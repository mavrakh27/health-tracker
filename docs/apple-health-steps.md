# Sync Apple Health Data to Coach

Coach can display your daily step count, distance walked, flights climbed, and active calories by syncing from Apple Health via an iOS Shortcut. These appear on the Today screen as stat cards and are included in your coach's daily analysis.

## Setup (5 minutes)

### 1. Get Your Relay URL and Sync Key

Open Coach > Settings > Cloud Sync. You need:
- **Worker URL** (e.g., `https://health-sync.your-worker.workers.dev`)
- **Sync Key** (your UUID)

### 2. Create the Shortcut

Open the **Shortcuts** app on your iPhone and create a new shortcut.

#### Step 1: Format today's date

- Add a **Date** action (defaults to Current Date)
- Add a **Format Date** action
  - Date: Current Date
  - Format: **Custom**
  - Custom Format: `yyyy-MM-dd`
- Set the result to variable: `today`

#### Step 2: Find step count

- Add **Find Health Samples**
  - Type: **Step Count**
  - Start Date: **is today**
  - Group By: **Day**
  - Sort By: Start Date
  - Limit: **1**
- Set the result to variable: `steps`

#### Step 3: Find distance walked

- Add **Find Health Samples**
  - Type: **Walking + Running Distance**
  - Start Date: **is today**
  - Group By: **Day**
  - Sort By: Start Date
  - Limit: **1**
- Set the result to variable: `distance`

#### Step 4: Find flights climbed

- Add **Find Health Samples**
  - Type: **Flights Climbed**
  - Start Date: **is today**
  - Group By: **Day**
  - Sort By: Start Date
  - Limit: **1**
- Set the result to variable: `flights`

#### Step 5: Find active calories

- Add **Find Health Samples**
  - Type: **Active Energy**
  - Start Date: **is today**
  - Group By: **Day**
  - Sort By: Start Date
  - Limit: **1**
- Set the result to variable: `activeCalories`

#### Step 6: Build the URL

- Add a **Text** action with the value:
  ```
  YOUR_WORKER_URL/sync/YOUR_SYNC_KEY/health/
  ```
  Then tap after the trailing slash and insert the `today` variable.
  - Replace `YOUR_WORKER_URL` with your actual Worker URL
  - Replace `YOUR_SYNC_KEY` with your actual sync key
  - The final URL should look like: `https://health-sync.example.workers.dev/sync/abc-123-def/health/2026-03-22`
- Set the result to variable: `url`

#### Step 7: Send to relay

- Add **Get Contents of URL**
  - URL: tap and insert the `url` variable
  - Method: **PUT**
  - Headers: add `Content-Type` = `application/json`
  - Request Body: **JSON**
  - Add these key-value pairs:
    - `steps` = (tap, select `steps` variable, choose **Value**)
    - `distance_mi` = (tap, select `distance` variable, choose **Value**)
    - `flights` = (tap, select `flights` variable, choose **Value**)
    - `activeCalories` = (tap, select `activeCalories` variable, choose **Value**)
    - `date` = (tap, insert the `today` variable)
    - `source` = `apple_health` (type this as text)

#### Step 8: Confirmation (optional)

- Add **Show Notification**
  - Title: `Steps synced`
  - Body: tap and insert the `steps` variable

### 3. Name It

Tap the shortcut name at the top and call it **Sync Health to Coach**.

### 4. Test It

Run the shortcut manually. You should see:
- A notification with your step count (if you added Step 8)
- In Coach, the Today screen should show your steps after a refresh

### 5. Automate It (optional)

To sync automatically every evening:

1. Go to the **Automations** tab in Shortcuts
2. Tap **+** > **Create Personal Automation**
3. Choose **Time of Day** > set to **9:00 PM** (or whenever you want the daily sync)
4. Tap **Next**
5. Add action: **Run Shortcut** > select **Sync Health to Coach**
6. Tap **Next**
7. Turn off **Ask Before Running**
8. Tap **Done**

Other trigger options:
- **App > Open Coach** -- syncs every time you open the app (may be excessive)
- **Time of Day, multiple times** -- e.g., noon and 9 PM for mid-day and end-of-day snapshots

## Simpler Version (Steps Only)

If you only care about step count, you can skip Steps 3-5 above and only include `steps` and `date` in the JSON body. The other fields are optional -- Coach displays whatever data is available.

## How It Works

1. The Shortcut reads health metrics from Apple Health (aggregated from all sources: iPhone, Apple Watch, etc.)
2. It sends the data as JSON to your cloud relay via HTTP PUT
3. The relay stores it in R2 at `health/{key}/{date}.json`
4. Coach fetches this data when loading the Today screen and displays stat cards
5. The processing script includes health data in its daily analysis

## Data Format

The JSON stored in the relay looks like:

```json
{
  "steps": 8432,
  "distance_mi": 3.7,
  "flights": 12,
  "activeCalories": 285,
  "date": "2026-03-22",
  "source": "apple_health"
}
```

All fields except `date` are optional. Coach displays whatever is present.

## Troubleshooting

**Steps not showing in Coach?**
- Make sure Cloud Sync is configured in Coach (Settings > Cloud Sync)
- The Shortcut must use the same Worker URL and Sync Key as your Coach app
- Try refreshing the Today tab or closing/reopening Coach

**Permission denied?**
- The Shortcut needs Health access. Go to Settings > Health > Data Access & Devices > Shortcuts and enable the data types you want to sync.

**Wrong step count?**
- Apple Health aggregates steps from all sources (iPhone, Apple Watch, connected apps). The total may differ from what a single device shows. This is the most accurate total since it deduplicates overlapping sources.

**Distance seems wrong?**
- The shortcut sends distance in whatever unit Apple Health uses for your locale. If you see unexpected values, check whether your Health app is set to miles or kilometers and adjust the field name in the JSON accordingly (`distance_mi` vs `distance_km`).

**Shortcut fails silently?**
- Try changing the last action to **Show Result** instead of **Show Notification** to see the HTTP response
- A `{"ok":true}` response means the relay accepted the data
- A `{"error":"invalid key"}` response means your sync key is wrong
