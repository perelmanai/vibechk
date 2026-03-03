export type ActivitySource = 'claude-code' | 'manual' | 'git-hook' | 'api' | 'import'

export type CelebrationLevel = 'minimal' | 'normal' | 'enthusiastic'

export interface CloudSyncConfig {
  endpoint: string
  apiKey: string
  lastSyncedAt: string | null
}

export interface UserPreferences {
  shareOnLeaderboard: boolean
  notificationsEnabled: boolean
  notificationTime: string // "HH:MM"
  celebrationLevel: CelebrationLevel
  sessionSources: ActivitySource[]
  weekendsCount: boolean
}

export interface UserProfile {
  id: string // UUID v4
  username: string
  timezone: string // IANA e.g. "America/New_York"
  createdAt: string // ISO 8601
  cloudSync: CloudSyncConfig | null
  preferences: UserPreferences
}
