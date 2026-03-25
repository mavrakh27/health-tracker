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

**One-line install:**

```bash
# Mac/Linux
curl -sL https://raw.githubusercontent.com/nEmily/health-tracker/main/install-coach.sh | bash

# Windows (PowerShell)
irm https://raw.githubusercontent.com/nEmily/health-tracker/main/install-coach.ps1 | iex
```

This installs Coach and sets up the data directory. No repo fork needed.

After installing, type `claude` in the Coach folder -- onboarding starts automatically.

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
