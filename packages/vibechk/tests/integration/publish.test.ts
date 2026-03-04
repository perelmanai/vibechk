import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { UserProfile, StreakRecord, BadgesRecord } from '../../src/types/index.js'

vi.mock('../../src/storage/paths.js', () => ({
  VIBECHK_SERVER: 'https://vibechk.test',
  VIBECHK_DIR: '/tmp/vibechk-test',
  FRIENDS_PATH: '/tmp/vibechk-test/friends.json',
  GIST_TOKEN_PATH: '/tmp/vibechk-test/gist-token',
  ensureDir: vi.fn(),
  dataExists: vi.fn(),
}))
vi.mock('../../src/storage/profile-store.js', () => ({
  requireProfile: vi.fn(),
}))
vi.mock('../../src/storage/streak-store.js', () => ({
  loadStreak: vi.fn(),
}))
vi.mock('../../src/storage/activity-store.js', () => ({
  loadActivity: vi.fn(),
}))
vi.mock('../../src/storage/badge-store.js', () => ({
  loadBadges: vi.fn(),
}))
vi.mock('../../src/storage/friends-store.js', () => ({
  loadFriends: vi.fn(),
  saveFriends: vi.fn(),
  loadGistToken: vi.fn(),
  saveGistToken: vi.fn(),
}))
vi.mock('../../src/core/date-utils.js', () => ({
  todayInTz: vi.fn(),
}))

import { runPublish, buildPublicProfile } from '../../src/commands/publish.js'
import { requireProfile } from '../../src/storage/profile-store.js'
import { loadStreak } from '../../src/storage/streak-store.js'
import { loadActivity } from '../../src/storage/activity-store.js'
import { loadBadges } from '../../src/storage/badge-store.js'
import { loadFriends, saveFriends, loadGistToken } from '../../src/storage/friends-store.js'
import { todayInTz } from '../../src/core/date-utils.js'
import type { FriendsFile } from '../../src/types/index.js'

const TODAY = '2026-03-04'

const makeProfile = (overrides: Partial<UserProfile> = {}): UserProfile => ({
  id: 'test-uuid-1234',
  username: 'alice',
  timezone: 'UTC',
  createdAt: '2026-01-01T00:00:00.000Z',
  cloudSync: null,
  preferences: {
    shareOnLeaderboard: true,
    notificationsEnabled: false,
    notificationTime: '21:00',
    celebrationLevel: 'normal',
    sessionSources: ['claude-code'],
    weekendsCount: true,
    watchedRepos: [],
  },
  ...overrides,
})

const makeStreak = (overrides: Partial<StreakRecord> = {}): StreakRecord => ({
  currentStreak: 7,
  longestStreak: 14,
  lastActivityDate: TODAY,
  lastCheckInAt: null,
  freezeTokens: 2,
  graceUsedAt: null,
  totalCheckIns: 20,
  status: 'active',
  ...overrides,
})

const makeBadges = (): BadgesRecord => ({ earned: [] })

const makeFriendsFile = (): FriendsFile => ({
  version: 1,
  friends: [],
  myPublishUrl: null,
  gistId: null,
})

describe('buildPublicProfile', () => {
  it('computes consistencyLast30 as a percentage', () => {
    const p = buildPublicProfile('alice', 7, 14, TODAY, 20, [], 24)
    expect(p.consistencyLast30).toBe(80) // 24/30 * 100
  })

  it('rounds consistency to nearest integer', () => {
    const p = buildPublicProfile('alice', 7, 14, TODAY, 20, [], 17)
    expect(p.consistencyLast30).toBe(57) // 17/30*100 = 56.67 → 57
  })

  it('includes all required PublicProfile fields', () => {
    const p = buildPublicProfile('alice', 5, 10, '2026-03-03', 15, ['milestone-7d'], 15)
    expect(p.version).toBe(1)
    expect(p.username).toBe('alice')
    expect(p.currentStreak).toBe(5)
    expect(p.longestStreak).toBe(10)
    expect(p.lastActiveDate).toBe('2026-03-03')
    expect(p.totalCheckIns).toBe(15)
    expect(p.badges).toEqual(['milestone-7d'])
    expect(p.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}/)
  })
})

describe('runPublish', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    vi.mocked(requireProfile).mockReturnValue(makeProfile())
    vi.mocked(loadStreak).mockReturnValue(makeStreak())
    vi.mocked(loadActivity).mockReturnValue([])
    vi.mocked(loadBadges).mockReturnValue(makeBadges())
    vi.mocked(loadFriends).mockReturnValue(makeFriendsFile())
    vi.mocked(saveFriends).mockImplementation(() => {})
    vi.mocked(todayInTz).mockReturnValue(TODAY)

    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  // ── stdout mode ────────────────────────────────────────────────────────────

  describe('--stdout', () => {
    it('prints JSON to stdout without calling fetch', async () => {
      const logSpy = vi.spyOn(console, 'log')
      await runPublish({ stdout: true })
      expect(vi.mocked(fetch)).not.toHaveBeenCalled()
      const output = logSpy.mock.calls.flat().join('\n')
      expect(output).toContain('"username": "alice"')
      expect(output).toContain('"currentStreak": 7')
    })

    it('returns null in stdout mode', async () => {
      const result = await runPublish({ stdout: true })
      expect(result).toBeNull()
    })
  })

  // ── server mode (default) ──────────────────────────────────────────────────

  describe('server publish (default)', () => {
    it('PUTs to the configured server with profile.id as Bearer token', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          username: 'alice',
          url: 'https://vibechk.test/u/alice',
          jsonUrl: 'https://vibechk.test/u/alice.json',
        }),
      } as Response)

      await runPublish()

      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        'https://vibechk.test/api/users/test-uuid-1234',
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-uuid-1234',
            'Content-Type': 'application/json',
          }),
        }),
      )
    })

    it('body includes the PublicProfile JSON with username', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          username: 'alice',
          url: 'https://vibechk.test/u/alice',
          jsonUrl: 'https://vibechk.test/u/alice.json',
        }),
      } as Response)

      await runPublish()

      const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(init.body as string)
      expect(body.username).toBe('alice')
      expect(body.currentStreak).toBe(7)
    })

    it('saves the returned jsonUrl as myPublishUrl', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          username: 'alice',
          url: 'https://vibechk.test/u/alice',
          jsonUrl: 'https://vibechk.test/u/alice.json',
        }),
      } as Response)

      let saved: FriendsFile | null = null
      vi.mocked(saveFriends).mockImplementation((data) => { saved = data })

      await runPublish()
      expect(saved!.myPublishUrl).toBe('https://vibechk.test/u/alice.json')
    })

    it('returns the jsonUrl on success', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          username: 'alice',
          url: 'https://vibechk.test/u/alice',
          jsonUrl: 'https://vibechk.test/u/alice.json',
        }),
      } as Response)

      const result = await runPublish()
      expect(result).toBe('https://vibechk.test/u/alice.json')
    })

    it('returns null and does not throw on server error', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Internal Server Error' } as Response)
      const result = await runPublish()
      expect(result).toBeNull()
    })

    it('returns null and does not throw on network error', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('ECONNREFUSED'))
      const result = await runPublish()
      expect(result).toBeNull()
    })

    it('silent mode suppresses all output even on failure', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('network down'))
      const writeSpy = vi.spyOn(process.stdout, 'write')
      const logSpy = vi.spyOn(console, 'log')

      await runPublish({ silent: true })

      expect(writeSpy).not.toHaveBeenCalled()
      expect(logSpy).not.toHaveBeenCalled()
    })

    it('shows profile URL and friend-add hint on success', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          username: 'alice',
          url: 'https://vibechk.test/u/alice',
          jsonUrl: 'https://vibechk.test/u/alice.json',
        }),
      } as Response)

      const logSpy = vi.spyOn(console, 'log')
      await runPublish()

      const output = logSpy.mock.calls.flat().join('\n')
      expect(output).toContain('https://vibechk.test/u/alice')
      expect(output).toContain('vibechk friend add alice')
    })

    it('409 conflict shows username-taken error', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 409, statusText: 'Conflict' } as Response)
      const logSpy = vi.spyOn(console, 'log')
      await runPublish()
      const output = logSpy.mock.calls.flat().join('\n')
      expect(output).toContain('409')
    })
  })
})
