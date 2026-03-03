import chalk from 'chalk'
import ora from 'ora'
import { confirm } from '@inquirer/prompts'
import { v4 as uuidv4 } from 'uuid'
import { requireProfile } from '../storage/profile-store.js'
import { loadStreak, saveStreak } from '../storage/streak-store.js'
import { appendActivity } from '../storage/activity-store.js'
import { loadBadges } from '../storage/badge-store.js'
import { appendBadges } from '../storage/badge-store.js'
import { todayInTz, nowIso } from '../core/date-utils.js'
import { calculateStreakImpact, applyStreakImpact, addFreezeTokens } from '../core/streak-calculator.js'
import { checkNewMilestones, createEarnedBadges, totalFreezeReward } from '../core/milestone-checker.js'
import { detectTodaySession } from '../detection/index.js'
import { pushStreak } from '../sync/client.js'
import { renderCheckIn, renderMilestone } from '../ui/renderer.js'
import { startDashboard } from '../web/server.js'
import type { CheckInOptions, CheckInResult, ActivitySource } from '../types/index.js'

import openBrowser from 'open'

export async function runCheckIn(options: CheckInOptions & {
  quiet?: boolean
  json?: boolean
  noInteractive?: boolean
  openDashboard?: boolean
} = {}): Promise<CheckInResult> {
  const profile = requireProfile()
  const today = todayInTz(profile.timezone)
  const now = nowIso()

  // Detect session
  let source: ActivitySource = options.source ?? 'manual'
  let agentData = undefined

  if (!options.source || options.source === 'claude-code') {
    const spinner = ora({ text: 'Detecting coding session…', isSilent: options.quiet }).start()
    const detection = await detectTodaySession(today, profile.timezone, profile.preferences.sessionSources)
    spinner.stop()

    if (detection.detected) {
      source = detection.source
      agentData = detection.agentData
    } else if (options.noInteractive) {
      source = 'manual'
    } else if (!options.quiet) {
      // No auto-detection — prompt for manual
      const doManual = await confirm({
        message: chalk.dim('No AI session detected. Check in manually anyway?'),
        default: true,
      })
      if (!doManual) {
        console.log(chalk.dim('  Skipped. Run vibechk again when you\'ve coded today.'))
        process.exit(0)
      }
      source = 'manual'
    }
  }

  // Calculate streak impact
  const currentStreak = loadStreak()
  const currentBadges = loadBadges()

  // Check if freeze is needed
  let useFreeze = options.autoFreeze ?? false
  const impact = calculateStreakImpact(currentStreak, today, false)

  // If broken and freeze available and interactive → ask user
  if (
    impact.action === 'broken' &&
    impact.previousStreak &&
    impact.previousStreak > 0 &&
    currentStreak.freezeTokens > 0 &&
    !options.noInteractive &&
    !options.quiet
  ) {
    const daysDiff = currentStreak.lastActivityDate
      ? Math.abs(new Date(today).getTime() - new Date(currentStreak.lastActivityDate).getTime()) / 86400000
      : 99

    if (daysDiff <= 2) {
      console.log(chalk.yellow(`\n  Missed yesterday. You have ${currentStreak.freezeTokens} freeze token(s).`))
      useFreeze = await confirm({
        message: `Use a freeze token to preserve your ${impact.previousStreak}-day streak?`,
        default: true,
      })
    }
  }

  // Recompute with freeze decision
  const finalImpact = calculateStreakImpact(currentStreak, today, useFreeze)
  const newStreakRecord = applyStreakImpact(currentStreak, finalImpact, today, now)

  // Check milestones
  const newMilestones = checkNewMilestones(newStreakRecord.currentStreak, currentBadges)
  const newBadges = createEarnedBadges(newMilestones, newStreakRecord.currentStreak, now)
  const freezeReward = totalFreezeReward(newMilestones)

  if (freezeReward > 0) {
    newStreakRecord.freezeTokens = addFreezeTokens(newStreakRecord.freezeTokens, freezeReward)
  }

  // Persist (unless dry run)
  if (!options.dryRun) {
    saveStreak(newStreakRecord)
    appendBadges(newBadges)

    if (finalImpact.action !== 'already_checked_in') {
      appendActivity({
        date: today,
        checkedInAt: now,
        source,
        isFrozen: finalImpact.action === 'frozen',
        isGrace: finalImpact.action === 'grace',
        sessionId: uuidv4(),
        agentData,
        notes: options.notes,
      })
    }
  }

  // Output
  if (!options.quiet && !options.json) {
    console.log('')
    console.log(renderCheckIn(finalImpact.action, newStreakRecord.currentStreak, finalImpact.previousStreak, newMilestones))

    for (const milestone of newMilestones) {
      console.log('')
      console.log(renderMilestone(milestone, newStreakRecord.currentStreak))
    }
    console.log('')
  } else if (options.json) {
    const result = {
      action: finalImpact.action,
      streak: newStreakRecord.currentStreak,
      previousStreak: finalImpact.previousStreak,
      newMilestones: newMilestones.map((m) => m.id),
      freezeTokensRemaining: newStreakRecord.freezeTokens,
    }
    console.log(JSON.stringify(result))
  }

  // Open browser for milestones or if requested
  const shouldOpenBrowser = options.openDashboard || (newMilestones.length > 0 && !options.quiet)
  if (shouldOpenBrowser && !options.dryRun) {
    try {
      const url = await startDashboard(true)
      const celebrateUrl = newMilestones.length > 0 ? `${url}?celebrate=1` : url
      await openBrowser(celebrateUrl)
      if (!options.quiet) console.log(chalk.dim(`  Opening dashboard in browser…`))
    } catch {
      // Browser open failed — not critical
    }
  }

  // Async cloud sync (non-blocking)
  if (!options.dryRun && profile.cloudSync) {
    const badges = loadBadges()
    pushStreak(profile, newStreakRecord, badges).catch(() => {/* silent fail */})
  }

  return {
    action: finalImpact.action,
    streak: newStreakRecord.currentStreak,
    previousStreak: finalImpact.previousStreak,
    newMilestones,
    freezeTokensRemaining: newStreakRecord.freezeTokens,
    agentData,
  }
}
