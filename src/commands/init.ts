import { input, confirm } from '@inquirer/prompts'
import chalk from 'chalk'
import { v4 as uuidv4 } from 'uuid'
import { saveProfile } from '../storage/profile-store.js'
import { saveStreak } from '../storage/streak-store.js'
import { DEFAULT_STREAK } from '../storage/streak-store.js'
import { systemTimezone } from '../core/date-utils.js'
import { installSchedule } from './schedule.js'
import type { UserProfile } from '../types/index.js'

export async function runInit(): Promise<void> {
  console.log('')
  console.log(chalk.bold('  Welcome to vibechk! 🔥'))
  console.log(chalk.dim('  Track your daily vibe coding streaks.\n'))

  const username = await input({
    message: 'Choose a username (shown on leaderboard):',
    validate: (v) => {
      if (!v.trim()) return 'Username cannot be empty'
      if (v.length > 24) return 'Max 24 characters'
      if (!/^[\w\-\.]+$/.test(v)) return 'Only letters, numbers, _ - . allowed'
      return true
    },
  })

  const detectedTz = systemTimezone()
  const tzInput = await input({
    message: 'Your timezone (IANA format):',
    default: detectedTz,
    validate: (v) => {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: v })
        return true
      } catch {
        return `Invalid timezone. Example: America/New_York`
      }
    },
  })

  const share = await confirm({
    message: 'Share your streak on the leaderboard? (you can change this later)',
    default: true,
  })

  let cloudEndpoint = ''
  let cloudApiKey = ''

  if (share) {
    cloudEndpoint = await input({
      message: 'Cloud leaderboard endpoint URL (leave blank to skip for now):',
      default: '',
    })

    if (cloudEndpoint) {
      cloudApiKey = await input({
        message: 'API key for that endpoint:',
      })
    }
  }

  const profile: UserProfile = {
    id: uuidv4(),
    username: username.trim(),
    timezone: tzInput,
    createdAt: new Date().toISOString(),
    cloudSync: cloudEndpoint
      ? { endpoint: cloudEndpoint.replace(/\/$/, ''), apiKey: cloudApiKey, lastSyncedAt: null }
      : null,
    preferences: {
      shareOnLeaderboard: share,
      notificationsEnabled: false,
      notificationTime: '21:00',
      celebrationLevel: 'normal',
      sessionSources: ['claude-code', 'git', 'manual'],
      weekendsCount: true,
      watchedRepos: [],
    },
  }

  saveProfile(profile)
  saveStreak({ ...DEFAULT_STREAK })

  console.log('')
  console.log(chalk.green(`✓ Profile created! Welcome, ${chalk.bold(profile.username)}.`))

  // Offer to install the daily scheduler so the streak tracks itself
  console.log('')
  const scheduleIt = await confirm({
    message: 'Set up automatic daily check-in at 9 PM? (recommended)',
    default: true,
  })

  if (scheduleIt) {
    try {
      await installSchedule('21:00', profile)
      console.log(chalk.green('✓ Daily auto-check-in scheduled.'))
      console.log(chalk.dim('  vibechk will detect your coding sessions automatically each evening.'))
      console.log(chalk.dim('  Run `vibechk schedule --help` to change the time or disable it.'))
    } catch (err: any) {
      console.log(chalk.yellow(`  Could not install schedule automatically: ${err.message}`))
      console.log(chalk.dim('  Run `vibechk schedule` manually to set it up.'))
    }
  } else {
    console.log(chalk.dim('  Run `vibechk schedule` any time to enable automatic daily tracking.'))
  }

  console.log('')
  console.log(chalk.dim(`  Run ${chalk.white('vibechk')} to check in your first session.\n`))
}
