# vibechk 🔥

> Daily streak tracker for vibe coders. Tracks your AI-assisted coding sessions and lets you compare streaks with friends.

Built for developers who use Claude Code, Cursor, Windsurf, and other AI coding tools. Like Duolingo's streak system — but for vibe coding.

## Install

```bash
npm install -g vibechk
```

## Quick Start

```bash
vibechk init          # Set up your profile (30 seconds)
vibechk               # Auto-detect today's session & check in
vibechk status        # See your streak, calendar, and progress
```

## How It Works

**Session Detection:** vibechk reads your local Claude Code session logs (via `ccusage`) to automatically detect when you've done AI-assisted coding. No manual check-in required.

```
$ vibechk

🔥 Day 23! Streak protected.
🔥 23-day streak

$ vibechk status
╭────────────────  vibechk  ─────────────────╮
│ 🔥 23-day streak  ✓ Protected for today    │
│                                            │
│ Progress  ████████░░░░ → day 30            │
│ Longest   23d  │  Freezes ❄️ ❄️            │
│                                            │
│ M:✓  T:✓  W:✓  T:✓  F:✓  S:·  S:✓         │
│                                            │
│ March 3, 2026  │  alice_codes              │
╰────────────────────────────────────────────╯
```

## Commands

| Command | Description |
|---|---|
| `vibechk` | Auto-detect session and check in (default) |
| `vibechk init` | Set up profile (username, timezone, cloud sync) |
| `vibechk check-in` | Check in today's session |
| `vibechk check-in --manual` | Manual check-in (skip auto-detection) |
| `vibechk status` | Show streak dashboard in terminal |
| `vibechk status --web` | Open visual dashboard in browser |
| `vibechk dashboard` | Open visual browser dashboard |
| `vibechk freeze` | Manage freeze tokens |
| `vibechk freeze --tomorrow` | Pre-apply freeze for a planned absence |
| `vibechk leaderboard` | View community streak leaderboard |
| `vibechk leaderboard --web` | Leaderboard in browser |
| `vibechk sync` | Push streak to cloud leaderboard |
| `vibechk export` | Export all data as JSON |

## Streak Psychology

vibechk is built around healthy habit psychology:

**Loss aversion:** Your streak display reminds you "Your 23-day streak is protected" — you've invested in it and the thought of losing it motivates you to keep going.

**Forgiveness mechanics (two-tier):**
- **Grace period** (automatic): Miss 1 day → streak auto-preserved. Once per 14 days.
- **Freeze tokens** (explicit): Start with 2 tokens. Earn more at 30, 60, 90 day milestones. Use with `vibechk freeze` for planned absences.

**Milestone system:**

| Days | Badge | Rarity |
|---|---|---|
| 3 | 🌱 Warming Up | Common |
| 7 | ⚡ Week Warrior | Common |
| 14 | 🚀 Fortnight Coder | Common |
| 30 | 🏆 Monthly Builder | Rare (+1 freeze token) |
| 60 | 💎 Two Month Grind | Rare (+1 freeze token) |
| 90 | 🔥 Quarter Strong | Epic (+1 freeze token) |
| 100 | 💯 Triple Digits | Epic |
| 180 | 🌟 Half Year Vibe | Legendary |
| 365 | 👑 Year of the Vibe | Legendary |

Milestone achievements open a visual celebration in your browser.

## Visual Dashboard

```bash
vibechk dashboard
```

Opens a beautiful dashboard in your browser showing:
- Streak hero card with live countdown
- 90-day activity calendar (GitHub contribution graph style)
- Leaderboard (if configured)
- All milestones with earned/locked status

## Leaderboard (Cloud Sync)

Opt-in to compare streaks with friends. You need a shared server endpoint.

```bash
# During init, or update later:
vibechk config cloudSync.endpoint https://your-server.com
vibechk config cloudSync.apiKey your-api-key

# Push your streak
vibechk sync

# View leaderboard
vibechk leaderboard
```

The leaderboard shows your rank relative to peers, with freeze usage transparently displayed:

```
Leaderboard (team.example.com) — updated 5m ago

  Rank  Name              Streak   Longest   Badges
  ─────────────────────────────────────────────────
     1  alice_codes         87d      112d    🏆💎🔥
  →  2  you                 23d       23d    ⚡
     3  bob_builds          21d       65d    ⚡ (1❄)
```

## Session Detection

vibechk auto-detects Claude Code sessions by scanning your local session logs at `~/.config/claude/projects/**/*.jsonl`. It also supports the `ccusage` CLI if you have it installed.

**Sources (configurable):**
- `claude-code` — Claude Code session logs (default)
- `manual` — Explicit `vibechk check-in` command
- `git-hook` — Git post-commit hook (`vibechk install-hook`)

## Scripting / CI

All commands support scripting flags:

```bash
# Silent mode (exit code only: 0=success, 1=broken, 2=already checked in)
vibechk check-in -q

# JSON output
vibechk status --json

# Non-interactive (no prompts)
vibechk check-in --no-interactive --auto-freeze
```

## Programmatic API

```typescript
import { checkIn, getStreak, getLeaderboard } from 'vibechk'

const result = await checkIn({ source: 'api', notes: 'Built auth flow' })
// { action: 'continued', streak: 24, newMilestones: [], freezeTokensRemaining: 2 }

const streak = getStreak()
// { currentStreak: 24, longestStreak: 24, status: 'active', ... }
```

## Data & Privacy

All data stored locally in `~/.vibechk/` (mode 700):

```
~/.vibechk/
├── profile.json      # Username, timezone, preferences
├── streak.json       # Current streak state
├── activity.jsonl    # Full activity log
├── badges.json       # Earned milestones
└── leaderboard.json  # Cached leaderboard (1hr TTL)
```

- **No telemetry.** No analytics. No ping-home on install or run.
- **Cloud is opt-in.** Your endpoint, your key, your data.
- **Export anytime:** `vibechk export > backup.json`

## License

MIT
