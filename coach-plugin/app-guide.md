# Coach App Guide

Read this file when helping a user navigate the app, explaining features, or troubleshooting. Source code & docs: https://github.com/nEmily/health-tracker

## The App (what the user sees on their phone)

4 tabs at the bottom:

- **Today** — Main logging screen. Quick-action buttons at top: Food, Water, Dailies, More. Tapping Food opens the camera — snap a photo and it auto-saves (no form). Water is a visual picker (6-40 oz, one tap). "More" expands to: workouts, weight, body photos, alcohol, period tracking. Below the buttons: today's score, calorie/protein/water totals, and a timeline of everything logged. Date arrows to browse past days.

- **Coach** — Async chat with you. Messages show as bubbles (user = blue, coach = teal). User sends a question, processing picks it up within ~30 min, your response syncs back. Only active on today's date.

- **Progress** — Swipeable sections: Insights (weekly deficit, logging consistency, goal scorecard, best/worst days, macro split), Plan (active meal plan), Trends (calendar heatmap, weight chart, body photo gallery with before/after compare), Skin (skincare progress photos), Challenges (streak tracking).

- **Settings** — Daily targets (calories, protein, water) with edit button. Cloud sync status and manual sync buttons. Day boundary setting. Dailies manager (supplements/vitamins checklist).

## Entry Types

| Type | How to log | Photo? |
|------|-----------|--------|
| Food | Tap Food button → camera snaps + auto-saves | Yes |
| Workout | More → Workout → strength/cardio/flexibility + duration | Optional |
| Water | Tap Water → pick size (6-40 oz) | No |
| Weight | More → Weight → +/- buttons | No |
| Body Photo | More → Body Photo → camera (custom types: body, arms, abs) | Yes |
| Alcohol | More → Alcohol → beer/wine/cocktail/shots + quantity | No |
| Period | More → Period → toggle on/off | No |
| Supplements | Tap Dailies → checklist | No |

## Key UX Patterns

- Logging is fast — most things are 1-2 taps
- Toasts confirm actions ("Food photo saved", "+16 oz — 56 oz total")
- Everything syncs automatically when saved. Manual "Sync Now" in Settings if needed.
- Works fully offline — entries queue for sync when connection returns.
- Camera photos log to the day they were taken; text entries log to selected date.
- Weight form pre-fills yesterday's weight if today is empty.

## Phone Pairing

New users pair in Settings > Cloud Sync:
1. Computer generates a sync key (UUID) during `/setup`
2. User enters the sync key in the PWA's Settings tab
3. Once paired, data flows automatically: phone uploads → relay → computer processes → results sync back

## Meal Plan Format (Progress > Plan tab)

The Plan tab renders from the `mealPlan` field in the analysis JSON. When pushing a meal plan, use this structure:

```json
{
  "mealPlan": {
    "generatedDate": "YYYY-MM-DD",
    "theme": "Short description shown as subtitle",
    "days": [
      {
        "date": "YYYY-MM-DD",
        "dayType": "optional label (e.g. 'cut day')",
        "day_totals": { "calories": 1200, "protein": 100, "snack_buffer": 150 },
        "meals": [
          {
            "type": "breakfast",
            "suggestion": "Greek yogurt with berries",
            "calories": 300,
            "protein": 25,
            "prep_time": "5 min"
          }
        ]
      }
    ],
    "shoppingList": {
      "proteins": ["chicken breast", "greek yogurt"],
      "produce": ["spinach", "berries"],
      "pantry": ["rice", "olive oil"],
      "already_have": ["salt", "pepper"]
    }
  }
}
```

Key fields: `theme` (subtitle), `days` (array with meals), `shoppingList` (optional). If `days` is empty, the Plan tab shows just the `theme` text. Always include `mealPlan` in the analysis JSON after setup — even tracking-only users should see a message explaining their mode.

## What Happens After Processing

Every 30 minutes, the user's computer:
1. Downloads new data (photos, logs, messages) from the relay
2. Analyzes food photos — estimates calories, protein, macros for each meal
3. Generates/updates a personalized meal plan
4. Scores the day (0-100 based on calorie target, protein, workouts, water)
5. Writes highlights and coaching notes
6. Responds to any inbox messages
7. Uploads results back → phone gets updated analysis, scores, meal plan, and coach responses
