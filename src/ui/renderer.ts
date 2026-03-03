import chalk from 'chalk'
import boxen from 'boxen'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import timezone from 'dayjs/plugin/timezone.js'
import type { StreakRecord, UserProfile, MilestoneDefinition, ActivityEntry } from '../types/index.js'

dayjs.extend(utc)
dayjs.extend(timezone)
import { secondsUntilMidnight, formatCountdown, friendlyDate, todayInTz } from '../core/date-utils.js'
import { getAllMilestones } from '../core/milestone-checker.js'

function flameBar(current: number, next: number): string {
  if (next <= current) return '██████████ ✓'
  const pct = Math.min(current / next, 1)
  const filled = Math.round(pct * 12)
  const empty = 12 - filled
  return chalk.red('█'.repeat(filled)) + chalk.gray('░'.repeat(empty)) + chalk.dim(` → day ${next}`)
}

function weekCalendar(activity: ActivityEntry[], tz: string): string {
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
  const today = dayjs().tz ? dayjs().tz(tz) : dayjs()
  // Get the start of this week (Monday)
  const dayOfWeek = today.day() // 0=Sun, 1=Mon...
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek

  const activityDates = new Set(activity.map((a) => a.date))

  const row = days.map((label, i) => {
    const d = today.add(mondayOffset + i, 'day')
    const dateStr = d.format('YYYY-MM-DD')
    const isToday = dateStr === today.format('YYYY-MM-DD')
    const isFuture = d.isAfter(today, 'day')
    const hasActivity = activityDates.has(dateStr)

    let cell: string
    if (isFuture) cell = chalk.gray('·')
    else if (hasActivity) cell = chalk.green('✓')
    else cell = chalk.red('✗')

    return isToday ? chalk.bold.underline(`${label}:${cell}`) : `${label}:${cell}`
  })

  return row.join('  ')
}

function nextMilestone(currentStreak: number): { days: number; daysAway: number } | null {
  const milestones = getAllMilestones()
  const next = milestones.find((m) => m.streakRequired > currentStreak)
  if (!next) return null
  return { days: next.streakRequired, daysAway: next.streakRequired - currentStreak }
}

export function renderStatus(
  profile: UserProfile,
  streak: StreakRecord,
  activity: ActivityEntry[],
  { quiet = false, json = false } = {},
): string {
  if (json) {
    return JSON.stringify({ streak, profile: { username: profile.username, timezone: profile.timezone } }, null, 2)
  }

  const today = todayInTz(profile.timezone)
  const secsLeft = secondsUntilMidnight(profile.timezone)
  const isProtected = streak.lastActivityDate === today

  const streakEmoji = streak.currentStreak >= 100 ? '💯' : streak.currentStreak >= 30 ? '🏆' : '🔥'
  const statusLabel = isProtected
    ? chalk.green('✓ Protected for today')
    : secsLeft < 3600
    ? chalk.red(`⚠ ${formatCountdown(secsLeft)} left to check in!`)
    : chalk.yellow(`○ Check in before midnight`)

  const next = nextMilestone(streak.currentStreak)
  const progressBar = next ? flameBar(streak.currentStreak, next.days) : chalk.green('████████████ All milestones reached!')

  const freezeDisplay = '❄'.repeat(streak.freezeTokens) + (streak.freezeTokens === 0 ? chalk.gray('none') : '')
  const recentWeek = activity.filter((a) => {
    const diff = dayjs(today).diff(dayjs(a.date), 'day')
    return diff >= 0 && diff < 7
  })

  if (quiet) {
    return `${streak.currentStreak}d streak`
  }

  const lines = [
    `${streakEmoji} ${chalk.bold.yellow(streak.currentStreak + '-day streak')}  ${statusLabel}`,
    ``,
    `Progress  ${progressBar}`,
    `Longest   ${chalk.cyan(streak.longestStreak + 'd')}  │  Freezes ${freezeDisplay}`,
    ``,
    weekCalendar(recentWeek, profile.timezone),
    ``,
    chalk.dim(`${friendlyDate(today)}  │  ${profile.username}`),
  ]

  return boxen(lines.join('\n'), {
    padding: { top: 0, bottom: 0, left: 1, right: 1 },
    borderStyle: 'round',
    borderColor: isProtected ? 'green' : streak.currentStreak > 0 ? 'yellow' : 'gray',
    title: ' vibechk ',
    titleAlignment: 'center',
  })
}

export function renderCheckIn(
  action: string,
  streak: number,
  previousStreak?: number,
  newMilestones: MilestoneDefinition[] = [],
  quiet = false,
): string {
  if (quiet) return ''

  const lines: string[] = []

  if (action === 'already_checked_in') {
    lines.push(chalk.green(`✓ Already checked in today — ${streak}-day streak protected.`))
    return lines.join('\n')
  }

  if (action === 'broken') {
    lines.push(chalk.red(`✗ Streak broken.`) + chalk.dim(` (was ${previousStreak} days)`))
    lines.push(chalk.yellow(`  Starting fresh — day 1. You got this.`))
    return boxen(lines.join('\n'), { padding: 1, borderColor: 'red', borderStyle: 'round' })
  }

  const actionEmoji =
    action === 'started' ? '🌱' : action === 'grace' ? '✨' : action === 'frozen' ? '❄️' : '🔥'

  const actionLabel =
    action === 'started' ? 'Day 1! The journey begins.' :
    action === 'grace' ? `Grace period used — streak preserved!` :
    action === 'frozen' ? `Freeze token used — streak preserved!` :
    `Day ${streak}! Streak protected.`

  lines.push(`${actionEmoji} ${chalk.bold(actionLabel)}`)
  lines.push(chalk.dim(`🔥 ${streak}-day streak`))

  return lines.join('\n')
}

export function renderMilestone(milestone: MilestoneDefinition, streak: number): string {
  const border = milestone.rarity === 'legendary' ? 'double' : milestone.rarity === 'epic' ? 'bold' : 'round'
  const color = milestone.rarity === 'legendary' ? 'magentaBright' : milestone.rarity === 'epic' ? 'yellowBright' : 'cyan'

  const lines = [
    chalk.bold.yellow('⭐ ACHIEVEMENT UNLOCKED!'),
    ``,
    `${milestone.icon}  ${chalk.bold(milestone.name)}`,
    chalk.dim(milestone.description),
    ``,
    chalk.green(`${streak}-day streak reached!`),
  ]

  if (milestone.freezeTokenReward > 0) {
    lines.push(``)
    lines.push(chalk.cyan(`+ ${milestone.freezeTokenReward} freeze token earned!`))
  }

  return boxen(lines.join('\n'), {
    padding: 1,
    borderStyle: border as any,
    borderColor: color as any,
    title: ` ${milestone.rarity.toUpperCase()} `,
    titleAlignment: 'center',
  })
}
