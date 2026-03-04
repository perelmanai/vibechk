import { requireProfile } from '../storage/profile-store.js'
import { loadStreak } from '../storage/streak-store.js'
import { loadActivity } from '../storage/activity-store.js'
import { calculateStreakImpact } from '../core/streak-calculator.js'
import { todayInTz } from '../core/date-utils.js'
import { renderStatus } from '../ui/renderer.js'
import { startDashboard } from '../web/server.js'
import openBrowser from 'open'
import chalk from 'chalk'
import type { StreakRecord } from '../types/index.js'

export async function runStatus(options: {
  quiet?: boolean
  json?: boolean
  web?: boolean
} = {}): Promise<void> {
  const profile = requireProfile()
  const stored = loadStreak()
  const activity = loadActivity()
  const today = todayInTz(profile.timezone)

  // Dry-run recalculation: surface the real effective streak rather than
  // the last-persisted value. If the streak has already broken (missed >2 days
  // with no grace left), show the user an honest 0 with the previous best
  // so they aren't surprised when they run check-in.
  const impact = calculateStreakImpact(stored, today, false)
  const streak: StreakRecord & { _expiredStreak?: number } =
    impact.action === 'broken'
      ? { ...stored, currentStreak: 0, status: 'broken', _expiredStreak: stored.currentStreak }
      : stored

  if (options.web) {
    const url = await startDashboard(false)
    console.log(chalk.dim(`  Opening dashboard at ${url}`))
    await openBrowser(url)
    // Keep server alive for 5 minutes then exit
    await new Promise((resolve) => setTimeout(resolve, 5 * 60 * 1000))
    process.exit(0)
    return
  }

  const output = renderStatus(profile, streak, activity, {
    quiet: options.quiet,
    json: options.json,
  })
  console.log(output)
}

export function getStreak() {
  return loadStreak()
}
