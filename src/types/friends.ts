/**
 * PublicProfile — what a user publishes at their streak URL.
 * Deliberately minimal: summary stats only, never the activity log.
 */
export interface PublicProfile {
  version: 1
  username: string
  currentStreak: number
  longestStreak: number
  lastActiveDate: string | null // "YYYY-MM-DD"
  consistencyLast30: number     // integer 0–100
  totalCheckIns: number
  badges: string[]              // milestone IDs earned
  publishedAt: string           // ISO 8601
}

/**
 * A friend you have subscribed to.
 * The `alias` is your local name for them (what you call them).
 * The `url` is their stable publish URL — this IS their identity.
 * The `cached` field holds the last successfully fetched data.
 */
export interface FriendEntry {
  alias: string
  url: string
  addedAt: string               // ISO 8601
  lastFetchedAt: string | null  // ISO 8601, null if never successfully fetched
  lastFetchError?: string       // last error message if fetch failed
  cached: PublicProfile | null
}

export interface FriendsFile {
  version: 1
  friends: FriendEntry[]
  myPublishUrl: string | null   // your own Gist URL (shareable with friends)
  gistId: string | null         // GitHub Gist ID if published there
}
