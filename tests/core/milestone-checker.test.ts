import { describe, it, expect } from 'vitest'
import { checkNewMilestones, totalFreezeReward, getAllMilestones } from '../../src/core/milestone-checker'
import type { BadgesRecord } from '../../src/types/index'

const emptyBadges: BadgesRecord = { earned: [] }

describe('getAllMilestones', () => {
  it('returns 9 milestones', () => {
    expect(getAllMilestones().length).toBe(9)
  })

  it('milestones are sorted by streakRequired', () => {
    const ms = getAllMilestones()
    for (let i = 1; i < ms.length; i++) {
      expect(ms[i].streakRequired).toBeGreaterThan(ms[i - 1].streakRequired)
    }
  })
})

describe('checkNewMilestones', () => {
  it('returns milestones earned at streak 7', () => {
    const result = checkNewMilestones(7, emptyBadges)
    const ids = result.map((m) => m.id)
    expect(ids).toContain('streak_3')
    expect(ids).toContain('streak_7')
    expect(ids).not.toContain('streak_14')
  })

  it('does not return already-earned milestones', () => {
    const badges: BadgesRecord = {
      earned: [{ milestoneId: 'streak_3', earnedAt: '2026-01-01T00:00:00Z', streakAtEarning: 3 }],
    }
    const result = checkNewMilestones(7, badges)
    const ids = result.map((m) => m.id)
    expect(ids).not.toContain('streak_3')
    expect(ids).toContain('streak_7')
  })

  it('returns empty array if no new milestones', () => {
    const badges: BadgesRecord = {
      earned: [
        { milestoneId: 'streak_3', earnedAt: '2026-01-01T00:00:00Z', streakAtEarning: 3 },
        { milestoneId: 'streak_7', earnedAt: '2026-01-08T00:00:00Z', streakAtEarning: 7 },
      ],
    }
    const result = checkNewMilestones(7, badges)
    expect(result).toHaveLength(0)
  })
})

describe('totalFreezeReward', () => {
  it('sums freeze token rewards', () => {
    const ms = getAllMilestones().filter((m) => m.id === 'streak_30' || m.id === 'streak_60')
    expect(totalFreezeReward(ms)).toBe(2) // 1 + 1
  })

  it('returns 0 for no reward milestones', () => {
    const ms = getAllMilestones().filter((m) => m.id === 'streak_7')
    expect(totalFreezeReward(ms)).toBe(0)
  })
})
