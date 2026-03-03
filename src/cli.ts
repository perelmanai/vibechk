import { Command } from 'commander'
import chalk from 'chalk'
import { dataExists } from './storage/paths.js'
import { runInit } from './commands/init.js'
import { runCheckIn } from './commands/check-in.js'
import { runStatus } from './commands/status.js'
import { runFreeze } from './commands/freeze.js'
import { runLeaderboard } from './commands/leaderboard.js'
import { runExport } from './commands/export.js'
import { runSync } from './commands/sync.js'

const program = new Command()

program
  .name('vibechk')
  .description('Daily streak tracker for vibe coders')
  .version('0.1.0')

// Default action (no subcommand) = check-in
program
  .action(async () => {
    if (!dataExists()) {
      console.log(chalk.dim('  No profile found. Running setup...\n'))
      await runInit()
      return
    }
    await runCheckIn({ openDashboard: false })
  })

program
  .command('init')
  .description('Set up your vibechk profile')
  .action(async () => {
    await runInit()
  })

program
  .command('check-in')
  .alias('checkin')
  .alias('ci')
  .description('Record a vibe coding session (auto-detects Claude Code usage)')
  .option('-m, --manual', 'Skip auto-detection, check in manually')
  .option('--note <text>', 'Add a note to this session')
  .option('--auto-freeze', 'Automatically use a freeze token if needed')
  .option('--dry-run', 'Compute but do not save')
  .option('-q, --quiet', 'Minimal output')
  .option('--json', 'Output as JSON')
  .option('--no-interactive', 'Non-interactive mode (no prompts)')
  .option('--web', 'Open browser dashboard after check-in')
  .action(async (opts) => {
    if (!dataExists()) {
      console.log(chalk.yellow('  Run `vibechk init` first.\n'))
      process.exit(1)
    }
    await runCheckIn({
      source: opts.manual ? 'manual' : undefined,
      notes: opts.note,
      autoFreeze: opts.autoFreeze,
      dryRun: opts.dryRun,
      quiet: opts.quiet,
      json: opts.json,
      noInteractive: opts.noInteractive === false ? true : undefined,
      openDashboard: opts.web,
    })
  })

program
  .command('status')
  .alias('s')
  .description('Show your current streak and activity')
  .option('-q, --quiet', 'Single-line output')
  .option('--json', 'Output as JSON')
  .option('--web', 'Open browser dashboard')
  .action(async (opts) => {
    if (!dataExists()) {
      console.log(chalk.yellow('  Run `vibechk init` first.\n'))
      process.exit(1)
    }
    await runStatus({ quiet: opts.quiet, json: opts.json, web: opts.web })
  })

program
  .command('freeze')
  .description('Manage freeze tokens (protect your streak against a missed day)')
  .option('--tomorrow', 'Pre-apply a freeze for tomorrow (planned absence)')
  .option('--no-interactive', 'Non-interactive mode')
  .action(async (opts) => {
    if (!dataExists()) {
      console.log(chalk.yellow('  Run `vibechk init` first.\n'))
      process.exit(1)
    }
    await runFreeze({
      tomorrow: opts.tomorrow,
      noInteractive: opts.noInteractive === false ? true : undefined,
    })
  })

program
  .command('leaderboard')
  .alias('lb')
  .description('View the opt-in community streak leaderboard')
  .option('--refresh', 'Force refresh (ignore 1hr cache)')
  .option('--hide-me', 'Hide yourself from display')
  .option('--web', 'Open in browser')
  .action(async (opts) => {
    if (!dataExists()) {
      console.log(chalk.yellow('  Run `vibechk init` first.\n'))
      process.exit(1)
    }
    await runLeaderboard({ refresh: opts.refresh, hideMe: opts.hideMe, web: opts.web })
  })

program
  .command('sync')
  .description('Push your streak data to the cloud leaderboard')
  .action(async () => {
    if (!dataExists()) {
      console.log(chalk.yellow('  Run `vibechk init` first.\n'))
      process.exit(1)
    }
    await runSync()
  })

program
  .command('export')
  .description('Export all your streak data')
  .option('--format <type>', 'Output format: json (default) or csv', 'json')
  .action(async (opts) => {
    if (!dataExists()) {
      console.log(chalk.yellow('  Run `vibechk init` first.\n'))
      process.exit(1)
    }
    await runExport({ format: opts.format })
  })

program
  .command('dashboard')
  .alias('dash')
  .description('Open the visual dashboard in your browser')
  .action(async () => {
    if (!dataExists()) {
      console.log(chalk.yellow('  Run `vibechk init` first.\n'))
      process.exit(1)
    }
    await runStatus({ web: true })
  })

program.parseAsync(process.argv).catch((err) => {
  console.error(chalk.red('Error:'), err.message)
  process.exit(1)
})
