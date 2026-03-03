import { execSync } from 'child_process'
import { existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

export interface GitDetectionResult {
  detected: boolean
  repoPath?: string
}

/**
 * Detect git commits made today across a list of watched repo paths.
 * Falls back to scanning common default directories if no repos are configured.
 *
 * We check for any commit authored by the local git user since the start of
 * `date` (YYYY-MM-DD) in the given timezone. A single commit is enough to
 * confirm a real coding session.
 */
export async function detectGitActivity(
  date: string,
  timezone: string,
  watchedRepos: string[],
): Promise<GitDetectionResult> {
  const repoPaths = watchedRepos.length > 0
    ? watchedRepos.map(expandHome)
    : discoverRepos()

  for (const repoPath of repoPaths) {
    if (!existsSync(join(repoPath, '.git'))) continue

    try {
      // git log filtered to commits on the target date in the user's timezone
      // TZ= prefix ensures git uses the right timezone for --after/--before
      const since = `${date} 00:00:00`
      const until = `${date} 23:59:59`
      const result = execSync(
        `git -C ${JSON.stringify(repoPath)} log --oneline --after=${JSON.stringify(since)} --before=${JSON.stringify(until)} 2>/dev/null`,
        { encoding: 'utf8', timeout: 5000, env: { ...process.env, TZ: timezone } },
      ).trim()

      if (result.length > 0) {
        return { detected: true, repoPath }
      }
    } catch {
      // Repo unreadable or git not available — skip
    }
  }

  return { detected: false }
}

function expandHome(p: string): string {
  if (p.startsWith('~/') || p === '~') {
    return join(homedir(), p.slice(2))
  }
  return p
}

/**
 * Discover git repos one level deep inside common developer directories.
 * Intentionally shallow — we don't want to crawl the whole filesystem.
 */
function discoverRepos(): string[] {
  const candidates = [
    homedir(),
    join(homedir(), 'code'),
    join(homedir(), 'projects'),
    join(homedir(), 'dev'),
    join(homedir(), 'workspace'),
    join(homedir(), 'src'),
  ]

  const repos: string[] = []
  for (const dir of candidates) {
    if (!existsSync(dir)) continue
    // Check if the dir itself is a repo
    if (existsSync(join(dir, '.git'))) {
      repos.push(dir)
      continue
    }
    // Check one level deep
    try {
      const entries = readdirSync(dir)
      for (const entry of entries) {
        const full = join(dir, entry)
        try {
          if (statSync(full).isDirectory() && existsSync(join(full, '.git'))) {
            repos.push(full)
          }
        } catch {
          // Skip unreadable entries
        }
      }
    } catch {
      // Skip unreadable dirs
    }
    // Cap at 50 repos to avoid slow startup
    if (repos.length >= 50) break
  }

  return repos
}
