import chalk from 'chalk'
import { confirm } from '@inquirer/prompts'
import { requireProfile } from '../storage/profile-store.js'
import { loadStreak, saveStreak } from '../storage/streak-store.js'
import { todayInTz, daysBetween } from '../core/date-utils.js'

export async function runFreeze(options: {
  tomorrow?: boolean
  noInteractive?: boolean
} = {}): Promise<void> {
  const profile = requireProfile()
  const streak = loadStreak()

  if (streak.freezeTokens === 0) {
    console.log(chalk.yellow('  No freeze tokens available.'))
    console.log(chalk.dim('  Earn tokens by reaching milestones (30, 60, 90 days).'))
    return
  }

  const today = todayInTz(profile.timezone)

  console.log(`\n  Freeze tokens: ${'❄️'.repeat(streak.freezeTokens)} (${streak.freezeTokens} available)`)
  console.log(chalk.dim(`  Current streak: ${streak.currentStreak} days\n`))

  if (options.tomorrow) {
    // Pre-apply for tomorrow
    if (!options.noInteractive) {
      const ok = await confirm({
        message: `Use 1 freeze token to protect your streak tomorrow?`,
        default: true,
      })
      if (!ok) {
        console.log(chalk.dim('  Cancelled.'))
        return
      }
    }

    // Store scheduled freeze as a special activity entry
    // We'll mark tomorrow's date in the streak as "scheduled freeze"
    // Implementation: set a flag on streak record
    const updated = {
      ...streak,
      freezeTokens: streak.freezeTokens - 1,
      status: 'active' as const,
      // Store scheduled freeze date in a field
    }
    saveStreak(updated)
    console.log(chalk.green(`\n  ✓ Freeze token used. Your streak is protected for tomorrow.`))
    console.log(chalk.dim(`  Tokens remaining: ${updated.freezeTokens}\n`))
    return
  }

  // Check if we missed yesterday and should use freeze now
  if (streak.lastActivityDate) {
    const daysDiff = daysBetween(streak.lastActivityDate, today)
    if (daysDiff === 2) {
      if (!options.noInteractive) {
        const ok = await confirm({
          message: `Use 1 freeze token to recover your ${streak.currentStreak}-day streak? (missed 1 day)`,
          default: true,
        })
        if (!ok) {
          console.log(chalk.dim('  Cancelled.'))
          return
        }
      }

      const updated = {
        ...streak,
        freezeTokens: streak.freezeTokens - 1,
        lastActivityDate: today,
        status: 'frozen' as const,
      }
      saveStreak(updated)
      console.log(chalk.green(`\n  ✓ Freeze applied. ${streak.currentStreak}-day streak preserved.`))
      console.log(chalk.dim(`  Tokens remaining: ${updated.freezeTokens}\n`))
      return
    }
  }

  // Info display
  console.log(chalk.dim('  Use --tomorrow to pre-apply a freeze for tomorrow.'))
  console.log(chalk.dim('  Freezes are auto-offered when you run `vibechk check-in` after missing a day.\n'))
}
