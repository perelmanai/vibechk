import chalk from 'chalk'
import dayjs from 'dayjs'
import { requireProfile } from '../storage/profile-store.js'
import { loadActivity } from '../storage/activity-store.js'
import { todayInTz } from '../core/date-utils.js'

export function runLog(): void {
  const profile = requireProfile()
  const activity = loadActivity()
  const today = todayInTz(profile.timezone)

  const activitySet = new Set(activity.map((a) => a.date))

  // Build last 30 days in chronological order
  const days: Array<{ date: string; label: string; active: boolean; isToday: boolean }> = []
  for (let i = 29; i >= 0; i--) {
    const d = dayjs(today).subtract(i, 'day')
    const dateStr = d.format('YYYY-MM-DD')
    days.push({
      date: dateStr,
      label: d.format('MMM D'),
      active: activitySet.has(dateStr),
      isToday: dateStr === today,
    })
  }

  const activeDays = days.filter((d) => d.active).length
  const consistencyPct = Math.round((activeDays / 30) * 100)

  const startLabel = days[0].label
  const endLabel = days[days.length - 1].label

  console.log('')
  console.log(chalk.bold(`Last 30 days`) + chalk.dim(`  ${startLabel} – ${endLabel}`))
  console.log(chalk.dim('  ✓ coded  · missed'))
  console.log('')

  // Render in rows of 7 (week by week)
  const WEEK_SIZE = 7
  const DAYS_SHORT = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

  // Print day-of-week header, aligned to where the first day falls
  const firstDayOfWeek = dayjs(days[0].date).day() // 0=Sun
  const mondayAligned = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1 // convert to Mon=0
  const headerOffset = ' '.repeat(8 + mondayAligned * 3)
  console.log(chalk.dim(headerOffset + DAYS_SHORT.join(' ')))

  // Render weeks
  for (let i = 0; i < days.length; i += WEEK_SIZE) {
    const week = days.slice(i, i + WEEK_SIZE)
    const rowLabel = chalk.dim(week[0].label.padStart(6))

    // Pad first row if first day doesn't start on Monday
    let prefix = ''
    if (i === 0 && mondayAligned > 0) {
      prefix = '   '.repeat(mondayAligned)
    }

    const cells = week.map((d) => {
      let cell: string
      if (d.active) {
        cell = chalk.green('✓')
      } else if (d.isToday) {
        cell = chalk.yellow('○') // today, not yet checked in
      } else {
        cell = chalk.dim('·')
      }
      return d.isToday ? chalk.underline(cell) : cell
    })

    console.log(`  ${rowLabel}  ${prefix}${cells.join('  ')}`)
  }

  console.log('')

  const consistencyColor = consistencyPct >= 80 ? chalk.green : consistencyPct >= 50 ? chalk.yellow : chalk.red
  console.log(
    `  Consistency: ` +
    consistencyColor(`${consistencyPct}%`) +
    chalk.dim(` — ${activeDays} of 30 days`)
  )
  console.log('')
}
