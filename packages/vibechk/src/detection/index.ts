import { detectClaudeCodeUsage } from './claude-code.js'
import { detectGitActivity } from './git.js'
import type { AgentData, ActivitySource } from '../types/index.js'

export interface SessionDetectionResult {
  detected: boolean
  source: ActivitySource
  agentData?: AgentData
}

/** Detect any vibe coding session for today */
export async function detectTodaySession(
  date: string,
  timezone: string,
  enabledSources: ActivitySource[],
  watchedRepos: string[] = [],
): Promise<SessionDetectionResult> {
  // Claude Code is the primary signal — richest data (tokens, models, sessions)
  if (enabledSources.includes('claude-code')) {
    const result = await detectClaudeCodeUsage(date, timezone)
    if (result.detected) {
      return { detected: true, source: 'claude-code', agentData: result.agentData }
    }
  }

  // Git commits as a fallback — covers sessions that didn't use Claude Code
  if (enabledSources.includes('git')) {
    const result = await detectGitActivity(date, timezone, watchedRepos)
    if (result.detected) {
      return { detected: true, source: 'git' }
    }
  }

  return { detected: false, source: 'manual' }
}
