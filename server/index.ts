#!/usr/bin/env node
/**
 * vibechk server
 *
 * GET  /                      landing page
 * GET  /leaderboard           leaderboard page
 * GET  /dashboard             user dashboard (requires GitHub auth)
 * GET  /auth/github           start GitHub OAuth
 * GET  /auth/github/callback  OAuth callback
 * GET  /auth/logout           clear session
 * GET  /u/:username           public profile card (HTML)
 * GET  /u/:username.json      public profile (JSON, for CLI)
 * PUT  /api/users/:uuid       CLI publish endpoint
 * GET  /leaderboard.json      top 50 JSON (for CLI)
 * GET  /health                health check
 */

import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { cors } from 'hono/cors'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs'
import { join } from 'path'
import { randomUUID, randomBytes } from 'crypto'

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? '3000', 10)
const BASE_URL = (process.env.BASE_URL ?? `http://localhost:${PORT}`).replace(/\/$/, '')
const DATA_DIR = process.env.DATA_DIR ?? join(process.cwd(), 'data')
const PROFILES_DIR = join(DATA_DIR, 'profiles')
const CLAIMS_PATH = join(DATA_DIR, 'claims.json')
const GH_CLIENT_ID = process.env.GITHUB_CLIENT_ID ?? ''
const GH_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET ?? ''
const AUTH_ENABLED = !!(GH_CLIENT_ID && GH_CLIENT_SECRET)

// ─────────────────────────────────────────────────────────────────────────────
// Session store (in-memory — replace with Redis/SQLite in production)
// ─────────────────────────────────────────────────────────────────────────────

interface Session { githubLogin: string; githubId: number; name: string }
type Vars = { session: Session | undefined }

const sessions = new Map<string, Session>()
const oauthStates = new Map<string, number>() // state → expiry ms

// ─────────────────────────────────────────────────────────────────────────────
// Storage helpers
// ─────────────────────────────────────────────────────────────────────────────

function ensureDirs(): void { mkdirSync(PROFILES_DIR, { recursive: true }) }

function loadClaims(): Record<string, string> {
  if (!existsSync(CLAIMS_PATH)) return {}
  try { return JSON.parse(readFileSync(CLAIMS_PATH, 'utf8')) } catch { return {} }
}

function saveClaims(c: Record<string, string>): void {
  writeFileSync(CLAIMS_PATH, JSON.stringify(c, null, 2))
}

function loadProfile(username: string): object | null {
  const p = join(PROFILES_DIR, `${username}.json`)
  if (!existsSync(p)) return null
  try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return null }
}

function saveProfileFile(username: string, data: object): void {
  writeFileSync(join(PROFILES_DIR, `${username}.json`), JSON.stringify(data, null, 2))
}

function loadAllProfiles(): any[] {
  if (!existsSync(PROFILES_DIR)) return []
  return readdirSync(PROFILES_DIR)
    .filter(f => f.endsWith('.json'))
    .flatMap(f => {
      try { return [JSON.parse(readFileSync(join(PROFILES_DIR, f), 'utf8'))] } catch { return [] }
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

function streakEmoji(n: number): string {
  if (n === 0) return '🌱'
  if (n >= 30) return '🏆'
  if (n >= 7) return '🔥'
  return '⚡'
}

function rankBadge(i: number): string {
  return i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : String(i + 1)
}

function relativeDate(date: string | null | undefined): string {
  if (!date) return '—'
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / 86400000)
  if (diff === 0) return 'today'
  if (diff === 1) return 'yesterday'
  if (diff < 7) return `${diff}d ago`
  if (diff < 30) return `${Math.floor(diff / 7)}w ago`
  return `${Math.floor(diff / 30)}mo ago`
}

function todayStr(): string { return new Date().toISOString().slice(0, 10) }
function avatarUrl(login: string): string {
  return `https://github.com/${encodeURIComponent(login)}.png?size=80`
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML layout
// ─────────────────────────────────────────────────────────────────────────────

const GH_ICON = `<svg class="w-4 h-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>`

function nav(session: Session | undefined): string {
  const right = AUTH_ENABLED
    ? session
      ? `<div class="flex items-center gap-3">
           <img src="${avatarUrl(session.githubLogin)}" class="w-7 h-7 rounded-full bg-zinc-800" alt="" onerror="this.style.visibility='hidden'">
           <a href="/dashboard" class="text-sm text-zinc-300 hover:text-white transition-colors">@${session.githubLogin}</a>
           <a href="/auth/logout" class="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">Sign out</a>
         </div>`
      : `<a href="/auth/github" class="flex items-center gap-2 px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-sm transition-colors">
           ${GH_ICON} Sign in with GitHub
         </a>`
    : ''

  return `<nav class="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-sm">
  <div class="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
    <a href="/" class="flex items-center gap-2 font-bold text-lg tracking-tight">
      <span class="text-amber-400">🔥</span>vibechk
    </a>
    <div class="flex items-center gap-5">
      <a href="/leaderboard" class="text-sm text-zinc-400 hover:text-white transition-colors">Leaderboard</a>
      ${right}
    </div>
  </div>
</nav>`
}

function layout(title: string, body: string, session: Session | undefined, ogDesc?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="${ogDesc ?? 'Track your vibe coding streak'}">
<title>${title}${title === 'vibechk' ? '' : ' — vibechk'}</title>
<script src="https://cdn.tailwindcss.com"></script>
<script>
tailwind.config = {
  theme: {
    extend: {
      keyframes: { 'fade-in': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'none' } } },
      animation: { 'fade-in': 'fade-in .35s ease both' }
    }
  }
}
</script>
<style>
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif }
.glow { text-shadow: 0 0 28px rgba(251,191,36,.5) }
.mono { font-family: ui-monospace, 'Cascadia Code', monospace }
</style>
</head>
<body class="bg-zinc-950 text-zinc-100 min-h-screen">
${nav(session)}
${body}
<footer class="border-t border-zinc-800 mt-24 py-10">
  <div class="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-zinc-600">
    <span>vibechk — vibe coding streak tracker</span>
    <div class="flex items-center gap-5">
      <a href="https://github.com/perelmanai/vibechk" class="hover:text-zinc-400 transition-colors">GitHub</a>
      <a href="/leaderboard.json" class="hover:text-zinc-400 transition-colors">JSON API</a>
    </div>
  </div>
</footer>
</body>
</html>`
}

// ─────────────────────────────────────────────────────────────────────────────
// Landing page
// ─────────────────────────────────────────────────────────────────────────────

function landingPage(top5: any[], totalUsers: number, activeToday: number, session: Session | undefined): string {
  const previewRows = top5.length
    ? top5.map((p, i) => `
      <div class="flex items-center gap-3 py-3 ${i < top5.length - 1 ? 'border-b border-zinc-800' : ''}">
        <span class="w-6 text-center text-sm font-bold ${i < 3 ? 'text-amber-400' : 'text-zinc-600'}">${rankBadge(i)}</span>
        <img src="${avatarUrl(p.username)}" class="w-8 h-8 rounded-full bg-zinc-800 flex-shrink-0" alt="" onerror="this.style.visibility='hidden'">
        <a href="/u/${p.username}" class="flex-1 font-medium hover:text-amber-400 transition-colors">@${p.username}</a>
        <span class="mono font-bold text-amber-400">${p.currentStreak ?? 0}</span>
        <span>${streakEmoji(p.currentStreak ?? 0)}</span>
      </div>`).join('')
    : `<p class="py-8 text-center text-zinc-600 text-sm">No streaks yet — be the first to publish!</p>`

  const steps = [
    ['npm install -g vibechk', 'Install globally'],
    ['vibechk init', 'Choose your username'],
    ['vibechk publish', 'Join the leaderboard'],
  ]

  return layout('vibechk', `
<main>
  <!-- Hero -->
  <section class="max-w-5xl mx-auto px-4 pt-20 pb-16 text-center animate-fade-in">
    <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-zinc-800 text-xs text-zinc-500 mb-8">
      <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
      ${totalUsers} coders tracked · ${activeToday} active today
    </div>
    <h1 class="text-5xl sm:text-6xl font-extrabold leading-tight mb-5">
      Track your<br><span class="text-amber-400 glow">vibe coding</span> streak
    </h1>
    <p class="text-xl text-zinc-400 max-w-lg mx-auto mb-10">
      Auto-detects your Claude Code sessions. Keeps your streak honest.
      Lets you see how you stack up.
    </p>
    <div class="flex flex-col sm:flex-row items-center justify-center gap-3">
      <div class="flex items-center gap-2 bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 mono text-sm">
        <span class="text-zinc-600">$</span>
        <span>npm install -g vibechk</span>
        <button
          onclick="navigator.clipboard.writeText('npm install -g vibechk').then(()=>{this.textContent='✓';setTimeout(()=>this.textContent='⎘',1400)})"
          class="text-zinc-600 hover:text-zinc-300 transition-colors ml-1" title="Copy">⎘</button>
      </div>
      <a href="/leaderboard" class="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl transition-colors">
        View Leaderboard →
      </a>
    </div>
  </section>

  <!-- Stats strip -->
  <section class="border-y border-zinc-800 bg-zinc-900/40">
    <div class="max-w-5xl mx-auto px-4 py-8 grid grid-cols-3 divide-x divide-zinc-800 text-center">
      <div class="px-4">
        <div class="text-3xl font-bold mono text-amber-400">${totalUsers}</div>
        <div class="text-xs text-zinc-500 uppercase tracking-wider mt-1">Users</div>
      </div>
      <div class="px-4">
        <div class="text-3xl font-bold mono text-amber-400">${activeToday}</div>
        <div class="text-xs text-zinc-500 uppercase tracking-wider mt-1">Active today</div>
      </div>
      <div class="px-4">
        <div class="text-3xl font-bold mono text-amber-400">${top5[0]?.currentStreak ?? 0}🔥</div>
        <div class="text-xs text-zinc-500 uppercase tracking-wider mt-1">Top streak</div>
      </div>
    </div>
  </section>

  <!-- Features -->
  <section class="max-w-5xl mx-auto px-4 py-20 grid grid-cols-1 sm:grid-cols-3 gap-5">
    <div class="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 hover:border-zinc-600 transition-colors">
      <div class="text-3xl mb-4">🤖</div>
      <h3 class="font-semibold mb-2">Auto-detection</h3>
      <p class="text-sm text-zinc-400 leading-relaxed">Reads your Claude Code session logs. No manual check-in required.</p>
    </div>
    <div class="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 hover:border-zinc-600 transition-colors">
      <div class="text-3xl mb-4">🔥</div>
      <h3 class="font-semibold mb-2">Streak tracking</h3>
      <p class="text-sm text-zinc-400 leading-relaxed">Daily streaks with freeze tokens, milestones, badges, and a local dashboard.</p>
    </div>
    <div class="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 hover:border-zinc-600 transition-colors">
      <div class="text-3xl mb-4">👥</div>
      <h3 class="font-semibold mb-2">Friend leaderboard</h3>
      <p class="text-sm text-zinc-400 leading-relaxed">Add friends by username. One command to see who's on fire this week.</p>
    </div>
  </section>

  <!-- Leaderboard preview + Steps -->
  <section class="max-w-5xl mx-auto px-4 pb-20 grid grid-cols-1 sm:grid-cols-2 gap-8 items-start">
    <div>
      <div class="flex items-center justify-between mb-4">
        <h2 class="font-bold text-lg">🏆 Top Streaks</h2>
        <a href="/leaderboard" class="text-sm text-amber-400 hover:text-amber-300 transition-colors">All →</a>
      </div>
      <div class="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-1">
        ${previewRows}
      </div>
    </div>
    <div>
      <h2 class="font-bold text-lg mb-4">Get started in 3 commands</h2>
      <div class="space-y-3">
        ${steps.map(([cmd, label], i) => `
        <div class="flex items-center gap-4 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 hover:border-zinc-600 transition-colors">
          <span class="text-xl font-extrabold mono text-amber-400/50 flex-shrink-0">0${i + 1}</span>
          <div>
            <div class="mono text-sm text-zinc-200">${cmd}</div>
            <div class="text-xs text-zinc-500 mt-0.5">${label}</div>
          </div>
        </div>`).join('')}
      </div>
    </div>
  </section>
</main>`, session)
}

// ─────────────────────────────────────────────────────────────────────────────
// Leaderboard page
// ─────────────────────────────────────────────────────────────────────────────

function leaderboardPage(profiles: any[], session: Session | undefined): string {
  const rows = profiles.map((p, i) => {
    const streak = p.currentStreak ?? 0
    const isTop3 = i < 3
    const streakColor = streak >= 30 ? 'text-amber-400 glow' : streak >= 7 ? 'text-orange-400' : streak > 0 ? 'text-zinc-200' : 'text-zinc-600'
    const rowBg = isTop3 ? 'border-l-2 border-amber-400/30 bg-amber-400/[.02]' : ''
    const consistencyColor = (p.consistencyLast30 ?? 0) >= 80 ? 'text-emerald-400' : (p.consistencyLast30 ?? 0) >= 50 ? 'text-yellow-400' : 'text-zinc-600'

    return `<tr class="group ${rowBg} hover:bg-zinc-800/40 transition-colors">
      <td class="py-3.5 pl-5 pr-2 w-10 text-center">
        <span class="${isTop3 ? 'text-base' : 'text-sm text-zinc-600'}">${rankBadge(i)}</span>
      </td>
      <td class="py-3.5 px-3">
        <a href="/u/${p.username}" class="flex items-center gap-3 hover:text-amber-400 transition-colors">
          <img src="${avatarUrl(p.username)}" class="w-7 h-7 rounded-full bg-zinc-800 flex-shrink-0" alt="" onerror="this.style.visibility='hidden'">
          <span class="font-medium">@${p.username}</span>
        </a>
      </td>
      <td class="py-3.5 px-3 text-right">
        <span class="mono font-bold text-lg ${streakColor}">${streak}</span>
        <span class="ml-1 text-base">${streakEmoji(streak)}</span>
      </td>
      <td class="py-3.5 px-3 text-right mono text-zinc-400">${p.longestStreak ?? 0}</td>
      <td class="py-3.5 px-3 text-right">
        <span class="text-sm ${consistencyColor}">${p.consistencyLast30 ?? 0}%</span>
      </td>
      <td class="py-3.5 pl-3 pr-5 text-right text-sm text-zinc-600">${relativeDate(p.lastActiveDate)}</td>
    </tr>`
  }).join('')

  const tableBody = profiles.length
    ? `<div class="overflow-x-auto">
       <table class="w-full">
         <thead>
           <tr class="border-b border-zinc-800">
             <th class="py-3 pl-5 pr-2 w-10 text-xs text-zinc-600 font-medium uppercase tracking-wider text-center">#</th>
             <th class="py-3 px-3 text-xs text-zinc-600 font-medium uppercase tracking-wider text-left">User</th>
             <th class="py-3 px-3 text-xs text-zinc-600 font-medium uppercase tracking-wider text-right">Streak</th>
             <th class="py-3 px-3 text-xs text-zinc-600 font-medium uppercase tracking-wider text-right">Best</th>
             <th class="py-3 px-3 text-xs text-zinc-600 font-medium uppercase tracking-wider text-right">30-day</th>
             <th class="py-3 pl-3 pr-5 text-xs text-zinc-600 font-medium uppercase tracking-wider text-right">Last active</th>
           </tr>
         </thead>
         <tbody class="divide-y divide-zinc-800/50">${rows}</tbody>
       </table>
       </div>`
    : `<div class="py-20 text-center text-zinc-600">
         <div class="text-5xl mb-4">🌱</div>
         <p class="font-medium mb-2">No streaks published yet</p>
         <p class="text-sm mt-1">Run <code class="bg-zinc-800 px-2 py-0.5 rounded text-zinc-300 mono">vibechk publish</code> to be first!</p>
       </div>`

  return layout('Leaderboard', `
<main class="max-w-5xl mx-auto px-4 py-12 animate-fade-in">
  <div class="mb-8">
    <h1 class="text-3xl font-bold mb-1">🏆 Leaderboard</h1>
    <p class="text-zinc-400">Top vibe coders by current streak · updated on each publish</p>
  </div>
  <div class="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
    ${tableBody}
  </div>
  <p class="text-xs text-zinc-700 mt-3 text-right">
    <a href="/leaderboard.json" class="hover:text-zinc-500 transition-colors">JSON API ↗</a>
  </p>
</main>`, session, 'Top vibe coders ranked by current streak')
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard page
// ─────────────────────────────────────────────────────────────────────────────

function dashboardPage(session: Session, profile: any | null): string {
  if (!profile) {
    const steps = [
      [`vibechk init`, `use "${session.githubLogin}" as your username`],
      [`vibechk publish`, `publishes to this server`],
      [`refresh this page`, ``],
    ]
    return layout('Dashboard', `
<main class="max-w-5xl mx-auto px-4 py-16 animate-fade-in">
  <div class="max-w-md mx-auto text-center">
    <div class="text-6xl mb-6">🔗</div>
    <h1 class="text-2xl font-bold mb-2">Connect your vibechk profile</h1>
    <p class="text-zinc-400 mb-8">
      Logged in as <span class="text-white font-medium">@${session.githubLogin}</span> — no matching profile found yet.
    </p>
    <div class="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-left text-sm space-y-4">
      <p class="text-zinc-500">Your vibechk username must match your GitHub username:</p>
      <div class="space-y-3">
        ${steps.map(([cmd, hint], i) => `
        <div class="flex items-start gap-3">
          <span class="text-amber-400 font-bold mono mt-0.5">${i + 1}.</span>
          <div>
            <span class="mono text-zinc-200">${cmd}</span>
            ${hint ? `<span class="text-zinc-600 ml-2 text-xs"># ${hint}</span>` : ''}
          </div>
        </div>`).join('')}
      </div>
    </div>
  </div>
</main>`, session)
  }

  const streak = profile.currentStreak ?? 0
  const best = profile.longestStreak ?? 0
  const consistency = profile.consistencyLast30 ?? 0
  const badges: string[] = profile.badges ?? []
  const totalCheckIns = profile.totalCheckIns ?? 0
  const consistencyColor = consistency >= 80 ? 'text-emerald-400' : consistency >= 50 ? 'text-yellow-400' : 'text-zinc-400'

  const allProfiles = loadAllProfiles()
  const rank = [...allProfiles]
    .sort((a, b) => (b.currentStreak ?? 0) - (a.currentStreak ?? 0))
    .findIndex(p => p.username === session.githubLogin) + 1
  const rankLabel = rank <= 3 ? `${rankBadge(rank - 1)} #${rank}` : `#${rank}`
  const rankColor = rank <= 3 ? 'text-amber-400 glow' : 'text-zinc-200'

  return layout('Dashboard', `
<main class="max-w-5xl mx-auto px-4 py-12 animate-fade-in">
  <!-- Header -->
  <div class="flex items-center gap-4 mb-10">
    <img src="${avatarUrl(session.githubLogin)}" class="w-16 h-16 rounded-full bg-zinc-800 ring-2 ring-zinc-700" alt="">
    <div class="flex-1">
      <h1 class="text-2xl font-bold">@${session.githubLogin}</h1>
      <p class="text-zinc-500 text-sm">Last active: ${relativeDate(profile.lastActiveDate)}</p>
    </div>
    <a href="/u/${session.githubLogin}" target="_blank"
       class="hidden sm:flex items-center gap-1.5 px-4 py-2 border border-zinc-700 hover:border-zinc-500 rounded-xl text-sm text-zinc-300 hover:text-white transition-colors">
      Public profile ↗
    </a>
  </div>

  <!-- Stats -->
  <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
    <div class="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 text-center">
      <div class="text-4xl font-extrabold mono text-amber-400 glow mb-1">${streak}</div>
      <div class="text-xs text-zinc-500 uppercase tracking-wider">Streak ${streakEmoji(streak)}</div>
    </div>
    <div class="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 text-center">
      <div class="text-4xl font-extrabold mono text-zinc-200 mb-1">${best}</div>
      <div class="text-xs text-zinc-500 uppercase tracking-wider">Best</div>
    </div>
    <div class="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 text-center">
      <div class="text-4xl font-extrabold mono ${consistencyColor} mb-1">${consistency}%</div>
      <div class="text-xs text-zinc-500 uppercase tracking-wider">30-day</div>
    </div>
    <div class="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 text-center">
      <div class="text-4xl font-extrabold mono text-zinc-200 mb-1">${totalCheckIns}</div>
      <div class="text-xs text-zinc-500 uppercase tracking-wider">Check-ins</div>
    </div>
  </div>

  <!-- Rank + share -->
  <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
    <div class="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex items-center gap-4">
      <div class="text-3xl font-extrabold mono ${rankColor}">${rankLabel}</div>
      <div>
        <div class="text-sm text-zinc-300">on the leaderboard</div>
        <a href="/leaderboard" class="text-xs text-zinc-500 hover:text-amber-400 transition-colors">View all →</a>
      </div>
    </div>
    <div class="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
      <div class="text-xs text-zinc-500 uppercase tracking-wider mb-2">Invite friends</div>
      <div class="mono text-sm bg-zinc-800 rounded-lg px-3 py-2 text-zinc-300 flex items-center justify-between gap-2">
        <span class="truncate">vibechk friend add ${session.githubLogin}</span>
        <button
          onclick="navigator.clipboard.writeText('vibechk friend add ${session.githubLogin}').then(()=>{this.textContent='✓';setTimeout(()=>this.textContent='⎘',1400)})"
          class="text-zinc-600 hover:text-zinc-300 transition-colors flex-shrink-0">⎘</button>
      </div>
      <p class="text-xs text-zinc-600 mt-1.5">Share with friends — they can follow your streak</p>
    </div>
  </div>

  ${badges.length ? `
  <div class="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
    <div class="text-xs text-zinc-500 uppercase tracking-wider mb-3">Badges</div>
    <div class="flex flex-wrap gap-2">
      ${badges.map(b => `<span class="bg-zinc-800 border border-zinc-700 rounded-full px-3 py-1 text-sm">${b}</span>`).join('')}
    </div>
  </div>` : ''}
</main>`, session)
}

// ─────────────────────────────────────────────────────────────────────────────
// Public profile page (/u/:username)
// ─────────────────────────────────────────────────────────────────────────────

function profilePage(profile: any): string {
  const streak = profile.currentStreak ?? 0
  const best = profile.longestStreak ?? 0
  const consistency = profile.consistencyLast30 ?? 0
  const username = profile.username ?? '?'
  const badges: string[] = profile.badges ?? []
  const emoji = streak >= 30 ? '🏆' : streak > 0 ? '🔥' : '🌱'
  const consistencyColor = consistency >= 80 ? 'text-emerald-400' : consistency >= 50 ? 'text-yellow-400' : 'text-zinc-400'

  return layout(`@${username}`, `
<main class="max-w-sm mx-auto px-4 py-16 animate-fade-in">
  <div class="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 text-center shadow-2xl">
    <img src="${avatarUrl(username)}" class="w-20 h-20 rounded-full mx-auto mb-4 bg-zinc-800 ring-2 ring-zinc-700" alt="" onerror="this.style.visibility='hidden'">
    <div class="text-xl font-bold mb-1">@${username}</div>
    <div class="text-3xl my-4">${emoji}</div>
    <div class="grid grid-cols-3 gap-3 mb-5">
      <div class="bg-zinc-800/60 rounded-xl p-3">
        <div class="text-2xl font-extrabold mono text-amber-400">${streak}</div>
        <div class="text-xs text-zinc-500 uppercase tracking-wider mt-1">streak</div>
      </div>
      <div class="bg-zinc-800/60 rounded-xl p-3">
        <div class="text-2xl font-extrabold mono text-zinc-200">${best}</div>
        <div class="text-xs text-zinc-500 uppercase tracking-wider mt-1">best</div>
      </div>
      <div class="bg-zinc-800/60 rounded-xl p-3">
        <div class="text-2xl font-extrabold mono ${consistencyColor}">${consistency}%</div>
        <div class="text-xs text-zinc-500 uppercase tracking-wider mt-1">30-day</div>
      </div>
    </div>
    ${badges.length ? `<div class="flex flex-wrap gap-2 justify-center mb-4">
      ${badges.map(b => `<span class="bg-zinc-800 border border-zinc-700/50 rounded-full px-3 py-1 text-xs">${b}</span>`).join('')}
    </div>` : ''}
    <p class="text-xs text-zinc-600 mb-1">last active: ${relativeDate(profile.lastActiveDate)}</p>
    <a href="/leaderboard" class="text-xs text-zinc-600 hover:text-amber-400 transition-colors">leaderboard →</a>
  </div>
</main>`, undefined, `@${username} · ${streak}-day streak`)
}

// ─────────────────────────────────────────────────────────────────────────────
// App + routes
// ─────────────────────────────────────────────────────────────────────────────

const app = new Hono<{ Variables: Vars }>()

// CORS for CLI consumers
app.use('/api/*', cors())
app.use('/leaderboard.json', cors())
app.use('/u/*', cors())

// Attach session from cookie
app.use('*', async (c, next) => {
  const sid = getCookie(c, 'sid')
  if (sid) c.set('session', sessions.get(sid))
  await next()
})

// ── Pages ────────────────────────────────────────────────────────────────────

app.get('/', (c) => {
  const all = loadAllProfiles()
  const today = todayStr()
  const top5 = [...all].sort((a, b) => (b.currentStreak ?? 0) - (a.currentStreak ?? 0)).slice(0, 5)
  return c.html(landingPage(top5, all.length, all.filter(p => p.lastActiveDate === today).length, c.get('session')))
})

app.get('/leaderboard', (c) => {
  const sorted = [...loadAllProfiles()].sort((a, b) => (b.currentStreak ?? 0) - (a.currentStreak ?? 0))
  return c.html(leaderboardPage(sorted, c.get('session')))
})

app.get('/dashboard', (c) => {
  const session = c.get('session')
  if (!session) return c.redirect(AUTH_ENABLED ? '/auth/github' : '/')
  return c.html(dashboardPage(session, loadProfile(session.githubLogin)))
})

// ── Auth ─────────────────────────────────────────────────────────────────────

app.get('/auth/github', (c) => {
  if (!AUTH_ENABLED)
    return c.text('GitHub OAuth not configured (set GITHUB_CLIENT_ID + GITHUB_CLIENT_SECRET)', 503)

  const state = randomBytes(16).toString('hex')
  oauthStates.set(state, Date.now() + 10 * 60 * 1000)
  for (const [k, exp] of oauthStates) if (exp < Date.now()) oauthStates.delete(k)

  const url = new URL('https://github.com/login/oauth/authorize')
  url.searchParams.set('client_id', GH_CLIENT_ID)
  url.searchParams.set('redirect_uri', `${BASE_URL}/auth/github/callback`)
  url.searchParams.set('scope', 'read:user')
  url.searchParams.set('state', state)
  return c.redirect(url.toString())
})

app.get('/auth/github/callback', async (c) => {
  const code = c.req.query('code')
  const state = c.req.query('state')
  if (!code || !state) return c.redirect('/?error=bad_params')

  const expiry = oauthStates.get(state)
  if (!expiry || expiry < Date.now()) return c.redirect('/?error=expired_state')
  oauthStates.delete(state)

  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'vibechk/0.1.0' },
      body: JSON.stringify({
        client_id: GH_CLIENT_ID, client_secret: GH_CLIENT_SECRET,
        code, redirect_uri: `${BASE_URL}/auth/github/callback`,
      }),
      signal: AbortSignal.timeout(10_000),
    })
    const tokenData = await tokenRes.json() as { access_token?: string; error?: string }
    if (!tokenData.access_token) return c.redirect('/?error=oauth_failed')

    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        'User-Agent': 'vibechk/0.1.0',
        Accept: 'application/vnd.github+json',
      },
      signal: AbortSignal.timeout(10_000),
    })
    const user = await userRes.json() as { login: string; id: number; name?: string }

    const sid = randomUUID()
    sessions.set(sid, { githubLogin: user.login, githubId: user.id, name: user.name ?? user.login })

    setCookie(c, 'sid', sid, {
      httpOnly: true,
      sameSite: 'Lax',
      secure: BASE_URL.startsWith('https'),
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    })
    return c.redirect('/dashboard')
  } catch {
    return c.redirect('/?error=oauth_failed')
  }
})

app.get('/auth/logout', (c) => {
  const sid = getCookie(c, 'sid')
  if (sid) sessions.delete(sid)
  deleteCookie(c, 'sid', { path: '/' })
  return c.redirect('/')
})

// ── Public profile ────────────────────────────────────────────────────────────

// Handles both /u/alice and /u/alice.json
app.get('/u/:username', (c) => {
  const raw = c.req.param('username')
  const isJson = raw.endsWith('.json')
  const username = isJson ? raw.slice(0, -5) : raw

  if (!/^[\w\-.]+$/.test(username))
    return isJson ? c.json({ error: 'Invalid username' }, 400) : c.notFound()

  const profile = loadProfile(username)
  if (!profile) return isJson ? c.json({ error: 'Not found' }, 404) : c.notFound()

  return isJson ? c.json(profile) : c.html(profilePage(profile))
})

// ── CLI API ───────────────────────────────────────────────────────────────────

app.put('/api/users/:uuid', async (c) => {
  const uuid = c.req.param('uuid')
  if (c.req.header('Authorization') !== `Bearer ${uuid}`)
    return c.json({ error: 'Unauthorized' }, 401)

  let data: any
  try { data = await c.req.json() } catch { return c.json({ error: 'Invalid JSON' }, 400) }

  const username: string = data?.username
  if (typeof username !== 'string' || !/^[\w\-.]+$/.test(username) || username.length > 24)
    return c.json({ error: 'Invalid or missing username' }, 400)

  const claims = loadClaims()
  if (claims[username] && claims[username] !== uuid)
    return c.json({ error: `Username "${username}" is already taken` }, 409)

  if (!claims[username]) { claims[username] = uuid; saveClaims(claims) }

  const { _savedAt: _, ...rest } = data
  saveProfileFile(username, { ...rest, _savedAt: new Date().toISOString() })

  return c.json({
    username,
    url: `${BASE_URL}/u/${username}`,
    jsonUrl: `${BASE_URL}/u/${username}.json`,
  })
})

app.get('/leaderboard.json', (c) => {
  const entries = [...loadAllProfiles()]
    .sort((a, b) => (b.currentStreak ?? 0) - (a.currentStreak ?? 0))
    .slice(0, 50)
  return c.json({ entries, fetchedAt: new Date().toISOString() })
})

app.get('/health', (c) =>
  c.json({ status: 'ok', auth: AUTH_ENABLED, users: loadAllProfiles().length }),
)

// ─────────────────────────────────────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────────────────────────────────────

ensureDirs()
serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`vibechk server → ${BASE_URL}`)
  if (AUTH_ENABLED) {
    console.log(`  GitHub auth: enabled (client_id: ${GH_CLIENT_ID.slice(0, 8)}...)`)
  } else {
    console.log('  GitHub auth: disabled (set GITHUB_CLIENT_ID + GITHUB_CLIENT_SECRET to enable)')
  }
  console.log(`  Data dir: ${DATA_DIR}`)
})
