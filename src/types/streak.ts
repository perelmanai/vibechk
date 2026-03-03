export type StreakStatus = 'active' | 'at_risk' | 'broken' | 'frozen' | 'grace' | 'new'

export interface StreakRecord {
  currentStreak: number
  longestStreak: number
  lastActivityDate: string | null // "YYYY-MM-DD" in user's timezone, null if never
  lastCheckInAt: string | null // ISO 8601
  freezeTokens: number
  totalCheckIns: number
  graceUsedAt: string | null // date string "YYYY-MM-DD" of last grace use
  status: StreakStatus
}

export type StreakAction =
  | 'continued'
  | 'started'
  | 'grace'
  | 'frozen'
  | 'already_checked_in'
  | 'broken'

export interface StreakImpact {
  action: StreakAction
  newStreak: number
  previousStreak?: number // populated on 'broken'
  usedGrace?: boolean
  usedFreeze?: boolean
}
