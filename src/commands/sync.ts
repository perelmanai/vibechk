import chalk from 'chalk'
import ora from 'ora'
import { requireProfile, saveProfile } from '../storage/profile-store.js'
import { loadStreak } from '../storage/streak-store.js'
import { loadBadges } from '../storage/badge-store.js'
import { pushStreak } from '../sync/client.js'

export async function runSync(): Promise<void> {
  const profile = requireProfile()

  if (!profile.cloudSync) {
    console.log(chalk.yellow('\n  No cloud sync configured.'))
    console.log(chalk.dim('  Run `vibechk init` to set up a leaderboard endpoint.\n'))
    return
  }

  const streak = loadStreak()
  const badges = loadBadges()

  const spinner = ora('Syncing to leaderboard…').start()
  const ok = await pushStreak(profile, streak, badges)
  spinner.stop()

  if (ok) {
    const now = new Date().toISOString()
    profile.cloudSync!.lastSyncedAt = now
    saveProfile(profile)
    console.log(chalk.green(`\n  ✓ Synced to ${profile.cloudSync!.endpoint}\n`))
  } else {
    console.log(chalk.red(`\n  ✗ Sync failed. Check your endpoint and API key.\n`))
    process.exitCode = 1
  }
}
