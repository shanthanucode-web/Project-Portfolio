import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import '../styles/calendar.css';

// ─────────────────────────────────────────────────────────────
// DATE HELPERS
// ─────────────────────────────────────────────────────────────

const DAY_SHORT   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function toKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function today0() {
  const d = new Date(); d.setHours(0,0,0,0); return d;
}
function addDays(d, n) {
  const x = new Date(d); x.setDate(x.getDate()+n); return x;
}
function fromKey(k) {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m-1, d);
}

// ─────────────────────────────────────────────────────────────
// WORKOUT TYPES
// ─────────────────────────────────────────────────────────────

const WORKOUT_TYPES = {
  strength:    { label:'Strength',        color:'var(--violet)', bg:'rgba(143,124,255,0.15)', border:'rgba(143,124,255,0.35)' },
  hypertrophy: { label:'Hypertrophy',     color:'var(--blue)',   bg:'rgba(87,165,255,0.15)',  border:'rgba(87,165,255,0.35)'  },
  endurance:   { label:'Endurance',       color:'var(--cyan)',   bg:'rgba(85,214,255,0.15)',  border:'rgba(85,214,255,0.35)'  },
  pr:          { label:'PR Attempt',      color:'var(--pink)',   bg:'rgba(255,111,216,0.15)', border:'rgba(255,111,216,0.35)' },
  deload:      { label:'Deload',          color:'var(--gold)',   bg:'rgba(255,216,77,0.15)',  border:'rgba(255,216,77,0.35)'  },
  recovery:    { label:'Active Recovery', color:'var(--mint)',   bg:'rgba(87,240,192,0.12)',  border:'rgba(87,240,192,0.3)'   },
  power:       { label:'Power',           color:'var(--pink)',   bg:'rgba(255,111,216,0.12)', border:'rgba(255,111,216,0.3)'  },
  buildup:     { label:'Build-Up',        color:'var(--mint)',   bg:'rgba(87,240,192,0.15)',  border:'rgba(87,240,192,0.35)'  },
};

// ─────────────────────────────────────────────────────────────
// MENSTRUAL CYCLE PHASES
// ─────────────────────────────────────────────────────────────

export const CYCLE_PHASES = {
  menstrual: {
    label: 'Menstrual',
    color: 'var(--pink)',
    colorRaw: '#ff6fd8',
    days: [1,2,3,4,5],
    intensityMod: 0.80,
    avoidTypes: ['pr','strength'],
    recommendedTypes: ['recovery','endurance'],
    workoutTip: 'Reduce load ~15–20%. Prioritise upper body accessories and mobility. Avoid heavy lower-body compounds today.',
    nutritionTip: 'Iron-rich foods and higher magnesium. Moderate carbs, stay well-hydrated. Avoid high-sodium foods.',
  },
  follicular: {
    label: 'Follicular',
    color: 'var(--mint)',
    colorRaw: '#57f0c0',
    days: [6,7,8,9,10,11,12,13],
    intensityMod: 1.0,
    avoidTypes: [],
    recommendedTypes: ['strength','pr','hypertrophy'],
    workoutTip: 'Best window for strength gains. Estrogen rising — push heavier weights and aim for PRs. Recovery is faster now.',
    nutritionTip: 'High carb tolerance. Prioritise pre-workout carbs 90 min before and post-workout protein within 30 min.',
  },
  ovulatory: {
    label: 'Ovulatory',
    color: 'var(--gold)',
    colorRaw: '#ffd84d',
    days: [14,15,16],
    intensityMod: 1.0,
    avoidTypes: ['deload','recovery'],
    recommendedTypes: ['pr','strength'],
    workoutTip: 'Peak performance window — best time for 1RM attempts. Energy and power are at their highest. Warm up well.',
    nutritionTip: 'Slightly elevated caloric needs. High protein supports peak output. Avoid heavy fatty foods pre-session.',
  },
  luteal_early: {
    label: 'Luteal · Early',
    color: 'var(--orange)',
    colorRaw: '#ff9f63',
    days: [17,18,19,20,21,22],
    intensityMod: 0.92,
    avoidTypes: ['pr'],
    recommendedTypes: ['hypertrophy','buildup'],
    workoutTip: 'Shift from heavy singles to volume work (4×10–12). Slight fatigue is normal — do not chase PRs this week.',
    nutritionTip: 'Increase protein ~10%. Progesterone raises metabolism slightly. Keep carbs moderate, fats slightly higher.',
  },
  luteal_late: {
    label: 'Luteal · Late',
    color: 'var(--violet)',
    colorRaw: '#8f7cff',
    days: [23,24,25,26,27,28],
    intensityMod: 0.80,
    avoidTypes: ['pr','strength'],
    recommendedTypes: ['deload','recovery','endurance'],
    workoutTip: 'Reduce overall intensity 20–30%. Focus on technique, mobility, and low-rep accessory work. Extra rest days are fine.',
    nutritionTip: 'Magnesium and B6 reduce PMS symptoms. Dark chocolate is legitimately helpful. Slight caloric reduction eases bloating.',
  },
};

// ─────────────────────────────────────────────────────────────
// CYCLE INFERENCE
// ─────────────────────────────────────────────────────────────

export function inferCycleAnchor(periodDays = []) {
  if (!periodDays || periodDays.length === 0) return null;

  const sorted = [...periodDays].sort();

  const runs = [];
  let run = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = fromKey(run[run.length - 1]);
    const curr = fromKey(sorted[i]);
    const gap  = Math.round((curr - prev) / 86400000);
    if (gap <= 2) {
      run.push(sorted[i]);
    } else {
      runs.push(run);
      run = [sorted[i]];
    }
  }
  runs.push(run);

  const lastRun = runs[runs.length - 1];
  return fromKey(lastRun[0]);
}

export function getCyclePhase(date, anchor, cycleLen = 28) {
  if (!anchor) return null;
  const d = new Date(date); d.setHours(0,0,0,0);
  const a = new Date(anchor); a.setHours(0,0,0,0);
  const diff     = Math.round((d - a) / 86400000);
  const cycleDay = ((diff % cycleLen) + cycleLen) % cycleLen + 1;

  for (const [key, ph] of Object.entries(CYCLE_PHASES)) {
    if (ph.days.includes(cycleDay)) return { key, phase: ph, cycleDay };
  }
  return { key: 'luteal_late', phase: CYCLE_PHASES.luteal_late, cycleDay };
}

// ─────────────────────────────────────────────────────────────
// ACCESSORIES
// ─────────────────────────────────────────────────────────────

const ACCESSORIES = {
  'full gym': {
    squat:    [{ name:'Leg Press 3×12', muscle:'Quads' }, { name:'Bulgarian Split Squat 3×10', muscle:'Glutes' }, { name:'Leg Curl 3×12', muscle:'Hamstrings' }, { name:'Calf Raise 4×15', muscle:'Calves' }],
    bench:    [{ name:'Cable Fly 3×15', muscle:'Chest' }, { name:'Tricep Pushdown 4×12', muscle:'Triceps' }, { name:'Face Pull 3×20', muscle:'Rear Delts' }, { name:'Incline DB Press 3×12', muscle:'Upper Chest' }],
    deadlift: [{ name:'Romanian DL 3×10', muscle:'Hamstrings' }, { name:'Lat Pulldown 3×12', muscle:'Lats' }, { name:'Seated Row 3×12', muscle:'Mid Back' }, { name:'Back Extension 3×15', muscle:'Erectors' }],
    ohp:      [{ name:'Lateral Raise 4×15', muscle:'Side Delts' }, { name:'Arnold Press 3×12', muscle:'Shoulders' }, { name:'Skull Crusher 3×12', muscle:'Triceps' }, { name:'Band Pull-Apart 3×25', muscle:'Rear Delts' }],
    upper:    [{ name:'Pull-Up 3×8', muscle:'Lats' }, { name:'DB Row 3×12', muscle:'Back' }, { name:'Chest Fly 3×15', muscle:'Chest' }, { name:'Bicep Curl 3×15', muscle:'Biceps' }],
    lower:    [{ name:'Leg Press 4×12', muscle:'Quads' }, { name:'Hip Thrust 3×15', muscle:'Glutes' }, { name:'Leg Extension 3×15', muscle:'Quads' }, { name:'Seated Leg Curl 3×12', muscle:'Hamstrings' }],
  },
  'barbell + rack': {
    squat:    [{ name:'Good Morning 3×10', muscle:'Hamstrings' }, { name:'Barbell Lunge 3×10/leg', muscle:'Quads' }, { name:'Back Extension 3×15', muscle:'Erectors' }],
    bench:    [{ name:'Close-Grip Bench 3×10', muscle:'Triceps' }, { name:'Barbell Row 3×10', muscle:'Back' }, { name:'Floor Press 3×12', muscle:'Chest' }],
    deadlift: [{ name:'Romanian DL 3×10', muscle:'Hamstrings' }, { name:'Pendlay Row 3×8', muscle:'Back' }, { name:'Good Morning 3×12', muscle:'Lower Back' }],
    ohp:      [{ name:'Push Press 3×5', muscle:'Shoulders' }, { name:'Barbell Shrug 4×15', muscle:'Traps' }, { name:'Close-Grip OHP 3×10', muscle:'Triceps' }],
    upper:    [{ name:'Barbell Row 4×8', muscle:'Back' }, { name:'Close-Grip Bench 3×10', muscle:'Triceps' }, { name:'Barbell Curl 3×12', muscle:'Biceps' }],
    lower:    [{ name:'Barbell Lunge 3×10', muscle:'Quads' }, { name:'Romanian DL 3×10', muscle:'Hamstrings' }, { name:'Good Morning 3×12', muscle:'Lower Back' }],
  },
  dumbbells: {
    squat:    [{ name:'Goblet Squat 4×12', muscle:'Quads' }, { name:'DB Reverse Lunge 3×12/leg', muscle:'Glutes' }, { name:'DB Step-Up 3×12/leg', muscle:'Quads' }],
    bench:    [{ name:'DB Press 4×12', muscle:'Chest' }, { name:'DB Fly 3×15', muscle:'Chest' }, { name:'DB Tricep Extension 3×15', muscle:'Triceps' }],
    deadlift: [{ name:'DB Romanian DL 3×12', muscle:'Hamstrings' }, { name:'DB Row 4×12', muscle:'Back' }, { name:'DB Shrug 3×20', muscle:'Traps' }],
    ohp:      [{ name:'DB Shoulder Press 4×12', muscle:'Shoulders' }, { name:'Lateral Raise 4×15', muscle:'Side Delts' }, { name:'DB Front Raise 3×15', muscle:'Front Delts' }],
    upper:    [{ name:'DB Row 4×12', muscle:'Back' }, { name:'DB Curl 3×15', muscle:'Biceps' }, { name:'Lateral Raise 3×15', muscle:'Delts' }],
    lower:    [{ name:'DB Goblet Squat 4×15', muscle:'Quads' }, { name:'DB RDL 4×12', muscle:'Hamstrings' }, { name:'DB Hip Thrust 3×15', muscle:'Glutes' }],
  },
  bodyweight: {
    squat:    [{ name:'Bodyweight Squat 4×20', muscle:'Quads' }, { name:'Jump Squat 3×10', muscle:'Power' }, { name:'Wall Sit 3×45s', muscle:'Quads' }],
    bench:    [{ name:'Push-Up 4×20', muscle:'Chest' }, { name:'Diamond Push-Up 3×15', muscle:'Triceps' }, { name:'Pike Push-Up 3×12', muscle:'Shoulders' }],
    deadlift: [{ name:'Single-Leg RDL 3×12', muscle:'Hamstrings' }, { name:'Superman Hold 3×30s', muscle:'Back' }, { name:'Glute Bridge 4×20', muscle:'Glutes' }],
    ohp:      [{ name:'Pike Push-Up 4×12', muscle:'Shoulders' }, { name:'Handstand Hold 3×30s', muscle:'Shoulders' }, { name:'Tricep Dip 3×15', muscle:'Triceps' }],
    upper:    [{ name:'Push-Up Variations 4×15', muscle:'Chest' }, { name:'Inverted Row 3×12', muscle:'Back' }, { name:'Tricep Dip 3×15', muscle:'Triceps' }],
    lower:    [{ name:'Bulgarian Split Squat 3×15', muscle:'Quads' }, { name:'Hip Thrust 4×20', muscle:'Glutes' }, { name:'Single-Leg Glute Bridge 3×15', muscle:'Glutes' }],
  },
};

function getAccessories(liftName, equipment) {
  const eq = ACCESSORIES[equipment] || ACCESSORIES['full gym'];
  const l  = (liftName || '').toLowerCase();
  if (l.includes('squat')    && !l.includes('goblet'))               return eq.squat    || [];
  if (l.includes('bench'))                                            return eq.bench    || [];
  if (l.includes('deadlift') && !l.includes('romanian'))             return eq.deadlift || [];
  if (l.includes('ohp') || l.includes('overhead') || l.includes('press')) return eq.ohp || [];
  if (l.includes('upper'))                                            return eq.upper    || [];
  if (l.includes('lower') || l.includes('leg'))                      return eq.lower    || [];
  return eq.upper || [];
}

// ─────────────────────────────────────────────────────────────
// GOAL CONFIG + BASE PATTERNS
// ─────────────────────────────────────────────────────────────

function getGoalConfig(goal) {
  const c = {
    strength:    { sets:'5×5',  note:'Heavy neural adaptation — low reps, high intensity' },
    hypertrophy: { sets:'4×10', note:'Volume focus — moderate weight, higher reps'        },
    fat_loss:    { sets:'3×12', note:'Metabolic conditioning — high rep, shorter rest'    },
    general:     { sets:'4×8',  note:'Balanced strength and general conditioning'         },
    performance: { sets:'4×6',  note:'Power + sport conditioning balance'                 },
  };
  return c[goal] || c.general;
}

const BASE_PATTERNS = {
  strength: [
    { lift:'Back Squat',  type:'strength',    baseKey:'squat'    },
    { rest:true },
    { lift:'Bench Press', type:'strength',    baseKey:'bench'    },
    { lift:'Back Squat',  type:'hypertrophy', baseKey:'squat'    },
    { rest:true },
    { lift:'Deadlift',    type:'strength',    baseKey:'deadlift' },
    { rest:true },
    { lift:'OHP',         type:'strength',    baseKey:'ohp'      },
    { lift:'Bench Press', type:'hypertrophy', baseKey:'bench'    },
    { rest:true },
    { lift:'Back Squat',  type:'pr',          baseKey:'squat'    },
    { lift:'Deadlift',    type:'hypertrophy', baseKey:'deadlift' },
    { rest:true },
    { lift:'OHP',         type:'buildup',     baseKey:'ohp'      },
  ],
  hypertrophy: [
    { lift:'Back Squat',  type:'hypertrophy', baseKey:'squat'    },
    { lift:'Bench Press', type:'hypertrophy', baseKey:'bench'    },
    { rest:true },
    { lift:'Deadlift',    type:'strength',    baseKey:'deadlift' },
    { lift:'OHP',         type:'hypertrophy', baseKey:'ohp'      },
    { rest:true },
    { lift:'Back Squat',  type:'buildup',     baseKey:'squat'    },
    { rest:true },
    { lift:'Bench Press', type:'hypertrophy', baseKey:'bench'    },
    { lift:'Lower Body',  type:'hypertrophy', baseKey:'lower'    },
    { rest:true },
    { lift:'Deadlift',    type:'hypertrophy', baseKey:'deadlift' },
    { lift:'OHP',         type:'strength',    baseKey:'ohp'      },
    { rest:true },
  ],
  fat_loss: [
    { lift:'Back Squat',  type:'endurance',   baseKey:'squat'    },
    { lift:'Bench Press', type:'endurance',   baseKey:'bench'    },
    { rest:true },
    { lift:'Deadlift',    type:'strength',    baseKey:'deadlift' },
    { lift:'OHP',         type:'endurance',   baseKey:'ohp'      },
    { rest:true },
    { lift:'Upper Body',  type:'hypertrophy', baseKey:'upper'    },
    { rest:true },
    { lift:'Back Squat',  type:'endurance',   baseKey:'squat'    },
    { lift:'Bench Press', type:'endurance',   baseKey:'bench'    },
    { rest:true },
    { lift:'Deadlift',    type:'endurance',   baseKey:'deadlift' },
    { lift:'Recovery',    type:'recovery',    baseKey:'upper'    },
    { rest:true },
  ],
};
BASE_PATTERNS.general     = BASE_PATTERNS.strength;
BASE_PATTERNS.performance = BASE_PATTERNS.hypertrophy;

// ─────────────────────────────────────────────────────────────
// CALORIC DELTA
// ─────────────────────────────────────────────────────────────

function getCaloricDelta(bulkCutBlock, isRest) {
  if (!bulkCutBlock) return null;
  const t = bulkCutBlock.type;
  if (t === 'bulk')     return isRest ? '+100 kcal' : '+350 kcal';
  if (t === 'cut')      return isRest ? '-200 kcal' : '-300 kcal';
  if (t === 'maintain') return '±0 kcal';
  return null;
}

// ─────────────────────────────────────────────────────────────
// SCHEDULE BUILDER
// ─────────────────────────────────────────────────────────────

export function buildSchedule(athlete, nutrition = {}) {
  const today      = today0();
  const goalConfig = getGoalConfig(athlete?.goal);
  const pattern    = BASE_PATTERNS[athlete?.goal] || BASE_PATTERNS.strength;

  const isFemale = athlete?.gender === 'female';
  const useCycle = isFemale && athlete?.cycleTracking === true;

  const periodDays    = Array.isArray(nutrition?.periodDays)    ? nutrition.periodDays    : [];
  const bulkCutBlocks = Array.isArray(nutrition?.bulkCutBlocks) ? nutrition.bulkCutBlocks : [];

  const cycleAnchor = useCycle ? inferCycleAnchor(periodDays) : null;

  function getActiveBulkCut(date) {
    const k = toKey(date);
    return bulkCutBlocks.find(b => k >= b.start && k <= b.end) || null;
  }

  const days = [];

  for (let i = 0; i < 14; i++) {
    const date    = addDays(today, i);
    const dateKey = toKey(date);
    const p       = { ...pattern[i % pattern.length] };

    const cycleInfo = (useCycle && cycleAnchor)
      ? getCyclePhase(date, cycleAnchor)
      : null;

    const bulkCutBlock = getActiveBulkCut(date);
    const caloricDelta = getCaloricDelta(bulkCutBlock, !!p.rest);

    if (cycleInfo && !p.rest) {
      const ph = cycleInfo.phase;
      if (ph.avoidTypes.includes(p.type) && ph.recommendedTypes.length) {
        p.type = ph.recommendedTypes[0];
      }
    }

    const accessories = (!p.rest && p.baseKey)
      ? getAccessories(p.baseKey, athlete?.equipment).map(a => ({ ...a, done: false }))
      : [];

    let reason = '';
    if (p.rest) {
      reason = 'CNS recovery day. Keep protein high and prioritise sleep. Light walking is fine.';
    } else {
      const typeLabel  = WORKOUT_TYPES[p.type]?.label || p.type;
      const cyclePart  = cycleInfo
        ? ` Cycle day ${cycleInfo.cycleDay} (${cycleInfo.phase.label}) — ${cycleInfo.phase.workoutTip}`
        : '';
      const injuryPart = athlete?.considerations
        ? ` ⚠ ${athlete.considerations}`
        : '';
      reason = `${typeLabel} — ${goalConfig.note}.${cyclePart}${injuryPart}`;
    }

    let nutr = '';
    if (p.rest) {
      nutr = `Recovery day — protein ≥1g/lb bodyweight.${caloricDelta ? ` Caloric target: ${caloricDelta}.` : ''} Hydration priority.`;
    } else if (cycleInfo && bulkCutBlock) {
      nutr = `${cycleInfo.phase.nutritionTip}  |  ${bulkCutBlock.type} phase: ${caloricDelta}.`;
    } else if (cycleInfo) {
      nutr = cycleInfo.phase.nutritionTip;
    } else if (bulkCutBlock) {
      nutr = bulkCutBlock.type === 'bulk'
        ? `Bulk surplus ${caloricDelta}. Pre-workout complex carbs 90 min before session.`
        : bulkCutBlock.type === 'cut'
        ? `Deficit day (${caloricDelta}). Keep protein high ≥${athlete?.bodyweight ?? '—'}g. Time carbs around the session.`
        : 'Maintenance calories. Balanced macros around your training window.';
    } else {
      nutr = 'No active nutrition block — set one on the Nutrition page to get daily calorie targets here.';
    }

    days.push({
      dateKey, date,
      dayNum:   date.getDate(),
      month:    date.getMonth(),
      year:     date.getFullYear(),
      weekday:  date.getDay(),
      isToday:  i === 0,
      dayLabel: `${DAY_SHORT[date.getDay()]} ${MONTH_NAMES[date.getMonth()]} ${date.getDate()}`,

      lift:        p.lift     || null,
      type:        p.type     || null,
      baseKey:     p.baseKey  || null,
      rest:        !!p.rest,
      accessories,
      reason,
      nutr,

      bulkCutBlock,
      caloricDelta,

      cycleInfo,
      cycleOptIn:   useCycle,
      hasCycleData: useCycle && cycleAnchor !== null,
    });
  }

  return days;
}

// ─────────────────────────────────────────────────────────────
// AI CONTEXT BUILDER
// ─────────────────────────────────────────────────────────────

export function buildCalendarAIContext(athlete, schedule, blockedDays, nutrition) {
  const todayKey      = toKey(today0());
  const bulkCutBlocks = nutrition?.bulkCutBlocks || [];
  const todayBlock    = bulkCutBlocks.find(b => todayKey >= b.start && todayKey <= b.end);

  const useCycle    = athlete?.gender === 'female' && athlete?.cycleTracking;
  const cycleAnchor = useCycle ? inferCycleAnchor(nutrition?.periodDays || []) : null;
  const todayCycle  = cycleAnchor ? getCyclePhase(today0(), cycleAnchor) : null;

  const upcomingLines = schedule
    .filter(d => !d.rest && d.lift)
    .slice(0, 6)
    .map(d => {
      const cyc = d.cycleInfo ? ` [${d.cycleInfo.phase.label} ×${d.cycleInfo.phase.intensityMod}]` : '';
      const nut = d.caloricDelta ? ` [${d.caloricDelta}]` : '';
      return `  ${d.dayLabel}: ${d.lift} (${d.type})${cyc}${nut}`;
    })
    .join('\n');

  const blocksText = bulkCutBlocks.length
    ? bulkCutBlocks.map(b => `  ${b.type.toUpperCase()}: ${b.start} → ${b.end}`).join('\n')
    : '  None set.';

  const systemPrompt = `You are an elite strength and conditioning coach. Give EXACTLY 3 bullet points, each under 30 words. Be specific and reference the athlete's actual data.
• [Load / intensity recommendation for the next session]
• [Schedule adjustment or exercise swap based on current data]
• [Recovery or nutrition priority this week]`;

  const userPrompt = `ATHLETE
Name: ${athlete?.firstName} ${athlete?.lastName} | Age: ${athlete?.age} | ${athlete?.bodyweight}lb | Goal: ${athlete?.goal}
Equipment: ${athlete?.equipment}
Considerations / injuries: ${athlete?.considerations || 'none'}

NUTRITION PHASE TODAY
${todayBlock ? `${todayBlock.type.toUpperCase()} (${todayBlock.start} – ${todayBlock.end})` : 'No active block set'}

MENSTRUAL CYCLE
Tracking enabled: ${useCycle ? 'yes' : 'no'}
${todayCycle
  ? `Today — ${todayCycle.phase.label}, cycle day ${todayCycle.cycleDay}, intensity modifier ×${todayCycle.phase.intensityMod}`
  : useCycle ? 'Opted in but no period data logged yet' : 'N/A'}

NEXT 6 TRAINING DAYS
${upcomingLines || '  None.'}

BULK / CUT BLOCKS
${blocksText}

BLOCKED DAYS THIS 2-WEEK WINDOW: ${blockedDays}`;

  return { system: systemPrompt, user: userPrompt };
}

// ─────────────────────────────────────────────────────────────
// AI CALL
// ─────────────────────────────────────────────────────────────

async function askGPT(systemPrompt, userPrompt) {
  const res = await fetch('/api/openai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 900,
      messages: [
        { role:'system', content:systemPrompt },
        { role:'user',   content:userPrompt   },
      ],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'OpenAI API error');
  return data.output;
}

// ─────────────────────────────────────────────────────────────
// SMALL PILL COMPONENTS
// ─────────────────────────────────────────────────────────────

function WorkoutTypePill({ type }) {
  const wt = WORKOUT_TYPES[type];
  if (!wt) return null;
  return (
    <span className="cal-type-pill" style={{ color:wt.color, background:wt.bg, borderColor:wt.border }}>
      {wt.label}
    </span>
  );
}

function CyclePhasePill({ cycleInfo }) {
  if (!cycleInfo) return null;
  const { phase, cycleDay } = cycleInfo;
  return (
    <span
      className="cal-cycle-pill"
      style={{ color:phase.color, borderColor:phase.colorRaw+'55', background:phase.colorRaw+'1a' }}
    >
      {phase.label} · D{cycleDay}
      {phase.intensityMod < 1 && ` · ×${phase.intensityMod}`}
    </span>
  );
}

function BulkCutPill({ bulkCutBlock, caloricDelta }) {
  if (!bulkCutBlock) return null;
  const map = {
    bulk:     { color:'var(--mint)',   border:'rgba(87,240,192,0.35)',  bg:'rgba(87,240,192,0.12)'  },
    cut:      { color:'var(--orange)', border:'rgba(255,159,99,0.35)',  bg:'rgba(255,159,99,0.12)'  },
    maintain: { color:'var(--blue)',   border:'rgba(87,165,255,0.35)',  bg:'rgba(87,165,255,0.12)'  },
  };
  const c = map[bulkCutBlock.type] || map.maintain;
  return (
    <span className="cal-nutr-pill" style={{ color:c.color, borderColor:c.border, background:c.bg }}>
      {bulkCutBlock.type.charAt(0).toUpperCase() + bulkCutBlock.type.slice(1)}
      {caloricDelta ? ` · ${caloricDelta}` : ''}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// CONTEXT BANNERS
// ─────────────────────────────────────────────────────────────

function ContextBanners({ todayCycle, todayBlock, athlete, hasCycleData, useCycle }) {
  return (
    <div className="cal-context-banners">

      {todayBlock ? (
        <div className={`cal-banner cal-banner-${todayBlock.type}`}>
          <div className="cal-banner-icon">
            {todayBlock.type === 'bulk' ? '↑' : todayBlock.type === 'cut' ? '↓' : '→'}
          </div>
          <div className="cal-banner-body">
            <div className="cal-banner-label">Nutrition phase active</div>
            <div className="cal-banner-title">
              {todayBlock.type.charAt(0).toUpperCase() + todayBlock.type.slice(1)}
            </div>
          </div>
          <div className="cal-banner-right">
            <div className={`cal-banner-chip cal-banner-chip-${todayBlock.type}`}>
              {todayBlock.type === 'bulk' ? '+350 kcal / training day' :
               todayBlock.type === 'cut'  ? '−300 kcal / training day' :
               'Maintenance calories'}
            </div>
            <div className="cal-banner-meta">{todayBlock.start} → {todayBlock.end}</div>
          </div>
        </div>
      ) : (
        <div className="cal-banner cal-banner-empty">
          <div className="cal-banner-icon">🥗</div>
          <div className="cal-banner-body">
            <div className="cal-banner-label">No active nutrition block</div>
            <div className="cal-banner-setup-text">
              Set a bulk, cut, or maintain block on the Nutrition page — calorie targets will appear on every training day.
            </div>
          </div>
        </div>
      )}

      {useCycle && hasCycleData && todayCycle && (
        <div
          className="cal-banner cal-banner-cycle"
          style={{
            borderColor: todayCycle.phase.colorRaw + '44',
            background:  todayCycle.phase.colorRaw + '0e',
          }}
        >
          <div className="cal-banner-icon" style={{ color: todayCycle.phase.color }}>◉</div>
          <div className="cal-banner-body">
            <div className="cal-banner-label" style={{ color: todayCycle.phase.color }}>
              Cycle phase today
            </div>
            <div className="cal-banner-title" style={{ color: todayCycle.phase.color }}>
              {todayCycle.phase.label}
              <span className="cal-banner-cycle-day"> · day {todayCycle.cycleDay} of 28</span>
            </div>
          </div>
          <div className="cal-banner-right">
            {todayCycle.phase.intensityMod < 1 && (
              <div
                className="cal-banner-chip"
                style={{
                  color: todayCycle.phase.color,
                  borderColor: todayCycle.phase.colorRaw + '55',
                  background:  todayCycle.phase.colorRaw + '15',
                }}
              >
                Intensity ×{todayCycle.phase.intensityMod} today
              </div>
            )}
            <div className="cal-banner-meta">{todayCycle.phase.workoutTip}</div>
          </div>
        </div>
      )}

      {useCycle && !hasCycleData && (
        <div className="cal-banner cal-banner-setup">
          <div className="cal-banner-icon">💧</div>
          <div className="cal-banner-body">
            <div className="cal-banner-label">Cycle tracking is on</div>
            <div className="cal-banner-setup-text">
              Log period days on the Nutrition page — your calendar will automatically adjust workout intensity and type to each phase.
            </div>
          </div>
        </div>
      )}

      {athlete?.considerations && (
        <div className="cal-banner cal-banner-warn">
          <div className="cal-banner-icon">⚠</div>
          <div className="cal-banner-body">
            <div className="cal-banner-label">Active consideration</div>
            <div className="cal-banner-setup-text">{athlete.considerations}</div>
          </div>
        </div>
      )}

    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// DAY MODAL  ← fix: athlete is now a named prop
// ─────────────────────────────────────────────────────────────

function DayModal({ day, athlete, onClose, onBlock, onStartLift, onToggleAcc, accDone }) {
  const wt        = day.type ? WORKOUT_TYPES[day.type] : null;
  const accs      = day.accessories || [];
  const dayAcc    = accDone[day.dateKey] || {};
  const doneCount = Object.values(dayAcc).filter(Boolean).length;

  return (
    <div
      className="cal-modal-overlay"
      onClick={e => e.target.classList.contains('cal-modal-overlay') && onClose()}
    >
      <div className="cal-modal">

        {/* Header */}
        <div className="cal-modal-head">
          <div>
            <div className="cal-modal-date">
              {day.dayLabel}
              {day.isToday && <span className="cal-today-tag">Today</span>}
            </div>
            <div className="cal-modal-title">
              {day.rest ? 'Rest Day' : (day.lift || '—')}
            </div>
          </div>
          <button className="cal-modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Badge row */}
        <div className="cal-modal-badges">
          {wt && <WorkoutTypePill type={day.type} />}
          {day.cycleOptIn && <CyclePhasePill cycleInfo={day.cycleInfo} />}
          {!day.rest && <BulkCutPill bulkCutBlock={day.bulkCutBlock} caloricDelta={day.caloricDelta} />}
        </div>

        {/* Cycle phase insight */}
        {day.cycleOptIn && day.cycleInfo && (
          <div
            className="cal-modal-section cal-modal-section-cycle"
            style={{
              borderColor: day.cycleInfo.phase.colorRaw + '44',
              background:  day.cycleInfo.phase.colorRaw + '0d',
            }}
          >
            <div
              className="cal-modal-section-label"
              style={{ color: day.cycleInfo.phase.color }}
            >
              {day.cycleInfo.phase.label} · Cycle day {day.cycleInfo.cycleDay}
            </div>
            <p className="cal-modal-body">{day.cycleInfo.phase.workoutTip}</p>
            {day.cycleInfo.phase.intensityMod < 1 && (
              <div
                className="cal-intensity-chip"
                style={{
                  color: day.cycleInfo.phase.color,
                  borderColor: day.cycleInfo.phase.colorRaw + '55',
                  background:  day.cycleInfo.phase.colorRaw + '12',
                }}
              >
                Target intensity: ~{Math.round(day.cycleInfo.phase.intensityMod * 100)}% of normal working weights
              </div>
            )}
            <p className="cal-modal-body-muted" style={{ marginTop:8 }}>
              <strong style={{ color: day.cycleInfo.phase.color }}>Nutrition: </strong>
              {day.cycleInfo.phase.nutritionTip}
            </p>
          </div>
        )}

        {/* Bulk / cut block detail */}
        {day.bulkCutBlock && (
          <div className={`cal-modal-section cal-modal-nutr-${day.bulkCutBlock.type}`}>
            <div className={`cal-modal-section-label cal-nutr-label-${day.bulkCutBlock.type}`}>
              {day.bulkCutBlock.type.charAt(0).toUpperCase() + day.bulkCutBlock.type.slice(1)} phase
              {day.caloricDelta && ` · ${day.caloricDelta} today`}
            </div>
            <p className="cal-modal-body">{day.nutr}</p>
          </div>
        )}

        {/* Why scheduled */}
        <div className="cal-modal-section">
          <div className="cal-modal-section-label">Why this is scheduled</div>
          <p className="cal-modal-body">{day.reason}</p>
        </div>

        {/* Nutrition fallback */}
        {!day.bulkCutBlock && !day.cycleInfo && (
          <div className="cal-modal-section">
            <div className="cal-modal-section-label">Nutrition today</div>
            <p className="cal-modal-body">{day.nutr}</p>
          </div>
        )}

        {/* Accessories */}
        {accs.length > 0 && (
          <div className="cal-modal-section">
            <div className="cal-modal-section-label-row">
              <span className="cal-modal-section-label">
                Accessories · {athlete?.equipment || 'full gym'}
              </span>
              <span className="cal-modal-acc-count">{doneCount}/{accs.length} done</span>
            </div>
            <div className="cal-modal-acc-list">
              {accs.map((acc, idx) => {
                const done = !!dayAcc[idx];
                return (
                  <div
                    key={idx}
                    className={`cal-acc-row ${done ? 'cal-acc-done' : ''}`}
                    onClick={() => onToggleAcc(day.dateKey, idx)}
                  >
                    <div className={`cal-acc-check ${done ? 'cal-acc-check-done' : ''}`}>
                      {done ? '✓' : ''}
                    </div>
                    <div className="cal-acc-info">
                      <div className="cal-acc-name">{acc.name}</div>
                      <div className="cal-acc-muscle">{acc.muscle}</div>
                    </div>
                    <div className="cal-acc-status">{done ? 'Done' : 'Tap'}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="cal-modal-actions">
          <button className="cal-modal-btn cal-modal-btn-ghost" onClick={onClose}>Close</button>
          <button className="cal-modal-btn cal-modal-btn-block" onClick={() => { onBlock(day.dateKey); onClose(); }}>
            Block day
          </button>
          {!day.rest && day.lift && (
            <button className="cal-modal-btn cal-modal-btn-start" onClick={() => { onStartLift(day.lift); onClose(); }}>
              Start lift ›
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// AI INSIGHT PANEL
// ─────────────────────────────────────────────────────────────

function AIInsightPanel({ athlete, schedule, blockedDays, nutrition }) {
  const [lines,   setLines]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const hasFetched = useRef(false);

  const runFetch = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const ctx    = buildCalendarAIContext(athlete, schedule, blockedDays, nutrition);
      const raw    = await askGPT(ctx.system, ctx.user);
      const parsed = raw
        .split('\n')
        .filter(l => l.trim().startsWith('•'))
        .map(l => l.trim().replace(/^•\s*/, ''));
      setLines(parsed.length ? parsed : [raw]);
    } catch {
      setError('Could not reach AI — check your connection.');
    }
    setLoading(false);
  }, [athlete, schedule, blockedDays, nutrition]);

  useEffect(() => {
    if (!hasFetched.current) { hasFetched.current = true; runFetch(); }
  }, [runFetch]);

  const dotColors = ['var(--mint)', 'var(--blue)', 'var(--orange)'];

  const todayDay   = schedule[0];
  const blockType  = todayDay?.bulkCutBlock?.type;
  const cyclePhase = todayDay?.cycleInfo?.phase;

  return (
    <div className="cal-ai-panel">
      <div className="cal-ai-panel-head">
        <div className="cal-ai-panel-title">
          <span className="cal-ai-spark">✦</span>
          AI Schedule Insight
        </div>
        <button className="cal-ai-refresh" onClick={runFetch} disabled={loading}>
          {loading ? 'Thinking…' : 'Refresh'}
        </button>
      </div>

      <div className="cal-ai-context-strip">
        {blockType && (
          <span className={`cal-ai-ctx-chip cal-ai-ctx-${blockType}`}>
            {blockType.charAt(0).toUpperCase() + blockType.slice(1)} phase
          </span>
        )}
        {cyclePhase && (
          <span
            className="cal-ai-ctx-chip"
            style={{
              color: cyclePhase.color,
              borderColor: cyclePhase.colorRaw + '44',
              background:  cyclePhase.colorRaw + '12',
            }}
          >
            {cyclePhase.label}
          </span>
        )}
        {athlete?.considerations && (
          <span className="cal-ai-ctx-chip cal-ai-ctx-warn">⚠ Injury / consideration</span>
        )}
        {!blockType && !cyclePhase && !athlete?.considerations && (
          <span className="cal-ai-ctx-chip" style={{ color:'var(--muted)', borderColor:'rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.05)' }}>
            Standard profile
          </span>
        )}
      </div>

      {loading && (
        <div className="cal-ai-loading">
          <div className="cal-ai-spinner" />
          <span>Analysing your schedule…</span>
        </div>
      )}
      {error && <p className="cal-ai-error">{error}</p>}
      {!loading && !error && lines.map((line, i) => (
        <div key={i} className="cal-ai-row">
          <div className="cal-ai-dot" style={{ background: dotColors[i] || 'var(--muted)' }} />
          <p className="cal-ai-text">{line}</p>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// LEGEND
// ─────────────────────────────────────────────────────────────

function CalendarLegend({ useCycle, hasCycleData }) {
  return (
    <div className="cal-legend">
      <div className="cal-legend-group">
        <span className="cal-legend-label">Workout type</span>
        {Object.entries(WORKOUT_TYPES).slice(0,5).map(([k, wt]) => (
          <div key={k} className="cal-legend-item">
            <div className="cal-legend-dot" style={{ background:wt.color }} />
            <span>{wt.label}</span>
          </div>
        ))}
      </div>

      {useCycle && hasCycleData && (
        <div className="cal-legend-group">
          <span className="cal-legend-label">Cycle phase (left stripe)</span>
          {Object.entries(CYCLE_PHASES).map(([k, ph]) => (
            <div key={k} className="cal-legend-item">
              <div className="cal-legend-stripe" style={{ background:ph.color }} />
              <span>{ph.label}</span>
            </div>
          ))}
        </div>
      )}

      <div className="cal-legend-group">
        <span className="cal-legend-label">Nutrition (right stripe)</span>
        {[
          { label:'Bulk',     color:'var(--mint)'   },
          { label:'Cut',      color:'var(--orange)' },
          { label:'Maintain', color:'var(--blue)'   },
        ].map(({ label, color }) => (
          <div key={label} className="cal-legend-item">
            <div className="cal-legend-stripe" style={{ background:color }} />
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// WEEK STRIP
// ─────────────────────────────────────────────────────────────

function WeekStrip({ days, blocked, onDayClick, onBlockToggle, accDone }) {
  return (
    <div className="cal-week-strip">
      {days.map(day => {
        const isBlocked = blocked.has(day.dateKey);
        const wt        = day.type ? WORKOUT_TYPES[day.type] : null;
        const accs      = day.accessories || [];
        const dayAcc    = accDone[day.dateKey] || {};
        const doneAcc   = Object.values(dayAcc).filter(Boolean).length;

        const cycleColor   = (day.cycleOptIn && day.cycleInfo) ? day.cycleInfo.phase.colorRaw : null;
        const bulkCutColor =
          day.bulkCutBlock?.type === 'bulk'     ? '#57f0c0' :
          day.bulkCutBlock?.type === 'cut'      ? '#ff9f63' :
          day.bulkCutBlock?.type === 'maintain' ? '#57a5ff' : null;

        return (
          <div
            key={day.dateKey}
            className={[
              'cal-day-card',
              day.isToday  ? 'cal-day-today'  : '',
              isBlocked    ? 'cal-day-blocked' : '',
              day.rest     ? 'cal-day-rest'    : '',
            ].filter(Boolean).join(' ')}
            onClick={() => !isBlocked && onDayClick(day)}
          >
            <button
              className={`cal-block-btn ${isBlocked ? 'cal-block-btn-on' : ''}`}
              title={isBlocked ? 'Unblock day' : 'Block day'}
              onClick={e => { e.stopPropagation(); onBlockToggle(day.dateKey); }}
            >
              {isBlocked ? '↩' : '×'}
            </button>

            {cycleColor && !isBlocked && (
              <div className="cal-cycle-stripe" style={{ background: cycleColor }} />
            )}

            {bulkCutColor && !isBlocked && (
              <div className="cal-bulkcut-stripe" style={{ background: bulkCutColor }} />
            )}

            <div className="cal-day-header">
              <span className="cal-day-short">{DAY_SHORT[day.weekday]}</span>
              <span className={`cal-day-num ${day.isToday ? 'cal-day-num-today' : ''}`}>
                {day.dayNum}
              </span>
            </div>

            {!isBlocked && day.cycleOptIn && day.cycleInfo && (
              <div
                className="cal-card-cycle-label"
                style={{ color: cycleColor || 'var(--muted)' }}
              >
                {day.cycleInfo.phase.label}
              </div>
            )}

            {isBlocked ? (
              <div className="cal-day-blocked-label">Blocked</div>
            ) : day.rest ? (
              <>
                <div className="cal-day-rest-label">Rest</div>
                {bulkCutColor && (
                  <div className="cal-day-nutr" style={{ color: bulkCutColor }}>
                    {day.bulkCutBlock.type.charAt(0).toUpperCase() + day.bulkCutBlock.type.slice(1)}
                    {day.caloricDelta ? ` · ${day.caloricDelta}` : ''}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="cal-day-lift">{day.lift}</div>

                {wt && (
                  <div className="cal-day-type" style={{ color:wt.color }}>
                    {wt.label}
                  </div>
                )}

                {bulkCutColor && (
                  <div className="cal-day-nutr" style={{ color: bulkCutColor }}>
                    {day.bulkCutBlock.type.charAt(0).toUpperCase() + day.bulkCutBlock.type.slice(1)}
                    {day.caloricDelta ? ` · ${day.caloricDelta}` : ''}
                  </div>
                )}

                {accs.length > 0 && (
                  <div className="cal-day-acc-progress">
                    <div
                      className="cal-day-acc-bar"
                      style={{ width:`${(doneAcc / accs.length) * 100}%` }}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────

export default function CalendarPage({
  athlete,
  nutrition = {},
  goToScreen,
}) {
  const today = useMemo(() => today0(), []);

  const [schedule,   setSchedule]   = useState(() => buildSchedule(athlete, nutrition));
  const [blocked,    setBlocked]    = useState(new Set());
  const [accDone,    setAccDone]    = useState({});
  const [modalDay,   setModalDay]   = useState(null);
  const [weekOffset, setWeekOffset] = useState(0);

  useEffect(() => {
    setSchedule(buildSchedule(athlete, nutrition));
  }, [athlete, nutrition]);

  const useCycle = athlete?.gender === 'female' && athlete?.cycleTracking === true;
  const cycleAnchor = useMemo(
    () => useCycle ? inferCycleAnchor(nutrition?.periodDays || []) : null,
    [useCycle, nutrition?.periodDays]
  );
  const hasCycleData = useCycle && cycleAnchor !== null;
  const todayCycle   = useMemo(
    () => hasCycleData ? getCyclePhase(today, cycleAnchor) : null,
    [hasCycleData, today, cycleAnchor]
  );

  const todayBlock = useMemo(() => {
    const k = toKey(today);
    return (nutrition?.bulkCutBlocks || []).find(b => k >= b.start && k <= b.end) || null;
  }, [nutrition?.bulkCutBlocks, today]);

  const visibleDays = useMemo(
    () => schedule.slice(weekOffset * 7, weekOffset * 7 + 7),
    [schedule, weekOffset]
  );

  const weekLabel = useMemo(() => {
    const s = addDays(today, weekOffset * 7);
    const e = addDays(today, weekOffset * 7 + 6);
    return `${MONTH_NAMES[s.getMonth()]} ${s.getDate()} – ${MONTH_NAMES[e.getMonth()]} ${e.getDate()}`;
  }, [today, weekOffset]);

  const toggleBlock = useCallback(dateKey => {
    setBlocked(prev => {
      const next = new Set(prev);
      next.has(dateKey) ? next.delete(dateKey) : next.add(dateKey);
      return next;
    });
  }, []);

  const toggleAcc = useCallback((dateKey, idx) => {
    setAccDone(prev => ({
      ...prev,
      [dateKey]: { ...(prev[dateKey] || {}), [idx]: !(prev[dateKey]?.[idx]) },
    }));
  }, []);

  return (
    <div className="screen cal-screen">

      <div className="cal-page-header">
        <div>
          <h1 className="page-title gradient-purple">Training Calendar</h1>
          <p className="page-sub">
            {athlete?.firstName ? `${athlete.firstName}'s` : 'Your'} {athlete?.goal || 'training'} plan ·{' '}
            {athlete?.equipment || 'full gym'} ·{' '}
            {useCycle
              ? hasCycleData ? 'Cycle-optimised ✓' : 'Cycle tracking on — log period to activate'
              : 'Standard schedule'}
          </p>
        </div>
      </div>

      <ContextBanners
        todayCycle={todayCycle}
        todayBlock={todayBlock}
        athlete={athlete}
        hasCycleData={hasCycleData}
        useCycle={useCycle}
      />

      <div className="cal-week-nav">
        <button className="cal-week-btn" disabled={weekOffset === 0} onClick={() => setWeekOffset(0)}>
          ← Week 1
        </button>
        <div className="cal-week-label">{weekLabel}</div>
        <button className="cal-week-btn" disabled={weekOffset === 1} onClick={() => setWeekOffset(1)}>
          Week 2 →
        </button>
      </div>

      <WeekStrip
        days={visibleDays}
        blocked={blocked}
        onDayClick={setModalDay}
        onBlockToggle={toggleBlock}
        accDone={accDone}
      />

      <CalendarLegend useCycle={useCycle} hasCycleData={hasCycleData} />

      <AIInsightPanel
        athlete={athlete}
        schedule={schedule}
        blockedDays={blocked.size}
        nutrition={nutrition}
      />

      {modalDay && (
        <DayModal
          day={modalDay}
          athlete={athlete}
          onClose={() => setModalDay(null)}
          onBlock={toggleBlock}
          onStartLift={() => goToScreen?.('liveWorkout')}
          onToggleAcc={toggleAcc}
          accDone={accDone}
        />
      )}
    </div>
  );
}
