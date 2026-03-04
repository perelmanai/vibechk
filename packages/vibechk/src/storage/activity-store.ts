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

/** Get activity entries within the last N calendar days (inclusive of today) */
export function recentActivity(days = 30): ActivityEntry[] {
  const all = loadActivity()
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - (days - 1))
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  return all.filter((a) => a.date >= cutoffStr)
}
