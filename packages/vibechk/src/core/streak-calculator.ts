import { daysBetween } from './date-utils.js'
import type { StreakRecord, StreakImpact } from '../types/index.js'

const GRACE_COOLDOWN_DAYS = 14 // can only use grace once per 14 days
const MAX_FREEZE_TOKENS = 5

/**
 * Pure function: given the current streak record and today's date string ("YYYY-MM-DD"),
 * compute the impact of checking in today.
 */
export function calculateStreakImpact(
  streak: StreakRecord,
  today: string,
  useFreeze = false,
): StreakImpact {
  const { lastActivityDate, currentStreak, graceUsedAt, freezeTokens } = streak

  // First ever check-in
  if (!lastActivityDate) {
    return { action: 'started', newStreak: 1 }
  }

  const daysDiff = daysBetween(lastActivityDate, today)

  // Already checked in today
  if (daysDiff === 0) {
    return { action: 'already_checked_in', newStreak: currentStreak }
  }

  // Perfect continuation (yesterday → today)
  if (daysDiff === 1) {
    return { action: 'continued', newStreak: currentStreak + 1 }
  }

  // Missed exactly one day — try forgiveness mechanisms
  if (daysDiff === 2) {
    // Check grace period eligibility (automatic, once per 14 days)
    const graceAvailable =
      !graceUsedAt || daysBetween(graceUsedAt, today) >= GRACE_COOLDOWN_DAYS

    if (graceAvailable) {
      return { action: 'grace', newStreak: currentStreak + 1, usedGrace: true }
    }

    // Check freeze token
    if (useFreeze && freezeTokens > 0) {
      return { action: 'frozen', newStreak: currentStreak + 1, usedFreeze: true }
    }

    // Offer to use freeze but don't auto-apply
    if (freezeTokens > 0 && !useFreeze) {
      // Return broken but indicate freeze is available (caller handles prompting)
      return {
        action: 'broken',
        newStreak: 1,
        previousStreak: currentStreak,
      }
    }
  }

  // Gap too large or no protection available
  return {
    action: 'broken',
    newStreak: 1,
    previousStreak: currentStreak,
  }
}

/** Apply a streak impact to produce a new streak record */
export function applyStreakImpact(
  current: StreakRecord,
  impact: StreakImpact,
  today: string,
  nowIso: string,
): StreakRecord {
  const newStreak = impact.newStreak
  const newLongest = Math.max(current.longestStreak, newStreak)

  let freezeTokens = current.freezeTokens
  if (impact.usedFreeze) {
    freezeTokens = Math.max(0, freezeTokens - 1)
  }

  let graceUsedAt = current.graceUsedAt
  if (impact.usedGrace) {
    graceUsedAt = today
  }

  let status: StreakRecord['status'] = 'active'
  if (impact.action === 'frozen') status = 'frozen'
  else if (impact.action === 'grace') status = 'grace'
  else if (impact.action === 'broken') status = 'broken'
  else if (impact.action === 'started' || impact.action === 'continued' || impact.action === 'already_checked_in') status = 'active'

  return {
    ...current,
    currentStreak: newStreak,
    longestStreak: newLongest,
    lastActivityDate: impact.action === 'already_checked_in' ? current.lastActivityDate : today,
    lastCheckInAt: nowIso,
    freezeTokens,
    totalCheckIns: impact.action === 'already_checked_in' ? current.totalCheckIns : current.totalCheckIns + 1,
    graceUsedAt,
    status,
  }
}

/** Add freeze tokens earned from a milestone, capped at MAX_FREEZE_TOKENS */
export function addFreezeTokens(current: number, toAdd: number): number {
  return Math.min(MAX_FREEZE_TOKENS, current + toAdd)
}
