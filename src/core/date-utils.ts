import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import timezone from 'dayjs/plugin/timezone.js'

dayjs.extend(utc)
dayjs.extend(timezone)

/** Returns "YYYY-MM-DD" for the current moment in a given IANA timezone */
export function todayInTz(tz: string): string {
  return dayjs().tz(tz).format('YYYY-MM-DD')
}

/** Returns "YYYY-MM-DD" for a given ISO timestamp in a given IANA timezone */
export function dateInTz(isoTimestamp: string, tz: string): string {
  return dayjs(isoTimestamp).tz(tz).format('YYYY-MM-DD')
}

/**
 * Difference in calendar days between two "YYYY-MM-DD" strings.
 * Returns a positive number if b is after a, negative if before.
 */
export function daysBetween(a: string, b: string): number {
  const da = dayjs(a, 'YYYY-MM-DD')
  const db = dayjs(b, 'YYYY-MM-DD')
  return db.diff(da, 'day')
}

/** Returns how many seconds remain until midnight in the given timezone */
export function secondsUntilMidnight(tz: string): number {
  const now = dayjs().tz(tz)
  const midnight = now.endOf('day')
  return midnight.diff(now, 'second')
}

/** Format seconds as "Xh Ym" */
export function formatCountdown(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

/** Returns current UTC ISO string */
export function nowIso(): string {
  return new Date().toISOString()
}

/** Returns "March 3, 2026" style from a YYYY-MM-DD string */
export function friendlyDate(date: string): string {
  return dayjs(date, 'YYYY-MM-DD').format('MMMM D, YYYY')
}

/** Detect system timezone (IANA) */
export function systemTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}
