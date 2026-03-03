import { homedir } from 'os'
import { join } from 'path'
import { mkdirSync, existsSync, chmodSync } from 'fs'

export const VIBECHK_DIR = join(homedir(), '.vibechk')
export const PROFILE_PATH = join(VIBECHK_DIR, 'profile.json')
export const STREAK_PATH = join(VIBECHK_DIR, 'streak.json')
export const ACTIVITY_PATH = join(VIBECHK_DIR, 'activity.jsonl')
export const BADGES_PATH = join(VIBECHK_DIR, 'badges.json')
export const LEADERBOARD_CACHE_PATH = join(VIBECHK_DIR, 'leaderboard.json')

export function ensureDir(): void {
  if (!existsSync(VIBECHK_DIR)) {
    mkdirSync(VIBECHK_DIR, { recursive: true, mode: 0o700 })
  }
}

export function dataExists(): boolean {
  return existsSync(PROFILE_PATH)
}
