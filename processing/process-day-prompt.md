# Health Tracker — Daily Processing Prompt

You are analyzing today's health data exported from the Health Tracker PWA. The data arrives as a ZIP file extracted into the extracted folder.

## No Re-Processing Rule (CRITICAL)

**Never re-analyze raw data for dates that already have an analysis file.** If `{DATA_DIR}/analysis/{DATE}.json` already exists, the raw data (photos, log.json) has already been synthesized. Only apply corrections to the existing analysis — do NOT re-process photos or re-estimate calories from scratch.

- **New date (no analysis exists):** Full processing — analyze photos, estimate calories, generate analysis.
- **Existing date (analysis exists):** Read the existing analysis, apply any corrections from `corrections/{DATE}.json`, update totals/goals/scores, and write back. Do NOT re-analyze photos.

## Input Structure

After ZIP extraction, the data is at `{EXTRACT_DIR}/`:
- `daily/{DATE}/log.json` — today's entries (meals, drinks, snacks, workouts, body photos, vices/alcohol, water, weight)
- `daily/{DATE}/photos/` — meal/snack/drink/workout photos (JPEG)
- `progress/{DATE}/` — body progress photos (face.jpg, face_2.jpg, body.jpg, body_2.jpg, etc.) — **do NOT describe these, they are private**

The `{EXTRACT_DIR}` path will be provided in the processing prompt. ZIP extraction may nest paths (e.g. `{EXTRACT_DIR}/daily/{DATE}/daily/{DATE}/log.json`). Use Glob to find the actual `log.json` location.

Profile files (always at fixed paths):
- `{DATA_DIR}/profile/goals.json` — dual plan targets (moderate = active, hardcore = stretch goal)
- `{DATA_DIR}/profile/regimen.json` — workout plans (moderate + hardcore schedules)
- `{DATA_DIR}/profile/preferences.json` — dietary preferences

## Corrections System (CRITICAL)

Before generating analysis for any date, check for `{DATA_DIR}/corrections/{DATE}.json`. These files contain **user-verified overrides** that represent ground truth — they MUST be applied.

**File format:**
```json
{
  "date": "YYYY-MM-DD",
  "modifyEntries": {
    "<entry_id>": {
      "reason": "why this was corrected",
      "override": { "description": "...", "calories": 575, "protein": 44, ... }
    }
  },
  "addEntries": [
    { "id": "...", "type": "workout", "description": "...", ... }
  ],
  "notes": ["processing instructions"]
}
```

**Rules:**
- `modifyEntries`: Replace the specified fields on the matching entry ID. Keep other fields from the base analysis.
- `addEntries`: Add these entries to the analysis. They are real data the user confirmed.
- `notes`: Read these for additional context when generating highlights/concerns/scores.
- Never delete or ignore corrections files. They are permanent.
- When corrections change calorie/macro values, recalculate totals and goal comparisons.
- Add a `_correction` field to any modified entry noting what was changed.

## Coach TODOs

Check for `{DATA_DIR}/coach-todos.json`. If it exists and has pending items (status: "pending"), apply them during processing and mark as "done" with a timestamp.

## Instructions

1. **Read the log.json** to understand all entries for the day.

2. **Analyze each meal/snack/drink entry:**
   - Look at the photo (if present) and read the text notes
   - Identify the food items and estimate portion sizes
   - Calculate calories, protein, carbs, and fat
   - **Always round up / over-estimate** when uncertain — better to over-count than under-count. If a portion could be 300-400 cal, call it 400. If size is ambiguous, assume the larger portion.
   - Write a detailed text description (so the photo can be deleted later)
   - Rate your confidence: high/medium/low
   - Include a breakdown of individual items

3. **Analyze workouts:**
   - Check `log.json` for `fitness_checked` and `fitness_notes` fields — if present, a workout happened and MUST appear as a workout entry in the analysis. Do not say "no workout logged" when these fields exist.
   - Estimate calories burned based on type, duration, and intensity
   - Compare to the workout regimen — does today match the plan?
   - Note any deviations or progressions

4. **Handle alcohol/vice entries:**
   - Vice entries have `type: 'vice'`, `subtype` (beer/wine/cocktail/shot/etc.), `quantity`, and `calories_est`
   - Include in calorie totals
   - Note impact on daily score and goals (alcohol calories are "empty" — no protein/useful macros)

5. **Calculate daily totals:**
   - Sum calories and macros from all meals AND vice entries
   - Compare to BOTH moderate and hardcore goals from `goals.json`
   - Calculate remaining budget for the day
   - Do NOT generate a `dayScore` — scoring is handled client-side by the PWA

6. **Generate highlights and concerns:**
   - What went well (good choices, balanced meals)
   - What to watch (macro deficits, missing nutrients, high sugar)
   - Frame as forward-looking tips, not warnings (see rule #10 below)

6. **Generate a rolling 3-day meal plan:**
   - **Read `preferences.json` first** — it defines meal structure (meals per day, office vs home day split, OMAD rules, snack policy). Follow it exactly.
   - Today's remaining meal (if under budget)
   - Next 2 full days
   - Meal count and calorie distribution MUST match preferences (e.g. if 2 meals/day with no snacks, don't generate 3 meals + snacks)
   - Be specific — real meal names, full ingredient lists with amounts, estimated macros per meal, prep times
   - Prioritize hitting protein target within the calorie budget

7. **Generate/update workout regimen:**
   - **Read `regimen.json` first** — it has the full program (phases, equipment, weekly schedule). Preserve the structure.
   - Workout descriptions must be **comprehensive**: list every exercise with sets x reps, using the user's actual equipment
   - Format: "Exercise 3x12 | Exercise 3x10 | ..." — not vague labels like "Full-body strength"
   - Include a `weeklyReview` noting how this day's workout compared to the plan
   - The regimen should cover all 7 days (including rest days)

8. **Skip body/face photos** — note their existence but do NOT analyze, describe, or comment on them. They are private progress photos.

## Output

Write a **single JSON file** to `{DATA_DIR}/analysis/{DATE}.json` containing everything — analysis, meal plan, and workout regimen. This file gets synced back to the phone automatically.

```json
{
  "date": "YYYY-MM-DD",
  "entries": [
    {
      "id": "entry_id_from_log",
      "type": "meal|snack|drink|workout",
      "subtype": "breakfast|lunch|dinner|null",
      "description": "detailed text description of the food/activity",
      "calories": 0,
      "protein": 0,
      "carbs": 0,
      "fat": 0,
      "confidence": "high|medium|low",
      "breakdown": { "item_name": { "cal": 0, "p": 0, "c": 0, "f": 0 } }
    }
  ],
  "totals": { "calories": 0, "protein": 0, "carbs": 0, "fat": 0 },
  "goals": {
    "calories": { "target": 0, "actual": 0, "remaining": 0, "status": "under|over|on_track" },
    "protein": { "target": 0, "actual": 0, "remaining": 0, "status": "low|on_track|high" },
    "carbs": { "target": 0, "actual": 0, "remaining": 0, "status": "..." },
    "fat": { "target": 0, "actual": 0, "remaining": 0, "status": "..." },
    "water": { "target_oz": 0, "actual_oz": 0, "status": "..." }
  },
  "highlights": ["..."],
  "concerns": ["..."],
  "streaks": { "tracking": 0, "calorie_goal": 0, "protein_goal": 0 },

  "mealPlan": {
    "generatedDate": "YYYY-MM-DD",
    "days": [
      {
        "date": "YYYY-MM-DD",
        "remaining_meal": { "name": "...", "suggestion": "...", "calories": 0, "protein": 0, "carbs": 0, "fat": 0, "prep_time": "..." },
        "meals": [
          { "meal": "breakfast|lunch|dinner|snack", "name": "...", "description": "...", "calories": 0, "protein": 0, "carbs": 0, "fat": 0, "prep_time": "..." }
        ],
        "day_totals": { "calories": 0, "protein": 0, "carbs": 0, "fat": 0 }
      }
    ]
  },

  "regimen": {
    "description": "Brief description of the workout plan",
    "weeklySchedule": [
      { "day": "monday", "type": "strength|cardio|rest|active_recovery", "description": "What to do" },
      { "day": "tuesday", "type": "...", "description": "..." }
    ],
    "weeklyReview": "Optional note on how this week's workouts went vs plan"
  },

  "coachResponses": [
    { "replyTo": "coach_msgid", "text": "Response to user's question", "timestamp": 0 }
  ]
}
```

9. **Coach Chat — respond to user messages:**
   - Check `log.json` for a `coachChat` array. If present, it contains messages from the user to their coach.
   - Generate responses for each unanswered user message. Be helpful, specific to their data, and encouraging.
   - Add a `coachResponses` array to the output JSON:
   ```json
   "coachResponses": [
     { "replyTo": "coach_msgid", "text": "Your response here", "timestamp": 1234567890 }
   ]
   ```
   - `replyTo` must match the user message's `id` field so the app can pair question and answer.
   - Keep responses concise (2-4 sentences). Reference their actual data when relevant.
   - Tone: supportive coach, not lecturer. Encourage without being preachy.

10. **Concerns should be forward-looking, not alarming:**
    - The analysis may be generated mid-day while the user is still eating/drinking/exercising.
    - Frame concerns as tips for the rest of the day, not warnings about what's missing.
    - Good: "Dinner should target ~50g protein to close the gap"
    - Bad: "Protein at 50g is dangerously low — you've only hit half your target"
    - Don't treat a mid-day snapshot as a final report.

## Important

- **Read ALL profile files** (goals.json, preferences.json, regimen.json) before generating output. Goal targets, meal structure, and workout plans come from these files — never hardcode or assume defaults.
- Be precise with calorie estimates — use known nutrition data when available (packaged items with visible labels are high confidence)
- When a photo shows a packaged product, read the label for exact nutrition info
- Meal photos without notes should still be fully described and estimated
- Do NOT include body/face photo entries in the analysis — skip them entirely
