import type { MilestoneDefinition, EarnedBadge, BadgesRecord } from '../types/index.js'

// Inlined milestone definitions (avoids import.meta.url issues in CJS bundles)
const MILESTONES: MilestoneDefinition[] = [
  { id: 'streak_3', name: 'Warming Up', description: '3 days of vibe coding', streakRequired: 3, icon: '🌱', rarity: 'common', freezeTokenReward: 0 },
  { id: 'streak_7', name: 'Week Warrior', description: "7 days straight — that's a real habit", streakRequired: 7, icon: '⚡', rarity: 'common', freezeTokenReward: 0 },
  { id: 'streak_14', name: 'Fortnight Coder', description: 'Two weeks of consistent vibe coding', streakRequired: 14, icon: '🚀', rarity: 'common', freezeTokenReward: 0 },
  { id: 'streak_30', name: 'Monthly Builder', description: 'A full month of showing up every day', streakRequired: 30, icon: '🏆', rarity: 'rare', freezeTokenReward: 1 },
  { id: 'streak_60', name: 'Two Month Grind', description: "60 days — you're not messing around", streakRequired: 60, icon: '💎', rarity: 'rare', freezeTokenReward: 1 },
  { id: 'streak_90', name: 'Quarter Strong', description: 'Three months of daily vibe coding', streakRequired: 90, icon: '🔥', rarity: 'epic', freezeTokenReward: 1 },
  { id: 'streak_100', name: 'Triple Digits', description: '100 days. This is who you are.', streakRequired: 100, icon: '💯', rarity: 'epic', freezeTokenReward: 0 },
  { id: 'streak_180', name: 'Half Year Vibe', description: 'Six months of consistent AI-assisted coding', streakRequired: 180, icon: '🌟', rarity: 'legendary', freezeTokenReward: 0 },
  { id: 'streak_365', name: 'Year of the Vibe', description: '365 days. Legendary status achieved.', streakRequired: 365, icon: '👑', rarity: 'legendary', freezeTokenReward: 0 },
]

export function getAllMilestones(): MilestoneDefinition[] {
  return MILESTONES
}

/**
 * Returns milestones newly earned by reaching `newStreak`,
 * filtering out ones already in the badges record.
 */
export function checkNewMilestones(
  newStreak: number,
  badges: BadgesRecord,
): MilestoneDefinition[] {
  const all = getAllMilestones()
  const earnedIds = new Set(badges.earned.map((b) => b.milestoneId))
  return all.filter((m) => m.streakRequired <= newStreak && !earnedIds.has(m.id))
}

/** Create EarnedBadge records for newly earned milestones */
export function createEarnedBadges(
  milestones: MilestoneDefinition[],
  streak: number,
  nowIso: string,
): EarnedBadge[] {
  return milestones.map((m) => ({
    milestoneId: m.id,
    earnedAt: nowIso,
    streakAtEarning: streak,
  }))
}

/** Total freeze tokens to award from a set of newly earned milestones */
export function totalFreezeReward(milestones: MilestoneDefinition[]): number {
  return milestones.reduce((sum, m) => sum + m.freezeTokenReward, 0)
}
