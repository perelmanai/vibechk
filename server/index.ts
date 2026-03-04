#!/usr/bin/env node
/**
 * vibechk server — minimal profile registry
 *
 * PUT  /api/users/:uuid     publish/update profile
 *   Authorization: Bearer {uuid}  (profile.id from local vibechk setup)
 *   Body: PublicProfile JSON      (must include `username` field)
 *
 * GET  /u/:username.json    fetch profile for CLI / friend pull
 * GET  /u/:username         HTML profile card for sharing
 * GET  /leaderboard.json    top 50 by currentStreak
 *
 * Storage: flat files under DATA_DIR (default ./data)
 *   data/profiles/{username}.json   — stored PublicProfile
 *   data/claims.json                — { [username]: uuid } first-write-wins
 *
 * Configuration (env vars):
 *   PORT=3000
 *   DATA_DIR=./data
 *   BASE_URL=https://vibechk.dev   (used in returned URLs)
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs'
import { join } from 'path'

const PORT = parseInt(process.env.PORT ?? '3000', 10)
const DATA_DIR = process.env.DATA_DIR ?? join(process.cwd(), 'data')
const BASE_URL = (process.env.BASE_URL ?? `http://localhost:${PORT}`).replace(/\/$/, '')

const PROFILES_DIR = join(DATA_DIR, 'profiles')
const CLAIMS_PATH = join(DATA_DIR, 'claims.json')

// ─────────────────────────────────────────────────────────────────────────────
// Storage helpers
// ─────────────────────────────────────────────────────────────────────────────

function ensureDirs(): void {
  mkdirSync(PROFILES_DIR, { recursive: true })
}

function loadClaims(): Record<string, string> {
  if (!existsSync(CLAIMS_PATH)) return {}
  try { return JSON.parse(readFileSync(CLAIMS_PATH, 'utf8')) } catch { return {} }
}

function saveClaims(c: Record<string, string>): void {
  writeFileSync(CLAIMS_PATH, JSON.stringify(c, null, 2))
}

function profilePath(username: string): string {
  return join(PROFILES_DIR, `${username}.json`)
}

function loadProfile(username: string): object | null {
  const p = profilePath(username)
  if (!existsSync(p)) return null
  try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return null }
}

function saveProfile(username: string, data: object): void {
  writeFileSync(profilePath(username), JSON.stringify(data, null, 2))
}

function loadAllProfiles(): any[] {
  if (!existsSync(PROFILES_DIR)) return []
  return readdirSync(PROFILES_DIR)
    .filter((f) => f.endsWith('.json'))
    .flatMap((f) => {
      try { return [JSON.parse(readFileSync(join(PROFILES_DIR, f), 'utf8'))] } catch { return [] }
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML profile card
// ─────────────────────────────────────────────────────────────────────────────

function renderProfileHtml(profile: any): string {
  const streak = profile.currentStreak ?? 0
  const best = profile.longestStreak ?? 0
  const consistency = profile.consistencyLast30 ?? 0
  const username = profile.username ?? '?'
  const lastActive = profile.lastActiveDate ?? '—'
  const emoji = streak >= 30 ? '🏆' : streak > 0 ? '🔥' : '🌱'
  const badges: string[] = profile.badges ?? []

  const badgeHtml = badges.length
    ? `<div class="badges">${badges.map((b) => `<span class="badge">${b}</span>`).join('')}</div>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${username} — vibechk</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0 }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #0d0d0d; color: #e8e8e8; min-height: 100vh;
           display: flex; align-items: center; justify-content: center; padding: 2rem }
    .card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 16px;
            padding: 2.5rem; max-width: 420px; width: 100%; text-align: center }
    .emoji { font-size: 3rem; margin-bottom: 0.5rem }
    .username { font-size: 1.6rem; font-weight: 700; margin-bottom: 1.5rem; color: #fff }
    .stats { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem }
    .stat { background: #222; border-radius: 10px; padding: 0.8rem }
    .stat-value { font-size: 1.5rem; font-weight: 700; color: #f5a623 }
    .stat-label { font-size: 0.7rem; color: #888; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 0.2rem }
    .last-active { font-size: 0.8rem; color: #666; margin-bottom: 1rem }
    .badges { display: flex; flex-wrap: wrap; gap: 0.4rem; justify-content: center }
    .badge { background: #2a2a2a; border-radius: 6px; padding: 0.2rem 0.6rem; font-size: 0.75rem }
    .footer { margin-top: 1.5rem; font-size: 0.75rem; color: #444 }
    .footer a { color: #666; text-decoration: none }
  </style>
</head>
<body>
  <div class="card">
    <div class="emoji">${emoji}</div>
    <div class="username">@${username}</div>
    <div class="stats">
      <div class="stat">
        <div class="stat-value">${streak}</div>
        <div class="stat-label">streak</div>
      </div>
      <div class="stat">
        <div class="stat-value">${best}</div>
        <div class="stat-label">best</div>
      </div>
      <div class="stat">
        <div class="stat-value">${consistency}%</div>
        <div class="stat-label">30-day</div>
      </div>
    </div>
    ${badgeHtml}
    <div class="last-active">last active: ${lastActive}</div>
    <div class="footer">tracked with <a href="https://github.com/perelmanai/vibechk">vibechk</a></div>
  </div>
</body>
</html>`
}

// ─────────────────────────────────────────────────────────────────────────────
// Request helpers
// ─────────────────────────────────────────────────────────────────────────────

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function json(res: ServerResponse, status: number, body: object): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

// ─────────────────────────────────────────────────────────────────────────────
// Server
// ─────────────────────────────────────────────────────────────────────────────

ensureDirs()

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)
  const method = req.method ?? 'GET'

  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')

  if (method === 'OPTIONS') { res.writeHead(204); res.end(); return }

  // ── PUT /api/users/:uuid ──────────────────────────────────────────────────
  const putMatch = method === 'PUT' && url.pathname.match(/^\/api\/users\/([\w\-]+)$/)
  if (putMatch) {
    const uuid = putMatch[1]

    const auth = req.headers.authorization
    if (!auth || auth !== `Bearer ${uuid}`) {
      json(res, 401, { error: 'Unauthorized' }); return
    }

    let body: string
    try { body = await readBody(req) } catch {
      json(res, 400, { error: 'Could not read body' }); return
    }

    let data: any
    try { data = JSON.parse(body) } catch {
      json(res, 400, { error: 'Invalid JSON' }); return
    }

    const username: string = data?.username
    if (typeof username !== 'string' || !/^[\w\-\.]+$/.test(username) || username.length > 24) {
      json(res, 400, { error: 'Invalid or missing username' }); return
    }

    const claims = loadClaims()
    if (claims[username] && claims[username] !== uuid) {
      json(res, 409, { error: `Username "${username}" is already taken` }); return
    }

    if (!claims[username]) { claims[username] = uuid; saveClaims(claims) }

    // Strip internal fields before storing — store only the PublicProfile shape
    const { _savedAt: _, ...profile } = data
    saveProfile(username, { ...profile, _savedAt: new Date().toISOString() })

    json(res, 200, {
      username,
      url: `${BASE_URL}/u/${username}`,
      jsonUrl: `${BASE_URL}/u/${username}.json`,
    })
    return
  }

  // ── GET /u/:username.json ─────────────────────────────────────────────────
  const jsonMatch = method === 'GET' && url.pathname.match(/^\/u\/([\w\-\.]+)\.json$/)
  if (jsonMatch) {
    const profile = loadProfile(jsonMatch[1])
    if (!profile) { json(res, 404, { error: 'Not found' }); return }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(profile))
    return
  }

  // ── GET /u/:username (HTML card) ──────────────────────────────────────────
  const htmlMatch = method === 'GET' && url.pathname.match(/^\/u\/([\w\-\.]+)$/)
  if (htmlMatch) {
    const profile = loadProfile(htmlMatch[1])
    if (!profile) { res.writeHead(404); res.end('<h1>Not found</h1>'); return }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(renderProfileHtml(profile))
    return
  }

  // ── GET /leaderboard.json ─────────────────────────────────────────────────
  if (method === 'GET' && url.pathname === '/leaderboard.json') {
    const entries = loadAllProfiles()
      .sort((a, b) => (b.currentStreak ?? 0) - (a.currentStreak ?? 0))
      .slice(0, 50)
    json(res, 200, { entries, fetchedAt: new Date().toISOString() })
    return
  }

  // ── GET / (health) ────────────────────────────────────────────────────────
  if (method === 'GET' && url.pathname === '/') {
    json(res, 200, { service: 'vibechk', status: 'ok' })
    return
  }

  res.writeHead(404); res.end('Not found')
})

server.listen(PORT, () => {
  console.log(`vibechk server running at ${BASE_URL}`)
  console.log(`  profiles: ${PROFILES_DIR}`)
})
