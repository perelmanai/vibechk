import chalk from 'chalk'
import { execSync } from 'child_process'
import { requireProfile } from '../storage/profile-store.js'
import { loadStreak } from '../storage/streak-store.js'
import { loadActivity } from '../storage/activity-store.js'
import { loadBadges } from '../storage/badge-store.js'
import { getAllMilestones } from '../core/milestone-checker.js'
import { todayInTz } from '../core/date-utils.js'

export function runShare(options: { json?: boolean } = {}): void {
  const profile = requireProfile()
  const streak = loadStreak()
  const activity = loadActivity()
  const badges = loadBadges()
  const today = todayInTz(profile.timezone)

  // 30-day consistency
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29)
  const cutoffStr = thirtyDaysAgo.toISOString().slice(0, 10)
  const activeLast30 = activity.filter((a) => a.date >= cutoffStr && a.date <= today).length
  const consistencyPct = Math.round((activeLast30 / 30) * 100)

  // Earned badge names
  const allMilestones = getAllMilestones()
  const earnedBadgeNames = badges.earned
    .map((b) => allMilestones.find((m) => m.id === b.milestoneId))
    .filter(Boolean)
    .map((m) => `${m!.icon} ${m!.name}`)

  if (options.json) {
    console.log(JSON.stringify({
      currentStreak: streak.currentStreak,
      longestStreak: streak.longestStreak,
      consistencyPct,
      activeLast30,
      badges: earnedBadgeNames,
    }, null, 2))
    return
  }

  // Build shareable text
  const streakLine = streak.currentStreak >= 30
    ? `🏆 ${streak.currentStreak}-day vibe coding streak!`
    : `🔥 ${streak.currentStreak}-day vibe coding streak`

  const statsLine = `📊 Best: ${streak.longestStreak}d  |  30-day consistency: ${consistencyPct}%`

  const badgeLine = earnedBadgeNames.length > 0
    ? `🎖  ${earnedBadgeNames.slice(-3).join('  ')}`
    : null

  const ctaLine = `Built with vibechk — npm i -g vibechk`

  const shareLines = [streakLine, statsLine, badgeLine, ctaLine].filter(Boolean) as string[]
  const shareText = shareLines.join('\n')

  console.log('')
  console.log(chalk.bold('  Copy and share:'))
  console.log('')
  console.log(chalk.dim('  ┌' + '─'.repeat(Math.max(...shareLines.map(l => l.length)) + 2) + '┐'))
  for (const line of shareLines) {
    console.log(chalk.dim('  │ ') + line + chalk.dim(' │'))
  }
  console.log(chalk.dim('  └' + '─'.repeat(Math.max(...shareLines.map(l => l.length)) + 2) + '┘'))
  console.log('')

  // Try to copy to clipboard (best-effort, no error if unavailable)
  tryCopyToClipboard(shareText)
}

function tryCopyToClipboard(text: string): void {
  const escaped = JSON.stringify(text)
  const cmds = [
    `echo ${escaped} | pbcopy`,       // macOS
    `echo ${escaped} | xclip -selection clipboard`, // Linux xclip
    `echo ${escaped} | xsel --clipboard --input`,   // Linux xsel
  ]
  for (const cmd of cmds) {
    try {
      execSync(cmd, { stdio: 'pipe' })
      console.log(chalk.dim('  Copied to clipboard ✓'))
      return
    } catch {
      // Try next
    }
  }
}
