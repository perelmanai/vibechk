import { readJson, writeJson } from './atomic.js'
import { PROFILE_PATH, ensureDir } from './paths.js'
import type { UserProfile } from '../types/index.js'

export function loadProfile(): UserProfile | null {
  return readJson<UserProfile>(PROFILE_PATH)
}

export function saveProfile(profile: UserProfile): void {
  ensureDir()
  writeJson(PROFILE_PATH, profile)
}

export function requireProfile(): UserProfile {
  const profile = loadProfile()
  if (!profile) {
    throw new Error(
      'No vibechk profile found. Run `vibechk init` to get started.',
    )
  }
  return profile
}
