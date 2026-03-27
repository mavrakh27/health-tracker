# Getting Started with Coach

Coach is an AI-powered health tracking PWA. Log food (with photos), workouts, water, weight, and sleep on your phone. Optionally connect it to your computer for AI-powered calorie analysis, meal plans, and coaching.

---

## Step 1: Install the PWA

1. Open **https://nemily.github.io/health-tracker/** in Safari (iOS) or Chrome (Android).
2. Tap the share icon → **Add to Home Screen**.
3. Open Coach from your home screen — it now runs like a native app, offline-capable.

---

## Step 2: Set Your Goals

On first launch, the app walks you through a quick onboarding:

- Choose a plan: **Moderate** (balanced) or **Hardcore** (aggressive deficit)
- Set calorie and protein targets
- Add workouts to your regimen

You can update goals anytime via the **Settings** tab.

---

## Step 3 (Optional): Set Up Cloud Sync

Cloud sync lets your phone upload data to a relay, and your computer download and process it with AI.

You need a relay URL and a sync key (a UUID you generate once).

**If you're running your own relay:** see [relay-setup.md](relay-setup.md).

**If using a shared relay:** get the URL from the relay owner.

**Configure in the app:**
1. Open **Settings → Cloud Sync**
2. Enter your relay URL and sync key
3. Tap **Sync Now** to test

---

## Step 4 (Optional): Install the Coach Plugin

The coach plugin adds AI-powered processing to your computer. It analyzes food photos, estimates calories/macros, generates meal plans, and gives you a 1:1 coaching experience -- all powered by your own Claude Code subscription.

**Requirements:** [Claude Code](https://claude.ai/code) installed with a Pro or Max subscription.

### Option A: Claude Code Plugin (recommended)

```bash
mkdir coach && cd coach
```

Then inside Claude Code:

```
/plugin marketplace add nEmily/health-tracker
/plugin install coach@health-tracker --scope project
/setup
```

The `/setup` command walks you through everything -- goals, phone pairing, and automated processing. The plugin is scoped to this folder, so `/coach` and `/process-day` only work when you're here.

To start a coaching session anytime, just `cd` into the coach folder and type `coach` (or `claude`).

**Updating:** Run `/plugin marketplace update` to get the latest version.

### Option B: Script installer (fallback)

If you prefer not to use the plugin system:

```bash
# Mac/Linux
mkdir coach && cd coach
curl -sL https://raw.githubusercontent.com/nEmily/health-tracker/main/install-coach.sh | bash

# Windows (PowerShell)
mkdir coach; cd coach
irm https://raw.githubusercontent.com/nEmily/health-tracker/main/install-coach.ps1 | iex
```

After installing, type `claude` in the coach folder -- onboarding starts automatically.

See [processing-setup.md](processing-setup.md) for manual setup or advanced configuration.

---

## What Works Without Processing

Even without a relay or processing setup, Coach is fully functional for:

- Manual food logging (name + estimated calories)
- Water and weight tracking
- Workout logging
- Daily health scoring (moderate and hardcore plans)
- Progress charts and history

---

## What Processing Adds

- **AI photo analysis** — photograph a meal, get estimated calories and macros automatically
- **Meal plans** — daily recommendations based on your goals and history
- **Coach responses** — AI feedback on your day, trends, and suggestions
- **Workout recommendations** — personalized based on your regimen and recent activity
