// fitness.js — Interactive workout checklist with exercise database

const Fitness = {
  // Exercise database — form cues, muscles, purpose
  exercises: {
    'goblet squats': {
      muscles: 'Quads, glutes, core',
      why: 'The biggest calorie-burning muscles in your body. Squats under load signal your legs to hold onto muscle during a cut — and a strong core engagement means bonus core work every rep.',
      form: 'Hold kettlebell at chest, elbows tucked. Feet shoulder-width, toes slightly out. Sit back and down — hips below knees. Chest stays up, weight in heels. Drive up through heels.',
      mistakes: 'Knees caving inward (push them out over toes). Leaning forward (keep chest proud). Not going deep enough (hip crease below knee).',
    },
    'push-ups': {
      muscles: 'Chest, shoulders, triceps, core',
      why: 'Full-body pressing that doubles as a plank. Every push-up is core training in disguise — your core fights to keep your hips from sagging.',
      form: 'Hands just outside shoulder-width. Body in a straight line from head to heels. Lower until chest nearly touches floor. Push back up, fully extending arms. Squeeze glutes to keep hips level.',
      mistakes: 'Sagging hips (squeeze glutes). Flaring elbows to 90° (keep them at ~45°). Half reps (full range of motion matters).',
    },
    'dumbbell rows': {
      muscles: 'Back (lats), biceps, rear delts, core',
      why: 'Balances all the pushing work. A strong back improves posture and physique. Also works core anti-rotation.',
      form: 'One hand and knee on bench (or bent over). Pull dumbbell to hip, squeezing shoulder blade back. Lower with control — don\'t just drop it.',
      mistakes: 'Twisting torso to heave weight up (keep hips square). Using momentum (slow and controlled). Shrugging shoulder up (pull to hip, not ear).',
    },
    'lunges': {
      muscles: 'Quads, glutes, hamstrings, balance',
      why: 'Single-leg work fixes imbalances and fires up stabilizer muscles. Burns more calories per rep than bilateral exercises because your core works overtime to keep you balanced.',
      form: 'Step forward, lower until both knees at 90°. Front knee tracks over ankle — never past toes. Back knee hovers just above floor. Push back to standing through front heel.',
      mistakes: 'Front knee shooting past toes (shorter step). Wobbling side to side (engage core, go slower). Leaning forward (stay upright).',
    },
    'dumbbell overhead press': {
      muscles: 'Shoulders (delts), triceps, core',
      why: 'Pressing overhead requires serious core bracing — your core works hard to stabilize your spine under load. Defined shoulders improve your overall physique.',
      form: 'Start with dumbbells at shoulder height, palms forward. Press straight up, fully extending arms. Bring them slightly together at top. Lower with control to shoulders.',
      mistakes: 'Arching lower back (brace core tight, slight lean back is OK). Not fully extending (lockout at top). Using legs to push (that\'s a push press — different exercise).',
    },
    'romanian deadlifts': {
      muscles: 'Hamstrings, glutes, lower back',
      why: 'The hip hinge is the most important movement pattern for posture and glute development. Strong posterior chain = everything looks better from behind. Also protects your lower back.',
      form: 'Hold dumbbells in front of thighs. Slight knee bend (soft, not locked). Push hips BACK like closing a car door with your butt. Lower weights along your legs until you feel a deep hamstring stretch. Drive hips forward to stand.',
      mistakes: 'Rounding your back (keep chest up, shoulders back). Bending knees too much (this isn\'t a squat — hips go BACK). Going too heavy too soon (feel the stretch first, add weight later).',
    },
    'resistance band pull-aparts': {
      muscles: 'Rear delts, upper back, rotator cuff',
      why: 'Counteracts phone/desk posture. Pulls your shoulders back, which makes your chest and abs more visible. Also keeps shoulders healthy for pressing.',
      form: 'Hold band at shoulder height, arms straight out. Pull band apart by squeezing shoulder blades together. Pause at full stretch. Return slowly.',
      mistakes: 'Using arms instead of back (think "squeeze shoulder blades"). Shrugging up (keep shoulders down). Going too fast (slow squeeze, slow return).',
    },
    'bodyweight squats': {
      muscles: 'Quads, glutes, core',
      why: 'Higher rep bodyweight work is more metabolic — keeps heart rate up while training legs. Good for building muscular endurance on a deficit.',
      form: 'Same as goblet squat but arms extended forward for balance. Full depth — hips below knees. Drive up through heels.',
      mistakes: 'Same as goblet squats. Without weight, people tend to go too fast — control the descent (2 seconds down, 1 second up).',
    },
    'kettlebell swings': {
      muscles: 'Glutes, hamstrings, core, shoulders, grip',
      why: 'The best bang-for-your-buck exercise. Explosive hip hinge burns calories like cardio while building posterior chain like strength training. 15 swings ≈ a sprint.',
      form: 'Hinge at hips, grip KB with both hands. Hike it back between legs. Snap hips forward explosively — the swing comes from your HIPS, not arms. At top, squeeze glutes hard, arms float to shoulder height.',
      mistakes: 'Squatting instead of hinging (push hips BACK). Using arms to lift (arms are just ropes — power comes from hip snap). Hyperextending back at top (stand tall, don\'t lean back).',
    },
    'dumbbell bench press': {
      muscles: 'Chest, shoulders, triceps',
      why: 'The king of upper body pushing. Dumbbells let each arm work independently, fixing imbalances. A defined chest adds shape to your upper body.',
      form: 'Lie on bench, feet flat on floor. Dumbbells at chest level, palms forward. Press up, bringing dumbbells slightly together at top. Lower with control until elbows are at 90° or slightly below.',
      mistakes: 'Bouncing at bottom (pause briefly). Feet coming off floor (keep planted for stability). Flaring elbows to 90° (keep at ~45°).',
    },
    'pull-up negatives': {
      muscles: 'Back (lats), biceps, forearms, core',
      why: 'Building toward full pull-ups — the ultimate back exercise. Negatives (lowering slowly) build strength through the hardest part. Lats are the widest muscle on your body — they create the V-taper silhouette.',
      form: 'Jump or step up to the top position (chin above bar). Lower yourself as SLOWLY as possible — aim for 5+ seconds. At the bottom, let go, reset, repeat.',
      mistakes: 'Dropping too fast (the slow descent IS the exercise). Kipping or swinging (dead hang, strict control). Gripping too narrow (shoulder width or slightly wider).',
    },
    'step-up lunges': {
      muscles: 'Quads, glutes, balance',
      why: 'Higher step = more glute activation. Single-leg strength that directly translates to everything — stairs, hiking, running.',
      form: 'Use a sturdy step or bench. Step up with one foot, drive through that heel to stand tall. Step back down with control. All 10 on one side, then switch.',
      mistakes: 'Pushing off the back foot (all the work should come from the front leg). Too high a step to start (12-16 inches is enough). Leaning forward (stay tall).',
    },
    'plank': {
      muscles: 'Entire core — rectus abdominis, transverse abdominis, obliques',
      why: 'The foundation of core training. Teaches your core to STABILIZE under load. Every other exercise is harder without a strong plank.',
      form: 'Forearms on ground, body in a straight line. Squeeze glutes, brace abs like someone\'s about to poke your stomach. Breathe normally. Don\'t let hips sag or pike up.',
      mistakes: 'Hips sagging (squeeze glutes harder). Hips piking up (you\'re making it easier — lower them). Holding breath (breathe steadily).',
    },
    'dead bugs': {
      muscles: 'Deep core (transverse abdominis), hip flexors',
      why: 'The best core exercise most people skip. Trains anti-extension — your core learns to keep your lower back flat while limbs move. This builds deep stability that carries over to every other exercise.',
      form: 'Lie on back. Arms straight up, knees at 90°. Press lower back into floor (NO gap). Extend opposite arm and leg slowly. Return. Switch sides. Lower back stays glued to floor the ENTIRE time.',
      mistakes: 'Lower back arching off floor (this is the whole point — if it arches, you\'ve gone too far). Going too fast (slow = harder = better). Holding breath (exhale as you extend).',
    },
    'bicycle crunches': {
      muscles: 'Obliques, rectus abdominis',
      why: 'One of the highest muscle activation exercises for obliques. The rotation component builds a strong, defined midsection.',
      form: 'Lie on back, hands behind head. Lift shoulders off floor. Bring knee to opposite elbow while extending other leg. Alternate in a pedaling motion. Don\'t pull on your neck.',
      mistakes: 'Pulling neck forward (hands are just resting behind head). Going too fast (slow and controlled — hold each twist for a beat). Not lifting shoulders (crunch UP, don\'t just move elbows).',
    },
    'leg raises': {
      muscles: 'Lower abs, hip flexors',
      why: 'Targets the lower portion of your core — the hardest area to define and usually the last to show. Direct work here accelerates core development.',
      form: 'Lie flat, hands under hips for support. Legs straight (or slight bend if needed). Raise legs to 90°. Lower SLOWLY — stop before lower back arches off floor. That\'s one rep.',
      mistakes: 'Lower back arching up (hands under hips help, reduce range if needed). Using momentum (slow on the way down). Legs bending too much (keep them as straight as possible).',
    },
    'plank shoulder taps': {
      muscles: 'Core (anti-rotation), shoulders',
      why: 'Levels up the basic plank by adding anti-rotation — your core fights to keep your hips still while you shift weight. This builds deep stability and total-body control.',
      form: 'Start in push-up position. Tap left shoulder with right hand, then right shoulder with left hand. The goal: your hips should NOT rock side to side. Widen feet for more stability.',
      mistakes: 'Hips rocking side to side (slow down, widen stance). Rushing (each tap should be deliberate). Sagging hips (same as plank — squeeze glutes).',
    },
    'bird dogs': {
      muscles: 'Core, lower back, glutes',
      why: 'Trains the same anti-extension as dead bugs but from all fours — different angle means different muscle fibers. Also bulletproofs your lower back, which lets you go harder on everything else.',
      form: 'On hands and knees. Extend opposite arm and leg until parallel to floor. Hold 2 seconds. Return with control. Switch sides. Keep hips level — imagine balancing a cup of water on your lower back.',
      mistakes: 'Rotating hips (keep them square to the floor). Rushing (hold at the top). Arching back (neutral spine the entire time).',
    },
  },

  // Get exercise list from a day plan — supports structured (exercises array) and legacy (description text)
  getExerciseList(todayPlan) {
    if (!todayPlan) return [];
    // New structured format: exercises array with name, sets, reps, formCue
    if (todayPlan.exercises && Array.isArray(todayPlan.exercises) && todayPlan.exercises.length > 0) {
      return todayPlan.exercises.map(ex => {
        const setsReps = ex.sets && ex.reps ? `${ex.sets}x${ex.reps}` : '';
        const dbKey = Object.keys(Fitness.exercises).find(k =>
          ex.name.toLowerCase().includes(k) || k.includes(ex.name.toLowerCase())
        );
        return {
          name: ex.name,
          setsReps,
          extra: ex.formCue || '',
          isCore: (ex.section || '').toLowerCase() === 'core',
          details: dbKey ? Fitness.exercises[dbKey] : null,
        };
      });
    }
    // Cardio day — single exercise
    if (todayPlan.type === 'cardio') {
      return [{ name: 'cardio', setsReps: '', extra: todayPlan.description || '', isCore: false, details: null }];
    }
    // Legacy text-based format
    return Fitness.parseExercises(todayPlan.description);
  },

  // Parse a workout description string into individual exercises (legacy format)
  parseExercises(description) {
    if (!description) return [];
    // Split on || for section breaks (e.g., "...exercises || Core: ...")
    const sections = description.split('||').map(s => s.trim());
    const exercises = [];

    for (const section of sections) {
      const parts = section.split('|').map(s => s.trim()).filter(Boolean);
      for (const part of parts) {
        // Try to parse "Exercise 3x12" or "Exercise 3x12 (notes)"
        const match = part.match(/^(?:Core:\s*)?(.+?)(?:\s+(\d+x\d+(?:s|sec)?)(?:\s+(.+))?)?$/i);
        if (match) {
          const rawName = match[1].trim();
          if (!rawName) continue;
          const setsReps = match[2] || '';
          const extra = match[3] || '';
          const isCore = part.toLowerCase().startsWith('core:');

          // Look up in database (case-insensitive, partial match)
          const dbKey = Object.keys(Fitness.exercises).find(k =>
            rawName.toLowerCase().includes(k) || k.includes(rawName.toLowerCase())
          );

          exercises.push({
            name: rawName,
            setsReps,
            extra,
            isCore,
            details: dbKey ? Fitness.exercises[dbKey] : null,
          });
        }
      }
    }
    return exercises;
  },

  // Render the interactive workout checklist (individual exercise cards)
  async render(regimen, date) {
    const dayName = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const todayPlan = regimen.weeklySchedule?.find(d => d.day === dayName);
    const isRest = !todayPlan || todayPlan.type === 'rest' || todayPlan.type === 'active_rest' || todayPlan.type === 'active_recovery';
    const notes = await Fitness.getWorkoutNotes(date);
    const checked = await Fitness.getCheckedExercises(date);

    if (isRest) {
      return `
        <div class="card" style="text-align:center; padding:var(--space-md); margin-top:var(--space-sm);">
          <div style="font-size:var(--text-xs); color:var(--text-muted); text-transform:uppercase; font-weight:600;">Rest Day</div>
          <div style="font-size:var(--text-sm); color:var(--text-secondary); margin-top:2px;">${todayPlan ? UI.escapeHtml(todayPlan.description) : 'Recover and recharge.'}</div>
        </div>
        <textarea class="form-input fitness-notes" id="fitness-notes" placeholder="Light walk, stretching, how you're feeling..." rows="1" style="margin-top:var(--space-sm);">${UI.escapeHtml(notes || '')}</textarea>
        <button class="btn btn-secondary" id="fitness-save-btn" style="margin-top:var(--space-xs); width:100%;">Save Notes</button>
      `;
    }

    const exercises = Fitness.getExerciseList(todayPlan);
    let html = '';

    // Each exercise as its own card
    for (let i = 0; i < exercises.length; i++) {
      const ex = exercises[i];
      const isDone = checked.has(ex.name);
      const hasDetails = !!ex.details;

      // Section divider for Core
      if (ex.isCore && (i === 0 || !exercises[i - 1].isCore)) {
        html += `<div style="font-size:var(--text-xs); font-weight:600; color:var(--text-muted); text-transform:uppercase; margin:var(--space-sm) 0 var(--space-xs);">Core</div>`;
      }

      html += `
        <div class="card fitness-exercise${isDone ? ' fitness-done' : ''}" data-exercise="${UI.escapeHtml(ex.name)}" style="margin-bottom:var(--space-xs);">
          <div class="fitness-exercise-row">
            <button class="fitness-check${isDone ? ' checked' : ''}" data-name="${UI.escapeHtml(ex.name)}">
              ${isDone ? '&#x2713;' : ''}
            </button>
            <div style="flex:1; min-width:0;">
              <div style="display:flex; justify-content:space-between; align-items:baseline;">
                <span class="fitness-exercise-name${isDone ? ' fitness-strikethrough' : ''}">${UI.escapeHtml(ex.name)}</span>
                ${ex.setsReps ? `<span style="font-size:var(--text-xs); color:var(--accent-green); font-weight:600; white-space:nowrap; margin-left:var(--space-sm);">${UI.escapeHtml(ex.setsReps)}</span>` : ''}
              </div>
              ${ex.extra ? `<div style="font-size:var(--text-xs); color:var(--text-muted);">${UI.escapeHtml(ex.extra)}</div>` : ''}
            </div>
            ${hasDetails ? `<button class="fitness-info-btn" data-idx="${i}" aria-label="Exercise info">?</button>` : ''}
          </div>
          <div class="fitness-details" id="fitness-detail-${i}" style="display:none;">
            ${hasDetails ? `
              <div class="fitness-detail-section">
                <div class="fitness-detail-label">Why this exercise?</div>
                <div class="fitness-detail-text">${UI.escapeHtml(ex.details.why)}</div>
              </div>
              <div class="fitness-detail-section">
                <div class="fitness-detail-label">Muscles</div>
                <div class="fitness-detail-text">${UI.escapeHtml(ex.details.muscles)}</div>
              </div>
              <div class="fitness-detail-section">
                <div class="fitness-detail-label">How to do it</div>
                <div class="fitness-detail-text">${UI.escapeHtml(ex.details.form)}</div>
              </div>
              <div class="fitness-detail-section">
                <div class="fitness-detail-label">Common mistakes</div>
                <div class="fitness-detail-text">${UI.escapeHtml(ex.details.mistakes)}</div>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }

    // Notes
    html += `
      <textarea class="form-input fitness-notes" id="fitness-notes" placeholder="Extra cardio, felt tight, modified an exercise..." rows="1" style="margin-top:var(--space-sm);">${UI.escapeHtml(notes || '')}</textarea>
      <button class="btn btn-secondary" id="fitness-save-btn" style="margin-top:var(--space-xs); width:100%;">Save Notes</button>
    `;

    return html;
  },

  // Wire up event handlers after rendering
  bindEvents(date, container) {
    const root = container || document;
    // Checkbox toggles
    root.querySelectorAll('.fitness-check').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const name = btn.dataset.name;
        const checked = await Fitness.getCheckedExercises(date);
        const exerciseCard = btn.closest('.fitness-exercise');
        if (checked.has(name)) {
          checked.delete(name);
          btn.classList.remove('checked');
          btn.innerHTML = '';
          exerciseCard?.classList.remove('fitness-done');
          exerciseCard?.querySelector('.fitness-exercise-name')?.classList.remove('fitness-strikethrough');
        } else {
          checked.add(name);
          btn.classList.add('checked');
          btn.innerHTML = '&#x2713;';
          exerciseCard?.classList.add('fitness-done');
          exerciseCard?.querySelector('.fitness-exercise-name')?.classList.add('fitness-strikethrough');
        }
        await Fitness.saveCheckedExercises(date, checked);

        // Update workout stat card counter
        const total = root.querySelectorAll('.fitness-check').length;
        const done = root.querySelectorAll('.fitness-check.checked').length;
        const statCard = document.querySelector('[data-stat-action="workout"] .stat-value');
        if (statCard && total > 0) statCard.textContent = `${done}/${total}`;
      });
    });

    // Info expand/collapse
    root.querySelectorAll('.fitness-info-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const detail = root.querySelector(`#fitness-detail-${btn.dataset.idx}`);
        if (detail) {
          const isOpen = detail.style.display !== 'none';
          detail.style.display = isOpen ? 'none' : 'block';
          btn.textContent = isOpen ? '?' : '\u2715';
        }
      });
    });

    // Notes — save button + auto-save fallback
    clearTimeout(Fitness._saveTimer);
    const notesEl = root.querySelector('#fitness-notes');
    const saveBtn = root.querySelector('#fitness-save-btn');
    if (notesEl) {
      UI.autoResize(notesEl);
      notesEl.addEventListener('input', () => {
        UI.autoResize(notesEl);
        clearTimeout(Fitness._saveTimer);
        if (saveBtn) { saveBtn.textContent = 'Save Notes'; saveBtn.style.opacity = '1'; }
        Fitness._saveTimer = setTimeout(() => {
          Fitness.saveWorkoutNotes(date, notesEl.value);
        }, 3000);
      });
    }
    if (saveBtn && notesEl) {
      saveBtn.addEventListener('click', async () => {
        clearTimeout(Fitness._saveTimer);
        await Fitness.saveWorkoutNotes(date, notesEl.value);
        saveBtn.textContent = 'Saved!';
        saveBtn.style.opacity = '0.6';
        // Also trigger sync
        if (await CloudRelay.isConfigured()) {
          CloudRelay.queueUpload(date);
        }
      });
    }
  },

  // Persistence — store checked exercises and notes in dailySummary
  async getCheckedExercises(date) {
    const summary = await DB.getDailySummary(date);
    return new Set(summary.fitness_checked || []);
  },

  async saveCheckedExercises(date, checkedSet) {
    await DB.updateDailySummary(date, { fitness_checked: [...checkedSet] });
  },

  async getWorkoutNotes(date) {
    const summary = await DB.getDailySummary(date);
    return summary.fitness_notes || '';
  },

  async saveWorkoutNotes(date, notes) {
    await DB.updateDailySummary(date, { fitness_notes: notes });
  },
};
