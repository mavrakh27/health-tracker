# Coach — AI Health Tracker

A personal health tracking PWA with AI-powered food analysis, workout planning, and daily coaching. Runs entirely on your own devices — no accounts, no cloud subscription, no third-party analytics.

---

## Features

- **Food logging** — log meals by photo or manually; AI estimates calories and macros from photos
- **Calorie & macro tracking** — daily totals, targets, and trend charts
- **Workout logging** — log sets and reps; track against your regimen
- **Meal plans** — AI-generated daily suggestions based on your goals and history
- **Workout recommendations** — personalized based on recent activity and targets
- **Daily scoring** — dual moderate/hardcore scoring so you can see how you track against either plan
- **Water & weight tracking** — quick-log from the home screen
- **Cloud sync** — phone uploads data to a relay; your computer processes and syncs results back
- **Offline-capable** — full PWA, works without a connection

---

## Tech Stack

- **Frontend:** Vanilla HTML/CSS/JS — no framework, no build step
- **Storage:** IndexedDB (on-device)
- **Sync:** Cloudflare Worker + R2 (self-hosted relay)
- **AI processing:** Claude Code CLI (runs on your own computer)
- **Hosting:** GitHub Pages

---

## Quick Start

1. **Install the app** — visit the GitHub Pages URL in Safari or Chrome, then Add to Home Screen
2. **Set your goals** — the onboarding wizard walks you through it
3. *(Optional)* **Set up cloud sync + AI processing** for photo analysis and coaching

Full guide: [docs/getting-started.md](docs/getting-started.md)

---

## Self-Hosting

- **Relay (Cloudflare Worker):** [docs/relay-setup.md](docs/relay-setup.md)
- **Processing (Windows / Mac / Linux):** [docs/processing-setup.md](docs/processing-setup.md)

---

## Privacy

- All health data stays on your device and your own infrastructure
- Food photos are analyzed by your own Claude Code subscription — not sent to any third-party service
- The cloud relay (if you deploy it) is your own Cloudflare Worker
- No analytics, no tracking, no accounts

---

## Contributing

See [.claude/skills/contribute/SKILL.md](.claude/skills/contribute/SKILL.md) for development setup and contribution guidelines.

---

## License

MIT
