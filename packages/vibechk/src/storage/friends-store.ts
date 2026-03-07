import { readFileSync, writeFileSync, existsSync } from 'fs'
import { FRIENDS_PATH, GIST_TOKEN_PATH, VIBECHK_SERVER, ensureDir } from './paths.js'
import type { FriendsFile, FriendEntry } from '../types/index.js'

const DEFAULT: FriendsFile = {
  version: 1, friends: [], myPublishUrl: null, gistId: null, publishEndpoint: null,
}

/**
 * Resolve the publish endpoint from env var or saved config.
 * Returns null if no endpoint is configured (standalone Gist mode).
 */
export function getPublishEndpoint(): string | null {
  // Env var takes priority (allows ad-hoc override)
  if (VIBECHK_SERVER) return VIBECHK_SERVER
  // Fall back to saved endpoint from last successful publish
  return loadFriends().publishEndpoint ?? null
}

export function loadFriends(): FriendsFile {
  if (!existsSync(FRIENDS_PATH)) return { ...DEFAULT }
  try {
    return JSON.parse(readFileSync(FRIENDS_PATH, 'utf8')) as FriendsFile
  } catch {
    return { ...DEFAULT }
  }
}

export function saveFriends(data: FriendsFile): void {
  ensureDir()
  writeFileSync(FRIENDS_PATH, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 })
}

export function getFriendByAlias(alias: string): FriendEntry | null {
  const { friends } = loadFriends()
  return friends.find((f) => f.alias.toLowerCase() === alias.toLowerCase()) ?? null
}

export function loadGistToken(): string | null {
  if (!existsSync(GIST_TOKEN_PATH)) return null
  try {
    const t = readFileSync(GIST_TOKEN_PATH, 'utf8').trim()
    return t || null
  } catch {
    return null
  }
}

export function saveGistToken(token: string): void {
  ensureDir()
  writeFileSync(GIST_TOKEN_PATH, token, { encoding: 'utf8', mode: 0o600 })
}
