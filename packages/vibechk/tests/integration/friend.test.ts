import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { FriendEntry, FriendsFile, PublicProfile, UserProfile, StreakRecord } from '../../src/types/index.js'

vi.mock('../../src/storage/friends-store.js', () => ({
  loadFriends: vi.fn(),
  saveFriends: vi.fn(),
  getFriendByAlias: vi.fn(),
  loadGistToken: vi.fn(),
  saveGistToken: vi.fn(),
}))
vi.mock('../../src/storage/profile-store.js', () => ({
  requireProfile: vi.fn(),
  loadProfile: vi.fn(),
  saveProfile: vi.fn(),
}))
vi.mock('../../src/storage/streak-store.js', () => ({
  loadStreak: vi.fn(),
  saveStreak: vi.fn(),
}))
vi.mock('../../src/core/date-utils.js', () => ({
  todayInTz: vi.fn(),
  daysBetween: vi.fn(),
  friendlyDate: vi.fn(),
  dateInTz: vi.fn(),
  secondsUntilMidnight: vi.fn(),
  formatCountdown: vi.fn(),
  systemTimezone: vi.fn(),
}))
vi.mock('../../src/core/milestone-checker.js', () => ({
  getAllMilestones: vi.fn(),
  checkNewMilestones: vi.fn(),
  createEarnedBadges: vi.fn(),
  totalFreezeReward: vi.fn(),
}))
vi.mock('../../src/storage/paths.js', () => ({
  VIBECHK_SERVER: 'https://vibechk.test',
  VIBECHK_DIR: '/tmp/vibechk-test',
  FRIENDS_PATH: '/tmp/vibechk-test/friends.json',
  GIST_TOKEN_PATH: '/tmp/vibechk-test/gist-token',
  ensureDir: vi.fn(),
  dataExists: vi.fn(),
}))

import { runFriendAdd, runFriendRemove, runFriendList, runFriendPull } from '../../src/commands/friend.js'
import { loadFriends, saveFriends, getFriendByAlias } from '../../src/storage/friends-store.js'
import { requireProfile } from '../../src/storage/profile-store.js'
import { loadStreak } from '../../src/storage/streak-store.js'
import { todayInTz } from '../../src/core/date-utils.js'
import { getAllMilestones } from '../../src/core/milestone-checker.js'

const mockLoadFriends = vi.mocked(loadFriends)
const mockSaveFriends = vi.mocked(saveFriends)
const mockGetFriendByAlias = vi.mocked(getFriendByAlias)
const mockRequireProfile = vi.mocked(requireProfile)
const mockLoadStreak = vi.mocked(loadStreak)
const mockTodayInTz = vi.mocked(todayInTz)
const mockGetAllMilestones = vi.mocked(getAllMilestones)

const TODAY = '2026-03-04'

const makeProfile = (): UserProfile => ({
  id: 'test-id',
  username: 'testuser',
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
})

const makeStreak = (overrides: Partial<StreakRecord> = {}): StreakRecord => ({
  currentStreak: 5,
  longestStreak: 10,
  lastActivityDate: TODAY,
  lastCheckInAt: null,
  freezeTokens: 2,
  graceUsedAt: null,
  totalCheckIns: 15,
  status: 'active',
  ...overrides,
})

const makeFriendsFile = (friends: FriendEntry[] = []): FriendsFile => ({
  version: 1,
  friends,
  myPublishUrl: null,
  gistId: null,
})

const makePublicProfile = (overrides: Partial<PublicProfile> = {}): PublicProfile => ({
  version: 1,
  username: 'alice',
  currentStreak: 7,
  longestStreak: 14,
  lastActiveDate: TODAY,
  consistencyLast30: 80,
  totalCheckIns: 30,
  badges: [],
  publishedAt: '2026-03-04T00:00:00.000Z',
  ...overrides,
})

const makeFriendEntry = (alias: string, cached: PublicProfile | null = null): FriendEntry => ({
  alias,
  url: `https://example.com/${alias}.json`,
  addedAt: '2026-03-01T00:00:00.000Z',
  lastFetchedAt: cached ? '2026-03-04T10:00:00.000Z' : null,
  cached,
})

describe('friend commands', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    mockLoadFriends.mockReturnValue(makeFriendsFile())
    mockGetFriendByAlias.mockReturnValue(null)
    mockRequireProfile.mockReturnValue(makeProfile())
    mockLoadStreak.mockReturnValue(makeStreak())
    mockTodayInTz.mockReturnValue(TODAY)
    mockGetAllMilestones.mockReturnValue([])
    mockSaveFriends.mockImplementation(() => {})

    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  // ──────────────────────────────────────────────────────────
  // runFriendAdd
  // ──────────────────────────────────────────────────────────

  describe('runFriendAdd', () => {
    it('rejects alias with spaces', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('process.exit')
      }) as any)
      await expect(runFriendAdd('bad alias', 'https://example.com/x.json')).rejects.toThrow('process.exit')
      expect(exitSpy).toHaveBeenCalledWith(1)
    })

    it('rejects alias with special chars', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('process.exit')
      }) as any)
      await expect(runFriendAdd('alice@bad!', 'https://example.com/x.json')).rejects.toThrow('process.exit')
      expect(exitSpy).toHaveBeenCalledWith(1)
    })

    it('warns and returns when alias already exists', async () => {
      mockGetFriendByAlias.mockReturnValue(makeFriendEntry('alice', makePublicProfile()))
      await runFriendAdd('alice', 'https://example.com/alice.json')
      expect(mockSaveFriends).not.toHaveBeenCalled()
    })

    it('normalises alias to lowercase', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => makePublicProfile(),
      } as Response)

      let savedData: FriendsFile | null = null
      mockSaveFriends.mockImplementation((data) => { savedData = data })

      await runFriendAdd('ALICE', 'https://example.com/alice.json')
      expect(savedData!.friends[0].alias).toBe('alice')
    })

    it('saves friend entry and fetches their profile for display', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => makePublicProfile(),
      } as Response)

      await runFriendAdd('alice', 'https://example.com/alice.json')

      expect(mockSaveFriends).toHaveBeenCalledOnce()
      expect(vi.mocked(fetch)).toHaveBeenCalledOnce()
      const [saved] = mockSaveFriends.mock.calls[0] as [FriendsFile]
      expect(saved.friends[0].alias).toBe('alice')
    })

    it('handles a non-ok HTTP response gracefully', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 404 } as Response)
      await runFriendAdd('alice', 'https://example.com/alice.json')
      // Should still save the entry (just with no cached data)
      expect(mockSaveFriends).toHaveBeenCalledOnce()
    })

    it('handles network error gracefully', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('ECONNREFUSED'))
      await runFriendAdd('bob', 'https://example.com/bob.json')
      expect(mockSaveFriends).toHaveBeenCalledOnce()
    })

    it('rejects invalid profile JSON from remote', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ not: 'a valid profile' }),
      } as Response)
      await runFriendAdd('charlie', 'https://example.com/charlie.json')
      // Should save the entry and not throw
      expect(mockSaveFriends).toHaveBeenCalledOnce()
    })

    it('resolves URL from server when no URL given', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => makePublicProfile({ username: 'alice' }),
      } as Response)

      let savedData: FriendsFile | null = null
      mockSaveFriends.mockImplementation((data) => { savedData = data })

      await runFriendAdd('alice')  // no URL
      expect(savedData!.friends[0].url).toBe('https://vibechk.test/u/alice.json')
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        'https://vibechk.test/u/alice.json',
        expect.objectContaining({ headers: expect.anything() }),
      )
    })

    it('explicit URL overrides server resolution', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => makePublicProfile({ username: 'alice' }),
      } as Response)

      let savedData: FriendsFile | null = null
      mockSaveFriends.mockImplementation((data) => { savedData = data })

      await runFriendAdd('alice', 'https://custom.example.com/alice.json')
      expect(savedData!.friends[0].url).toBe('https://custom.example.com/alice.json')
    })
  })

  // ──────────────────────────────────────────────────────────
  // runFriendRemove
  // ──────────────────────────────────────────────────────────

  describe('runFriendRemove', () => {
    it('removes an existing friend', () => {
      mockLoadFriends.mockReturnValue(
        makeFriendsFile([makeFriendEntry('alice'), makeFriendEntry('bob')])
      )
      runFriendRemove('alice')
      const [saved] = mockSaveFriends.mock.calls[0] as [FriendsFile]
      expect(saved.friends).toHaveLength(1)
      expect(saved.friends[0].alias).toBe('bob')
    })

    it('is case-insensitive', () => {
      mockLoadFriends.mockReturnValue(makeFriendsFile([makeFriendEntry('alice')]))
      runFriendRemove('ALICE')
      const [saved] = mockSaveFriends.mock.calls[0] as [FriendsFile]
      expect(saved.friends).toHaveLength(0)
    })

    it('does not save when alias not found', () => {
      mockLoadFriends.mockReturnValue(makeFriendsFile([]))
      runFriendRemove('nobody')
      expect(mockSaveFriends).not.toHaveBeenCalled()
    })

    it('trims whitespace from alias', () => {
      mockLoadFriends.mockReturnValue(makeFriendsFile([makeFriendEntry('alice')]))
      runFriendRemove('  alice  ')
      const [saved] = mockSaveFriends.mock.calls[0] as [FriendsFile]
      expect(saved.friends).toHaveLength(0)
    })
  })

  // ──────────────────────────────────────────────────────────
  // runFriendList
  // ──────────────────────────────────────────────────────────

  describe('runFriendList', () => {
    it('shows empty state with publish hint when no friends', () => {
      runFriendList()
      const output = consoleSpy.mock.calls.flat().join('\n')
      expect(output).toContain('No friends yet')
    })

    it('renders a row for each friend with cached data', () => {
      mockLoadFriends.mockReturnValue(
        makeFriendsFile([
          makeFriendEntry('alice', makePublicProfile({ username: 'alice', currentStreak: 7 })),
          makeFriendEntry('bob', makePublicProfile({ username: 'bob', currentStreak: 3 })),
        ])
      )
      runFriendList()
      const output = consoleSpy.mock.calls.flat().join('\n')
      expect(output).toContain('alice')
      expect(output).toContain('bob')
    })

    it('sorts checked-in-today before not-yet-checked', () => {
      const checkedIn = makeFriendEntry(
        'bob',
        makePublicProfile({ username: 'bob', currentStreak: 1, lastActiveDate: TODAY })
      )
      const notCheckedIn = makeFriendEntry(
        'alice',
        makePublicProfile({ username: 'alice', currentStreak: 10, lastActiveDate: '2026-03-03' })
      )
      // alice has higher streak but hasn't checked in today
      mockLoadFriends.mockReturnValue(makeFriendsFile([notCheckedIn, checkedIn]))

      runFriendList()

      const output = consoleSpy.mock.calls.flat().join('\n')
      expect(output.indexOf('bob')).toBeLessThan(output.indexOf('alice'))
    })

    it('shows stale warning when lastFetchedAt is >25h ago', () => {
      const staleEntry: FriendEntry = {
        ...makeFriendEntry('alice', makePublicProfile()),
        lastFetchedAt: new Date(Date.now() - 30 * 3600 * 1000).toISOString(),
      }
      mockLoadFriends.mockReturnValue(makeFriendsFile([staleEntry]))

      runFriendList()

      const output = consoleSpy.mock.calls.flat().join('\n')
      expect(output).toContain('stale')
    })

    it('shows your own row at the bottom', () => {
      mockLoadFriends.mockReturnValue(
        makeFriendsFile([makeFriendEntry('alice', makePublicProfile())])
      )
      runFriendList()
      const output = consoleSpy.mock.calls.flat().join('\n')
      expect(output).toContain('you')
    })

    it('shows your publish URL when available', () => {
      const file = makeFriendsFile([makeFriendEntry('alice', makePublicProfile())])
      file.myPublishUrl = 'https://gist.githubusercontent.com/me/123/raw/vibechk.json'
      mockLoadFriends.mockReturnValue(file)

      runFriendList()
      const output = consoleSpy.mock.calls.flat().join('\n')
      expect(output).toContain(file.myPublishUrl)
    })

    it('prompts to publish when no URL set', () => {
      mockLoadFriends.mockReturnValue(
        makeFriendsFile([makeFriendEntry('alice', makePublicProfile())])
      )
      runFriendList()
      const output = consoleSpy.mock.calls.flat().join('\n')
      expect(output).toContain('vibechk publish')
    })
  })

  // ──────────────────────────────────────────────────────────
  // runFriendPull
  // ──────────────────────────────────────────────────────────

  describe('runFriendPull', () => {
    it('does nothing and shows hint when no friends', async () => {
      await runFriendPull()
      expect(vi.mocked(fetch)).not.toHaveBeenCalled()
      const output = consoleSpy.mock.calls.flat().join('\n')
      expect(output).toContain('No friends added yet')
    })

    it('fetches all friends in parallel and saves', async () => {
      const profile = makePublicProfile()
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => profile,
      } as Response)

      mockLoadFriends.mockReturnValue(
        makeFriendsFile([makeFriendEntry('alice'), makeFriendEntry('bob')])
      )

      let saved: FriendsFile | null = null
      mockSaveFriends.mockImplementation((data) => { saved = data })

      await runFriendPull()

      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2)
      expect(saved!.friends[0].cached).toEqual(profile)
      expect(saved!.friends[1].cached).toEqual(profile)
    })

    it('preserves stale cached data when fetch fails', async () => {
      const oldProfile = makePublicProfile({ currentStreak: 5 })
      vi.mocked(fetch).mockRejectedValue(new Error('timeout'))

      mockLoadFriends.mockReturnValue(
        makeFriendsFile([
          {
            ...makeFriendEntry('alice', oldProfile),
            lastFetchedAt: '2026-03-03T10:00:00.000Z',
          },
        ])
      )

      let saved: FriendsFile | null = null
      mockSaveFriends.mockImplementation((data) => { saved = data })

      await runFriendPull({ quiet: true })

      expect(saved!.friends[0].cached).toEqual(oldProfile)
      expect(saved!.friends[0].lastFetchError).toBe('timeout')
    })

    it('records fetch error message on failure', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('HTTP 404'))

      mockLoadFriends.mockReturnValue(makeFriendsFile([makeFriendEntry('alice')]))

      let saved: FriendsFile | null = null
      mockSaveFriends.mockImplementation((data) => { saved = data })

      await runFriendPull({ quiet: true })

      expect(saved!.friends[0].lastFetchError).toBe('HTTP 404')
    })

    it('quiet mode suppresses all output', async () => {
      await runFriendPull({ quiet: true })
      expect(consoleSpy).not.toHaveBeenCalled()
    })

    it('default mode reports sync count', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => makePublicProfile(),
      } as Response)

      mockLoadFriends.mockReturnValue(
        makeFriendsFile([makeFriendEntry('alice'), makeFriendEntry('bob')])
      )

      await runFriendPull()

      const output = consoleSpy.mock.calls.flat().join('\n')
      expect(output).toContain('2/2')
    })
  })
})
