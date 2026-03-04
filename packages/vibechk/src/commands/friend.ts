import chalk from 'chalk'
import { loadFriends, saveFriends, getFriendByAlias } from '../storage/friends-store.js'
import { requireProfile } from '../storage/profile-store.js'
import { loadStreak } from '../storage/streak-store.js'
import { todayInTz, daysBetween, friendlyDate } from '../core/date-utils.js'
import { getAllMilestones } from '../core/milestone-checker.js'
import { VIBECHK_SERVER } from '../storage/paths.js'
import type { FriendEntry, PublicProfile } from '../types/index.js'

const FETCH_TIMEOUT_MS = 8000
const STALE_HOURS = 25  // data older than this is shown with a warning

// ─────────────────────────────────────────────────────────────────────────────
// Add a friend
// ─────────────────────────────────────────────────────────────────────────────

export async function runFriendAdd(alias: string, url?: string): Promise<void> {
  const normalized = alias.trim().toLowerCase()
  if (!normalized || !/^[\w\-\.]+$/.test(normalized)) {
    console.error(chalk.red('  Alias must be letters, numbers, - or _ only.'))
    process.exit(1)
  }

  const existing = getFriendByAlias(normalized)
  if (existing) {
    console.log(chalk.yellow(`  Already following "${normalized}" at ${existing.url}`))
    console.log(chalk.dim(`  Use \`vibechk friend remove ${normalized}\` first to replace them.`))
    return
  }

  // If no URL given, resolve from the default server by username
  const resolvedUrl = url?.trim() ?? `${VIBECHK_SERVER}/u/${normalized}.json`

  const data = loadFriends()
  const entry: FriendEntry = {
    alias: normalized,
    url: resolvedUrl,
    addedAt: new Date().toISOString(),
    lastFetchedAt: null,
    cached: null,
  }
  data.friends.push(entry)
  saveFriends(data)

  console.log(chalk.green(`\n  ✓ Added ${normalized}.`))
  console.log(chalk.dim('  Fetching their streak now...\n'))

  // Immediately fetch so the user sees data right away
  const result = await fetchOneFriend(entry)
  if (result.cached) {
    printFriendRow(result, todayInTz(requireProfile().timezone), true)
  } else {
    console.log(chalk.yellow(`  Could not fetch their data: ${result.lastFetchError ?? 'unknown error'}`))
    console.log(chalk.dim('  Their data will be retried on the next `vibechk friend pull`.'))
  }
  console.log('')
}

// ─────────────────────────────────────────────────────────────────────────────
// Remove a friend
// ─────────────────────────────────────────────────────────────────────────────

export function runFriendRemove(alias: string): void {
  const normalized = alias.trim().toLowerCase()
  const data = loadFriends()
  const idx = data.friends.findIndex((f) => f.alias.toLowerCase() === normalized)
  if (idx === -1) {
    console.log(chalk.yellow(`  No friend found with alias "${normalized}".`))
    return
  }
  data.friends.splice(idx, 1)
  saveFriends(data)
  console.log(chalk.green(`\n  ✓ Removed ${normalized}.\n`))
}

// ─────────────────────────────────────────────────────────────────────────────
// Pull / refresh all friends
// ─────────────────────────────────────────────────────────────────────────────

export async function runFriendPull(options: { quiet?: boolean } = {}): Promise<void> {
  const data = loadFriends()
  if (data.friends.length === 0) {
    if (!options.quiet) {
      console.log(chalk.dim('\n  No friends added yet. Run `vibechk friend add <alias> <url>`.\n'))
    }
    return
  }

  if (!options.quiet) process.stdout.write(chalk.dim(`  Syncing ${data.friends.length} friend(s)...`))

  const updated = await Promise.all(data.friends.map(fetchOneFriend))
  data.friends = updated
  saveFriends(data)

  if (!options.quiet) {
    const ok = updated.filter((f) => f.cached !== null).length
    console.log(chalk.green(` ${ok}/${updated.length} updated.\n`))
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// List friends (the main display)
// ─────────────────────────────────────────────────────────────────────────────

export function runFriendList(): void {
  const profile = requireProfile()
  const myStreak = loadStreak()
  const today = todayInTz(profile.timezone)
  const data = loadFriends()

  console.log('')

  if (data.friends.length === 0) {
    console.log(chalk.dim('  No friends yet.\n'))
    console.log('  Share your streak URL with friends and add theirs:')
    if (data.myPublishUrl) {
      console.log('')
      console.log(`  Your URL: ${chalk.cyan(data.myPublishUrl)}`)
    } else {
      console.log(chalk.dim('  Run `vibechk publish` to generate your shareable URL first.'))
    }
    console.log(chalk.dim('\n  vibechk friend add <alias> <their-url>\n'))
    return
  }

  // Sort: checked-in-today first, then by current streak desc
  const sorted = [...data.friends].sort((a, b) => {
    const aToday = a.cached?.lastActiveDate === today ? 1 : 0
    const bToday = b.cached?.lastActiveDate === today ? 1 : 0
    if (bToday !== aToday) return bToday - aToday
    return (b.cached?.currentStreak ?? -1) - (a.cached?.currentStreak ?? -1)
  })

  // Header row
  const COL = { alias: 14, streak: 9, today: 8, consistency: 8, best: 7 }
  const header =
    chalk.dim(padR('  name', COL.alias)) +
    chalk.dim(padR('streak', COL.streak)) +
    chalk.dim(padR('today', COL.today)) +
    chalk.dim(padR('30d%', COL.consistency)) +
    chalk.dim('best')
  console.log(header)
  console.log(chalk.dim('  ' + '─'.repeat(48)))

  for (const friend of sorted) {
    printFriendRow(friend, today, false)
  }

  // Divider + your own row
  console.log(chalk.dim('  ' + '─'.repeat(48)))
  const myCheckedIn = myStreak.lastActivityDate === today
  const myEmoji = myStreak.currentStreak >= 30 ? '🏆' : myStreak.currentStreak > 0 ? '🔥' : '🌱'
  const myTodayLabel = myCheckedIn ? chalk.green('✓') : chalk.yellow('○')
  console.log(
    padR(`  ${chalk.bold('you')}`, COL.alias) +
    padR(`${myEmoji} ${myStreak.currentStreak}d`, COL.streak) +
    padR(myTodayLabel, COL.today) +
    padR(chalk.dim('—'), COL.consistency) +
    chalk.dim(`${myStreak.longestStreak}d`)
  )
  console.log('')

  // Freshness footer
  const staleCount = data.friends.filter((f) => isStale(f)).length
  if (staleCount > 0) {
    console.log(chalk.yellow(`  ⚠ ${staleCount} friend(s) have stale data. Run \`vibechk friend pull\`.`))
  } else if (data.friends.some((f) => f.lastFetchedAt)) {
    const oldest = data.friends
      .filter((f) => f.lastFetchedAt)
      .sort((a, b) => a.lastFetchedAt!.localeCompare(b.lastFetchedAt!))
      .at(0)!
    const age = Math.round((Date.now() - new Date(oldest.lastFetchedAt!).getTime()) / 60000)
    console.log(chalk.dim(`  Last synced: ${age < 60 ? `${age}m ago` : `${Math.round(age / 60)}h ago`}`))
  }

  if (data.myPublishUrl) {
    console.log(chalk.dim(`  Your URL: ${data.myPublishUrl}`))
  } else {
    console.log(chalk.dim('  Run `vibechk publish` so friends can follow you.'))
  }
  console.log('')
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

async function fetchOneFriend(entry: FriendEntry): Promise<FriendEntry> {
  try {
    const res = await fetch(entry.url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': 'vibechk/0.1.0', Accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json() as PublicProfile
    if (typeof json.username !== 'string' || typeof json.currentStreak !== 'number') {
      throw new Error('Invalid profile format')
    }
    return {
      ...entry,
      lastFetchedAt: new Date().toISOString(),
      lastFetchError: undefined,
      cached: json,
    }
  } catch (err: any) {
    return {
      ...entry,
      lastFetchError: err.message ?? 'fetch failed',
      // preserve old cached data — stale is better than empty
    }
  }
}

function printFriendRow(friend: FriendEntry, today: string, verbose: boolean): void {
  const c = friend.cached
  const COL = { alias: 14, streak: 9, today: 8, consistency: 8 }

  if (!c) {
    const errLabel = friend.lastFetchError
      ? chalk.red(`⚠ ${friend.lastFetchError.slice(0, 30)}`)
      : chalk.dim('fetching...')
    console.log(padR(`  ${chalk.bold(friend.alias)}`, COL.alias) + errLabel)
    return
  }

  const streakEmoji = c.currentStreak >= 30 ? '🏆' : c.currentStreak > 0 ? '🔥' : '🌱'
  const checkedInToday = c.lastActiveDate === today
  const todayLabel = checkedInToday ? chalk.green('✓') : chalk.dim('○')
  const consistencyColor = c.consistencyLast30 >= 80 ? chalk.green : c.consistencyLast30 >= 50 ? chalk.yellow : chalk.red
  const prevNote = c.longestStreak > c.currentStreak && c.longestStreak > 0
    ? chalk.dim(` prev ${c.longestStreak}d`)
    : ''
  const staleNote = isStale(friend) ? chalk.yellow(' ⚠') : ''
  const theirName = c.username !== friend.alias ? chalk.dim(` (${c.username})`) : ''

  if (verbose) {
    console.log(`  ${streakEmoji} ${chalk.bold(friend.alias)}${theirName}: ${chalk.yellow.bold(c.currentStreak + ' days')}`)
    console.log(`     Today: ${checkedInToday ? chalk.green('checked in ✓') : chalk.dim('not yet ○')}`)
    console.log(`     30-day consistency: ${consistencyColor(c.consistencyLast30 + '%')}`)
    console.log(`     Best streak: ${c.longestStreak}d   Check-ins: ${c.totalCheckIns}`)
    const milestones = getAllMilestones()
    const earned = c.badges.map((id) => milestones.find((m) => m.id === id)?.icon ?? '').filter(Boolean)
    if (earned.length) console.log(`     Badges: ${earned.join(' ')}`)
  } else {
    console.log(
      padR(`  ${chalk.bold(friend.alias)}${theirName}`, COL.alias) +
      padR(`${streakEmoji} ${c.currentStreak}d${prevNote}`, COL.streak) +
      padR(todayLabel, COL.today) +
      padR(consistencyColor(c.consistencyLast30 + '%'), COL.consistency) +
      chalk.dim(c.longestStreak + 'd') +
      staleNote
    )
  }
}

function isStale(friend: FriendEntry): boolean {
  if (!friend.lastFetchedAt) return false
  const ageMs = Date.now() - new Date(friend.lastFetchedAt).getTime()
  return ageMs > STALE_HOURS * 3600 * 1000
}

function padR(s: string, width: number): string {
  // Strip ANSI codes for length calculation
  const plainLen = s.replace(/\x1B\[[0-9;]*m/g, '').length
  const pad = Math.max(0, width - plainLen)
  return s + ' '.repeat(pad)
}
