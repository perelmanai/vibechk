import { readJson, writeJson } from './atomic.js'
import { STREAK_PATH, ensureDir } from './paths.js'
import type { StreakRecord } from '../types/index.js'

export const DEFAULT_STREAK: StreakRecord = {
  currentStreak: 0,
  longestStreak: 0,
  lastActivityDate: null,
  lastCheckInAt: null,
  freezeTokens: 2,
  totalCheckIns: 0,
  graceUsedAt: null,
  status: 'new',
}

export function loadStreak(): StreakRecord {
  return readJson<StreakRecord>(STREAK_PATH) ?? { ...DEFAULT_STREAK }
}

export function saveStreak(streak: StreakRecord): void {
  ensureDir()
  writeJson(STREAK_PATH, streak)
}
