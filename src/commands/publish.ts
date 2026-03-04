import chalk from 'chalk'
import { input } from '@inquirer/prompts'
import { requireProfile } from '../storage/profile-store.js'
import { loadStreak } from '../storage/streak-store.js'
import { loadActivity } from '../storage/activity-store.js'
import { loadBadges } from '../storage/badge-store.js'
import { loadFriends, saveFriends, loadGistToken, saveGistToken } from '../storage/friends-store.js'
import { todayInTz } from '../core/date-utils.js'
import type { PublicProfile } from '../types/index.js'

const GIST_API = 'https://api.github.com'
const GIST_FILENAME = 'vibechk.json'

// ─────────────────────────────────────────────────────────────────────────────
// Build the public JSON payload
// ─────────────────────────────────────────────────────────────────────────────

export function buildPublicProfile(
  username: string,
  currentStreak: number,
  longestStreak: number,
  lastActiveDate: string | null,
  totalCheckIns: number,
  badges: string[],
  activeLast30: number,
): PublicProfile {
  return {
    version: 1,
    username,
    currentStreak,
    longestStreak,
    lastActiveDate,
    consistencyLast30: Math.round((activeLast30 / 30) * 100),
    totalCheckIns,
    badges,
    publishedAt: new Date().toISOString(),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main publish command
// ─────────────────────────────────────────────────────────────────────────────

export async function runPublish(options: {
  gist?: boolean
  stdout?: boolean
  token?: string
  silent?: boolean  // used by the daily auto-publish after check-in
} = {}): Promise<string | null> {
  const profile = requireProfile()
  const streak = loadStreak()
  const activity = loadActivity()
  const badges = loadBadges()
  const today = todayInTz(profile.timezone)

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29)
  const cutoff = thirtyDaysAgo.toISOString().slice(0, 10)
  const activeLast30 = activity.filter((a) => a.date >= cutoff && a.date <= today).length

  const payload = buildPublicProfile(
    profile.username,
    streak.currentStreak,
    streak.longestStreak,
    streak.lastActivityDate,
    streak.totalCheckIns,
    badges.earned.map((b) => b.milestoneId),
    activeLast30,
  )

  const json = JSON.stringify(payload, null, 2)

  // ── stdout mode ────────────────────────────────────────────────────────────
  if (options.stdout) {
    console.log(json)
    return null
  }

  // ── Gist mode ──────────────────────────────────────────────────────────────
  const doGist = options.gist ?? (!options.stdout)
  if (!doGist) {
    console.log(json)
    return null
  }

  let token = options.token ?? loadGistToken()

  if (!token) {
    if (options.silent) return null  // no token, no interactive — skip silently
    console.log('')
    console.log(chalk.bold('  Publish your streak to a GitHub Gist'))
    console.log(chalk.dim('  This creates a public JSON file that friends can subscribe to.'))
    console.log(chalk.dim('  You need a GitHub personal access token with the `gist` scope.'))
    console.log(chalk.dim('  Create one at: https://github.com/settings/tokens/new?scopes=gist'))
    console.log('')
    token = await input({ message: 'GitHub token (gist scope):' })
    if (!token.trim()) {
      console.log(chalk.dim('  Skipped. Run `vibechk publish` when you have a token.'))
      return null
    }
    saveGistToken(token.trim())
    token = token.trim()
  }

  const friends = loadFriends()

  try {
    if (!options.silent) process.stdout.write(chalk.dim('  Publishing to Gist...'))

    const { gistId, rawUrl, login } = friends.gistId
      ? await updateGist(friends.gistId, json, token)
      : await createGist(json, token)

    friends.gistId = gistId
    friends.myPublishUrl = rawUrl
    saveFriends(friends)

    if (!options.silent) {
      console.log(chalk.green(' ✓'))
      console.log('')
      console.log(`  ${chalk.bold('Your friend URL:')} ${chalk.cyan(rawUrl)}`)
      console.log('')
      console.log(chalk.dim('  Share this with friends so they can follow your streak:'))
      console.log(chalk.dim(`  vibechk friend add ${profile.username} ${rawUrl}`))
      console.log('')
    }

    return rawUrl
  } catch (err: any) {
    if (!options.silent) {
      console.log(chalk.red(` ✗ ${err.message}`))
      if (err.message.includes('401') || err.message.includes('403')) {
        console.log(chalk.dim('\n  Token may be expired or missing gist scope.'))
        console.log(chalk.dim('  Delete ~/.vibechk/gist-token and run `vibechk publish` again.'))
      }
    }
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GitHub Gist API
// ─────────────────────────────────────────────────────────────────────────────

interface GistResult {
  gistId: string
  rawUrl: string
  login: string
}

async function createGist(json: string, token: string): Promise<GistResult> {
  const res = await fetch(`${GIST_API}/gists`, {
    method: 'POST',
    headers: gistHeaders(token),
    body: JSON.stringify({
      description: 'vibechk — my vibe coding streak',
      public: true,
      files: { [GIST_FILENAME]: { content: json } },
    }),
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${res.statusText}`)
  const data = await res.json() as any
  const login: string = data.owner?.login ?? 'me'
  // Raw URL is stable: always points to the latest revision
  const rawUrl = `https://gist.githubusercontent.com/${login}/${data.id}/raw/${GIST_FILENAME}`
  return { gistId: data.id, rawUrl, login }
}

async function updateGist(gistId: string, json: string, token: string): Promise<GistResult> {
  const res = await fetch(`${GIST_API}/gists/${gistId}`, {
    method: 'PATCH',
    headers: gistHeaders(token),
    body: JSON.stringify({
      files: { [GIST_FILENAME]: { content: json } },
    }),
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${res.statusText}`)
  const data = await res.json() as any
  const login: string = data.owner?.login ?? 'me'
  const rawUrl = `https://gist.githubusercontent.com/${login}/${data.id}/raw/${GIST_FILENAME}`
  return { gistId: data.id, rawUrl, login }
}

function gistHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'User-Agent': 'vibechk/0.1.0',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}
