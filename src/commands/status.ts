import { requireProfile } from '../storage/profile-store.js'
import { loadStreak } from '../storage/streak-store.js'
import { loadActivity } from '../storage/activity-store.js'
import { renderStatus } from '../ui/renderer.js'
import { startDashboard } from '../web/server.js'
import openBrowser from 'open'
import chalk from 'chalk'

export async function runStatus(options: {
  quiet?: boolean
  json?: boolean
  web?: boolean
} = {}): Promise<void> {
  const profile = requireProfile()
  const streak = loadStreak()
  const activity = loadActivity()

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
