import { requireProfile } from '../storage/profile-store.js'
import { loadStreak } from '../storage/streak-store.js'
import { loadActivity } from '../storage/activity-store.js'
import { loadBadges } from '../storage/badge-store.js'

export interface ExportData {
  exportedAt: string
  version: string
  profile: {
    username: string
    timezone: string
    createdAt: string
  }
  streak: ReturnType<typeof loadStreak>
  activity: ReturnType<typeof loadActivity>
  badges: ReturnType<typeof loadBadges>
}

export async function runExport(options: { format?: 'json' | 'csv' } = {}): Promise<void> {
  const profile = requireProfile()
  const streak = loadStreak()
  const activity = loadActivity()
  const badges = loadBadges()

  const data: ExportData = {
    exportedAt: new Date().toISOString(),
    version: '0.1.0',
    profile: {
      username: profile.username,
      timezone: profile.timezone,
      createdAt: profile.createdAt,
    },
    streak,
    activity,
    badges,
  }

  if (options.format === 'csv') {
    const rows = ['date,source,isFrozen,isGrace']
    for (const a of activity) {
      rows.push(`${a.date},${a.source},${a.isFrozen},${a.isGrace}`)
    }
    process.stdout.write(rows.join('\n') + '\n')
  } else {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n')
  }
}
