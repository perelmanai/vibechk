import chalk from 'chalk'
import type { LeaderboardCache, LeaderboardEntry } from '../types/index.js'
import { getAllMilestones } from '../core/milestone-checker.js'
import dayjs from 'dayjs'

function badgeIcons(badgeIds: string[]): string {
  const milestones = getAllMilestones()
  return badgeIds
    .map((id) => milestones.find((m) => m.id === id)?.icon ?? '')
    .filter(Boolean)
    .slice(0, 4)
    .join('')
}

function formatEntry(entry: LeaderboardEntry, today: string): string {
  const rankStr = entry.rank ? String(entry.rank).padStart(3) : '  ?'
  const nameStr = (entry.displayName ?? 'anonymous').padEnd(16).slice(0, 16)
  const streakStr = `${entry.currentStreak}d`.padStart(6)
  const longestStr = `${entry.longestStreak}d`.padStart(8)
  const badges = badgeIcons(entry.badges ?? []).padEnd(6)
  const freeze = entry.freezesUsed > 0 ? chalk.dim(` (${entry.freezesUsed}❄)`) : ''
  const activeToday = entry.lastActiveDate === today ? chalk.green(' ●') : ''

  const line = `${rankStr}  ${nameStr} ${streakStr}   ${longestStr}   ${badges}${freeze}${activeToday}`

  if (entry.isYou) return chalk.bold.cyan('→ ' + line)
  return '  ' + line
}

export function renderLeaderboard(cache: LeaderboardCache, myUserId: string): string {
  const today = dayjs().format('YYYY-MM-DD')
  const updatedAgo = Math.round((Date.now() - new Date(cache.fetchedAt).getTime()) / 60000)
  const source = cache.source.replace(/^https?:\/\//, '')

  const header = [
    chalk.bold('Leaderboard') + chalk.dim(` (${source}) — updated ${updatedAgo}m ago`),
    ``,
    chalk.dim(`  Rank  Name              Streak   Longest   Badges`),
    chalk.dim(`  ─────────────────────────────────────────────────`),
  ].join('\n')

  // Show ranks near the user, plus top 5
  const me = cache.entries.find((e) => e.userId === myUserId)
  const myRank = me?.rank ?? Infinity

  const showSet = new Set<number>()
  cache.entries.slice(0, 5).forEach((e) => showSet.add(e.rank ?? 0))
  cache.entries
    .filter((e) => {
      const r = e.rank ?? 0
      return r >= myRank - 5 && r <= myRank + 5
    })
    .forEach((e) => showSet.add(e.rank ?? 0))

  const shown = cache.entries.filter((e) => showSet.has(e.rank ?? 0))

  let lastRank = 0
  const rows: string[] = []
  for (const entry of shown) {
    const rank = entry.rank ?? 0
    if (lastRank > 0 && rank > lastRank + 1) {
      rows.push(chalk.dim('  ...'))
    }
    rows.push(formatEntry(entry, today))
    lastRank = rank
  }

  if (rows.length === 0) {
    rows.push(chalk.dim('  No entries yet. Be the first!'))
  }

  return [header, ...rows, ''].join('\n')
}
