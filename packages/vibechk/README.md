# vibechk 🔥

> Daily streak tracker for vibe coders. Tracks your AI-assisted coding sessions and lets you compare streaks with friends — no server required.

Built for developers who use Claude Code, Cursor, Windsurf, and other AI coding tools. Like Duolingo's streak system — but for vibe coding.

## Install

```bash
npm install -g vibechk
```

## Full Flow: Install → Track → Share → Leaderboard

### 1. Set up (30 seconds)

```bash
vibechk init
```

Prompts for your username, auto-detects your timezone, and optionally installs a daily 9 PM auto-check-in job (recommended).

---

### 2. Check in

```bash
vibechk
```

Running `vibechk` with no arguments auto-detects your Claude Code sessions for the day and updates your streak. If you installed the daily scheduler during `init`, this happens automatically each evening without any action from you.

```
$ vibechk

🔥 Day 23! Streak protected.
```

For a manual check-in (no auto-detection):

```bash
vibechk check-in --manual
```

---

### 3. View your stats

```bash
vibechk status       # Terminal dashboard
vibechk status --web # Visual dashboard in browser
vibechk log          # Last 30 days as a calendar
```

```
$ vibechk status
╭────────────────  vibechk  ─────────────────╮
│ 🔥 23-day streak  ✓ Protected for today    │
│                                            │
│ Progress  ████████░░░░ → day 30            │
│ Longest   23d  │  Freezes ❄️ ❄️            │
│                                            │
│ M:✓  T:✓  W:✓  T:✓  F:✓  S:·  S:✓         │
│                                            │
│ March 7, 2026  │  alice_codes              │
╰────────────────────────────────────────────╯

$ vibechk log

Last 30 days  Feb 6 – Mar 7
  ✓ coded  · missed

         Mo Tu We Th Fr Sa Su
  Feb 6     ✓  ✓  ✓  ✓  ✓  ·
  Feb 13  ✓  ✓  ✓  ✓  ✓  ·  ✓
  Feb 20  ✓  ✓  ✓  ·  ✓  ✓  ✓
  Feb 27  ✓  ✓  ✓  ✓  ✓  ·  ✓
  Mar 6   ✓  ○

  Consistency: 87% — 26 of 30 days
```

---

### 4. Share your streak with friends (no server needed)

**Step 1 — Publish your streak to a GitHub Gist:**

```bash
vibechk publish
```

You'll be prompted once for a GitHub personal access token (needs only the `gist` scope). vibechk creates a public Gist with your streak data and prints your shareable URL:

```
  Your friend URL: https://gist.githubusercontent.com/alice/abc123/raw/vibechk.json

  Share this URL with friends so they can follow your streak:
    vibechk friend add alice https://gist.githubusercontent.com/alice/abc123/raw/vibechk.json
```

**Step 2 — Tell your friend to add you:**

Your friend runs the command above on their machine. That's it.

**Step 3 — Add your friends back:**

```bash
vibechk friend add bob https://gist.githubusercontent.com/bob/xyz789/raw/vibechk.json
```

---

### 5. View the leaderboard

```bash
vibechk friends
```

Shows all your friends' streaks in a ranked table. Data auto-refreshes whenever it's stale:

```
$ vibechk friends
  Refreshing 3 friend(s)... 3/3 updated.

  name          streak   today   30d%    best
  ────────────────────────────────────────────────
  bob           🏆 41d          97%     41d
  carol         🔥 23d   ✓      87%     30d
  alice         🔥 19d   ✓      80%     25d
  ────────────────────────────────────────────────
  you           🔥 23d   ✓      —       23d

  Last synced: 0m ago
  Your URL: https://gist.githubusercontent.com/...
```

Your streak is automatically re-published to your Gist after each auto-check-in, so your friends always see fresh data.

---

## Streak Mechanics

### Forgiveness — two tiers

**Grace period (automatic):** Miss 1 day? Your streak is preserved automatically. Resets every 14 days so it's always available for genuine one-off misses.

**Freeze tokens (explicit):** Start with 2 tokens. Earn more at the 30, 60, and 90-day milestones. Use them when you know you'll miss a day:

```bash
vibechk freeze --tomorrow   # Pre-apply for a planned absence
vibechk freeze              # Use today to recover yesterday's miss
```

### Milestones

| Days | Badge | Rarity | Bonus |
|---|---|---|---|
| 3 | 🌱 Warming Up | Common | |
| 7 | ⚡ Week Warrior | Common | |
| 14 | 🚀 Fortnight Coder | Common | |
| 30 | 🏆 Monthly Builder | Rare | +1 freeze token |
| 60 | 💎 Two Month Grind | Rare | +1 freeze token |
| 90 | 🔥 Quarter Strong | Epic | +1 freeze token |
| 100 | 💯 Triple Digits | Epic | |
| 180 | 🌟 Half Year Vibe | Legendary | |
| 365 | 👑 Year of the Vibe | Legendary | |

Hitting a milestone opens a visual celebration in your browser.

---

## All Commands

### Daily use

| Command | What it does |
|---|---|
| `vibechk` | Auto-detect session and check in |
| `vibechk check-in --manual` | Check in without auto-detection |
| `vibechk status` | Terminal streak dashboard |
| `vibechk status --web` | Visual dashboard in browser |
| `vibechk log` | Last 30 days as a calendar grid |
| `vibechk share` | Generate a shareable streak summary (copies to clipboard) |

### Scheduler

| Command | What it does |
|---|---|
| `vibechk schedule` | Install daily 9 PM auto-check-in (macOS/Linux) |
| `vibechk schedule --time 20:00` | Install at a custom time |
| `vibechk schedule --remove` | Remove the scheduled job |
| `vibechk schedule --status` | Check if a schedule is installed |

### Friends & sharing

| Command | What it does |
|---|---|
| `vibechk publish` | Publish streak to GitHub Gist (first run prompts for token) |
| `vibechk friends` | Show friends' streaks (auto-refreshes stale data) |
| `vibechk friend add <alias> <url>` | Subscribe to a friend's streak |
| `vibechk friend remove <alias>` | Unsubscribe from a friend |
| `vibechk friend pull` | Force-refresh all friends now |

### Freeze tokens

| Command | What it does |
|---|---|
| `vibechk freeze` | Use a token to recover from yesterday's miss |
| `vibechk freeze --tomorrow` | Pre-apply a token for tomorrow |

### Data

| Command | What it does |
|---|---|
| `vibechk export` | Export all data as JSON |

---

## Session Detection

vibechk auto-detects coding sessions by scanning your local Claude Code session logs at `~/.config/claude/projects/**/*.jsonl`. Detection runs at check-in time — nothing runs in the background between check-ins.

**Supported sources:**
- `claude-code` — Claude Code session logs (default, no config needed)
- `git` — Git commits in watched repos (opt-in via `init`)
- `manual` — `vibechk check-in --manual`

---

## Automatic daily tracking

Install the scheduler once and vibechk runs itself every evening:

```bash
vibechk schedule           # installs at 9 PM (macOS: launchd, Linux: cron)
vibechk schedule --time 20:00   # different time
```

The scheduler runs `vibechk check-in --no-interactive --quiet` — it only records a streak day when a coding session is actually detected, then silently re-publishes your Gist so friends see fresh data.

---

## Scripting / CI

```bash
vibechk check-in --quiet            # minimal output
vibechk check-in --json             # structured JSON output
vibechk check-in --no-interactive   # no prompts (for scripts/CI)
vibechk status --json
```

## Programmatic API

```typescript
import { checkIn, getStreak, getProfile, exportData } from 'vibechk'

const result = await checkIn({ source: 'api', notes: 'Built auth flow' })
// { action: 'continued', streak: 24, newMilestones: [], freezeTokensRemaining: 2 }

const streak = getStreak()
// { currentStreak: 24, longestStreak: 24, status: 'active', freezeTokens: 2, ... }
```

---

## Data & Privacy

All data stored locally in `~/.vibechk/`:

```
~/.vibechk/
├── profile.json      # Username, timezone, preferences
├── streak.json       # Current streak state
├── activity.jsonl    # Full activity log (never published)
├── badges.json       # Earned milestones
├── friends.json      # Friend subscriptions + cached data
└── gist-token        # GitHub token (gist scope only)
```

- **No telemetry.** No analytics. No ping-home on install or run.
- **Activity log is private.** Only your public summary (streak counts, badges) is published to your Gist.
- **Export anytime:** `vibechk export > backup.json`

---

## License

MIT
