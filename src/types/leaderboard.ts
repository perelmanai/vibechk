export interface LeaderboardEntry {
  userId: string
  displayName: string
  currentStreak: number
  longestStreak: number
  freezesUsed: number
  badges: string[] // milestone IDs
  lastActiveDate: string // "YYYY-MM-DD"
  rank?: number
  isYou?: boolean
}

export interface LeaderboardCache {
  entries: LeaderboardEntry[]
  fetchedAt: string // ISO 8601
  source: string // endpoint URL
  weekStart: string // "YYYY-MM-DD"
}
