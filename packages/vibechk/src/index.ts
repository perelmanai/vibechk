// Public programmatic API for vibechk

export { runCheckIn as checkIn } from './commands/check-in.js'
export { getStreak } from './commands/status.js'
export { getLeaderboard } from './commands/leaderboard.js'
export { loadProfile as getProfile } from './storage/profile-store.js'
export { runExport as exportData } from './commands/export.js'

export type {
  UserProfile,
  StreakRecord,
  StreakStatus,
  StreakAction,
  StreakImpact,
  ActivityEntry,
  AgentData,
  MilestoneDefinition,
  EarnedBadge,
  BadgesRecord,
  LeaderboardEntry,
  LeaderboardCache,
  CheckInOptions,
  CheckInResult,
  ActivitySource,
  CelebrationLevel,
} from './types/index.js'
