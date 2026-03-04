import type { UserProfile, StreakRecord, BadgesRecord, LeaderboardCache, LeaderboardEntry } from '../types/index.js'

export interface SyncPayload {
  userId: string
  username: string
  currentStreak: number
  longestStreak: number
  lastActiveDate: string | null
  freezesUsed: number
  badges: string[]
  shareOnLeaderboard: boolean
}

export interface SyncError {
  code: string
  message: string
}

function makeHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    'User-Agent': 'vibechk/0.1.0',
  }
}

export function buildSyncPayload(
  profile: UserProfile,
  streak: StreakRecord,
  badges: BadgesRecord,
): SyncPayload {
  const totalFreezesUsed = streak.totalCheckIns - streak.currentStreak // rough proxy
  return {
    userId: profile.id,
    username: profile.username,
    currentStreak: streak.currentStreak,
    longestStreak: streak.longestStreak,
    lastActiveDate: streak.lastActivityDate,
    freezesUsed: totalFreezesUsed > 0 ? totalFreezesUsed : 0,
    badges: badges.earned.map((b) => b.milestoneId),
    shareOnLeaderboard: profile.preferences.shareOnLeaderboard,
  }
}

/** Push local streak state to cloud. Returns true on success. */
export async function pushStreak(
  profile: UserProfile,
  streak: StreakRecord,
  badges: BadgesRecord,
): Promise<boolean> {
  const sync = profile.cloudSync
  if (!sync) return false

  const payload = buildSyncPayload(profile, streak, badges)

  try {
    const response = await fetch(`${sync.endpoint}/users/${profile.id}`, {
      method: 'PUT',
      headers: makeHeaders(sync.apiKey),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    })
    return response.ok
  } catch {
    return false
  }
}

/** Fetch leaderboard from cloud endpoint */
export async function fetchLeaderboard(
  profile: UserProfile,
): Promise<LeaderboardCache | null> {
  const sync = profile.cloudSync
  if (!sync) return null

  try {
    const response = await fetch(`${sync.endpoint}/leaderboard`, {
      headers: makeHeaders(sync.apiKey),
      signal: AbortSignal.timeout(8000),
    })

    if (!response.ok) return null

    const data = await response.json() as { entries: LeaderboardEntry[]; weekStart?: string }
    const entries = data.entries ?? []

    // Rank and mark self
    const sorted = [...entries].sort((a, b) => b.currentStreak - a.currentStreak)
    sorted.forEach((e, i) => {
      e.rank = i + 1
      e.isYou = e.userId === profile.id
    })

    return {
      entries: sorted,
      fetchedAt: new Date().toISOString(),
      source: sync.endpoint,
      weekStart: data.weekStart ?? '',
    }
  } catch {
    return null
  }
}
