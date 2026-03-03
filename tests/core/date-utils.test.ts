import { describe, it, expect } from 'vitest'
import { daysBetween, formatCountdown } from '../../src/core/date-utils'

describe('daysBetween', () => {
  it('returns 1 for consecutive days', () => {
    expect(daysBetween('2026-03-02', '2026-03-03')).toBe(1)
  })

  it('returns 0 for same day', () => {
    expect(daysBetween('2026-03-03', '2026-03-03')).toBe(0)
  })

  it('returns negative for reverse order', () => {
    expect(daysBetween('2026-03-03', '2026-03-02')).toBe(-1)
  })

  it('handles month boundaries', () => {
    expect(daysBetween('2026-02-28', '2026-03-01')).toBe(1)
  })

  it('handles year boundaries', () => {
    expect(daysBetween('2025-12-31', '2026-01-01')).toBe(1)
  })

  it('handles longer gaps', () => {
    expect(daysBetween('2026-01-01', '2026-03-03')).toBe(61)
  })
})

describe('formatCountdown', () => {
  it('formats hours and minutes', () => {
    expect(formatCountdown(3661)).toBe('1h 1m')
  })

  it('formats minutes only', () => {
    expect(formatCountdown(300)).toBe('5m')
  })

  it('formats zero', () => {
    expect(formatCountdown(0)).toBe('0m')
  })
})
