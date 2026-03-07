import chalk from 'chalk'
import { input } from '@inquirer/prompts'
import { requireProfile } from '../storage/profile-store.js'
import { loadStreak } from '../storage/streak-store.js'
import { loadActivity } from '../storage/activity-store.js'
import { loadBadges } from '../storage/badge-store.js'
import { loadFriends, saveFriends, loadGistToken, saveGistToken, getPublishEndpoint } from '../storage/friends-store.js'
import { todayInTz } from '../core/date-utils.js'
import type { PublicProfile, UserProfile } from '../types/index.js'

const GIST_API = 'https://api.github.com'
const GIST_FILENAME = 'vibechk.json'

// ─────────────────────────────────────────────────────────────────────────────
// Build the public JSON payload
// ─────────────────────────────────────────────────────────────────────────────

export function buildPublicProfile(
  username: string,
  currentStreak: number,
  longestStreak: number,
  lastActiveDate: string | null,
  totalCheckIns: number,
  badges: string[],
  activeLast30: number,
): PublicProfile {
  return {
    version: 1,
    username,
    currentStreak,
    longestStreak,
    lastActiveDate,
    consistencyLast30: Math.round((activeLast30 / 30) * 100),
    totalCheckIns,
    badges,
    publishedAt: new Date().toISOString(),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main publish command
// ─────────────────────────────────────────────────────────────────────────────

export async function runPublish(options: {
  gist?: boolean
  endpoint?: string          // explicit endpoint URL (saved for future use)
  stdout?: boolean
  token?: string
  silent?: boolean           // used by the daily auto-publish after check-in
} = {}): Promise<string | null> {
  const profile = requireProfile()
  const streak = loadStreak()
  const activity = loadActivity()
  const badges = loadBadges()
  const today = todayInTz(profile.timezone)

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29)
  const cutoff = thirtyDaysAgo.toISOString().slice(0, 10)
  const activeLast30 = activity.filter((a) => a.date >= cutoff && a.date <= today).length

  const payload = buildPublicProfile(
    profile.username,
    streak.currentStreak,
    streak.longestStreak,
    streak.lastActivityDate,
    streak.totalCheckIns,
    badges.earned.map((b) => b.milestoneId),
    activeLast30,
  )

  const json = JSON.stringify(payload, null, 2)

  // ── stdout mode ────────────────────────────────────────────────────────────
  if (options.stdout) {
    console.log(json)
    return null
  }

  // ── Force Gist ─────────────────────────────────────────────────────────────
  if (options.gist) {
    return publishToGist(profile, json, options)
  }

  // ── Endpoint mode: explicit flag > env var > saved endpoint ────────────────
  const endpoint = options.endpoint
    ? options.endpoint.replace(/\/$/, '')
    : getPublishEndpoint()

  if (endpoint) {
    return publishToEndpoint(profile, json, endpoint, options.silent ?? false)
  }

  // ── Default: Gist (standalone, works without any server) ───────────────────
  return publishToGist(profile, json, options)
}

// ─────────────────────────────────────────────────────────────────────────────
// Remote endpoint publish
//
// Works with any server that implements:
//   PUT /api/users/:uuid  { Authorization: Bearer <uuid>, body: PublicProfile }
//   → { username, url, jsonUrl }
// ─────────────────────────────────────────────────────────────────────────────

async function publishToEndpoint(
  profile: UserProfile,
  json: string,
  endpoint: string,
  silent: boolean,
): Promise<string | null> {
  try {
    if (!silent) process.stdout.write(chalk.dim(`  Publishing to ${endpoint}...`))

    const res = await fetch(`${endpoint}/api/users/${profile.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${profile.id}`,
        'User-Agent': 'vibechk/0.1.0',
      },
      body: json,
      signal: AbortSignal.timeout(10000),
    })

    if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`)

    const data = await res.json() as { username: string; url: string; jsonUrl: string }

    // Save endpoint + URL for future use
    const friends = loadFriends()
    friends.myPublishUrl = data.jsonUrl
    friends.publishEndpoint = endpoint
    saveFriends(friends)

    if (!silent) {
      console.log(chalk.green(' ✓'))
      console.log('')
      console.log(`  ${chalk.bold('Your profile:')} ${chalk.cyan(data.url)}`)
      console.log('')
      console.log(chalk.dim('  Friends on the same server can add you by username:'))
      console.log(chalk.dim(`    vibechk friend add ${profile.username}`))
      console.log('')
      console.log(chalk.dim('  Or share your direct URL:'))
      console.log(chalk.dim(`    vibechk friend add ${profile.username} ${data.jsonUrl}`))
      console.log('')
    }

    return data.jsonUrl
  } catch (err: any) {
    if (!silent) {
      console.log(chalk.red(` ✗ ${err.message}`))
      console.log(chalk.dim('\n  Check that the endpoint is reachable and supports the vibechk API.'))
      console.log(chalk.dim('  Use --gist to publish via GitHub Gist instead.'))
    }
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GitHub Gist publish (default standalone mode)
// ─────────────────────────────────────────────────────────────────────────────

async function publishToGist(
  profile: UserProfile,
  json: string,
  options: { token?: string; silent?: boolean },
): Promise<string | null> {
  let token = options.token ?? loadGistToken()

  if (!token) {
    if (options.silent) return null
    console.log('')
    console.log(chalk.bold('  Publish your streak via GitHub Gist'))
    console.log('')
    console.log(chalk.dim('  This creates a public JSON file that friends can subscribe to.'))
    console.log(chalk.dim('  You need a GitHub personal access token with the `gist` scope.'))
    console.log('')
    console.log(chalk.dim('  1. Go to https://github.com/settings/tokens/new?scopes=gist'))
    console.log(chalk.dim('  2. Create a token with just the "gist" scope'))
    console.log(chalk.dim('  3. Paste it below'))
    console.log('')
    token = await input({ message: 'GitHub token (gist scope):' })
    if (!token.trim()) {
      console.log(chalk.dim('  Skipped. Run `vibechk publish` again when ready.'))
      return null
    }
    saveGistToken(token.trim())
    token = token.trim()
  }

  const friends = loadFriends()

  try {
    if (!options.silent) process.stdout.write(chalk.dim('  Publishing to Gist...'))

    const { gistId, rawUrl } = friends.gistId
      ? await updateGist(friends.gistId, json, token)
      : await createGist(json, token)

    friends.gistId = gistId
    friends.myPublishUrl = rawUrl
    saveFriends(friends)

    if (!options.silent) {
      console.log(chalk.green(' ✓'))
      console.log('')
      console.log(`  ${chalk.bold('Your friend URL:')} ${chalk.cyan(rawUrl)}`)
      console.log('')
      console.log(chalk.dim('  Share this URL with friends so they can follow your streak:'))
      console.log(chalk.dim(`    vibechk friend add ${profile.username} ${rawUrl}`))
      console.log('')
    }

    return rawUrl
  } catch (err: any) {
    if (!options.silent) {
      console.log(chalk.red(` ✗ ${err.message}`))
      if (err.message.includes('401') || err.message.includes('403')) {
        console.log(chalk.dim('\n  Token may be expired or missing the gist scope.'))
        console.log(chalk.dim('  Delete ~/.vibechk/gist-token and run `vibechk publish` again.'))
      }
    }
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GitHub Gist API helpers
// ─────────────────────────────────────────────────────────────────────────────

interface GistResult {
  gistId: string
  rawUrl: string
  login: string
}

async function createGist(json: string, token: string): Promise<GistResult> {
  const res = await fetch(`${GIST_API}/gists`, {
    method: 'POST',
    headers: gistHeaders(token),
    body: JSON.stringify({
      description: 'vibechk — my vibe coding streak',
      public: true,
      files: { [GIST_FILENAME]: { content: json } },
    }),
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${res.statusText}`)
  const data = await res.json() as any
  const login: string = data.owner?.login ?? 'me'
  const rawUrl = `https://gist.githubusercontent.com/${login}/${data.id}/raw/${GIST_FILENAME}`
  return { gistId: data.id, rawUrl, login }
}

async function updateGist(gistId: string, json: string, token: string): Promise<GistResult> {
  const res = await fetch(`${GIST_API}/gists/${gistId}`, {
    method: 'PATCH',
    headers: gistHeaders(token),
    body: JSON.stringify({
      files: { [GIST_FILENAME]: { content: json } },
    }),
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${res.statusText}`)
  const data = await res.json() as any
  const login: string = data.owner?.login ?? 'me'
  const rawUrl = `https://gist.githubusercontent.com/${login}/${data.id}/raw/${GIST_FILENAME}`
  return { gistId: data.id, rawUrl, login }
}

function gistHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'User-Agent': 'vibechk/0.1.0',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}
