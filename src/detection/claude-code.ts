/**
 * Detects Claude Code / AI agent usage for a given date by reading
 * the local JSONL session logs written by Claude Code at:
 *   ~/.config/claude/projects/**\/*.jsonl
 *
 * Also supports `ccusage` CLI if available.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { execSync } from 'child_process'
import { dateInTz } from '../core/date-utils.js'
import type { AgentData } from '../types/index.js'

const CLAUDE_PROJECTS_DIR = join(homedir(), '.config', 'claude', 'projects')

export interface DetectionResult {
  detected: boolean
  source: 'ccusage-cli' | 'jsonl-scan' | 'none'
  agentData?: AgentData
}

/**
 * Try to detect Claude Code activity on `date` (YYYY-MM-DD) in `timezone`.
 * First tries `ccusage` CLI, then falls back to raw JSONL scanning.
 */
export async function detectClaudeCodeUsage(
  date: string,
  timezone: string,
): Promise<DetectionResult> {
  // Try ccusage CLI first
  const ccusageResult = tryCcusageCli(date)
  if (ccusageResult) return ccusageResult

  // Fall back to raw JSONL scan
  return scanJsonlFiles(date, timezone)
}

function tryCcusageCli(date: string): DetectionResult | null {
  try {
    // ccusage daily --date YYYY-MM-DD --json
    const output = execSync(`ccusage daily --date ${date} --json 2>/dev/null`, {
      timeout: 5000,
      encoding: 'utf8',
    })
    const data = JSON.parse(output)
    // ccusage returns an array or object with token counts
    const entries = Array.isArray(data) ? data : [data]
    const total = entries.reduce((sum: number, e: any) => sum + (e.totalTokens || e.tokens || 0), 0)

    if (total > 0) {
      return {
        detected: true,
        source: 'ccusage-cli',
        agentData: {
          sessions: entries.length,
          tokensApprox: total,
          models: [...new Set(entries.map((e: any) => e.model).filter(Boolean))],
        },
      }
    }
    return { detected: false, source: 'ccusage-cli' }
  } catch {
    return null // ccusage not available
  }
}

function scanJsonlFiles(date: string, timezone: string): DetectionResult {
  if (!existsSync(CLAUDE_PROJECTS_DIR)) {
    return { detected: false, source: 'none' }
  }

  let sessionCount = 0
  let tokenCount = 0

  try {
    const projectDirs = readdirSync(CLAUDE_PROJECTS_DIR)

    for (const project of projectDirs) {
      const projectPath = join(CLAUDE_PROJECTS_DIR, project)
      if (!statSync(projectPath).isDirectory()) continue

      const files = readdirSync(projectPath).filter((f) => f.endsWith('.jsonl'))

      for (const file of files) {
        const filePath = join(projectPath, file)
        const content = readFileSync(filePath, 'utf8')
        const lines = content.split('\n').filter((l) => l.trim())

        let fileHasActivity = false
        for (const line of lines) {
          try {
            const entry = JSON.parse(line)
            // Each line is a message in the conversation
            // Check if this message's timestamp falls on `date` in `timezone`
            const ts = entry.timestamp || entry.createdAt || entry.created_at
            if (!ts) continue

            const entryDate = dateInTz(ts, timezone)
            if (entryDate === date) {
              fileHasActivity = true
              // Approximate tokens from content length if not provided
              if (typeof entry.usage?.input_tokens === 'number') {
                tokenCount += entry.usage.input_tokens + (entry.usage.output_tokens || 0)
              } else if (typeof entry.content === 'string') {
                tokenCount += Math.floor(entry.content.length / 4) // rough estimate
              }
            }
          } catch {
            // Skip malformed lines
          }
        }
        if (fileHasActivity) sessionCount++
      }
    }
  } catch {
    return { detected: false, source: 'none' }
  }

  if (sessionCount > 0) {
    return {
      detected: true,
      source: 'jsonl-scan',
      agentData: { sessions: sessionCount, tokensApprox: tokenCount },
    }
  }

  return { detected: false, source: 'jsonl-scan' }
}
