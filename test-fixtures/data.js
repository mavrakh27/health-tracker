// test-fixtures/data.js — Fake dataset for validation testing
// 5 days of varied health data covering all entry types, score ranges, and edge cases
//
// Day layout (relative to test run date):
//   -4 (Mon): Full day — breakfast, lunch, dinner, cardio workout, water met, supplements → high score
//   -3 (Tue): Partial — breakfast, lunch, missed workout day → medium score
//   -2 (Wed): Rest day, good nutrition, water hit → high score (rest day logic)
//   -1 (Thu): Minimal — one drink logged → low score
//    0 (Fri): Vice day — meals + alcohol → tests penalty scoring

function generateTestDates() {
  const today = new Date();
  const dates = [];
  for (let i = 4; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    // Use local date (matches UI.today() in the app) — not UTC via toISOString()
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    dates.push(`${yyyy}-${mm}-${dd}`);
  }
  return dates;
}

function buildFixtures() {
  const [day1, day2, day3, day4, day5] = generateTestDates();
  const ts = (date, h, m) => new Date(`${date}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`).getTime();

  // --- ENTRIES ---
  const entries = [
    // Day 1: Full day (high score) — breakfast & lunch have photos
    { id: `meal_${ts(day1,8,0)}_test1`, date: day1, type: 'meal', subtype: 'breakfast', timestamp: ts(day1,8,0), notes: 'Oatmeal with berries and protein powder', photo: true },
    { id: `meal_${ts(day1,12,30)}_test2`, date: day1, type: 'meal', subtype: 'lunch', timestamp: ts(day1,12,30), notes: 'Grilled chicken salad with quinoa', photo: true },
    { id: `meal_${ts(day1,18,0)}_test3`, date: day1, type: 'meal', subtype: 'dinner', timestamp: ts(day1,18,0), notes: 'Salmon with roasted vegetables' },
    { id: `workout_${ts(day1,7,0)}_test4`, date: day1, type: 'workout', subtype: 'cardio', timestamp: ts(day1,7,0), notes: 'Elliptical 25 min, level 10' },
    { id: `supplement_${ts(day1,8,30)}_test5`, date: day1, type: 'supplement', timestamp: ts(day1,8,30), notes: 'Fiber + Collagen' },
    // Day 1: Body photo (private, locked)
    { id: `bodyPhoto_${ts(day1,9,0)}_test_body`, date: day1, type: 'bodyPhoto', timestamp: ts(day1,9,0), notes: 'Morning progress', photo: true },

    // Day 2: Partial (medium score — missed workout) — breakfast has photo
    { id: `meal_${ts(day2,9,0)}_test6`, date: day2, type: 'meal', subtype: 'breakfast', timestamp: ts(day2,9,0), notes: 'Greek yogurt with granola', photo: true },
    { id: `meal_${ts(day2,13,0)}_test7`, date: day2, type: 'meal', subtype: 'lunch', timestamp: ts(day2,13,0), notes: 'Turkey sandwich' },

    // Day 3: Rest day (high score)
    { id: `meal_${ts(day3,8,0)}_test8`, date: day3, type: 'meal', subtype: 'breakfast', timestamp: ts(day3,8,0), notes: 'Eggs and toast' },
    { id: `meal_${ts(day3,12,0)}_test9`, date: day3, type: 'meal', subtype: 'lunch', timestamp: ts(day3,12,0), notes: 'Chicken bowl' },
    { id: `meal_${ts(day3,18,30)}_test10`, date: day3, type: 'meal', subtype: 'dinner', timestamp: ts(day3,18,30), notes: 'Steak with sweet potato', photo: true },
    { id: `supplement_${ts(day3,8,30)}_test11`, date: day3, type: 'supplement', timestamp: ts(day3,8,30), notes: 'Fiber' },

    // Day 4: Minimal (low score)
    { id: `drink_${ts(day4,14,0)}_test12`, date: day4, type: 'drink', timestamp: ts(day4,14,0), notes: 'La Croix sparkling water' },

    // Day 5: Vice day (penalty scoring) — lunch has photo
    { id: `meal_${ts(day5,12,0)}_test13`, date: day5, type: 'meal', subtype: 'lunch', timestamp: ts(day5,12,0), notes: 'Pizza slice', photo: true },
    { id: `meal_${ts(day5,19,0)}_test14`, date: day5, type: 'meal', subtype: 'dinner', timestamp: ts(day5,19,0), notes: 'Burger and fries', photo: true },
    { id: `custom_${ts(day5,20,0)}_test15`, date: day5, type: 'custom', timestamp: ts(day5,20,0), notes: 'Beer x2', quantity: 2 },
    { id: `custom_${ts(day5,21,0)}_test16`, date: day5, type: 'custom', timestamp: ts(day5,21,0), notes: 'Cocktail', quantity: 1 },
  ];

  // --- DAILY SUMMARIES ---
  const summaries = [
    { date: day1, water_oz: 72, weight: 145.2, sleep: { hours: 7.5, quality: 'good' } },
    { date: day2, water_oz: 32, weight: 145.0 },
    { date: day3, water_oz: 64, weight: 144.8, sleep: { hours: 8, quality: 'great' } },
    { date: day4, water_oz: 8 },
    { date: day5, water_oz: 24, weight: 145.5 },
  ];

  // --- ANALYSIS (mirrors what Claude processing would produce) ---
  const analyses = [
    {
      date: day1,
      entries: [
        { id: `meal_${ts(day1,8,0)}_test1`, type: 'meal', subtype: 'breakfast', description: 'Oatmeal with berries and protein powder', calories: 380, protein: 28, carbs: 52, fat: 8, confidence: 'high' },
        { id: `meal_${ts(day1,12,30)}_test2`, type: 'meal', subtype: 'lunch', description: 'Grilled chicken salad with quinoa', calories: 450, protein: 42, carbs: 35, fat: 14, confidence: 'high' },
        { id: `meal_${ts(day1,18,0)}_test3`, type: 'meal', subtype: 'dinner', description: 'Salmon with roasted vegetables', calories: 520, protein: 38, carbs: 28, fat: 24, confidence: 'medium' },
        { id: `workout_${ts(day1,7,0)}_test4`, type: 'workout', subtype: 'cardio', description: 'Elliptical 25 min, level 10', calories: -180, protein: 0, carbs: 0, fat: 0, confidence: 'high' },
        { id: `supplement_${ts(day1,8,30)}_test5`, type: 'supplement', description: 'Fiber + Collagen', calories: 100, protein: 18 },
      ],
      totals: { calories: 1450, protein: 126, carbs: 115, fat: 46 },
      goals: { water: { target_oz: 64, actual_oz: 72 } },
      streaks: { logging: 5, water_goal: 3, workout: 2, protein_goal: 4 },
    },
    {
      date: day2,
      entries: [
        { id: `meal_${ts(day2,9,0)}_test6`, type: 'meal', subtype: 'breakfast', description: 'Greek yogurt with granola', calories: 320, protein: 22, carbs: 38, fat: 10, confidence: 'medium' },
        { id: `meal_${ts(day2,13,0)}_test7`, type: 'meal', subtype: 'lunch', description: 'Turkey sandwich', calories: 480, protein: 32, carbs: 42, fat: 18, confidence: 'medium' },
      ],
      totals: { calories: 800, protein: 54, carbs: 80, fat: 28 },
      goals: { water: { target_oz: 64, actual_oz: 32 } },
      streaks: { logging: 4, water_goal: 2, workout: 1 },
    },
    {
      date: day3,
      entries: [
        { id: `meal_${ts(day3,8,0)}_test8`, type: 'meal', subtype: 'breakfast', description: 'Eggs and toast', calories: 350, protein: 24, carbs: 30, fat: 16, confidence: 'high' },
        { id: `meal_${ts(day3,12,0)}_test9`, type: 'meal', subtype: 'lunch', description: 'Chicken bowl', calories: 550, protein: 45, carbs: 40, fat: 20, confidence: 'medium' },
        { id: `meal_${ts(day3,18,30)}_test10`, type: 'meal', subtype: 'dinner', description: 'Steak with sweet potato', calories: 620, protein: 48, carbs: 35, fat: 28, confidence: 'medium' },
        { id: `supplement_${ts(day3,8,30)}_test11`, type: 'supplement', description: 'Fiber', calories: 30, protein: 0 },
      ],
      totals: { calories: 1550, protein: 117, carbs: 105, fat: 64 },
      goals: { water: { target_oz: 64, actual_oz: 64 } },
      streaks: { logging: 3, water_goal: 1, protein_goal: 3 },
    },
    {
      date: day4,
      entries: [
        { id: `drink_${ts(day4,14,0)}_test12`, type: 'drink', description: 'La Croix sparkling water', calories: 0, protein: 0, confidence: 'high' },
      ],
      totals: { calories: 0, protein: 0, carbs: 0, fat: 0 },
      goals: { water: { target_oz: 64, actual_oz: 8 } },
    },
    {
      date: day5,
      entries: [
        { id: `meal_${ts(day5,12,0)}_test13`, type: 'meal', subtype: 'lunch', description: 'Pizza slice', calories: 450, protein: 18, carbs: 48, fat: 20, confidence: 'medium' },
        { id: `meal_${ts(day5,19,0)}_test14`, type: 'meal', subtype: 'dinner', description: 'Burger and fries', calories: 950, protein: 35, carbs: 65, fat: 48, confidence: 'medium' },
        { id: `custom_${ts(day5,20,0)}_test15`, type: 'custom', description: 'Beer x2', calories: 300, quantity: 2 },
        { id: `custom_${ts(day5,21,0)}_test16`, type: 'custom', description: 'Cocktail', calories: 200, quantity: 1 },
      ],
      totals: { calories: 1900, protein: 53, carbs: 113, fat: 68 },
      goals: { water: { target_oz: 64, actual_oz: 24 } },
    },
  ];

  // --- PROFILE ---
  const goals = {
    calories: 1200, protein: 105, water_oz: 64,
    hardcore: { calories: 1000, protein: 120, water_oz: 64 },
    activePlan: 'moderate',
    timeline: {
      start: day1,
      moderate_end: (() => { const d = new Date(day1); d.setDate(d.getDate() + 112); return d.toISOString().split('T')[0]; })(),
      milestones: [
        { name: 'First week', target: (() => { const d = new Date(day1); d.setDate(d.getDate() + 7); return d.toISOString().split('T')[0]; })() },
      ],
    },
    fitnessGoals: [
      { name: 'Lose 10 lbs', target: (() => { const d = new Date(day1); d.setDate(d.getDate() + 90); return d.toISOString().split('T')[0]; })() },
      { name: 'Run a 5K', target: (() => { const d = new Date(day1); d.setDate(d.getDate() + 60); return d.toISOString().split('T')[0]; })() },
    ],
  };

  const regimen = {
    weeklySchedule: [
      { day: 'monday', type: 'cardio', exercises: [{ name: 'Elliptical', duration: '25 min' }] },
      { day: 'tuesday', type: 'strength', exercises: [{ name: 'Upper body', sets: 3 }] },
      { day: 'wednesday', type: 'rest' },
      { day: 'thursday', type: 'cardio', exercises: [{ name: 'Running', duration: '30 min' }] },
      { day: 'friday', type: 'strength', exercises: [{ name: 'Lower body', sets: 3 }] },
      { day: 'saturday', type: 'rest' },
      { day: 'sunday', type: 'rest' },
    ],
  };

  // --- MEAL PLAN (days array format expected by plan.js) ---
  const mealPlan = {
    generatedDate: day1,
    days: [
      {
        date: day1, dayType: 'training day',
        meals: [
          { meal: 'breakfast', name: 'Oatmeal with berries', calories: 350, protein: 20 },
          { meal: 'lunch', name: 'Grilled chicken salad', calories: 450, protein: 40 },
          { meal: 'dinner', name: 'Salmon with vegetables', calories: 500, protein: 38 },
          { meal: 'snack', name: 'Protein shake', calories: 150, protein: 25 },
        ],
      },
      {
        date: day2, dayType: 'training day',
        meals: [
          { meal: 'breakfast', name: 'Greek yogurt parfait', calories: 300, protein: 25 },
          { meal: 'lunch', name: 'Turkey wrap', calories: 400, protein: 30 },
          { meal: 'dinner', name: 'Stir-fry with tofu', calories: 420, protein: 28 },
        ],
      },
      {
        date: day3, dayType: 'rest day',
        meals: [
          { meal: 'breakfast', name: 'Eggs and avocado toast', calories: 380, protein: 22 },
          { meal: 'lunch', name: 'Chicken bowl', calories: 500, protein: 40 },
          { meal: 'dinner', name: 'Steak with sweet potato', calories: 550, protein: 45 },
        ],
      },
    ],
  };

  // --- PHOTOS (metadata — blobs generated in-browser via canvas) ---
  // Various types: meal photos (different foods), body progress, face, multiple per entry
  // Each has a 'scene' descriptor for the canvas generator to create distinct visuals
  const photos = [
    // Day 1 breakfast — overhead plate shot (warm tones, bowl shape)
    {
      id: `photo_meal_${ts(day1,8,0)}_test1`,
      entryId: `meal_${ts(day1,8,0)}_test1`,
      date: day1, category: 'meal', syncStatus: 'processed',
      scene: { type: 'plate', bg: '#fdf2e9', plate: '#f5e6d3', food: '#d4a574', accent: '#c0392b', label: 'Oatmeal + Berries', shape: 'bowl' },
    },
    // Day 1 lunch — salad (greens, top-down)
    {
      id: `photo_meal_${ts(day1,12,30)}_test2`,
      entryId: `meal_${ts(day1,12,30)}_test2`,
      date: day1, category: 'meal', syncStatus: 'processed',
      scene: { type: 'plate', bg: '#e8f5e9', plate: '#ffffff', food: '#4caf50', accent: '#ff9800', label: 'Chicken Salad', shape: 'plate' },
    },
    // Day 1 lunch — SECOND photo (close-up, different angle)
    {
      id: `photo_meal_${ts(day1,12,30)}_test2b`,
      entryId: `meal_${ts(day1,12,30)}_test2`,
      date: day1, category: 'meal', syncStatus: 'processed',
      scene: { type: 'closeup', bg: '#2d3436', color: '#00b894', label: 'Close-up', shape: 'macro' },
    },
    // Day 1 body photo — front view (person silhouette, neutral)
    {
      id: `photo_body_${ts(day1,9,0)}_front`,
      entryId: `bodyPhoto_${ts(day1,9,0)}_test_body`,
      date: day1, category: 'body', syncStatus: 'processed',
      scene: { type: 'body', bg: '#2c3e50', silhouette: '#7f8c8d', label: 'Front', pose: 'front' },
    },
    // Day 1 body photo — side view (second photo same entry)
    {
      id: `photo_body_${ts(day1,9,0)}_side`,
      entryId: `bodyPhoto_${ts(day1,9,0)}_test_body`,
      date: day1, category: 'body', syncStatus: 'processed',
      scene: { type: 'body', bg: '#2c3e50', silhouette: '#7f8c8d', label: 'Side', pose: 'side' },
    },
    // Day 2 breakfast — yogurt (light, pastel)
    {
      id: `photo_meal_${ts(day2,9,0)}_test6`,
      entryId: `meal_${ts(day2,9,0)}_test6`,
      date: day2, category: 'meal', syncStatus: 'synced',
      scene: { type: 'plate', bg: '#fce4ec', plate: '#ffffff', food: '#e91e63', accent: '#f8bbd0', label: 'Yogurt Granola', shape: 'bowl' },
    },
    // Day 3 dinner — steak (dark/moody, warm lighting)
    {
      id: `photo_meal_${ts(day3,18,30)}_test10`,
      entryId: `meal_${ts(day3,18,30)}_test10`,
      date: day3, category: 'meal', syncStatus: 'processed',
      scene: { type: 'plate', bg: '#1a1a2e', plate: '#2d2d44', food: '#8b4513', accent: '#ff6347', label: 'Steak Dinner', shape: 'plate' },
    },
    // Day 5 lunch — pizza (bright, casual)
    {
      id: `photo_meal_${ts(day5,12,0)}_test13`,
      entryId: `meal_${ts(day5,12,0)}_test13`,
      date: day5, category: 'meal', syncStatus: 'unsynced',
      scene: { type: 'plate', bg: '#fff3e0', plate: '#efebe9', food: '#ff5722', accent: '#ffc107', label: 'Pizza', shape: 'triangle' },
    },
    // Day 5 dinner — burger (warm, indulgent)
    {
      id: `photo_meal_${ts(day5,19,0)}_test14`,
      entryId: `meal_${ts(day5,19,0)}_test14`,
      date: day5, category: 'meal', syncStatus: 'unsynced',
      scene: { type: 'closeup', bg: '#3e2723', color: '#ff8f00', label: 'Burger & Fries', shape: 'stack' },
    },
  ];

  return { entries, summaries, analyses, goals, regimen, mealPlan, photos, dates: [day1, day2, day3, day4, day5] };
}

module.exports = { buildFixtures, generateTestDates };
