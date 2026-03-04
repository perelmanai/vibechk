import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { rmSync, writeFileSync } from 'fs'

// vi.hoisted runs before imports — lets us compute a temp dir the mock factory can reference
const { testDir, FRIENDS_PATH, GIST_TOKEN_PATH } = vi.hoisted(() => {
  const fs = require('fs')
  const path = require('path')
  const os = require('os')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibechk-friends-store-test-'))
  return {
    testDir: dir,
    FRIENDS_PATH: path.join(dir, 'friends.json'),
    GIST_TOKEN_PATH: path.join(dir, 'gist-token'),
  }
})

vi.mock('../../src/storage/paths.js', () => ({
  VIBECHK_DIR: testDir,
  FRIENDS_PATH,
  GIST_TOKEN_PATH,
  PROFILE_PATH: '',
  STREAK_PATH: '',
  ACTIVITY_PATH: '',
  BADGES_PATH: '',
  LEADERBOARD_CACHE_PATH: '',
  ensureDir: vi.fn(),
  dataExists: vi.fn(),
}))

import {
  loadFriends,
  saveFriends,
  getFriendByAlias,
  loadGistToken,
  saveGistToken,
} from '../../src/storage/friends-store.js'
import type { FriendEntry, FriendsFile } from '../../src/types/index.js'

const makeFriend = (alias: string): FriendEntry => ({
  alias,
  url: `https://example.com/${alias}.json`,
  addedAt: '2026-03-01T00:00:00.000Z',
  lastFetchedAt: null,
  cached: null,
})

const DEFAULT_FILE: FriendsFile = { version: 1, friends: [], myPublishUrl: null, gistId: null }

afterAll(() => {
  try { rmSync(testDir, { recursive: true }) } catch {}
})

describe('friends-store', () => {
  beforeEach(() => {
    try { rmSync(FRIENDS_PATH) } catch {}
    try { rmSync(GIST_TOKEN_PATH) } catch {}
  })

  describe('loadFriends', () => {
    it('returns default when file does not exist', () => {
      expect(loadFriends()).toEqual(DEFAULT_FILE)
    })

    it('returns parsed data when file exists', () => {
      const data: FriendsFile = { ...DEFAULT_FILE, friends: [makeFriend('alice')] }
      saveFriends(data)
      expect(loadFriends()).toEqual(data)
    })

    it('returns default on corrupt JSON', () => {
      writeFileSync(FRIENDS_PATH, 'not valid json', 'utf8')
      expect(loadFriends()).toEqual(DEFAULT_FILE)
    })
  })

  describe('saveFriends / loadFriends roundtrip', () => {
    it('persists and retrieves multiple friends', () => {
      const data: FriendsFile = {
        version: 1,
        friends: [makeFriend('alice'), makeFriend('bob')],
        myPublishUrl: 'https://gist.githubusercontent.com/me/123/raw/vibechk.json',
        gistId: 'abc123',
      }
      saveFriends(data)
      expect(loadFriends()).toEqual(data)
    })
  })

  describe('getFriendByAlias', () => {
    beforeEach(() => {
      saveFriends({ ...DEFAULT_FILE, friends: [makeFriend('alice'), makeFriend('bob')] })
    })

    it('returns matching friend', () => {
      expect(getFriendByAlias('alice')?.alias).toBe('alice')
    })

    it('is case-insensitive', () => {
      expect(getFriendByAlias('ALICE')?.alias).toBe('alice')
    })

    it('returns null when alias not found', () => {
      expect(getFriendByAlias('charlie')).toBeNull()
    })
  })

  describe('gist token', () => {
    it('returns null when file missing', () => {
      expect(loadGistToken()).toBeNull()
    })

    it('roundtrips a token', () => {
      saveGistToken('ghp_abc123')
      expect(loadGistToken()).toBe('ghp_abc123')
    })

    it('returns null for empty file', () => {
      writeFileSync(GIST_TOKEN_PATH, '', 'utf8')
      expect(loadGistToken()).toBeNull()
    })

    it('trims whitespace from saved token', () => {
      saveGistToken('ghp_abc123')
      expect(loadGistToken()).toBe('ghp_abc123')
    })
  })
})
