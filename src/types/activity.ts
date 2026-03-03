import type { ActivitySource } from './profile.js'

export interface AgentData {
  sessions: number
  tokensApprox: number
  models?: string[]
}

export interface ActivityEntry {
  date: string // "YYYY-MM-DD" in user's timezone
  checkedInAt: string // ISO 8601 UTC
  source: ActivitySource
  isFrozen: boolean
  isGrace: boolean
  sessionId: string // UUID
  agentData?: AgentData
  notes?: string
}
