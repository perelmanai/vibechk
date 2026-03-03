import { detectClaudeCodeUsage } from './claude-code.js'
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
): Promise<SessionDetectionResult> {
  if (enabledSources.includes('claude-code')) {
    const result = await detectClaudeCodeUsage(date, timezone)
    if (result.detected) {
      return {
        detected: true,
        source: 'claude-code',
        agentData: result.agentData,
      }
    }
  }

  return { detected: false, source: 'manual' }
}
