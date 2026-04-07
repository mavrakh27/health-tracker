// workout.js — Strong-style workout tracker with weight/reps per set, rest timer,
// exercise history, PR detection, templates, and AI coach integration.

const Workout = {
  // Active workout state (null when no workout in progress)
  active: null,
  restTimer: null,
  _restInterval: null,
  _durationInterval: null,
  _restAudio: null,

  // ============================================================
  // EXERCISE DATABASE (extends Fitness.exercises with category/equipment metadata)
  // ============================================================
  exerciseDB: {
    // Compound lifts
    'Barbell Squat': { category: 'Legs', equipment: 'Barbell', muscles: 'Quads, Glutes, Core' },
    'Barbell Bench Press': { category: 'Chest', equipment: 'Barbell', muscles: 'Chest, Shoulders, Triceps' },
    'Barbell Deadlift': { category: 'Back', equipment: 'Barbell', muscles: 'Hamstrings, Glutes, Back, Core' },
    'Barbell Overhead Press': { category: 'Shoulders', equipment: 'Barbell', muscles: 'Shoulders, Triceps, Core' },
    'Barbell Row': { category: 'Back', equipment: 'Barbell', muscles: 'Back, Biceps, Rear Delts' },
    'Front Squat': { category: 'Legs', equipment: 'Barbell', muscles: 'Quads, Core, Upper Back' },
    'Barbell Hip Thrust': { category: 'Legs', equipment: 'Barbell', muscles: 'Glutes, Hamstrings' },
    'Sumo Deadlift': { category: 'Legs', equipment: 'Barbell', muscles: 'Glutes, Inner Thighs, Back' },
    'Romanian Deadlift': { category: 'Legs', equipment: 'Barbell', muscles: 'Hamstrings, Glutes, Lower Back' },
    'Incline Bench Press': { category: 'Chest', equipment: 'Barbell', muscles: 'Upper Chest, Shoulders, Triceps' },

    // Dumbbell
    'Dumbbell Bench Press': { category: 'Chest', equipment: 'Dumbbell', muscles: 'Chest, Shoulders, Triceps' },
    'Dumbbell Row': { category: 'Back', equipment: 'Dumbbell', muscles: 'Back, Biceps, Rear Delts' },
    'Dumbbell Overhead Press': { category: 'Shoulders', equipment: 'Dumbbell', muscles: 'Shoulders, Triceps' },
    'Dumbbell Curl': { category: 'Arms', equipment: 'Dumbbell', muscles: 'Biceps' },
    'Dumbbell Lateral Raise': { category: 'Shoulders', equipment: 'Dumbbell', muscles: 'Side Delts' },
    'Dumbbell Fly': { category: 'Chest', equipment: 'Dumbbell', muscles: 'Chest' },
    'Dumbbell Lunges': { category: 'Legs', equipment: 'Dumbbell', muscles: 'Quads, Glutes, Hamstrings' },
    'Dumbbell Romanian Deadlift': { category: 'Legs', equipment: 'Dumbbell', muscles: 'Hamstrings, Glutes' },
    'Dumbbell Tricep Extension': { category: 'Arms', equipment: 'Dumbbell', muscles: 'Triceps' },
    'Hammer Curl': { category: 'Arms', equipment: 'Dumbbell', muscles: 'Biceps, Forearms' },
    'Goblet Squat': { category: 'Legs', equipment: 'Dumbbell', muscles: 'Quads, Glutes, Core' },
    'Dumbbell Shrug': { category: 'Back', equipment: 'Dumbbell', muscles: 'Traps' },
    'Incline Dumbbell Press': { category: 'Chest', equipment: 'Dumbbell', muscles: 'Upper Chest, Shoulders' },
    'Incline Dumbbell Curl': { category: 'Arms', equipment: 'Dumbbell', muscles: 'Biceps' },
    'Concentration Curl': { category: 'Arms', equipment: 'Dumbbell', muscles: 'Biceps' },

    // Cable/Machine
    'Lat Pulldown': { category: 'Back', equipment: 'Cable', muscles: 'Lats, Biceps' },
    'Cable Row': { category: 'Back', equipment: 'Cable', muscles: 'Back, Biceps' },
    'Tricep Pushdown': { category: 'Arms', equipment: 'Cable', muscles: 'Triceps' },
    'Cable Fly': { category: 'Chest', equipment: 'Cable', muscles: 'Chest' },
    'Face Pull': { category: 'Shoulders', equipment: 'Cable', muscles: 'Rear Delts, Upper Back' },
    'Cable Lateral Raise': { category: 'Shoulders', equipment: 'Cable', muscles: 'Side Delts' },
    'Leg Press': { category: 'Legs', equipment: 'Machine', muscles: 'Quads, Glutes' },
    'Leg Extension': { category: 'Legs', equipment: 'Machine', muscles: 'Quads' },
    'Leg Curl': { category: 'Legs', equipment: 'Machine', muscles: 'Hamstrings' },
    'Chest Press Machine': { category: 'Chest', equipment: 'Machine', muscles: 'Chest, Triceps' },
    'Shoulder Press Machine': { category: 'Shoulders', equipment: 'Machine', muscles: 'Shoulders, Triceps' },
    'Smith Machine Squat': { category: 'Legs', equipment: 'Machine', muscles: 'Quads, Glutes' },
    'Hack Squat': { category: 'Legs', equipment: 'Machine', muscles: 'Quads, Glutes' },
    'Calf Raise Machine': { category: 'Legs', equipment: 'Machine', muscles: 'Calves' },
    'Pec Deck': { category: 'Chest', equipment: 'Machine', muscles: 'Chest' },

    // Bodyweight
    'Pull-up': { category: 'Back', equipment: 'Bodyweight', muscles: 'Lats, Biceps, Core' },
    'Chin-up': { category: 'Back', equipment: 'Bodyweight', muscles: 'Lats, Biceps' },
    'Push-up': { category: 'Chest', equipment: 'Bodyweight', muscles: 'Chest, Shoulders, Triceps' },
    'Dip': { category: 'Chest', equipment: 'Bodyweight', muscles: 'Chest, Triceps, Shoulders' },
    'Plank': { category: 'Core', equipment: 'Bodyweight', muscles: 'Core' },
    'Dead Bug': { category: 'Core', equipment: 'Bodyweight', muscles: 'Core, Hip Flexors' },
    'Bicycle Crunch': { category: 'Core', equipment: 'Bodyweight', muscles: 'Obliques, Abs' },
    'Leg Raise': { category: 'Core', equipment: 'Bodyweight', muscles: 'Lower Abs, Hip Flexors' },
    'Mountain Climber': { category: 'Core', equipment: 'Bodyweight', muscles: 'Core, Shoulders' },
    'Bodyweight Squat': { category: 'Legs', equipment: 'Bodyweight', muscles: 'Quads, Glutes' },
    'Lunge': { category: 'Legs', equipment: 'Bodyweight', muscles: 'Quads, Glutes, Hamstrings' },
    'Glute Bridge': { category: 'Legs', equipment: 'Bodyweight', muscles: 'Glutes, Hamstrings' },
    'Burpee': { category: 'Full Body', equipment: 'Bodyweight', muscles: 'Full Body' },
    'Hanging Leg Raise': { category: 'Core', equipment: 'Bodyweight', muscles: 'Lower Abs, Hip Flexors' },
    'Russian Twist': { category: 'Core', equipment: 'Bodyweight', muscles: 'Obliques' },
    'V-Up': { category: 'Core', equipment: 'Bodyweight', muscles: 'Abs' },
    'Superman': { category: 'Back', equipment: 'Bodyweight', muscles: 'Lower Back, Glutes' },
    'Calf Raise': { category: 'Legs', equipment: 'Bodyweight', muscles: 'Calves' },

    // Kettlebell
    'Kettlebell Swing': { category: 'Full Body', equipment: 'Kettlebell', muscles: 'Glutes, Hamstrings, Core' },
    'Kettlebell Goblet Squat': { category: 'Legs', equipment: 'Kettlebell', muscles: 'Quads, Glutes, Core' },
    'Kettlebell Turkish Get-Up': { category: 'Full Body', equipment: 'Kettlebell', muscles: 'Full Body' },

    // EZ Bar / Other
    'EZ Bar Curl': { category: 'Arms', equipment: 'EZ Bar', muscles: 'Biceps' },
    'Skull Crusher': { category: 'Arms', equipment: 'EZ Bar', muscles: 'Triceps' },
    'Preacher Curl': { category: 'Arms', equipment: 'EZ Bar', muscles: 'Biceps' },
  },

  // Get all unique categories
  getCategories() {
    const cats = new Set();
    for (const ex of Object.values(Workout.exerciseDB)) cats.add(ex.category);
    return [...cats].sort();
  },

  // Search exercises
  searchExercises(query) {
    if (!query) return Object.keys(Workout.exerciseDB);
    const q = query.toLowerCase();
    return Object.entries(Workout.exerciseDB)
      .filter(([name, info]) =>
        name.toLowerCase().includes(q) ||
        info.category.toLowerCase().includes(q) ||
        info.muscles.toLowerCase().includes(q) ||
        info.equipment.toLowerCase().includes(q)
      )
      .map(([name]) => name);
  },

  // ============================================================
  // WORKOUT TEMPLATES
  // ============================================================

  async getTemplates() {
    return (await DB.getProfile('workoutTemplates')) || [];
  },

  async saveTemplate(template) {
    const templates = await Workout.getTemplates();
    const idx = templates.findIndex(t => t.id === template.id);
    if (idx >= 0) templates[idx] = template;
    else templates.push(template);
    await DB.setProfile('workoutTemplates', templates);
  },

  async deleteTemplate(id) {
    const templates = await Workout.getTemplates();
    await DB.setProfile('workoutTemplates', templates.filter(t => t.id !== id));
  },

  createTemplateFromWorkout(workout, name) {
    return {
      id: UI.generateId('tmpl'),
      name: name || 'My Workout',
      created: new Date().toISOString(),
      exercises: workout.exercises.map(ex => ({
        name: ex.name,
        sets: ex.sets.length,
        reps: ex.sets[0]?.reps || 0,
        weight: ex.sets[0]?.weight || 0,
      })),
    };
  },

  // ============================================================
  // WORKOUT HISTORY
  // ============================================================

  async getHistory(limit = 50) {
    const entries = await DB.getEntriesByType('workout');
    // Filter to only strength workouts with workout_data
    return entries
      .filter(e => e.workout_data && e.workout_data.exercises)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  },

  // Get last performance for a specific exercise
  async getExerciseHistory(exerciseName, limit = 10) {
    const history = await Workout.getHistory(200);
    const results = [];
    for (const entry of history) {
      const match = entry.workout_data.exercises.find(
        ex => ex.name.toLowerCase() === exerciseName.toLowerCase()
      );
      if (match) {
        results.push({
          date: entry.date,
          sets: match.sets,
          volume: match.sets.reduce((sum, s) => sum + ((s.weight || 0) * (s.reps || 0)), 0),
        });
        if (results.length >= limit) break;
      }
    }
    return results;
  },

  // Get the last set data for an exercise (for "Previous" column)
  async getLastPerformance(exerciseName) {
    const history = await Workout.getExerciseHistory(exerciseName, 1);
    return history.length > 0 ? history[0] : null;
  },

  // ============================================================
  // PERSONAL RECORDS
  // ============================================================

  async getPRs() {
    return (await DB.getProfile('workoutPRs')) || {};
  },

  async checkAndUpdatePRs(workout) {
    const prs = await Workout.getPRs();
    const newPRs = [];

    for (const ex of workout.exercises) {
      const key = ex.name.toLowerCase();
      if (!prs[key]) prs[key] = {};

      for (const set of ex.sets) {
        if (!set.done || !set.weight || !set.reps) continue;

        // Check 1RM estimate (Epley formula)
        const estimated1RM = set.reps === 1 ? set.weight : set.weight * (1 + set.reps / 30);
        if (!prs[key].estimated1RM || estimated1RM > prs[key].estimated1RM) {
          prs[key].estimated1RM = Math.round(estimated1RM * 10) / 10;
          prs[key].estimated1RM_date = workout.date;
          newPRs.push({ exercise: ex.name, type: 'Estimated 1RM', value: `${Math.round(estimated1RM)} lbs` });
        }

        // Check max weight
        if (!prs[key].maxWeight || set.weight > prs[key].maxWeight) {
          prs[key].maxWeight = set.weight;
          prs[key].maxWeight_reps = set.reps;
          prs[key].maxWeight_date = workout.date;
          newPRs.push({ exercise: ex.name, type: 'Max Weight', value: `${set.weight} lbs x ${set.reps}` });
        }

        // Check max volume in a single set
        const setVol = set.weight * set.reps;
        if (!prs[key].maxSetVolume || setVol > prs[key].maxSetVolume) {
          prs[key].maxSetVolume = setVol;
          prs[key].maxSetVolume_date = workout.date;
        }
      }

      // Check total exercise volume
      const totalVol = ex.sets.reduce((sum, s) => sum + ((s.weight || 0) * (s.reps || 0)), 0);
      if (totalVol > 0 && (!prs[key].maxTotalVolume || totalVol > prs[key].maxTotalVolume)) {
        prs[key].maxTotalVolume = totalVol;
        prs[key].maxTotalVolume_date = workout.date;
        newPRs.push({ exercise: ex.name, type: 'Volume PR', value: `${totalVol.toLocaleString()} lbs` });
      }
    }

    await DB.setProfile('workoutPRs', prs);
    return newPRs;
  },

  // ============================================================
  // ACTIVE WORKOUT
  // ============================================================

  async startWorkout(template) {
    // Build exercise list with previous performance
    const exercises = [];
    const exList = template ? template.exercises : [];

    for (const ex of exList) {
      const last = await Workout.getLastPerformance(ex.name);
      const numSets = ex.sets || 3;
      const sets = [];
      for (let i = 0; i < numSets; i++) {
        const prevSet = last?.sets?.[i];
        sets.push({
          weight: prevSet?.weight || ex.weight || null,
          reps: prevSet?.reps || ex.reps || null,
          done: false,
          previous: prevSet ? `${prevSet.weight || 0} x ${prevSet.reps || 0}` : null,
        });
      }
      exercises.push({
        name: ex.name,
        info: Workout.exerciseDB[ex.name] || null,
        sets,
      });
    }

    Workout.active = {
      id: UI.generateId('wkt'),
      startTime: Date.now(),
      date: UI.today(),
      exercises,
      templateId: template?.id || null,
      templateName: template?.name || 'Empty Workout',
    };

    // Save to recover from app close
    await Workout._saveActiveState();
    Workout._startDurationTimer();
    Workout.renderActiveWorkout();
  },

  async resumeWorkout() {
    const saved = await DB.getProfile('activeWorkout');
    if (saved) {
      Workout.active = saved;
      Workout._startDurationTimer();
      Workout.renderActiveWorkout();
      return true;
    }
    return false;
  },

  async _saveActiveState() {
    if (Workout.active) {
      await DB.setProfile('activeWorkout', Workout.active);
    } else {
      await DB.setProfile('activeWorkout', null);
    }
  },

  // ============================================================
  // REST TIMER
  // ============================================================

  startRestTimer(seconds) {
    Workout.stopRestTimer();
    Workout.restTimer = { total: seconds, remaining: seconds, startedAt: Date.now() };

    const timerEl = document.getElementById('wkt-rest-timer');
    if (timerEl) timerEl.style.display = 'flex';

    Workout._restInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - Workout.restTimer.startedAt) / 1000);
      Workout.restTimer.remaining = Math.max(0, Workout.restTimer.total - elapsed);

      const timerDisplay = document.getElementById('wkt-rest-display');
      if (timerDisplay) {
        const m = Math.floor(Workout.restTimer.remaining / 60);
        const s = Workout.restTimer.remaining % 60;
        timerDisplay.textContent = `${m}:${String(s).padStart(2, '0')}`;
      }

      // Progress bar
      const prog = document.getElementById('wkt-rest-progress');
      if (prog) {
        prog.style.width = `${(Workout.restTimer.remaining / Workout.restTimer.total) * 100}%`;
      }

      if (Workout.restTimer.remaining <= 0) {
        Workout.stopRestTimer();
        // Vibrate if available
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        UI.toast('Rest done', 'success', 1500);
      }
    }, 250);
  },

  stopRestTimer() {
    if (Workout._restInterval) {
      clearInterval(Workout._restInterval);
      Workout._restInterval = null;
    }
    Workout.restTimer = null;
    const timerEl = document.getElementById('wkt-rest-timer');
    if (timerEl) timerEl.style.display = 'none';
  },

  _startDurationTimer() {
    if (Workout._durationInterval) clearInterval(Workout._durationInterval);
    Workout._durationInterval = setInterval(() => {
      if (!Workout.active) return;
      const elapsed = Math.floor((Date.now() - Workout.active.startTime) / 1000);
      const el = document.getElementById('wkt-duration');
      if (el) {
        const h = Math.floor(elapsed / 3600);
        const m = Math.floor((elapsed % 3600) / 60);
        const s = elapsed % 60;
        el.textContent = h > 0
          ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
          : `${m}:${String(s).padStart(2, '0')}`;
      }
    }, 1000);
  },

  // ============================================================
  // FINISH WORKOUT
  // ============================================================

  async finishWorkout() {
    if (!Workout.active) return;

    const workout = Workout.active;
    const endTime = Date.now();
    const durationMin = Math.round((endTime - workout.startTime) / 60000);

    // Calculate stats
    let totalVolume = 0;
    let totalSets = 0;
    let exercisesDone = 0;
    const exerciseSummaries = [];

    for (const ex of workout.exercises) {
      const doneSets = ex.sets.filter(s => s.done);
      if (doneSets.length === 0) continue;
      exercisesDone++;
      totalSets += doneSets.length;

      let exVolume = 0;
      const setSummaries = [];
      for (const s of doneSets) {
        const vol = (s.weight || 0) * (s.reps || 0);
        exVolume += vol;
        setSummaries.push({ weight: s.weight, reps: s.reps });
      }
      totalVolume += exVolume;
      exerciseSummaries.push({
        name: ex.name,
        sets: setSummaries,
        volume: exVolume,
      });
    }

    // Check PRs
    const newPRs = await Workout.checkAndUpdatePRs(workout);

    // Build entry for DB
    const entry = {
      id: workout.id,
      type: 'workout',
      subtype: 'strength',
      date: workout.date,
      timestamp: new Date(workout.startTime).toISOString(),
      notes: '',
      duration_minutes: durationMin,
      workout_data: {
        exercises: workout.exercises.map(ex => ({
          name: ex.name,
          sets: ex.sets.filter(s => s.done).map(s => ({
            weight: s.weight,
            reps: s.reps,
            done: true,
          })),
        })).filter(ex => ex.sets.length > 0),
        totalVolume,
        totalSets,
        templateName: workout.templateName,
        templateId: workout.templateId,
      },
    };

    await DB.addEntry(entry, null);
    CloudRelay.queueUpload(workout.date);

    // Save as template option
    const summary = {
      duration: durationMin,
      exercises: exercisesDone,
      sets: totalSets,
      volume: totalVolume,
      prs: newPRs,
      entry,
    };

    // Clean up
    if (Workout._durationInterval) clearInterval(Workout._durationInterval);
    Workout.stopRestTimer();
    Workout.active = null;
    await Workout._saveActiveState();

    // Show summary
    Workout.renderSummary(summary);
    return summary;
  },

  async discardWorkout() {
    if (Workout._durationInterval) clearInterval(Workout._durationInterval);
    Workout.stopRestTimer();
    Workout.active = null;
    await Workout._saveActiveState();
    Workout.renderHome();
  },

  // ============================================================
  // ADD/REMOVE EXERCISES AND SETS
  // ============================================================

  async addExercise(exerciseName) {
    if (!Workout.active) return;
    const last = await Workout.getLastPerformance(exerciseName);
    const numSets = 3;
    const sets = [];
    for (let i = 0; i < numSets; i++) {
      const prevSet = last?.sets?.[i];
      sets.push({
        weight: prevSet?.weight || null,
        reps: prevSet?.reps || null,
        done: false,
        warmup: false,
        previous: prevSet ? `${prevSet.weight || 0} x ${prevSet.reps || 0}` : null,
      });
    }
    Workout.active.exercises.push({
      name: exerciseName,
      info: Workout.exerciseDB[exerciseName] || null,
      sets,
    });
    await Workout._saveActiveState();
    Workout.renderActiveWorkout();
  },

  addSet(exerciseIndex) {
    if (!Workout.active) return;
    const ex = Workout.active.exercises[exerciseIndex];
    if (!ex) return;
    const lastSet = ex.sets[ex.sets.length - 1];
    ex.sets.push({
      weight: lastSet?.weight || null,
      reps: lastSet?.reps || null,
      done: false,
      previous: null,
    });
    Workout._saveActiveState();
    Workout.renderActiveWorkout();
  },

  removeSet(exerciseIndex, setIndex) {
    if (!Workout.active) return;
    const ex = Workout.active.exercises[exerciseIndex];
    if (!ex || ex.sets.length <= 1) return;
    ex.sets.splice(setIndex, 1);
    Workout._saveActiveState();
    Workout.renderActiveWorkout();
  },

  removeExercise(exerciseIndex) {
    if (!Workout.active) return;
    Workout.active.exercises.splice(exerciseIndex, 1);
    Workout._saveActiveState();
    Workout.renderActiveWorkout();
  },

  toggleSet(exerciseIndex, setIndex) {
    if (!Workout.active) return;
    const set = Workout.active.exercises[exerciseIndex]?.sets[setIndex];
    if (!set) return;
    set.done = !set.done;
    Workout._saveActiveState();

    // Auto-start rest timer on set completion (skip for warm-up sets)
    if (set.done && !set.warmup) {
      const restSecs = Workout._getRestTime(Workout.active.exercises[exerciseIndex].name);
      Workout.startRestTimer(restSecs);
    }
  },

  updateSet(exerciseIndex, setIndex, field, value) {
    if (!Workout.active) return;
    const set = Workout.active.exercises[exerciseIndex]?.sets[setIndex];
    if (!set) return;
    set[field] = value;
    Workout._saveActiveState();
  },

  toggleWarmup(exerciseIndex, setIndex) {
    if (!Workout.active) return;
    const set = Workout.active.exercises[exerciseIndex]?.sets[setIndex];
    if (!set) return;
    set.warmup = !set.warmup;
    Workout._saveActiveState();
    Workout.renderActiveWorkout();
  },

  updateExerciseNotes(exerciseIndex, notes) {
    if (!Workout.active) return;
    Workout.active.exercises[exerciseIndex].notes = notes;
    Workout._saveActiveState();
  },

  toggleSuperset(exerciseIndex) {
    if (!Workout.active) return;
    const ex = Workout.active.exercises[exerciseIndex];
    if (!ex) return;
    ex.supersetWith = ex.supersetWith ? null : (exerciseIndex + 1);
    Workout._saveActiveState();
    Workout.renderActiveWorkout();
  },

  reorderExercise(fromIndex, toIndex) {
    if (!Workout.active) return;
    if (toIndex < 0 || toIndex >= Workout.active.exercises.length) return;
    const [moved] = Workout.active.exercises.splice(fromIndex, 1);
    Workout.active.exercises.splice(toIndex, 0, moved);
    Workout._saveActiveState();
    Workout.renderActiveWorkout();
  },

  replaceExercise(exerciseIndex) {
    if (!Workout.active) return;
    const origAdd = Workout.addExercise.bind(Workout);
    Workout.addExercise = async (name) => {
      const last = await Workout.getLastPerformance(name);
      const oldEx = Workout.active.exercises[exerciseIndex];
      const numSets = oldEx.sets.length;
      const sets = [];
      for (let i = 0; i < numSets; i++) {
        const prevSet = last?.sets?.[i];
        sets.push({
          weight: prevSet?.weight || null,
          reps: prevSet?.reps || null,
          done: false,
          warmup: false,
          previous: prevSet ? `${prevSet.weight || 0} x ${prevSet.reps || 0}` : null,
        });
      }
      Workout.active.exercises[exerciseIndex] = {
        name,
        info: Workout.exerciseDB[name] || null,
        sets,
        notes: '',
      };
      await Workout._saveActiveState();
      Workout.renderActiveWorkout();
      Workout.addExercise = origAdd;
    };
    Workout.showExerciseSearch();
  },

  _getRestTime(exerciseName) {
    // Heavier compound lifts get more rest
    const info = Workout.exerciseDB[exerciseName];
    if (!info) return 90;
    const compounds = ['Barbell Squat', 'Barbell Bench Press', 'Barbell Deadlift', 'Barbell Overhead Press', 'Front Squat', 'Barbell Row'];
    if (compounds.includes(exerciseName)) return 180;
    if (info.category === 'Legs') return 120;
    if (info.equipment === 'Bodyweight' && info.category === 'Core') return 60;
    return 90;
  },

  // ============================================================
  // RENDERING — HOME (template selection + start)
  // ============================================================

  async renderHome() {
    const container = document.getElementById('today-workout');
    if (!container) return;

    // Check for active workout to resume
    const saved = await DB.getProfile('activeWorkout');
    if (saved) {
      container.innerHTML = `
        <div class="card wkt-resume-card" style="text-align:center; padding:var(--space-md);">
          <div style="font-size:var(--text-sm); font-weight:600; margin-bottom:var(--space-xs);">Workout in progress</div>
          <div style="font-size:var(--text-xs); color:var(--text-muted); margin-bottom:var(--space-sm);">${UI.escapeHtml(saved.templateName)}</div>
          <button class="btn btn-primary" id="wkt-resume-btn" style="width:100%;">Resume Workout</button>
          <button class="btn btn-ghost" id="wkt-discard-btn" style="margin-top:var(--space-xs); font-size:var(--text-xs); color:var(--accent-red);">Discard</button>
        </div>
      `;
      document.getElementById('wkt-resume-btn').addEventListener('click', () => Workout.resumeWorkout());
      document.getElementById('wkt-discard-btn').addEventListener('click', () => {
        if (confirm('Discard this workout?')) Workout.discardWorkout();
      });
      return;
    }

    const templates = await Workout.getTemplates();
    const recentWorkouts = await Workout.getHistory(5);

    let html = '';

    // Start buttons
    html += `
      <div class="card" style="padding:var(--space-md); margin-bottom:var(--space-sm);">
        <button class="btn btn-primary" id="wkt-start-empty" style="width:100%; margin-bottom:var(--space-xs);">Start Empty Workout</button>
      </div>
    `;

    // Templates
    html += `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-xs);">
        <div style="font-size:var(--text-xs); font-weight:600; color:var(--text-muted); text-transform:uppercase;">Templates</div>
        <button class="btn btn-ghost" id="wkt-new-template" style="font-size:var(--text-xs); padding:2px 8px;">+ New</button>
      </div>
    `;

    if (templates.length === 0) {
      html += `<div class="card" style="padding:var(--space-md); text-align:center; color:var(--text-muted); font-size:var(--text-sm);">No templates yet. Finish a workout to save one, or create from scratch.</div>`;
    } else {
      for (const tmpl of templates) {
        const exNames = tmpl.exercises.map(e => e.name).slice(0, 4).join(', ');
        const moreCount = tmpl.exercises.length > 4 ? ` +${tmpl.exercises.length - 4} more` : '';
        html += `
          <div class="card wkt-template-card" style="padding:var(--space-sm) var(--space-md); margin-bottom:var(--space-xs); cursor:pointer;" data-template-id="${tmpl.id}">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div>
                <div style="font-size:var(--text-sm); font-weight:600;">${UI.escapeHtml(tmpl.name)}</div>
                <div style="font-size:var(--text-xs); color:var(--text-muted); margin-top:2px;">${UI.escapeHtml(exNames)}${moreCount}</div>
              </div>
              <button class="btn btn-ghost wkt-template-delete" data-template-id="${tmpl.id}" style="font-size:var(--text-xs); color:var(--accent-red); padding:4px 8px;">X</button>
            </div>
          </div>
        `;
      }
    }

    // Recent workouts
    if (recentWorkouts.length > 0) {
      html += `<div style="font-size:var(--text-xs); font-weight:600; color:var(--text-muted); text-transform:uppercase; margin-top:var(--space-md); margin-bottom:var(--space-xs);">Recent</div>`;
      for (const entry of recentWorkouts) {
        const wd = entry.workout_data;
        const exCount = wd.exercises?.length || 0;
        const dur = entry.duration_minutes;
        const vol = wd.totalVolume || 0;
        html += `
          <div class="card wkt-history-card" style="padding:var(--space-sm) var(--space-md); margin-bottom:var(--space-xs);" data-workout-id="${entry.id}">
            <div style="font-size:var(--text-sm); font-weight:600;">${UI.escapeHtml(wd.templateName || 'Workout')}</div>
            <div style="font-size:var(--text-xs); color:var(--text-muted); margin-top:2px;">
              ${UI.formatDate(entry.date)} &middot; ${dur || '?'}min &middot; ${exCount} exercises &middot; ${vol.toLocaleString()} lbs
            </div>
          </div>
        `;
      }
    }

    container.innerHTML = html;

    // Bind events
    document.getElementById('wkt-start-empty')?.addEventListener('click', () => Workout.startWorkout(null));
    document.getElementById('wkt-new-template')?.addEventListener('click', () => Workout.showNewTemplateSheet());

    container.querySelectorAll('.wkt-template-card').forEach(card => {
      card.addEventListener('click', async (e) => {
        if (e.target.closest('.wkt-template-delete')) return;
        const id = card.dataset.templateId;
        const tmpl = templates.find(t => t.id === id);
        if (tmpl) Workout.startWorkout(tmpl);
      });
    });

    container.querySelectorAll('.wkt-template-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm('Delete this template?')) {
          await Workout.deleteTemplate(btn.dataset.templateId);
          Workout.renderHome();
        }
      });
    });

    container.querySelectorAll('.wkt-history-card').forEach(card => {
      card.addEventListener('click', () => {
        const entry = recentWorkouts.find(e => e.id === card.dataset.workoutId);
        if (entry) Workout.showWorkoutDetail(entry);
      });
    });
  },

  // ============================================================
  // RENDERING — ACTIVE WORKOUT
  // ============================================================

  renderActiveWorkout() {
    const container = document.getElementById('today-workout');
    if (!container || !Workout.active) return;

    let html = '';

    // Header: timer + finish/cancel
    html += `
      <div class="wkt-active-header">
        <div class="wkt-active-header-top">
          <div>
            <div style="font-size:var(--text-sm); font-weight:600;">${UI.escapeHtml(Workout.active.templateName)}</div>
            <div id="wkt-duration" style="font-size:var(--text-lg); font-weight:700; font-variant-numeric:tabular-nums; color:var(--accent-primary);">0:00</div>
          </div>
          <div style="display:flex; gap:var(--space-xs);">
            <button class="btn btn-ghost" id="wkt-cancel-btn" style="color:var(--accent-red); font-size:var(--text-xs);">Cancel</button>
            <button class="btn btn-primary" id="wkt-finish-btn">Finish</button>
          </div>
        </div>
      </div>
    `;

    // Rest timer bar (hidden by default)
    html += `
      <div id="wkt-rest-timer" class="wkt-rest-timer" style="display:none;">
        <div class="wkt-rest-timer-inner">
          <span style="font-size:var(--text-xs); font-weight:600;">REST</span>
          <span id="wkt-rest-display" style="font-size:var(--text-lg); font-weight:700; font-variant-numeric:tabular-nums;">0:00</span>
          <div class="wkt-rest-bar"><div id="wkt-rest-progress" class="wkt-rest-bar-fill"></div></div>
          <div style="display:flex; gap:var(--space-xs); margin-top:var(--space-xs);">
            <button class="btn btn-ghost wkt-rest-adjust" data-adjust="-15" style="font-size:var(--text-xs);">-15s</button>
            <button class="btn btn-ghost wkt-rest-adjust" data-adjust="15" style="font-size:var(--text-xs);">+15s</button>
            <button class="btn btn-ghost" id="wkt-rest-skip" style="font-size:var(--text-xs);">Skip</button>
          </div>
        </div>
      </div>
    `;

    // Exercises
    for (let ei = 0; ei < Workout.active.exercises.length; ei++) {
      const ex = Workout.active.exercises[ei];
      const info = ex.info || Workout.exerciseDB[ex.name];
      const allDone = ex.sets.every(s => s.done);

      // Superset indicator
      const isSuperset = ex.supersetWith != null;
      const prevIsSuperset = ei > 0 && Workout.active.exercises[ei - 1]?.supersetWith === ei;
      const supersetLabel = isSuperset ? `<div class="wkt-superset-badge">SUPERSET</div>` : '';
      const supersetConnector = prevIsSuperset ? `<div class="wkt-superset-connector"></div>` : '';

      html += `
        ${supersetConnector}
        <div class="card wkt-exercise-card${allDone ? ' wkt-ex-done' : ''}${isSuperset ? ' wkt-superset' : ''}" data-ex-idx="${ei}" style="margin-bottom:var(--space-sm);">
          ${supersetLabel}
          <div class="wkt-ex-header">
            <div style="flex:1;">
              <div class="wkt-ex-name">${UI.escapeHtml(ex.name)}</div>
              ${info ? `<div class="wkt-ex-muscles">${UI.escapeHtml(info.muscles)}</div>` : ''}
            </div>
            <div class="wkt-ex-actions">
              <button class="btn btn-ghost wkt-ex-menu-btn" data-ex-idx="${ei}" style="font-size:var(--text-xs); padding:4px 6px;">...</button>
            </div>
          </div>

          <div class="wkt-set-header">
            <span class="wkt-set-col-num">SET</span>
            <span class="wkt-set-col-prev">PREVIOUS</span>
            <span class="wkt-set-col-weight">LBS</span>
            <span class="wkt-set-col-reps">REPS</span>
            <span class="wkt-set-col-check"></span>
          </div>
      `;

      for (let si = 0; si < ex.sets.length; si++) {
        const set = ex.sets[si];
        const warmupClass = set.warmup ? ' wkt-set-warmup' : '';
        const setLabel = set.warmup ? 'W' : String(si + 1 - ex.sets.slice(0, si).filter(s => s.warmup).length);
        html += `
          <div class="wkt-set-row${set.done ? ' wkt-set-done' : ''}${warmupClass}" data-ex-idx="${ei}" data-set-idx="${si}">
            <span class="wkt-set-col-num wkt-set-type-toggle" data-ex-idx="${ei}" data-set-idx="${si}" title="Tap to toggle warm-up">${setLabel}</span>
            <span class="wkt-set-col-prev">${set.previous || '-'}</span>
            <input type="number" class="wkt-input wkt-weight-input" value="${set.weight || ''}" placeholder="-" inputmode="decimal" data-ex-idx="${ei}" data-set-idx="${si}" data-field="weight">
            <input type="number" class="wkt-input wkt-reps-input" value="${set.reps || ''}" placeholder="-" inputmode="numeric" data-ex-idx="${ei}" data-set-idx="${si}" data-field="reps">
            <button class="wkt-set-check${set.done ? ' checked' : ''}" data-ex-idx="${ei}" data-set-idx="${si}">${set.done ? '&#x2713;' : ''}</button>
          </div>
        `;
      }

      // Per-exercise notes
      const exNotes = ex.notes || '';
      html += `
          <div class="wkt-ex-footer">
            <button class="btn btn-ghost wkt-add-set" data-ex-idx="${ei}" style="font-size:var(--text-xs); color:var(--text-muted);">+ Add Set</button>
          </div>
          <div class="wkt-ex-notes-row">
            <input type="text" class="wkt-ex-notes-input" data-ex-idx="${ei}" value="${UI.escapeHtml(exNotes)}" placeholder="Add exercise notes...">
          </div>
        </div>
      `;
    }

    // Add exercise button
    html += `
      <button class="btn btn-ghost wkt-add-exercise" id="wkt-add-exercise" style="width:100%; margin-top:var(--space-sm); padding:var(--space-sm); border:1px dashed var(--border-color); border-radius:var(--radius-md);">
        + Add Exercise
      </button>
    `;

    container.innerHTML = html;
    Workout._bindActiveEvents(container);

    // Update duration immediately
    if (Workout.active) {
      const elapsed = Math.floor((Date.now() - Workout.active.startTime) / 1000);
      const el = document.getElementById('wkt-duration');
      if (el) {
        const m = Math.floor(elapsed / 60);
        const s = elapsed % 60;
        el.textContent = `${m}:${String(s).padStart(2, '0')}`;
      }
    }

    // Restore rest timer display if active
    if (Workout.restTimer) {
      const timerEl = document.getElementById('wkt-rest-timer');
      if (timerEl) timerEl.style.display = 'flex';
    }
  },

  _bindActiveEvents(container) {
    // Finish
    container.querySelector('#wkt-finish-btn')?.addEventListener('click', () => {
      const doneSets = Workout.active.exercises.reduce((sum, ex) => sum + ex.sets.filter(s => s.done).length, 0);
      if (doneSets === 0) {
        if (confirm('No sets completed. Discard workout?')) Workout.discardWorkout();
        return;
      }
      Workout.finishWorkout();
    });

    // Cancel
    container.querySelector('#wkt-cancel-btn')?.addEventListener('click', () => {
      if (confirm('Discard this workout?')) Workout.discardWorkout();
    });

    // Set checkboxes
    container.querySelectorAll('.wkt-set-check').forEach(btn => {
      btn.addEventListener('click', () => {
        const ei = parseInt(btn.dataset.exIdx);
        const si = parseInt(btn.dataset.setIdx);
        Workout.toggleSet(ei, si);

        // Update UI in-place
        const row = btn.closest('.wkt-set-row');
        const set = Workout.active.exercises[ei].sets[si];
        if (set.done) {
          row.classList.add('wkt-set-done');
          btn.classList.add('checked');
          btn.innerHTML = '&#x2713;';
        } else {
          row.classList.remove('wkt-set-done');
          btn.classList.remove('checked');
          btn.innerHTML = '';
        }

        // Check if all exercise sets done
        const card = btn.closest('.wkt-exercise-card');
        const allDone = Workout.active.exercises[ei].sets.every(s => s.done);
        card.classList.toggle('wkt-ex-done', allDone);
      });
    });

    // Weight/reps inputs
    container.querySelectorAll('.wkt-input').forEach(input => {
      const update = () => {
        const ei = parseInt(input.dataset.exIdx);
        const si = parseInt(input.dataset.setIdx);
        const field = input.dataset.field;
        const val = input.value ? parseFloat(input.value) : null;
        Workout.updateSet(ei, si, field, val);
      };
      input.addEventListener('change', update);
      input.addEventListener('blur', update);
    });

    // Add set
    container.querySelectorAll('.wkt-add-set').forEach(btn => {
      btn.addEventListener('click', () => Workout.addSet(parseInt(btn.dataset.exIdx)));
    });

    // Exercise menu (replace, reorder, superset, remove)
    container.querySelectorAll('.wkt-ex-menu-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.exIdx);
        Workout._showExerciseMenu(idx, btn);
      });
    });

    // Warm-up toggle (tap set number)
    container.querySelectorAll('.wkt-set-type-toggle').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const ei = parseInt(el.dataset.exIdx);
        const si = parseInt(el.dataset.setIdx);
        Workout.toggleWarmup(ei, si);
      });
    });

    // Per-exercise notes
    container.querySelectorAll('.wkt-ex-notes-input').forEach(input => {
      let timer = null;
      input.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          Workout.updateExerciseNotes(parseInt(input.dataset.exIdx), input.value);
        }, 800);
      });
      input.addEventListener('blur', () => {
        clearTimeout(timer);
        Workout.updateExerciseNotes(parseInt(input.dataset.exIdx), input.value);
      });
    });

    // Add exercise
    container.querySelector('#wkt-add-exercise')?.addEventListener('click', () => {
      Workout.showExerciseSearch();
    });

    // Rest timer controls
    container.querySelector('#wkt-rest-skip')?.addEventListener('click', () => Workout.stopRestTimer());
    container.querySelectorAll('.wkt-rest-adjust').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!Workout.restTimer) return;
        const adj = parseInt(btn.dataset.adjust);
        Workout.restTimer.total = Math.max(15, Workout.restTimer.total + adj);
        Workout.restTimer.startedAt = Date.now() - ((Workout.restTimer.total - Workout.restTimer.remaining - adj) * 1000);
      });
    });
  },

  // ============================================================
  // EXERCISE CONTEXT MENU (HEVY-style)
  // ============================================================

  _showExerciseMenu(exerciseIndex, anchorEl) {
    const ex = Workout.active?.exercises[exerciseIndex];
    if (!ex) return;

    // Remove existing menu
    document.querySelector('.wkt-ex-menu')?.remove();

    const menu = UI.createElement('div', 'wkt-ex-menu');
    const canMoveUp = exerciseIndex > 0;
    const canMoveDown = exerciseIndex < Workout.active.exercises.length - 1;
    const isSupersetted = ex.supersetWith != null;

    menu.innerHTML = `
      <button class="wkt-ex-menu-item" data-action="replace">Replace Exercise</button>
      ${canMoveUp ? '<button class="wkt-ex-menu-item" data-action="move-up">Move Up</button>' : ''}
      ${canMoveDown ? '<button class="wkt-ex-menu-item" data-action="move-down">Move Down</button>' : ''}
      ${canMoveDown ? `<button class="wkt-ex-menu-item" data-action="superset">${isSupersetted ? 'Remove Superset' : 'Superset with Next'}</button>` : ''}
      <button class="wkt-ex-menu-item wkt-ex-menu-danger" data-action="remove">Remove Exercise</button>
    `;

    // Position near anchor
    const rect = anchorEl.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.right = `${window.innerWidth - rect.right}px`;
    menu.style.zIndex = '100';
    document.body.appendChild(menu);

    const close = () => menu.remove();
    const closeOnOutside = (e) => {
      if (!menu.contains(e.target)) { close(); document.removeEventListener('click', closeOnOutside); }
    };
    setTimeout(() => document.addEventListener('click', closeOnOutside), 10);

    menu.querySelectorAll('.wkt-ex-menu-item').forEach(item => {
      item.addEventListener('click', () => {
        close();
        switch (item.dataset.action) {
          case 'replace': Workout.replaceExercise(exerciseIndex); break;
          case 'move-up': Workout.reorderExercise(exerciseIndex, exerciseIndex - 1); break;
          case 'move-down': Workout.reorderExercise(exerciseIndex, exerciseIndex + 1); break;
          case 'superset': Workout.toggleSuperset(exerciseIndex); break;
          case 'remove':
            if (confirm(`Remove ${ex.name}?`)) Workout.removeExercise(exerciseIndex);
            break;
        }
      });
    });
  },

  // ============================================================
  // RENDERING — EXERCISE SEARCH MODAL
  // ============================================================

  showExerciseSearch() {
    const overlay = UI.createElement('div', 'modal-overlay');
    const sheet = UI.createElement('div', 'modal-sheet');
    sheet.style.maxHeight = '85dvh';

    const categories = Workout.getCategories();
    const allExercises = Object.keys(Workout.exerciseDB);

    sheet.innerHTML = `
      <div class="modal-header">
        <span class="modal-title">Add Exercise</span>
        <button class="modal-close" id="ex-search-close">&times;</button>
      </div>
      <div style="padding:0 var(--space-md) var(--space-sm);">
        <input type="text" class="form-input" id="ex-search-input" placeholder="Search exercises..." style="width:100%;">
      </div>
      <div style="padding:0 var(--space-md) var(--space-sm); display:flex; gap:var(--space-xs); flex-wrap:wrap;" id="ex-category-chips">
        <button class="subtype-chip selected" data-cat="all">All</button>
        ${categories.map(c => `<button class="subtype-chip" data-cat="${UI.escapeHtml(c)}">${UI.escapeHtml(c)}</button>`).join('')}
      </div>
      <div id="ex-search-results" style="padding:0 var(--space-md); overflow-y:auto; max-height:55dvh;"></div>
      <div style="padding:var(--space-sm) var(--space-md);">
        <button class="btn btn-ghost" id="ex-add-custom" style="width:100%; font-size:var(--text-sm);">+ Create Custom Exercise</button>
      </div>
    `;

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    let selectedCategory = 'all';

    const renderResults = (query) => {
      const resultsEl = document.getElementById('ex-search-results');
      let matches = Workout.searchExercises(query);
      if (selectedCategory !== 'all') {
        matches = matches.filter(name => Workout.exerciseDB[name]?.category === selectedCategory);
      }
      resultsEl.innerHTML = matches.map(name => {
        const info = Workout.exerciseDB[name];
        return `
          <div class="wkt-search-result" data-name="${UI.escapeHtml(name)}" style="padding:var(--space-sm) 0; border-bottom:1px solid var(--border-color); cursor:pointer;">
            <div style="font-size:var(--text-sm); font-weight:500;">${UI.escapeHtml(name)}</div>
            <div style="font-size:var(--text-xs); color:var(--text-muted);">${UI.escapeHtml(info.muscles)} &middot; ${UI.escapeHtml(info.equipment)}</div>
          </div>
        `;
      }).join('');

      resultsEl.querySelectorAll('.wkt-search-result').forEach(el => {
        el.addEventListener('click', () => {
          Workout.addExercise(el.dataset.name);
          close();
        });
      });
    };

    document.getElementById('ex-search-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    const searchInput = document.getElementById('ex-search-input');
    searchInput.addEventListener('input', () => renderResults(searchInput.value));
    searchInput.focus();

    // Category chips
    document.getElementById('ex-category-chips').querySelectorAll('.subtype-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('#ex-category-chips .subtype-chip').forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
        selectedCategory = chip.dataset.cat;
        renderResults(searchInput.value);
      });
    });

    // Custom exercise
    document.getElementById('ex-add-custom').addEventListener('click', () => {
      const name = prompt('Exercise name:');
      if (name && name.trim()) {
        Workout.exerciseDB[name.trim()] = { category: 'Custom', equipment: 'Other', muscles: 'Custom' };
        Workout.addExercise(name.trim());
        close();
      }
    });

    renderResults('');
  },

  // ============================================================
  // RENDERING — NEW TEMPLATE SHEET
  // ============================================================

  showNewTemplateSheet() {
    const overlay = UI.createElement('div', 'modal-overlay');
    const sheet = UI.createElement('div', 'modal-sheet');
    sheet.style.maxHeight = '85dvh';

    sheet.innerHTML = `
      <div class="modal-header">
        <span class="modal-title">New Template</span>
        <button class="modal-close" id="tmpl-close">&times;</button>
      </div>
      <div style="padding:var(--space-md);">
        <div class="form-group">
          <label class="form-label">Template Name</label>
          <input type="text" class="form-input" id="tmpl-name" placeholder="e.g. Push Day, Leg Day...">
        </div>
        <div id="tmpl-exercises" style="margin-top:var(--space-md);"></div>
        <button class="btn btn-ghost" id="tmpl-add-ex" style="width:100%; margin-top:var(--space-sm); border:1px dashed var(--border-color);">+ Add Exercise</button>
        <button class="btn btn-primary" id="tmpl-save" style="width:100%; margin-top:var(--space-md);">Save Template</button>
      </div>
    `;

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    const exercises = [];

    const renderExercises = () => {
      const el = document.getElementById('tmpl-exercises');
      el.innerHTML = exercises.map((ex, i) => `
        <div style="display:flex; align-items:center; gap:var(--space-sm); margin-bottom:var(--space-xs); padding:var(--space-xs) 0; border-bottom:1px solid var(--border-color);">
          <div style="flex:1; font-size:var(--text-sm);">${UI.escapeHtml(ex.name)}</div>
          <input type="number" class="form-input tmpl-sets-input" data-idx="${i}" value="${ex.sets}" style="width:50px; text-align:center; font-size:var(--text-sm);" min="1" max="20" inputmode="numeric">
          <span style="font-size:var(--text-xs); color:var(--text-muted);">sets</span>
          <button class="btn btn-ghost" data-remove="${i}" style="color:var(--accent-red); font-size:var(--text-xs); padding:4px;">X</button>
        </div>
      `).join('') || '<div style="text-align:center; color:var(--text-muted); font-size:var(--text-sm); padding:var(--space-md);">Add exercises to build your template</div>';

      el.querySelectorAll('[data-remove]').forEach(btn => {
        btn.addEventListener('click', () => {
          exercises.splice(parseInt(btn.dataset.remove), 1);
          renderExercises();
        });
      });
      el.querySelectorAll('.tmpl-sets-input').forEach(input => {
        input.addEventListener('change', () => {
          exercises[parseInt(input.dataset.idx)].sets = parseInt(input.value) || 3;
        });
      });
    };

    document.getElementById('tmpl-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    document.getElementById('tmpl-add-ex').addEventListener('click', () => {
      // Reuse exercise search but with a callback
      const origAddExercise = Workout.addExercise.bind(Workout);
      Workout.addExercise = async (name) => {
        exercises.push({ name, sets: 3, reps: 10, weight: 0 });
        renderExercises();
        Workout.addExercise = origAddExercise;
      };
      Workout.showExerciseSearch();
    });

    document.getElementById('tmpl-save').addEventListener('click', async () => {
      const name = document.getElementById('tmpl-name').value.trim();
      if (!name) { UI.toast('Name your template', 'error'); return; }
      if (exercises.length === 0) { UI.toast('Add at least one exercise', 'error'); return; }
      const template = {
        id: UI.generateId('tmpl'),
        name,
        created: new Date().toISOString(),
        exercises,
      };
      await Workout.saveTemplate(template);
      close();
      UI.toast('Template saved');
      Workout.renderHome();
    });

    renderExercises();
  },

  // ============================================================
  // RENDERING — WORKOUT SUMMARY (post-finish)
  // ============================================================

  renderSummary(summary) {
    const container = document.getElementById('today-workout');
    if (!container) return;

    const prHtml = summary.prs.length > 0
      ? `<div class="wkt-prs">
          <div style="font-size:var(--text-xs); font-weight:600; color:var(--accent-green); text-transform:uppercase; margin-bottom:var(--space-xs);">Personal Records</div>
          ${summary.prs.map(pr => `
            <div style="font-size:var(--text-sm); margin-bottom:2px;">
              <span style="font-weight:600;">${UI.escapeHtml(pr.exercise)}</span>
              <span style="color:var(--text-muted);">—</span>
              ${UI.escapeHtml(pr.type)}: ${UI.escapeHtml(pr.value)}
            </div>
          `).join('')}
        </div>`
      : '';

    container.innerHTML = `
      <div class="card" style="padding:var(--space-md); text-align:center; margin-bottom:var(--space-sm);">
        <div style="font-size:var(--text-lg); font-weight:700; margin-bottom:var(--space-xs);">Workout Complete</div>
        <div class="wkt-summary-stats">
          <div class="wkt-summary-stat">
            <div class="wkt-summary-stat-value">${summary.duration}</div>
            <div class="wkt-summary-stat-label">minutes</div>
          </div>
          <div class="wkt-summary-stat">
            <div class="wkt-summary-stat-value">${summary.exercises}</div>
            <div class="wkt-summary-stat-label">exercises</div>
          </div>
          <div class="wkt-summary-stat">
            <div class="wkt-summary-stat-value">${summary.sets}</div>
            <div class="wkt-summary-stat-label">sets</div>
          </div>
          <div class="wkt-summary-stat">
            <div class="wkt-summary-stat-value">${summary.volume.toLocaleString()}</div>
            <div class="wkt-summary-stat-label">lbs volume</div>
          </div>
        </div>
        ${prHtml}
      </div>
      <div style="display:flex; gap:var(--space-xs);">
        <button class="btn btn-ghost" id="wkt-save-template" style="flex:1;">Save as Template</button>
        <button class="btn btn-primary" id="wkt-done" style="flex:1;">Done</button>
      </div>
    `;

    document.getElementById('wkt-done').addEventListener('click', () => Workout.renderHome());
    document.getElementById('wkt-save-template').addEventListener('click', async () => {
      const name = prompt('Template name:', summary.entry.workout_data.templateName || 'My Workout');
      if (name) {
        const tmpl = Workout.createTemplateFromWorkout(summary.entry.workout_data, name);
        await Workout.saveTemplate(tmpl);
        UI.toast('Template saved');
      }
    });
  },

  // ============================================================
  // RENDERING — WORKOUT DETAIL (history view)
  // ============================================================

  showWorkoutDetail(entry) {
    const wd = entry.workout_data;
    const overlay = UI.createElement('div', 'modal-overlay');
    const sheet = UI.createElement('div', 'modal-sheet');
    sheet.style.maxHeight = '85dvh';

    let exHtml = '';
    for (const ex of (wd.exercises || [])) {
      exHtml += `
        <div style="margin-bottom:var(--space-sm);">
          <div style="font-size:var(--text-sm); font-weight:600;">${UI.escapeHtml(ex.name)}</div>
          ${ex.sets.map((s, i) => `
            <div style="font-size:var(--text-xs); color:var(--text-secondary); margin-left:var(--space-sm);">
              Set ${i + 1}: ${s.weight || 0} lbs x ${s.reps || 0}
            </div>
          `).join('')}
        </div>
      `;
    }

    sheet.innerHTML = `
      <div class="modal-header">
        <span class="modal-title">${UI.escapeHtml(wd.templateName || 'Workout')}</span>
        <button class="modal-close" id="wkt-detail-close">&times;</button>
      </div>
      <div style="padding:var(--space-md);">
        <div style="font-size:var(--text-xs); color:var(--text-muted); margin-bottom:var(--space-sm);">
          ${UI.formatDate(entry.date)} &middot; ${entry.duration_minutes || '?'}min &middot; ${(wd.totalVolume || 0).toLocaleString()} lbs total
        </div>
        ${exHtml}
        <button class="btn btn-ghost" id="wkt-detail-repeat" style="width:100%; margin-top:var(--space-md);">Repeat This Workout</button>
      </div>
    `;

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    document.getElementById('wkt-detail-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    document.getElementById('wkt-detail-repeat').addEventListener('click', () => {
      close();
      const template = {
        id: null,
        name: wd.templateName || 'Workout',
        exercises: wd.exercises.map(ex => ({
          name: ex.name,
          sets: ex.sets.length,
          reps: ex.sets[0]?.reps || 10,
          weight: ex.sets[0]?.weight || 0,
        })),
      };
      Workout.startWorkout(template);
    });
  },
};
