# Sync Steps from Apple Health

Coach can display your daily step count by syncing from Apple Health via an iOS Shortcut. Steps appear on the Today screen as a stat card.

## Setup (2 minutes)

### 1. Get Your Relay URL and Sync Key

Open Coach > Settings > Cloud Sync. You need:
- **Worker URL** (e.g., `https://health-sync.your-worker.workers.dev`)
- **Sync Key** (your UUID)

### 2. Create the Shortcut

Open the **Shortcuts** app on your iPhone and create a new shortcut:

**Action 1: Find Health Samples**
- Tap **Add Action** > search "Find Health Samples"
- Type: **Step Count**
- Filter: Start Date **is today**
- Group By: **Day**
- Sort By: Value, Descending
- Limit: **1**

**Action 2: Get Contents of URL** (HTTP POST)
- URL: `{your-worker-url}/sync/{your-sync-key}/health/{today's date}`
  - For the date, insert a **Format Date** variable: tap the URL field, add a **Current Date** variable formatted as `yyyy-MM-dd`
  - Full URL example: `https://health-sync.example.workers.dev/sync/abc-123/health/2026-03-21`
- Method: **PUT**
- Headers: `Content-Type` = `application/json`
- Request Body: **JSON**
  - Key: `steps` = Value: tap and select the **Health Sample** result from Action 1 > **Value**
  - Key: `date` = Value: **Current Date** (formatted `yyyy-MM-dd`)

**Action 3: Show Notification** (optional)
- Title: "Steps synced"
- Body: the steps value from Action 1

### 3. Name It

Tap the shortcut name at the top and call it "Sync Steps to Coach"

### 4. Automate It (Optional)

To sync automatically:
1. Go to **Automations** tab in Shortcuts
2. Tap **+** > **Create Personal Automation**
3. Choose a trigger:
   - **Time of Day** (e.g., every day at 9 PM)
   - **App** > Open Coach (syncs when you open the app)
4. Add action: **Run Shortcut** > select "Sync Steps to Coach"
5. Turn off **Ask Before Running**

## How It Works

- The Shortcut reads your step count from Apple Health and sends it to your cloud relay
- The relay stores it as a simple JSON file (`health/{key}/{date}.json`)
- Coach fetches it when loading the Today screen and shows it as a stat card
- Steps are also included in daily processing for your coach's analysis

## Troubleshooting

- **Steps not showing?** Make sure Cloud Sync is configured in Coach. The Shortcut needs the same Worker URL and Sync Key.
- **Permission denied?** The Shortcut needs Health access. Go to Settings > Health > Data Access > Shortcuts and enable Step Count.
- **Wrong count?** The Shortcut reads the daily total from Apple Health, which aggregates from all sources (iPhone, Apple Watch, etc.). The count may differ from what your watch shows if both devices logged steps.
