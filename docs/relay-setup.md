# Cloud Relay Setup

The relay is a Cloudflare Worker that acts as a middleman between your phone and your computer. Your phone uploads health data ZIPs; your computer downloads and processes them; analysis results sync back.

---

## Option A: Deploy Your Own Relay

### Prerequisites

- [Node.js](https://nodejs.org/) installed
- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier is enough)
- Wrangler CLI: `npm install -g wrangler`

### Steps

**1. Fork and clone the repo**

```
git clone https://github.com/your-fork/health-tracker.git
cd health-tracker/health-sync
```

**2. Log in to Cloudflare**

```
npx wrangler login
```

**3. Create the R2 bucket**

```
npx wrangler r2 bucket create health-sync
```

**4. Deploy the worker**

```
npx wrangler deploy
```

Wrangler prints your worker URL: `https://health-sync.<your-subdomain>.workers.dev`

**5. Test it**

```
curl https://health-sync.<your-subdomain>.workers.dev/health
```

Expected response:

```json
{"ok":true,"version":"1.0"}
```

**6. Generate a sync key**

Your sync key is a UUID that acts as a private namespace for your data. Generate one:

```
# Mac/Linux
uuidgen

# Windows PowerShell
[guid]::NewGuid().ToString()
```

Save this key — you'll enter it in the app and in your processing environment variables.

---

## Option B: Use a Shared Relay

If someone is already running a relay, you just need:

- The relay URL (e.g. `https://health-sync.example.workers.dev`)
- A UUID sync key (generate your own with the commands above — it acts as a private partition)

Your data is isolated by your key. No one else can read or write to your namespace without it.

---

## Entering the Relay URL in the App

1. Open Coach → **Settings → Cloud Sync**
2. Enter the relay URL and your sync key
3. Tap **Sync Now** — a success toast confirms connectivity

---

## Relay Endpoints (Reference)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/sync/:key/pending` | List dates with pending data |
| GET | `/sync/:key/day/:date` | Download a day's ZIP |
| POST | `/sync/:key/day/:date/done` | Upload analysis results |
| GET | `/sync/:key/results` | List available results |
| POST | `/results/resync` | Re-queue all results from R2 |
