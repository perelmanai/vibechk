import { homedir } from 'os'
import { join } from 'path'
import { mkdirSync, existsSync, chmodSync } from 'fs'

export const VIBECHK_SERVER = (process.env.VIBECHK_SERVER ?? 'https://vibechk.dev').replace(/\/$/, '')

export const VIBECHK_DIR = join(homedir(), '.vibechk')
export const PROFILE_PATH = join(VIBECHK_DIR, 'profile.json')
export const STREAK_PATH = join(VIBECHK_DIR, 'streak.json')
export const ACTIVITY_PATH = join(VIBECHK_DIR, 'activity.jsonl')
export const BADGES_PATH = join(VIBECHK_DIR, 'badges.json')
export const LEADERBOARD_CACHE_PATH = join(VIBECHK_DIR, 'leaderboard.json')
export const FRIENDS_PATH = join(VIBECHK_DIR, 'friends.json')
export const GIST_TOKEN_PATH = join(VIBECHK_DIR, 'gist-token')  // mode 0o600, never synced

export function ensureDir(): void {
  if (!existsSync(VIBECHK_DIR)) {
    mkdirSync(VIBECHK_DIR, { recursive: true, mode: 0o700 })
  }
}

export function dataExists(): boolean {
  return existsSync(PROFILE_PATH)
}
