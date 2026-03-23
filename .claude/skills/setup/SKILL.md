# /setup -- Set Up Coach for a New User

One-command setup that creates the Coach project folder, installs the terminal alias, configures cloud sync, sets up automated processing, and runs an interactive onboarding conversation to set personalized goals.

## Usage

```
/setup                # Full guided setup (new user)
/setup reset          # Re-run onboarding (existing user)
```

## What It Creates

Everything lives in the current directory (the user should `mkdir coach && cd coach` first):

```
./
├── CLAUDE.md          — Coach brain (loads personality + data on every session)
├── SOUL.md            — Coach personality (voice, values, communication style)
├── USER.md            — This user's stats, goals, challenges (written during onboarding)
├── conversations.md   — Chat history from the app (built by processing)
├── profile/           — goals.json, preferences.json, regimen.json, bio.txt, skincare.json
├── analysis/          — Daily analysis JSONs (populated by processing)
├── logs/              — Processing logs
├── processing/        — Watcher + process-day scripts, conversation builder
└── .claude/           — Skills, memory
```

## Steps

### 1. Create the folder structure

```bash
mkdir -p .claude/skills .claude/memory profile analysis logs processing
```

If the directory already has data (profile/, analysis/), this is a re-setup — skip creation.

### 2. Write SOUL.md and CLAUDE.md

Copy `SOUL.md` and `CLAUDE.md` from the health-tracker repo:
- Source: `{REPO}/coach-plugin/SOUL.md` and `{REPO}/coach-plugin/CLAUDE.md`
- If running from the health-tracker repo, use the local copies
- If the repo isn't available, write them inline (the content is defined in this skill)

The SOUL.md defines WHO Coach is. The CLAUDE.md defines HOW Coach operates. These are the core of the experience — read them to understand the personality before proceeding.

### 3. Install the `coach` alias

Detect the user's shell and add the alias. The alias should cd to the coach folder (current directory) and start Claude.

**PowerShell (Windows):**
```powershell
$coachDir = (Get-Location).Path
if (-not (Test-Path (Split-Path $PROFILE))) { New-Item -ItemType Directory -Path (Split-Path $PROFILE) -Force | Out-Null }
if (-not (Test-Path $PROFILE)) { New-Item -ItemType File -Path $PROFILE | Out-Null }
if (-not (Get-Content $PROFILE -ErrorAction SilentlyContinue | Select-String 'function coach')) {
    Add-Content $PROFILE "`nfunction coach { Set-Location '$coachDir'; claude }"
}
```

**Mac/Linux (write to BOTH .bashrc and .zshrc):**
```bash
COACH_DIR="$(pwd)"
for rc in "$HOME/.bashrc" "$HOME/.zshrc"; do
    if ! grep -q 'alias coach=' "$rc" 2>/dev/null; then
        echo "alias coach=\"cd '$COACH_DIR' && claude\"" >> "$rc"
    fi
done
```

Tell the user: "Open a new terminal and type `coach` to start a session."

### 4. Configure cloud sync

The relay URL is shared (all users use the same Cloudflare Worker). The user only needs a sync key.

**Relay URL constant** (used in all commands below):
```
RELAY_URL = https://health-sync.emilyn-90a.workers.dev
```
Note: all users share this relay. Data is isolated by sync key.

**Generate a sync key:**
```bash
# PowerShell
$key = [System.Guid]::NewGuid().ToString()

# Bash (fallback chain: uuidgen → python3 → openssl)
key=$(uuidgen 2>/dev/null || python3 -c "import uuid; print(uuid.uuid4())" 2>/dev/null || openssl rand -hex 16 | sed 's/\(.\{8\}\)\(.\{4\}\)\(.\{4\}\)\(.\{4\}\)/\1-\2-\3-\4-/')
if [ -z "$key" ]; then echo "ERROR: Could not generate UUID. Install uuidgen or python3."; exit 1; fi
```

**Set environment variables** (data dir = current directory):

PowerShell (Windows):
```powershell
$coachDir = (Get-Location).Path
[System.Environment]::SetEnvironmentVariable("HEALTH_SYNC_URL", "https://health-sync.emilyn-90a.workers.dev", "User")
[System.Environment]::SetEnvironmentVariable("HEALTH_SYNC_KEY", "$key", "User")
[System.Environment]::SetEnvironmentVariable("HEALTH_DATA_DIR", "$coachDir", "User")
[System.Environment]::SetEnvironmentVariable("COACH_DIR", "$coachDir", "User")
```

Mac/Linux — write to BOTH .bashrc and .zshrc, with dedup:
```bash
RELAY="https://health-sync.emilyn-90a.workers.dev"
COACH_DIR="$(pwd)"
for rc in "$HOME/.bashrc" "$HOME/.zshrc"; do
    sed -i.bak '/HEALTH_SYNC_URL\|HEALTH_SYNC_KEY\|HEALTH_DATA_DIR\|COACH_DIR/d' "$rc" 2>/dev/null
    cat >> "$rc" <<ENVEOF
export HEALTH_SYNC_URL='$RELAY'
export HEALTH_SYNC_KEY='$key'
export HEALTH_DATA_DIR='$COACH_DIR'
export COACH_DIR='$COACH_DIR'
ENVEOF
done
```

Also write a `.env` file for cron/scheduled tasks (which don't source shell RC files):
```bash
cat > .env <<ENVEOF
HEALTH_SYNC_URL=$RELAY
HEALTH_SYNC_KEY=$key
HEALTH_DATA_DIR=$(pwd)
COACH_DIR=$(pwd)
ENVEOF
```

Note: `HEALTH_DATA_DIR` and `COACH_DIR` both point to the current directory. No separate folder.

**Save the sync key** — it's needed for the phone setup later in the conversation.

### 5. Copy processing scripts

Copy from the health-tracker repo into `./processing/`. If running from the repo:
```bash
cp processing/process-day.bat processing/process-day.sh processing/watcher.ps1 processing/watcher.sh processing/process-day-prompt.md ./processing/
cp coach-plugin/build-conversations.js ./processing/
```

If the repo isn't available, download directly:
```bash
REPO="https://raw.githubusercontent.com/nEmily/health-tracker/main"
for f in process-day.bat process-day.sh watcher.ps1 watcher.sh process-day-prompt.md; do
    curl -sL "$REPO/processing/$f" -o ./processing/$f
done
curl -sL "$REPO/coach-plugin/build-conversations.js" -o ./processing/build-conversations.js
```

### 6. Run onboarding conversation

This is the heart of setup. Adopt the Coach persona (read SOUL.md) and have a natural conversation:

**Introduce yourself:**
"Hey! I'm Coach. I'm going to be your health buddy — tracking what you eat, keeping you accountable, and helping you hit your goals. Let me learn about you first."

**Ask one question at a time** (conversational, not a form):
1. "What's your height and current weight?"
2. "What's your main goal? Lose weight, get stronger, eat healthier, all of the above?"
3. "Any specific target? Like 'lose 10 lbs by summer' or 'run a 5K'?"
4. "How active are you day-to-day? Office job, on your feet, pretty active?"
5. "How many meals do you usually eat? Any schedule constraints? (Partner's schedule, office cafeteria, etc.)"
6. "Any foods you love that you want to keep in the plan?"
7. "Any foods you hate, allergies, or dietary restrictions?"
8. "What equipment do you have for workouts? Gym membership, home stuff, just bodyweight?"
9. "What's your biggest challenge with eating right now? Late-night snacking, portions, skipping meals?"

**Calculate and write goals:**
- BMR via Mifflin-St Jeor, TDEE with activity multiplier
- Deficit/surplus based on goal (typically 300-500 cal deficit for weight loss)
- Protein: 0.8-1g per pound of goal weight
- Water: half bodyweight in oz (minimum 64oz)
- Create moderate + hardcore variants (hardcore = 200 cal less)

**Write files:**
- `USER.md` — conversational summary of who they are and what they want
- `profile/bio.txt` — structured stats and goals
- `profile/goals.json` — calorie/macro/water targets with timeline and milestones
- `profile/preferences.json` — meal structure, dietary preferences, schedule
- `profile/regimen.json` — starter workout plan based on equipment and experience

**Ask about skincare** (optional — they can skip):
- Skin type, concerns, current products, budget, time commitment
- Write `profile/skincare.json` if they're interested

### 7. Set up automated processing (guided, during conversation)

After the onboarding questions, guide the user through setting up the scheduled task. They need to run these commands themselves — walk them through it conversationally.

**IMPORTANT:** Run `watcher.sh`/`watcher.ps1` (not `process-day` directly) — the watcher handles pending-data checks, quiet hours, and lock management.

**Frame it naturally:**
"One more thing — let's set up the auto-pilot so I can analyze your food photos and update your plan every 30 minutes. You'll need to paste a command:"

**Windows — give them this single-line command:**
```
Tell the user to open an elevated PowerShell (Run as Administrator) and paste:
```
```powershell
$a = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -File `"COACH_DIR\processing\watcher.ps1`""; $t = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 30) -RepetitionDuration (New-TimeSpan -Days 3650); $s = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries; Register-ScheduledTask -TaskName "CoachWatcher" -Action $a -Trigger $t -Settings $s -Description "Coach - processes health data every 30 min"
```
Replace `COACH_DIR` with the actual path before giving it to the user.

**Mac/Linux — give them this command:**
```bash
(crontab -l 2>/dev/null; echo "*/30 * * * * . COACH_DIR/.env && bash COACH_DIR/processing/watcher.sh >> COACH_DIR/logs/watcher.log 2>&1") | crontab -
```
Replace `COACH_DIR` with the actual path before giving it to the user.

**Verify it worked:**
- Windows: `Get-ScheduledTask -TaskName "CoachWatcher" | Select-Object State`
- Mac/Linux: `crontab -l | grep Coach`

Tell the user what to expect: "Every 30 minutes, I'll check if you've logged anything new, analyze your food photos, estimate calories, and sync results back to your phone."

### 8. Connect the phone (guided, during conversation)

Walk the user through installing the PWA and connecting it — don't just dump instructions. Coach should guide them step by step:

**Generate the pairing URL:**
```
https://nemily.github.io/health-tracker/?key={SYNC_KEY}&relay=https://health-sync.emilyn-90a.workers.dev
```

**Show QR code or link:**
"Time to connect your phone! Open this link on your phone — it'll install the app and connect it automatically:"

Print the pairing URL. If running in a terminal that supports it, suggest the user open the welcome page on their computer to generate a QR code:
"Or open https://nemily.github.io/health-tracker/welcome.html on this computer, paste your sync key, and scan the QR code with your phone."

**Walk through phone-side setup:**
1. "Open that link on your phone (Safari for iPhone, Chrome for Android)"
2. "You should see a toast saying 'Sync connected' — that means we're linked up"
3. "Now install it as an app: tap Share > Add to Home Screen (iPhone) or the install banner (Android)"
4. "Open the app from your home screen — it works offline"

**Verify the connection:**
"Log a quick test — take a photo of whatever's in front of you and hit save. I'll pick it up on the next processing run and you'll see the analysis appear in the app."

### 9. Confirm

"You're all set! Here's your plan:
- **Calories:** {target}/day ({hardcore} on crush-it days)
- **Protein:** {protein}g
- **Water:** {water}oz
- **Workouts:** {schedule summary}

The app syncs every 30 minutes. Log a meal photo to test it out. And anytime you want to chat, just type `coach` in your terminal."

## Notes

- The relay URL is hardcoded — all users share the same Cloudflare Worker
- Data is isolated by sync key (UUID) — no accounts needed
- Processing requires Claude Code (Pro or Max subscription) on the user's computer
- The coach folder IS the data directory — everything lives in one place
- `conversations.md` is rebuilt each processing run from analysis + extracted chat data
- The `coach` alias works from any terminal — it cd's into the coach folder and starts Claude
