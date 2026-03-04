/**
 * Minimal local HTTP server that serves the visual dashboard.
 * Opens in the browser via `open`. No external dependencies beyond node:http.
 */
import { createServer, IncomingMessage, ServerResponse } from 'http'
import { AddressInfo } from 'net'
import { loadProfile, requireProfile } from '../storage/profile-store.js'
import { loadStreak } from '../storage/streak-store.js'
import { loadActivity } from '../storage/activity-store.js'
import { loadBadges } from '../storage/badge-store.js'
import { loadLeaderboardCache } from '../storage/leaderboard-cache.js'
import { getAllMilestones } from '../core/milestone-checker.js'
import { todayInTz } from '../core/date-utils.js'

export async function startDashboard(autoClose = true): Promise<string> {
  const profile = requireProfile()
  const streak = loadStreak()
  const activity = loadActivity()
  const badges = loadBadges()
  const leaderboard = loadLeaderboardCache()
  const milestones = getAllMilestones()
  const today = todayInTz(profile.timezone)

  const dashboardData = {
    profile: { username: profile.username, timezone: profile.timezone },
    streak,
    recentActivity: activity.slice(-90),
    badges: badges.earned,
    milestones,
    leaderboard,
    today,
  }

  const html = generateDashboardHtml(dashboardData)

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.url === '/data') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(dashboardData))
      return
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(html)

    if (autoClose) {
      setTimeout(() => server.close(), 500)
    }
  })

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo
      const url = `http://127.0.0.1:${addr.port}`
      resolve(url)
    })
  })
}

function generateDashboardHtml(data: any): string {
  const { profile, streak, recentActivity, badges, milestones, leaderboard, today } = data

  // Build activity map: date → { checked, frozen, grace }
  const activityMap: Record<string, any> = {}
  for (const a of recentActivity) {
    activityMap[a.date] = { checked: true, frozen: a.isFrozen, grace: a.isGrace, source: a.source }
  }

  // Generate last 90 days of calendar cells (GitHub contribution graph style)
  const cells: string[] = []
  for (let i = 89; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().slice(0, 10)
    const act = activityMap[dateStr]
    const isToday = dateStr === today

    let cls = 'day-empty'
    if (act?.frozen) cls = 'day-frozen'
    else if (act?.grace) cls = 'day-grace'
    else if (act?.checked) cls = 'day-active'
    if (isToday) cls += ' day-today'

    cells.push(`<div class="day ${cls}" title="${dateStr}"></div>`)
  }

  // Leaderboard rows
  const lbRows = leaderboard
    ? leaderboard.entries
        .slice(0, 20)
        .map((e: any) => {
          const isYou = e.userId === profile.id || e.displayName === profile.username
          const badges_icons = (e.badges || [])
            .slice(0, 3)
            .map((id: string) => milestones.find((m: any) => m.id === id)?.icon ?? '')
            .join('')
          return `<tr class="${isYou ? 'you' : ''}">
          <td class="rank">${e.rank ?? '?'}</td>
          <td class="name">${isYou ? '→ ' : ''}${e.displayName}</td>
          <td class="streak">${e.currentStreak}d</td>
          <td class="longest">${e.longestStreak}d</td>
          <td class="badges">${badges_icons}${e.freezesUsed > 0 ? `<span class="freeze-used">${e.freezesUsed}❄</span>` : ''}</td>
        </tr>`
        })
        .join('\n')
    : '<tr><td colspan="5" class="empty">No leaderboard data — run <code>vibechk sync</code></td></tr>'

  // Badge list
  const earnedIds = new Set(badges.map((b: any) => b.milestoneId))
  const milestoneCards = milestones
    .map((m: any) => {
      const earned = earnedIds.has(m.id)
      return `<div class="milestone-card ${earned ? 'earned' : 'locked'} rarity-${m.rarity}">
      <div class="ms-icon">${earned ? m.icon : '🔒'}</div>
      <div class="ms-name">${m.name}</div>
      <div class="ms-req">${m.streakRequired}d</div>
    </div>`
    })
    .join('\n')

  const isCheckedInToday = streak.lastActivityDate === today
  const streakEmoji = streak.currentStreak >= 100 ? '💯' : streak.currentStreak >= 30 ? '🏆' : '🔥'

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>vibechk — ${profile.username}</title>
  <style>
    :root {
      --bg: #0d1117;
      --surface: #161b22;
      --border: #30363d;
      --text: #e6edf3;
      --muted: #8b949e;
      --accent: #f78166;
      --green: #3fb950;
      --yellow: #d29922;
      --blue: #58a6ff;
      --frozen: #79c0ff;
      --grace: #ffa657;
      --purple: #bc8cff;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      padding: 24px;
    }
    h1, h2, h3 { font-weight: 600; }
    .container { max-width: 900px; margin: 0 auto; }
    header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 32px;
    }
    header .logo {
      font-size: 1.5rem;
      font-weight: 700;
      background: linear-gradient(135deg, #f78166, #d29922);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    header .username {
      color: var(--muted);
      font-size: 0.9rem;
    }

    /* Streak hero card */
    .streak-hero {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 28px 32px;
      margin-bottom: 24px;
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 16px;
      align-items: center;
    }
    .streak-number {
      font-size: 4rem;
      font-weight: 700;
      line-height: 1;
      color: var(--accent);
    }
    .streak-label {
      color: var(--muted);
      font-size: 0.9rem;
      margin-top: 4px;
    }
    .streak-stats {
      display: flex;
      gap: 24px;
    }
    .stat { text-align: center; }
    .stat-value { font-size: 1.5rem; font-weight: 600; color: var(--blue); }
    .stat-label { font-size: 0.75rem; color: var(--muted); margin-top: 2px; }

    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.8rem;
      font-weight: 500;
      margin-top: 8px;
    }
    .status-badge.protected { background: rgba(63, 185, 80, 0.15); color: var(--green); border: 1px solid rgba(63,185,80,0.3); }
    .status-badge.at-risk { background: rgba(210, 153, 34, 0.15); color: var(--yellow); border: 1px solid rgba(210,153,34,0.3); }
    .status-badge.broken { background: rgba(247, 129, 102, 0.15); color: var(--accent); border: 1px solid rgba(247,129,102,0.3); }

    .freeze-tokens {
      font-size: 1.2rem;
      margin-top: 8px;
    }

    /* Progress bar */
    .progress-section {
      margin-top: 16px;
      grid-column: 1 / -1;
    }
    .progress-label {
      font-size: 0.75rem;
      color: var(--muted);
      margin-bottom: 6px;
    }
    .progress-bar-track {
      height: 8px;
      background: var(--border);
      border-radius: 4px;
      overflow: hidden;
    }
    .progress-bar-fill {
      height: 100%;
      border-radius: 4px;
      background: linear-gradient(90deg, #f78166, #d29922);
      transition: width 0.6s ease;
    }

    /* Calendar grid */
    .section {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px 24px;
      margin-bottom: 24px;
    }
    .section h2 {
      font-size: 0.85rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
      margin-bottom: 16px;
    }
    .calendar-grid {
      display: grid;
      grid-template-columns: repeat(13, 1fr);
      gap: 3px;
    }
    .day {
      aspect-ratio: 1;
      border-radius: 3px;
      cursor: default;
      transition: transform 0.1s;
    }
    .day:hover { transform: scale(1.3); }
    .day-empty { background: var(--border); }
    .day-active { background: var(--green); }
    .day-frozen { background: var(--frozen); }
    .day-grace { background: var(--grace); }
    .day-today { outline: 2px solid var(--text); outline-offset: 1px; }
    .calendar-legend {
      display: flex;
      gap: 16px;
      margin-top: 12px;
      flex-wrap: wrap;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.75rem;
      color: var(--muted);
    }
    .legend-dot {
      width: 12px;
      height: 12px;
      border-radius: 3px;
    }

    /* Leaderboard */
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 8px 12px; text-align: left; font-size: 0.875rem; }
    th { color: var(--muted); font-weight: 500; border-bottom: 1px solid var(--border); }
    tr.you { background: rgba(88, 166, 255, 0.08); }
    tr.you td { color: var(--blue); font-weight: 600; }
    td.rank { color: var(--muted); width: 40px; }
    td.streak { color: var(--accent); font-weight: 600; }
    td.longest { color: var(--muted); }
    td.badges { font-size: 1rem; letter-spacing: 2px; }
    td.empty { color: var(--muted); font-style: italic; padding: 20px 12px; }
    .freeze-used { font-size: 0.7rem; color: var(--frozen); margin-left: 4px; }
    tr:hover:not(.you) { background: rgba(255,255,255,0.03); }

    /* Milestones */
    .milestones-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
      gap: 12px;
    }
    .milestone-card {
      text-align: center;
      padding: 16px 8px;
      border-radius: 10px;
      border: 1px solid var(--border);
      transition: transform 0.2s;
    }
    .milestone-card:hover { transform: translateY(-2px); }
    .milestone-card.locked { opacity: 0.35; filter: grayscale(1); }
    .milestone-card.earned { border-color: transparent; }
    .milestone-card.rarity-common.earned { background: rgba(63,185,80,0.1); border-color: rgba(63,185,80,0.3); }
    .milestone-card.rarity-rare.earned { background: rgba(88,166,255,0.1); border-color: rgba(88,166,255,0.3); }
    .milestone-card.rarity-epic.earned { background: rgba(210,153,34,0.1); border-color: rgba(210,153,34,0.3); }
    .milestone-card.rarity-legendary.earned { background: rgba(188,140,255,0.1); border-color: rgba(188,140,255,0.3); }
    .ms-icon { font-size: 1.75rem; margin-bottom: 6px; }
    .ms-name { font-size: 0.7rem; font-weight: 600; color: var(--text); }
    .ms-req { font-size: 0.65rem; color: var(--muted); margin-top: 2px; }

    /* Animations */
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
    .streak-number { animation: ${isCheckedInToday ? 'none' : 'pulse 2s ease-in-out infinite'}; }

    @keyframes celebrate {
      0% { transform: scale(1); }
      50% { transform: scale(1.05); }
      100% { transform: scale(1); }
    }
    .celebrate { animation: celebrate 0.5s ease-in-out; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="logo">vibechk</div>
      <div class="username">@${profile.username}</div>
    </header>

    <!-- Streak Hero -->
    <div class="streak-hero" id="heroCard">
      <div>
        <div class="streak-number">${streakEmoji} ${streak.currentStreak}</div>
        <div class="streak-label">day streak</div>
        <div class="status-badge ${isCheckedInToday ? 'protected' : streak.currentStreak > 0 ? 'at-risk' : 'broken'}">
          ${isCheckedInToday ? '✓ Protected for today' : streak.currentStreak > 0 ? '○ Check in to protect' : '● Start your streak'}
        </div>
        <div class="freeze-tokens" title="Freeze tokens available">
          ${'❄️'.repeat(streak.freezeTokens)}${streak.freezeTokens === 0 ? '<span style="color:var(--muted);font-size:0.8rem">No freezes</span>' : ''}
        </div>
      </div>
      <div class="streak-stats">
        <div class="stat">
          <div class="stat-value">${streak.longestStreak}d</div>
          <div class="stat-label">Longest</div>
        </div>
        <div class="stat">
          <div class="stat-value">${streak.totalCheckIns}</div>
          <div class="stat-label">Total days</div>
        </div>
      </div>
    </div>

    <!-- Activity Calendar -->
    <div class="section">
      <h2>Last 90 Days</h2>
      <div class="calendar-grid">
        ${cells.join('\n        ')}
      </div>
      <div class="calendar-legend">
        <div class="legend-item"><div class="legend-dot" style="background:var(--green)"></div> Coded</div>
        <div class="legend-item"><div class="legend-dot" style="background:var(--frozen)"></div> Frozen</div>
        <div class="legend-item"><div class="legend-dot" style="background:var(--grace)"></div> Grace</div>
        <div class="legend-item"><div class="legend-dot" style="background:var(--border)"></div> Missed</div>
      </div>
    </div>

    <!-- Leaderboard -->
    <div class="section">
      <h2>Leaderboard</h2>
      ${leaderboard ? `<table>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Name</th>
            <th>Streak</th>
            <th>Longest</th>
            <th>Badges</th>
          </tr>
        </thead>
        <tbody>
          ${lbRows}
        </tbody>
      </table>` : '<p style="color:var(--muted);font-size:0.875rem">No leaderboard data yet. Configure cloud sync to compare with friends.</p>'}
    </div>

    <!-- Milestones -->
    <div class="section">
      <h2>Milestones</h2>
      <div class="milestones-grid">
        ${milestoneCards}
      </div>
    </div>
  </div>

  <script>
    // Celebrate if just reached a new milestone
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('celebrate')) {
      document.getElementById('heroCard').classList.add('celebrate');
    }

    // Auto-refresh every 60s
    setTimeout(() => window.location.reload(), 60000);
  </script>
</body>
</html>`
}
