import chalk from 'chalk'
import ora from 'ora'
import { requireProfile } from '../storage/profile-store.js'
import { loadLeaderboardCache, saveLeaderboardCache, isCacheStale } from '../storage/leaderboard-cache.js'
import { fetchLeaderboard } from '../sync/client.js'
import { renderLeaderboard } from '../ui/leaderboard-view.js'
import { startDashboard } from '../web/server.js'
import openBrowser from 'open'

export async function runLeaderboard(options: {
  refresh?: boolean
  hideMe?: boolean
  web?: boolean
} = {}): Promise<void> {
  const profile = requireProfile()

  if (options.web) {
    const url = await startDashboard(false)
    console.log(chalk.dim(`  Opening leaderboard in browser at ${url}`))
    await openBrowser(url + '#leaderboard')
    await new Promise((resolve) => setTimeout(resolve, 5 * 60 * 1000))
    process.exit(0)
    return
  }

  if (!profile.cloudSync) {
    console.log('')
    console.log(chalk.yellow('  No cloud sync configured.'))
    console.log(chalk.dim('  Run `vibechk init` and provide a leaderboard endpoint to compare with friends.'))
    console.log(chalk.dim('  Or run `vibechk leaderboard --web` to see your local stats.\n'))
    return
  }

  // Use cache unless stale or forced refresh
  let cache = loadLeaderboardCache()

  if (!cache || options.refresh || isCacheStale(cache)) {
    const spinner = ora('Fetching leaderboard…').start()
    const fresh = await fetchLeaderboard(profile)
    spinner.stop()

    if (!fresh) {
      console.log(chalk.red('  Could not reach leaderboard server.'))
      if (cache) {
        console.log(chalk.dim('  Showing cached data.\n'))
      } else {
        return
      }
    } else {
      cache = fresh
      saveLeaderboardCache(cache)
    }
  }

  if (!cache) return

  if (options.hideMe) {
    cache = {
      ...cache,
      entries: cache.entries.map((e) => ({
        ...e,
        isYou: false,
      })),
    }
  }

  console.log('')
  console.log(renderLeaderboard(cache, profile.id))
}

export function getLeaderboard() {
  return loadLeaderboardCache()
}
