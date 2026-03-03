import { describe, it, expect } from 'vitest'
import { calculateStreakImpact, applyStreakImpact } from '../../src/core/streak-calculator'
import type { StreakRecord } from '../../src/types/index'

const BASE_STREAK: StreakRecord = {
  currentStreak: 0,
  longestStreak: 0,
  lastActivityDate: null,
  lastCheckInAt: null,
  freezeTokens: 2,
  totalCheckIns: 0,
  graceUsedAt: null,
  status: 'new',
}

describe('calculateStreakImpact', () => {
  it('starts a new streak on first ever check-in', () => {
    const impact = calculateStreakImpact(BASE_STREAK, '2026-03-03')
    expect(impact.action).toBe('started')
    expect(impact.newStreak).toBe(1)
  })

  it('continues streak on consecutive days', () => {
    const streak: StreakRecord = { ...BASE_STREAK, currentStreak: 5, lastActivityDate: '2026-03-02', longestStreak: 5 }
    const impact = calculateStreakImpact(streak, '2026-03-03')
    expect(impact.action).toBe('continued')
    expect(impact.newStreak).toBe(6)
  })

  it('returns already_checked_in for same day', () => {
    const streak: StreakRecord = { ...BASE_STREAK, currentStreak: 5, lastActivityDate: '2026-03-03', longestStreak: 5 }
    const impact = calculateStreakImpact(streak, '2026-03-03')
    expect(impact.action).toBe('already_checked_in')
    expect(impact.newStreak).toBe(5)
  })

  it('applies grace period for 1-day miss (no prior grace)', () => {
    const streak: StreakRecord = { ...BASE_STREAK, currentStreak: 10, lastActivityDate: '2026-03-01', longestStreak: 10, graceUsedAt: null }
    const impact = calculateStreakImpact(streak, '2026-03-03') // missed March 2
    expect(impact.action).toBe('grace')
    expect(impact.newStreak).toBe(11)
    expect(impact.usedGrace).toBe(true)
  })

  it('does not use grace if used within last 14 days', () => {
    const streak: StreakRecord = {
      ...BASE_STREAK,
      currentStreak: 10,
      lastActivityDate: '2026-03-01',
      longestStreak: 10,
      graceUsedAt: '2026-02-25', // 6 days ago, within 14-day cooldown
    }
    const impact = calculateStreakImpact(streak, '2026-03-03')
    // No grace available, has freeze tokens → should offer freeze
    expect(impact.action).toBe('broken')
  })

  it('applies freeze when explicitly requested for 1-day miss (no grace available)', () => {
    const streak: StreakRecord = {
      ...BASE_STREAK,
      currentStreak: 10,
      lastActivityDate: '2026-03-01',
      longestStreak: 10,
      graceUsedAt: '2026-02-25',
      freezeTokens: 2,
    }
    const impact = calculateStreakImpact(streak, '2026-03-03', true) // useFreeze=true
    expect(impact.action).toBe('frozen')
    expect(impact.newStreak).toBe(11)
    expect(impact.usedFreeze).toBe(true)
  })

  it('breaks streak for gap > 2 days', () => {
    const streak: StreakRecord = { ...BASE_STREAK, currentStreak: 20, lastActivityDate: '2026-02-25', longestStreak: 20 }
    const impact = calculateStreakImpact(streak, '2026-03-03')
    expect(impact.action).toBe('broken')
    expect(impact.newStreak).toBe(1)
    expect(impact.previousStreak).toBe(20)
  })
})

describe('applyStreakImpact', () => {
  it('updates longest streak when new streak exceeds it', () => {
    const streak: StreakRecord = { ...BASE_STREAK, currentStreak: 10, longestStreak: 10, lastActivityDate: '2026-03-02' }
    const impact = { action: 'continued' as const, newStreak: 11 }
    const result = applyStreakImpact(streak, impact, '2026-03-03', '2026-03-03T10:00:00Z')
    expect(result.currentStreak).toBe(11)
    expect(result.longestStreak).toBe(11)
  })

  it('deducts freeze token when freeze is used', () => {
    const streak: StreakRecord = { ...BASE_STREAK, currentStreak: 10, longestStreak: 10, freezeTokens: 2 }
    const impact = { action: 'frozen' as const, newStreak: 11, usedFreeze: true }
    const result = applyStreakImpact(streak, impact, '2026-03-03', '2026-03-03T10:00:00Z')
    expect(result.freezeTokens).toBe(1)
  })

  it('records grace usage date', () => {
    const streak: StreakRecord = { ...BASE_STREAK, currentStreak: 10, longestStreak: 10 }
    const impact = { action: 'grace' as const, newStreak: 11, usedGrace: true }
    const result = applyStreakImpact(streak, impact, '2026-03-03', '2026-03-03T10:00:00Z')
    expect(result.graceUsedAt).toBe('2026-03-03')
  })

  it('does not increment totalCheckIns for already_checked_in', () => {
    const streak: StreakRecord = { ...BASE_STREAK, currentStreak: 5, totalCheckIns: 5 }
    const impact = { action: 'already_checked_in' as const, newStreak: 5 }
    const result = applyStreakImpact(streak, impact, '2026-03-03', '2026-03-03T10:00:00Z')
    expect(result.totalCheckIns).toBe(5)
  })
})
