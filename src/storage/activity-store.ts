import { appendFileSync, existsSync, readFileSync } from 'fs'
import { ACTIVITY_PATH, ensureDir } from './paths.js'
import type { ActivityEntry } from '../types/index.js'

export function appendActivity(entry: ActivityEntry): void {
  ensureDir()
  const line = JSON.stringify(entry) + '\n'
  appendFileSync(ACTIVITY_PATH, line, { encoding: 'utf8', mode: 0o600 })
}

export function loadActivity(): ActivityEntry[] {
  if (!existsSync(ACTIVITY_PATH)) return []
  try {
    const content = readFileSync(ACTIVITY_PATH, 'utf8')
    return content
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as ActivityEntry)
  } catch {
    return []
  }
}

/** Get the last N days of activity */
export function recentActivity(days = 30): ActivityEntry[] {
  const all = loadActivity()
  return all.slice(-days)
}
