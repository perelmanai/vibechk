import { readJson, writeJson } from './atomic.js'
import { BADGES_PATH, ensureDir } from './paths.js'
import type { BadgesRecord, EarnedBadge } from '../types/index.js'

const DEFAULT_BADGES: BadgesRecord = { earned: [] }

export function loadBadges(): BadgesRecord {
  return readJson<BadgesRecord>(BADGES_PATH) ?? { ...DEFAULT_BADGES }
}

export function saveBadges(badges: BadgesRecord): void {
  ensureDir()
  writeJson(BADGES_PATH, badges)
}

export function appendBadges(newBadges: EarnedBadge[]): void {
  if (newBadges.length === 0) return
  const current = loadBadges()
  current.earned.push(...newBadges)
  saveBadges(current)
}
