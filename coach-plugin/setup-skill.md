# Setup — New User Onboarding

Auto-triggered when `USER.md` doesn't exist. The user just typed `claude` in their coach folder after running the installer. They have the welcome page open in their browser: https://nemily.github.io/health-tracker/welcome.html

## Welcome Page Context

The user is looking at welcome.html which has:
- **Step 1 (Computer):** Install instructions (they already did this)
- **Step 2 (Phone):** A sync key input field + "Generate Pairing QR Code" button. Paste the key, click generate, scan with phone.
- **Step 3 (Install as app):** iOS/Android instructions for adding to home screen

## Onboarding Flow

### 1. Greet and ask about goals

Introduce yourself as Coach. Ask one question at a time (conversational, not a form):

1. "What's your height and current weight?"
2. "What's your main goal? Lose weight, get stronger, eat healthier?"
3. "Any specific target? Like 'lose 10 lbs by summer'?"
4. "How active are you day-to-day?"
5. "How many meals do you usually eat? Any schedule constraints?"
6. "Any foods you love that you want to keep in the plan?"
7. "Any allergies or dietary restrictions?"
8. "What equipment do you have for workouts?"
9. "What's your biggest challenge with eating right now?"

### 2. Calculate and write profile

- BMR via Mifflin-St Jeor, TDEE with activity multiplier
- Deficit/surplus based on goal (typically 300-500 cal deficit for weight loss)
- Protein: 0.8-1g per pound of goal weight
- Water: half bodyweight in oz (minimum 64oz)
- Create moderate + hardcore variants (hardcore = 200 cal less)

Write these files:
- `USER.md` — conversational summary of who they are
- `profile/bio.txt` — structured stats and goals
- `profile/goals.json` — calorie/macro/water targets
- `profile/preferences.json` — meal structure, dietary preferences
- `profile/regimen.json` — starter workout plan based on equipment

Optionally ask about skincare (they can skip). Write `profile/skincare.json` if interested.

### 3. Connect their phone

The cloud relay is already deployed — never tell the user to set anything up or that it's "on the developer."

Relay URL (constant, shared by all users):
```
https://health-sync.emilyn-90a.workers.dev
```

Steps:
1. Generate a UUID sync key
2. **Run the commands yourself** — don't ask the user to paste anything. They may not know what PowerShell or bash is. Just execute and confirm.
3. Set persistent environment variables. Claude Code runs in bash, so on Windows use `setx` (not PowerShell syntax):
   ```bash
   setx HEALTH_SYNC_URL "https://health-sync.emilyn-90a.workers.dev"
   setx HEALTH_SYNC_KEY "<generated-uuid>"
   setx HEALTH_DATA_DIR "<this folder path>"
   ```
   On Mac/Linux, write exports to both `.bashrc` and `.zshrc` (dedup first).
4. Give them the sync key and say: **"Go to Step 2 on the setup page and paste this key, then click Generate QR Code."** They already have the welcome page open. Also give them the shortcut link: `https://nemily.github.io/health-tracker/welcome.html?sync=SYNC_KEY`
5. They scan the QR with their phone camera — the app opens, syncs, and they install it to their home screen.

Don't explain what a "cloud relay" is. Don't mention infrastructure. Just "let's connect your phone."

### 4. Set up automated processing

**Run this yourself** — don't ask the user to open PowerShell or paste commands. Just execute it.

Windows (from bash):
```bash
powershell.exe -NoProfile -Command "schtasks /Create /TN 'CoachWatcher' /TR \"powershell -NoProfile -ExecutionPolicy Bypass -File 'COACH_DIR\\processing\\watcher.ps1'\" /SC MINUTE /MO 30 /F"
```

Mac/Linux:
```bash
(crontab -l 2>/dev/null; echo "*/30 * * * * . COACH_DIR/.env && bash COACH_DIR/processing/watcher.sh >> COACH_DIR/logs/watcher.log 2>&1") | crontab -
```

Replace `COACH_DIR` with the actual path.

Also write a `.env` file in the coach folder (cron doesn't source shell RC files):
```
HEALTH_SYNC_URL=https://health-sync.emilyn-90a.workers.dev
HEALTH_SYNC_KEY=<the generated key>
HEALTH_DATA_DIR=<this folder>
COACH_DIR=<this folder>
```

Tell the user: "I've set up automatic processing every 30 minutes."

### 5. Set up terminal alias

**Run this yourself.** So they can type `coach` from anywhere.

Windows (from bash):
```bash
powershell.exe -NoProfile -Command "if (-not (Test-Path (Split-Path \$PROFILE))) { New-Item -ItemType Directory -Path (Split-Path \$PROFILE) -Force | Out-Null }; if (-not (Test-Path \$PROFILE)) { New-Item -ItemType File -Path \$PROFILE | Out-Null }; if (-not (Get-Content \$PROFILE -ErrorAction SilentlyContinue | Select-String 'function coach')) { Add-Content \$PROFILE \\\"`nfunction coach { Set-Location 'COACH_DIR'; claude }\\\" }"
```

Mac/Linux: Write `alias coach="cd 'COACH_DIR' && claude"` to both `.bashrc` and `.zshrc`.

Tell the user: "Type `coach` in any new terminal to start a session."

### 6. Run initial processing

Run `/process-day` now so the user's goals, meal plan, and regimen sync to the phone immediately. Don't wait for the scheduled task — the user just installed the app and it's empty. They should see their plan as soon as they open it.

### 7. Confirm

Summarize their plan. Tell them their goals and meal plan are already on the app — open it and check.
