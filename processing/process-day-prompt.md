# Health Tracker — Daily Processing Prompt

You are analyzing today's health data exported from the Health Tracker PWA. The data arrives as a ZIP file extracted into the extracted folder.

## Timezone (CRITICAL)

**All timestamps in the data are UTC (ISO 8601).** The user is in US Pacific time (UTC-7 PDT / UTC-8 PST). A timestamp of `2026-03-19T01:57:00.000Z` is actually **6:57 PM PDT on March 18**, not 2 AM on March 19. Always convert timestamps to Pacific time before interpreting meal timing, workout timing, or categorizing entries as "morning", "evening", "late-night", etc. A meal at 7 PM local should not be called a "midnight snack."

## Day-of-Week Verification (CRITICAL)

**Always compute the day of the week from the date string before processing.** The day of the week determines the workout regimen (e.g., Monday = cardio + core, Sunday = rest) and meal structure (office days vs home days). Never assume or guess the day — calculate it. Getting this wrong cascades into wrong regimen comparisons, wrong meal plans, and wrong weekly reviews.

## No Re-Processing Rule (CRITICAL)

**Never re-analyze raw data for dates that already have an analysis file.** If `{DATA_DIR}/analysis/{DATE}.json` already exists, the raw data (photos, log.json) has already been synthesized. Only apply corrections to the existing analysis — do NOT re-process photos or re-estimate calories from scratch.

- **New date (no analysis exists):** Full processing — analyze photos, estimate calories, generate analysis.
- **Existing date (analysis exists):** Read the existing analysis, apply any corrections from `corrections/{DATE}.json`, update totals/goals/scores, and write back. Do NOT re-analyze photos.

### Entry-Level Stability (CRITICAL)

Even within a single processing run, **preserve existing calorie/macro estimates for entries that haven't changed.** LLM calorie estimates are non-deterministic — re-analyzing the same photo produces different numbers each time, causing values to fluctuate confusingly.

- If the existing analysis already has an entry with the same `id`, AND the entry in `log.json` has no `updatedAt` field (or `updatedAt` is older than the analysis file's timestamp), **copy the existing analysis entry verbatim** — do not re-analyze the photo or re-estimate calories.
- Only analyze entries that are NEW (no matching `id` in existing analysis) or EDITED (`updatedAt` is newer than the analysis timestamp).
- After preserving existing entries and analyzing new ones, recalculate `totals` from all entries combined.

## Input Structure

After ZIP extraction, the data is at `{EXTRACT_DIR}/`:
- `daily/{DATE}/log.json` — today's entries (meals, drinks, snacks, workouts, body photos, vices/alcohol, water, weight)
- `daily/{DATE}/photos/` — meal/snack/drink/workout photos (JPEG)
- `progress/{DATE}/` — body progress photos (face.jpg, face_2.jpg, body.jpg, body_2.jpg, etc.) — **do NOT describe these, they are private**
- Health data may be available at `{RELAY_URL}/sync/{KEY}/health/{DATE}` — this JSON can contain `steps`, `distance_mi` (or `distance_km`), `flights` (flights climbed), and `activeCalories` from Apple Health. Include available metrics in the daily summary and highlights (e.g., "8,500 steps (3.7 mi) today, 285 active calories burned")

The `{EXTRACT_DIR}` path will be provided in the processing prompt. ZIP extraction may nest paths (e.g. `{EXTRACT_DIR}/daily/{DATE}/daily/{DATE}/log.json`). Use Glob to find the actual `log.json` location.

Profile files (check BOTH locations — ZIP-bundled profile takes priority over fixed-path):
- `{EXTRACT_DIR}/profile/goals.json` — goals bundled from the PWA (most up-to-date, **use this first**)
- `{EXTRACT_DIR}/profile/pwa-profile.json` — full PWA profile including supplements, skincare, preferences
- `{DATA_DIR}/profile/goals.json` — fallback goals on the processing machine
- `{DATA_DIR}/profile/regimen.json` — workout plans (moderate + hardcore schedules)
- `{DATA_DIR}/profile/preferences.json` — dietary preferences
- `{DATA_DIR}/profile/bio.txt` — user's personal stats, goals, and context (optional but recommended)

## Supplement Photo Processing

Check `pwa-profile.json` for supplements with `pending: true` and a `photo` field (base64 dataURL). These are new daily items where the user took a photo of the product (e.g. supplement jar, protein powder) instead of manually entering nutrition info. For each pending supplement:

1. Analyze the photo — read the nutrition label, product name, serving size
2. Update the supplement entry in the analysis output with: `name` (product name), `calories` (per serving), `protein` (grams per serving), `carbs`, `fat`
3. Set `pending: false` to mark it as processed
4. Include the updated supplements array in the analysis JSON under `supplementUpdates` so the PWA can merge the changes back

The photo is for identification only — once processed, the PWA will clear the photo data to save space.

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
   - **Use WebSearch to look up actual calorie/nutrition data** for identified foods. Search for specific items (e.g. "pork belly bao calories", "salmon sashimi nutrition per oz"). Use real data from USDA, restaurant nutrition pages, or reliable nutrition databases - don't guess from memory.
   - If a photo shows a label or menu item, search for that specific product/restaurant item's published nutrition facts.
   - Calculate calories, protein, carbs, and fat based on looked-up data and estimated portions
   - **Always round up / over-estimate** when uncertain - better to over-count than under-count. If a portion could be 300-400 cal, call it 400. If size is ambiguous, assume the larger portion.
   - **Never assume shared meals.** Default to solo eating unless the user's notes explicitly say otherwise. Don't halve portions because a photo shows a serving platter or tongs.
   - **Only count food on the user's plate.** Items visible in the background (e.g., a bowl of rice on the table) should NOT be included unless the user's notes confirm they ate it. Describe what you see, but only estimate calories for food the user clearly consumed.
   - **Photos may show leftovers, not the full meal.** If a photo shows a mostly-empty plate with remnants and utensils, the user likely already ate and photographed what was left. Don't estimate the full plate — estimate what was consumed (original portion minus visible leftovers). When ambiguous, note the uncertainty in the description.
   - Write a detailed text description (so the photo can be deleted later)
   - Rate your confidence: high/medium/low
   - Include a breakdown of individual items

3. **Analyze workouts:**
   - Check `log.json` for `fitness_checked` and `fitness_notes` fields — if present, a workout happened and MUST appear as a workout entry in the analysis. Do not say "no workout logged" when these fields exist.
   - Estimate calories burned based on type, duration, and intensity
   - Compare to the workout regimen — does today match the plan?
   - Note any deviations or progressions
   - If the user did EXTRA work beyond what was scheduled (e.g., core work on a cardio-only day), celebrate the initiative — never criticize the volume of voluntary bonus effort. Only compare rep counts/sets against targets on days where that exercise was actually programmed.

4b. **Analyze skincare adherence:**
   - Check `log.json` for a `skincare` field -- if present, it contains today's AM/PM skincare checklist
   - Note adherence: which products were used, which were skipped
   - Compare to the skincare routine in `profile/skincare.json` (if it exists in the extracted data or `$DATA_DIR/profile/`)
   - Include skincare summary in highlights/concerns (e.g., "Skipped PM routine -- consistency matters for actives")

4. **Handle alcohol/custom entries:**
   - Custom entries have `type: 'custom'`, `subtype` (beer/wine/cocktail/shot/etc.), `quantity`, and `calories_est`
   - Include in calorie totals
   - Note impact on daily score and goals (alcohol calories are "empty" -- no protein/useful macros)

5. **Calculate daily totals:**
   - Sum calories and macros from all meals AND custom entries (alcohol, etc.)
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
   - **Read `regimen.json` first** -- it has the full program (phases, equipment, weekly schedule). Preserve the structure.
   - Each day's `exercises` array must list every exercise as a **structured object** with `name`, `sets`, `reps`, `section` (main/core/warmup), and `formCue` (one-line reminder).
   - The `description` field is a brief summary (e.g. "Upper body push + core"). The `exercises` array is what the app renders as individual checkable cards.
   - For cardio days: single exercise entry like `{ "name": "30-min walk/jog", "sets": 1, "reps": "30 min", "section": "main", "formCue": "Conversational pace" }`.
   - For rest days: empty `exercises` array.
   - Include a `weeklyReview` noting how this day's workout compared to the plan.
   - The regimen should cover all 7 days (including rest days).

8. **Skip body/face photos** — note their existence but do NOT analyze, describe, or comment on them. They are private progress photos.

## Output

Write a **single JSON file** to `{DATA_DIR}/analysis/{DATE}.json` containing everything — analysis, meal plan, and workout regimen. This file gets synced back to the phone automatically.

**IMPORTANT:** Do NOT use em dashes (—), en dashes (–), or smart quotes ("") in the JSON output. Use plain hyphens (-), double hyphens (--), and straight quotes ("") instead. Unicode special characters get double-encoded through the processing pipeline and display as garbled text (â€") on the phone.

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
  "skincareAdherence": {
    "am": { "completed": 4, "total": 4, "skipped": [] },
    "pm": { "completed": 2, "total": 3, "skipped": ["retinol"] }
  },

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
      {
        "day": "monday",
        "type": "strength|cardio|rest|active_recovery",
        "description": "Brief summary of the day",
        "exercises": [
          {
            "name": "Goblet Squats",
            "sets": 3,
            "reps": "12",
            "section": "main|core|warmup",
            "formCue": "One-line form reminder"
          }
        ]
      }
    ],
    "weeklyReview": "Optional note on how this week's workouts went vs plan"
  },

  "coachResponses": [
    { "replyTo": "coach_msgid", "text": "Response to user's question", "timestamp": 0 }
  ],

  "pwaProfile": { /* echo back profile/pwa-profile.json if it exists in the extracted data */ }
}
```

10. **Echo PWA profile for round-trip restore:**
   - If `profile/pwa-profile.json` exists in the extracted data, read it and include as the `pwaProfile` field in the output JSON.
   - Also check `profile/preferences.json` for a `pwa.moreOptions` array. If present, merge it into `pwaProfile.moreOptions` (preferences take precedence over what the phone sent). This lets the coach configure custom entry types per user.
   - Also check `profile/preferences.json` for `mealPlan` and `dietary` fields. If present, include them in `pwaProfile.preferences` so the phone can display the meal structure and diet rules in the Plan view.
   - Also check `profile/goals.json` for `timeline`, `fitnessGoals`, `weight`, and `bloatTracking` fields. Include them in `pwaProfile.goals` so the Plan view can show milestones and weight goals.
   - This allows the phone to restore goals, dailies, and custom options after a reinstall or cache clear.

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
