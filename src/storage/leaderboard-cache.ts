import { readJson, writeJson } from './atomic.js'
import { LEADERBOARD_CACHE_PATH, ensureDir } from './paths.js'
import type { LeaderboardCache } from '../types/index.js'

const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

export function loadLeaderboardCache(): LeaderboardCache | null {
  return readJson<LeaderboardCache>(LEADERBOARD_CACHE_PATH)
}

export function saveLeaderboardCache(cache: LeaderboardCache): void {
  ensureDir()
  writeJson(LEADERBOARD_CACHE_PATH, cache)
}

export function isCacheStale(cache: LeaderboardCache): boolean {
  const age = Date.now() - new Date(cache.fetchedAt).getTime()
  return age > CACHE_TTL_MS
}
