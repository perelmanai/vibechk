import { execSync } from 'child_process'
import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import chalk from 'chalk'
import type { UserProfile } from '../types/index.js'

const LAUNCHD_LABEL = 'com.vibechk.daily'
const LAUNCHD_PLIST_PATH = join(homedir(), 'Library', 'LaunchAgents', `${LAUNCHD_LABEL}.plist`)
const CRON_MARKER = '# vibechk-daily'

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Install the daily auto-check-in job.
 * Uses launchd on macOS and cron on Linux.
 * `time` is "HH:MM" in 24-hour format.
 */
export async function installSchedule(time: string, profile?: UserProfile): Promise<void> {
  const [hour, minute] = parseTime(time)
  const bin = findVibechkBin()

  if (process.platform === 'darwin') {
    installLaunchd(bin, hour, minute, profile?.timezone)
  } else {
    installCron(bin, hour, minute, profile?.timezone)
  }
}

/** Remove the daily auto-check-in job. */
export async function uninstallSchedule(): Promise<void> {
  if (process.platform === 'darwin') {
    uninstallLaunchd()
  } else {
    uninstallCron()
  }
}

/** Return a human-readable description of the current schedule, or null if none. */
export function getScheduleStatus(): string | null {
  if (process.platform === 'darwin') {
    return existsSync(LAUNCHD_PLIST_PATH) ? `launchd plist: ${LAUNCHD_PLIST_PATH}` : null
  }
  const crontab = readCrontab()
  return crontab.includes(CRON_MARKER) ? 'cron (user crontab)' : null
}

// ─────────────────────────────────────────────────────────────────────────────
// macOS launchd
// ─────────────────────────────────────────────────────────────────────────────

function installLaunchd(bin: string, hour: number, minute: number, timezone?: string): void {
  // Unload any existing job first
  if (existsSync(LAUNCHD_PLIST_PATH)) {
    try { execSync(`launchctl unload "${LAUNCHD_PLIST_PATH}" 2>/dev/null`, { stdio: 'pipe' }) } catch { /* ignore */ }
  }

  // launchd runs jobs in the user's login session so timezone is inherited from
  // the environment. We set TZ explicitly just to be safe.
  const tzEnv = timezone ? `
        <key>EnvironmentVariables</key>
        <dict>
          <key>TZ</key>
          <string>${timezone}</string>
        </dict>` : ''

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCHD_LABEL}</string>

  <key>ProgramArguments</key>
  <array>
    <string>${bin}</string>
    <string>check-in</string>
    <string>--no-interactive</string>
    <string>--quiet</string>
  </array>

  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>${hour}</integer>
    <key>Minute</key>
    <integer>${minute}</integer>
  </dict>
${tzEnv}
  <key>StandardOutPath</key>
  <string>/tmp/vibechk-daily.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/vibechk-daily.log</string>

  <!-- Run at load only if the scheduled time was missed while the machine was off -->
  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>
`

  writeFileSync(LAUNCHD_PLIST_PATH, plist, { encoding: 'utf8', mode: 0o644 })
  execSync(`launchctl load -w "${LAUNCHD_PLIST_PATH}"`, { stdio: 'pipe' })
}

function uninstallLaunchd(): void {
  if (!existsSync(LAUNCHD_PLIST_PATH)) {
    console.log(chalk.dim('  No launchd job found.'))
    return
  }
  try { execSync(`launchctl unload -w "${LAUNCHD_PLIST_PATH}"`, { stdio: 'pipe' }) } catch { /* ignore */ }
  unlinkSync(LAUNCHD_PLIST_PATH)
  console.log(chalk.green('✓ launchd job removed.'))
}

// ─────────────────────────────────────────────────────────────────────────────
// Linux / generic cron
// ─────────────────────────────────────────────────────────────────────────────

function installCron(bin: string, hour: number, minute: number, timezone?: string): void {
  const existing = readCrontab()

  // Remove any previous vibechk entry
  const cleaned = existing
    .split('\n')
    .filter((line) => !line.includes(CRON_MARKER))
    .join('\n')
    .trim()

  // cron minimal PATH often misses npm global bins — include common locations
  const pathHint = `PATH=/usr/local/bin:/usr/bin:/bin:${join(homedir(), '.npm-global/bin')}:${join(homedir(), '.local/bin')}`
  const tzLine = timezone ? `TZ=${timezone}` : ''
  const cronLine = `${minute} ${hour} * * * ${bin} check-in --no-interactive --quiet >> /tmp/vibechk-daily.log 2>&1 ${CRON_MARKER}`

  const parts = [cleaned, pathHint, tzLine, cronLine].filter(Boolean)
  const newCrontab = parts.join('\n') + '\n'

  writeCrontab(newCrontab)
}

function uninstallCron(): void {
  const existing = readCrontab()
  if (!existing.includes(CRON_MARKER)) {
    console.log(chalk.dim('  No cron job found.'))
    return
  }
  const cleaned = existing
    .split('\n')
    .filter((line) => !line.includes(CRON_MARKER))
    .join('\n')
    .trimEnd() + '\n'
  writeCrontab(cleaned)
  console.log(chalk.green('✓ Cron job removed.'))
}

function readCrontab(): string {
  try {
    return execSync('crontab -l 2>/dev/null', { encoding: 'utf8' })
  } catch {
    return ''
  }
}

function writeCrontab(content: string): void {
  // Write to a temp file and pipe to crontab
  const tmp = `/tmp/vibechk-crontab-${Date.now()}`
  writeFileSync(tmp, content, { encoding: 'utf8' })
  try {
    execSync(`crontab "${tmp}"`, { stdio: 'pipe' })
  } finally {
    try { unlinkSync(tmp) } catch { /* ignore */ }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function parseTime(time: string): [number, number] {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time)
  if (!match) throw new Error(`Invalid time format "${time}". Use HH:MM, e.g. 21:00`)
  const h = parseInt(match[1], 10)
  const m = parseInt(match[2], 10)
  if (h < 0 || h > 23 || m < 0 || m > 59) {
    throw new Error(`Time out of range. Hour must be 0–23, minute 0–59.`)
  }
  return [h, m]
}

function findVibechkBin(): string {
  // Try which first (works when installed globally via npm)
  try {
    const bin = execSync('which vibechk', { encoding: 'utf8', stdio: 'pipe' }).trim()
    if (bin) return bin
  } catch { /* fall through */ }

  // Fall back to common npm global bin locations
  const candidates = [
    '/usr/local/bin/vibechk',
    join(homedir(), '.npm-global/bin/vibechk'),
    join(homedir(), '.local/bin/vibechk'),
    join(homedir(), '.yarn/bin/vibechk'),
  ]
  for (const c of candidates) {
    if (existsSync(c)) return c
  }

  // Last resort: use node to run the dist file directly
  const nodeExec = process.execPath
  const distCli = new URL('../cli.js', import.meta.url).pathname
  return `${nodeExec} ${distCli}`
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI entry point for `vibechk schedule`
// ─────────────────────────────────────────────────────────────────────────────

export async function runSchedule(options: { time?: string; remove?: boolean; status?: boolean }): Promise<void> {
  if (options.status) {
    const status = getScheduleStatus()
    if (status) {
      console.log(chalk.green(`✓ Daily auto-check-in is active`))
      console.log(chalk.dim(`  ${status}`))
    } else {
      console.log(chalk.yellow('  No daily schedule is installed.'))
      console.log(chalk.dim('  Run `vibechk schedule` to set it up.'))
    }
    return
  }

  if (options.remove) {
    await uninstallSchedule()
    return
  }

  const time = options.time ?? '21:00'
  const { requireProfile } = await import('../storage/profile-store.js')
  const profile = requireProfile()

  try {
    await installSchedule(time, profile)
    const platform = process.platform === 'darwin' ? 'launchd' : 'cron'
    console.log('')
    console.log(chalk.green(`✓ Daily auto-check-in scheduled via ${platform}`))
    console.log(chalk.dim(`  vibechk check-in will run at ${time} every day`))
    console.log(chalk.dim(`  It detects Claude Code and git commits automatically.`))
    console.log(chalk.dim(`  Logs: /tmp/vibechk-daily.log`))
    console.log(chalk.dim(`  To remove: vibechk schedule --remove`))
    console.log('')
  } catch (err: any) {
    console.error(chalk.red('Failed to install schedule:'), err.message)
    process.exit(1)
  }
}
