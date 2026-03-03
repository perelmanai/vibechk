export type { ActivitySource, CelebrationLevel, CloudSyncConfig, UserPreferences, UserProfile } from './profile.js'
export type { StreakStatus, StreakRecord, StreakAction, StreakImpact } from './streak.js'
export type { AgentData, ActivityEntry } from './activity.js'
export type { MilestoneRarity, MilestoneDefinition, EarnedBadge, BadgesRecord } from './badges.js'
export type { LeaderboardEntry, LeaderboardCache } from './leaderboard.js'

export interface CheckInOptions {
  source?: ActivitySource
  notes?: string
  autoFreeze?: boolean // auto-apply freeze if available (for non-interactive callers)
  dryRun?: boolean
}

export interface CheckInResult {
  action: StreakAction
  streak: number
  previousStreak?: number
  newMilestones: MilestoneDefinition[]
  freezeTokensRemaining: number
  agentData?: AgentData
}

import type { ActivitySource } from './profile.js'
import type { StreakAction } from './streak.js'
import type { AgentData } from './activity.js'
import type { MilestoneDefinition } from './badges.js'
