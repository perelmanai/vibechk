export type MilestoneRarity = 'common' | 'rare' | 'epic' | 'legendary'

export interface MilestoneDefinition {
  id: string
  name: string
  description: string
  streakRequired: number
  icon: string // single emoji
  rarity: MilestoneRarity
  freezeTokenReward: number // how many freeze tokens this milestone grants
}

export interface EarnedBadge {
  milestoneId: string
  earnedAt: string // ISO 8601
  streakAtEarning: number
}

export interface BadgesRecord {
  earned: EarnedBadge[]
}
