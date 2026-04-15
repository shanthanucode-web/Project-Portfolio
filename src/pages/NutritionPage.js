import { useState, useMemo, useCallback } from 'react';
import '../styles/nutrition.css';

/* ─── date helpers ─── */
function toKey(d) {
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}
function fromKey(k) {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function fmtShort(d) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function fmtMonthYear(y, m) {
  return new Date(y, m, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}
function buildCells(year, month) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const cells = [];
  for (let i = 0; i < first.getDay(); i++) cells.push(null);
  for (let d = 1; d <= last.getDate(); d++) cells.push(new Date(year, month, d));
  return cells;
}

/* ─── period inference ─── */
function inferPeriods(markedKeys) {
  if (markedKeys.size === 0) return [];
  const sorted = [...markedKeys].sort();
  const periods = [];
  let cur = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = fromKey(cur[cur.length - 1]);
    const curr = fromKey(sorted[i]);
    if ((curr - prev) / 86400000 <= 2) {
      cur.push(sorted[i]);
    } else {
      periods.push(cur);
      cur = [sorted[i]];
    }
  }
  periods.push(cur);
  return periods;
}

function computePeriodMeta(markedKeys) {
  const periods = inferPeriods(markedKeys);
  if (periods.length === 0) return { periods, avgCycle: 28, avgLen: 5 };
  const avgLen = Math.round(
    periods.map((p) => p.length).reduce((s, l) => s + l, 0) / periods.length
  );
  let avgCycle = 28;
  if (periods.length >= 2) {
    const gaps = [];
    for (let i = 1; i < periods.length; i++) {
      const a = fromKey(periods[i - 1][0]);
      const b = fromKey(periods[i][0]);
      gaps.push(Math.round((b - a) / 86400000));
    }
    avgCycle = Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length);
  }
  return { periods, avgCycle, avgLen };
}

function buildPredictedKeys(markedKeys) {
  const { periods, avgCycle, avgLen } = computePeriodMeta(markedKeys);
  if (periods.length === 0) return new Set();
  const predicted = new Set();
  const lastStart = fromKey(periods[periods.length - 1][0]);
  for (let c = 1; c <= 8; c++) {
    const ps = addDays(lastStart, avgCycle * c);
    for (let i = 0; i < avgLen; i++) {
      const k = toKey(addDays(ps, i));
      if (!markedKeys.has(k)) predicted.add(k);
    }
  }
  return predicted;
}

/* ─── constants ─── */
const DURATIONS = [
  { label: '2 wks', days: 14 },
  { label: '4 wks', days: 28 },
  { label: '6 wks', days: 42 },
  { label: '8 wks', days: 56 },
  { label: '12 wks', days: 84 },
  { label: 'Custom', days: 0 },
];
const DAY_HEADERS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/* ─── Droplet SVG ─── */
function DropletIcon({ filled, predicted }) {
  const fill = filled ? 'rgba(212,83,126,0.9)' : 'none';
  const stroke = filled
    ? 'rgba(212,83,126,1)'
    : predicted
    ? 'rgba(212,83,126,0.45)'
    : 'rgba(212,83,126,0.35)';
  return (
    <svg viewBox="0 0 12 14" width="10" height="10" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
      <path
        d="M6 1 C6 1 1.5 6 1.5 9 C1.5 11.5 3.5 13 6 13 C8.5 13 10.5 11.5 10.5 9 C10.5 6 6 1 6 1Z"
        fill={fill}
        stroke={stroke}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ─── NEW: Calorie calculator helper ─── */
function calcDailyCalories(athlete, cycleType) {
  // Mifflin-St Jeor BMR
  const weightKg = (athlete.bodyweight || 130) * 0.453592;
  const heightCm = ((athlete.heightFt || 5) * 12 + (athlete.heightIn || 4)) * 2.54;
  const age = athlete.age || 25;
  const isMale = athlete.gender === 'male';

  let bmr;
  if (isMale) {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  } else {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
  }

  // Moderate activity multiplier (3-5 days/week lifting)
  const tdee = Math.round(bmr * 1.55);

  // Adjust for cycle type
  if (cycleType === 'bulk') return tdee + 300;
  if (cycleType === 'cut') return tdee - 300;
  return tdee; // maintain or none
}

/* ─── NEW: Calorie Ring SVG ─── */
function CalorieRing({ consumed, goal }) {
  const radius = 80;
  const stroke = 10;
  const normalised = radius - stroke / 2;
  const circumference = 2 * Math.PI * normalised;
  const pct = Math.min(consumed / goal, 1);
  const offset = circumference * (1 - pct);
  const isOver = consumed > goal;

  const ringColor = isOver
    ? '#ff9f63'
    : pct > 0.85
    ? '#ffd84d'
    : '#57f0c0';

  return (
    <svg width={radius * 2} height={radius * 2} style={{ display: 'block' }}>
      {/* Track */}
      <circle
        cx={radius}
        cy={radius}
        r={normalised}
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth={stroke}
      />
      {/* Fill */}
      <circle
        cx={radius}
        cy={radius}
        r={normalised}
        fill="none"
        stroke={ringColor}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${radius} ${radius})`}
        style={{ transition: 'stroke-dashoffset 0.5s ease, stroke 0.4s ease' }}
      />
      {/* Centre text */}
      <text
        x={radius}
        y={radius - 10}
        textAnchor="middle"
        fill="#f7f9ff"
        fontSize="22"
        fontWeight="700"
        fontFamily="'Space Grotesk', sans-serif"
      >
        {consumed.toLocaleString()}
      </text>
      <text
        x={radius}
        y={radius + 10}
        textAnchor="middle"
        fill="rgba(216,226,255,0.56)"
        fontSize="11"
        fontWeight="600"
        fontFamily="'Inter', sans-serif"
      >
        of {goal.toLocaleString()} kcal
      </text>
      <text
        x={radius}
        y={radius + 26}
        textAnchor="middle"
        fill={ringColor}
        fontSize="11"
        fontWeight="700"
        fontFamily="'Inter', sans-serif"
      >
        {isOver ? `+${(consumed - goal).toLocaleString()} over` : `${(goal - consumed).toLocaleString()} left`}
      </text>
    </svg>
  );
}

/* ─── NEW: Calorie Tracker Component ─── */
function CalorieTracker({ athlete, cycleType }) {
  const todayKey = toKey(new Date());
  const storageKey = `calorie-meals-${todayKey}`;

  const [meals, setMeals] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || '[]');
    } catch {
      return [];
    }
  });
  const [mealName, setMealName] = useState('');
  const [mealCals, setMealCals] = useState('');
  const [inputError, setInputError] = useState('');

  const goal = useMemo(() => calcDailyCalories(athlete, cycleType), [athlete, cycleType]);
  const consumed = useMemo(() => meals.reduce((s, m) => s + m.cals, 0), [meals]);

  function saveMeals(next) {
    setMeals(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
  }

  function addMeal() {
    const cals = parseInt(mealCals, 10);
    if (!mealName.trim()) { setInputError('Please enter a meal name.'); return; }
    if (!cals || cals <= 0) { setInputError('Please enter a valid calorie amount.'); return; }
    setInputError('');
    const next = [...meals, { id: Date.now(), name: mealName.trim(), cals }];
    saveMeals(next);
    setMealName('');
    setMealCals('');
  }

  function removeMeal(id) {
    saveMeals(meals.filter((m) => m.id !== id));
  }

  const cycleLabel = cycleType
    ? cycleType.charAt(0).toUpperCase() + cycleType.slice(1)
    : 'Maintenance';

  const cycleDotColor = {
    bulk: '#57a5ff',
    cut: '#ff6fd8',
    maintain: '#57f0c0',
  }[cycleType] || 'rgba(255,255,255,0.4)';

  return (
    <div style={styles.trackerWrap}>
      {/* Header */}
      <div style={styles.trackerHeader}>
        <div>
          <div style={styles.trackerTitle}>Daily Calories</div>
          <div style={styles.trackerSub}>
            <span style={{ ...styles.cycleDot, background: cycleDotColor }} />
            {cycleLabel} · {goal.toLocaleString()} kcal target
          </div>
        </div>
        <div style={styles.dateChip}>{new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>
      </div>

      {/* Ring + meals side by side */}
      <div style={styles.trackerBody}>
        {/* Ring */}
        <div style={styles.ringWrap}>
          <CalorieRing consumed={consumed} goal={goal} />
          <div style={styles.ringMeta}>
            <div style={styles.ringMetaItem}>
              <span style={styles.ringMetaDot} />
              <span style={styles.ringMetaText}>{meals.length} meal{meals.length !== 1 ? 's' : ''} logged</span>
            </div>
          </div>
        </div>

        {/* Meal list */}
        <div style={styles.mealsCol}>
          {meals.length === 0 ? (
            <div style={styles.emptyMeals}>No meals logged yet — add your first below ↓</div>
          ) : (
            <div style={styles.mealList}>
              {meals.map((m) => (
                <div key={m.id} style={styles.mealRow}>
                  <span style={styles.mealName}>{m.name}</span>
                  <span style={styles.mealCals}>{m.cals.toLocaleString()} kcal</span>
                  <button
                    style={styles.mealRemove}
                    onClick={() => removeMeal(m.id)}
                    title="Remove"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add meal form */}
      <div style={styles.addRow}>
        <input
          style={styles.addInput}
          placeholder="Meal name (e.g. Chicken & rice)"
          value={mealName}
          onChange={(e) => setMealName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addMeal()}
        />
        <input
          style={{ ...styles.addInput, maxWidth: 110 }}
          placeholder="Calories"
          type="number"
          min="1"
          value={mealCals}
          onChange={(e) => setMealCals(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addMeal()}
        />
        <button style={styles.addBtn} onClick={addMeal}>+ Add</button>
      </div>
      {inputError && <div style={styles.errorText}>{inputError}</div>}
    </div>
  );
}

/* ─── Inline styles for new tracker (scoped, no conflicts) ─── */
const styles = {
  trackerWrap: {
    marginTop: 20,
    borderRadius: 28,
    padding: '22px 22px 18px',
    background: 'linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.07) 100%)',
    backdropFilter: 'blur(24px) saturate(140%)',
    WebkitBackdropFilter: 'blur(24px) saturate(140%)',
    border: '1px solid rgba(255,255,255,0.12)',
    boxShadow: '0 10px 30px rgba(0,0,0,0.22)',
  },
  trackerHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  trackerTitle: {
    fontFamily: "'Space Grotesk', sans-serif",
    fontSize: '1.1rem',
    fontWeight: 700,
    color: '#f7f9ff',
    letterSpacing: '0.02em',
    marginBottom: 4,
  },
  trackerSub: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: '0.76rem',
    fontWeight: 600,
    color: 'rgba(216,226,255,0.56)',
  },
  cycleDot: {
    display: 'inline-block',
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
  },
  dateChip: {
    padding: '6px 12px',
    borderRadius: 999,
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.1)',
    fontSize: '0.72rem',
    fontWeight: 700,
    color: 'rgba(247,249,255,0.7)',
    whiteSpace: 'nowrap',
  },
  trackerBody: {
    display: 'flex',
    gap: 24,
    alignItems: 'flex-start',
    marginBottom: 18,
    flexWrap: 'wrap',
  },
  ringWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
  },
  ringMeta: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    alignItems: 'center',
  },
  ringMetaItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  ringMetaDot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.3)',
    flexShrink: 0,
  },
  ringMetaText: {
    fontSize: '0.72rem',
    fontWeight: 600,
    color: 'rgba(216,226,255,0.56)',
  },
  mealsCol: {
    flex: 1,
    minWidth: 180,
  },
  emptyMeals: {
    fontSize: '0.82rem',
    color: 'rgba(216,226,255,0.4)',
    fontWeight: 600,
    padding: '14px 0',
    lineHeight: 1.5,
  },
  mealList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 7,
    maxHeight: 220,
    overflowY: 'auto',
    paddingRight: 4,
  },
  mealRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '9px 12px',
    borderRadius: 14,
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.09)',
  },
  mealName: {
    flex: 1,
    fontSize: '0.86rem',
    fontWeight: 600,
    color: 'rgba(247,249,255,0.85)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  mealCals: {
    fontSize: '0.82rem',
    fontWeight: 700,
    color: '#57f0c0',
    whiteSpace: 'nowrap',
  },
  mealRemove: {
    width: 24,
    height: 24,
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(247,249,255,0.5)',
    cursor: 'pointer',
    fontSize: '1rem',
    lineHeight: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    padding: 0,
    transition: 'background 0.15s',
  },
  addRow: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  addInput: {
    flex: 1,
    minWidth: 120,
    minHeight: 44,
    borderRadius: 14,
    padding: '0 14px',
    background: 'linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.06))',
    border: '1px solid rgba(255,255,255,0.12)',
    color: '#f7f9ff',
    fontSize: '0.86rem',
    fontWeight: 600,
    outline: 'none',
    fontFamily: "'Inter', sans-serif",
  },
  addBtn: {
    minHeight: 44,
    padding: '0 18px',
    borderRadius: 14,
    background: 'linear-gradient(135deg, #fff4b0 0%, #ffd84d 18%, #ffffff 40%, #c6deff 74%, #97b6ff 100%)',
    color: '#06101f',
    fontFamily: "'Space Grotesk', sans-serif",
    fontSize: '0.9rem',
    fontWeight: 700,
    cursor: 'pointer',
    border: 'none',
    boxShadow: '0 10px 24px rgba(255,216,77,0.15)',
    transition: 'transform 0.16s ease, box-shadow 0.16s ease',
    whiteSpace: 'nowrap',
  },
  errorText: {
    marginTop: 8,
    fontSize: '0.76rem',
    fontWeight: 700,
    color: '#ff9f63',
  },
};

/* ─── main component ─── */
export default function NutritionPage({ athlete, nutrition, setNutrition, goToScreen }) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const trackPeriod = athlete?.cycleTracking === true;
  const showBulkCut = athlete?.nutritionGuidance && athlete?.doesBulkCutCycles;

  /* Page is disabled only when there is nothing at all to show */
  const nutritionEnabled = showBulkCut || trackPeriod;

  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState(null);
  const [activeType, setActiveType] = useState('bulk');
  const [activeDur, setActiveDur] = useState(28);
  const [customDays, setCustomDays] = useState(21);

  const blocks = nutrition.bulkCutBlocks ?? [];
  const markedPeriodDays = useMemo(
    () => new Set(nutrition.periodDays ?? []),
    [nutrition.periodDays]
  );

  const predictedPeriodKeys = useMemo(
    () => (trackPeriod ? buildPredictedKeys(markedPeriodDays) : new Set()),
    [trackPeriod, markedPeriodDays]
  );

  const periodMeta = useMemo(() => computePeriodMeta(markedPeriodDays), [markedPeriodDays]);

  const cells = useMemo(() => buildCells(viewYear, viewMonth), [viewYear, viewMonth]);

  function blockAt(d) {
    const k = toKey(d);
    return blocks.find((b) => k >= b.start && k <= b.end);
  }

  const todayBlock = blockAt(today);

  const currentCycleInfo = useMemo(() => {
    if (!todayBlock) return null;
    const start = fromKey(todayBlock.start);
    const end = fromKey(todayBlock.end);
    const totalDays = Math.round((end - start) / 86400000) + 1;
    const elapsed = Math.round((today - start) / 86400000) + 1;
    const pct = Math.min(100, Math.round((elapsed / totalDays) * 100));
    const week = Math.ceil(elapsed / 7);
    const totalWeeks = Math.round(totalDays / 7);
    return { start, end, pct, week, totalWeeks, type: todayBlock.type };
  }, [todayBlock, today]);

  const getDur = useCallback(
    () => (activeDur === 0 ? customDays : activeDur),
    [activeDur, customDays]
  );

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  }

  function handleDayClick(date) {
    if (!showBulkCut) return;
    if (date < today) return;
    setSelectedDate(date);
  }

  function handleDropletClick(e, date) {
    e.stopPropagation();
    const key = toKey(date);
    const next = new Set(markedPeriodDays);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setNutrition((prev) => ({ ...prev, periodDays: [...next] }));
  }

  function applyBlock() {
    if (!selectedDate) return;
    const dur = getDur();
    const startKey = toKey(selectedDate);
    const endKey = toKey(addDays(selectedDate, dur - 1));
    const nb = { type: activeType, start: startKey, end: endKey };
    const filtered = blocks.filter((b) => nb.end < b.start || nb.start > b.end);
    const sorted = [...filtered, nb].sort((a, b) => a.start.localeCompare(b.start));
    setNutrition((prev) => ({ ...prev, bulkCutBlocks: sorted }));
    setSelectedDate(null);
  }

  function removeBlock() {
    if (!selectedDate) return;
    const k = toKey(selectedDate);
    setNutrition((prev) => ({
      ...prev,
      bulkCutBlocks: (prev.bulkCutBlocks ?? []).filter(
        (b) => !(k >= b.start && k <= b.end)
      ),
    }));
    setSelectedDate(null);
  }

  const previewEnd = selectedDate ? addDays(selectedDate, getDur() - 1) : null;
  const selectedBlock = selectedDate ? blockAt(selectedDate) : null;
  const showPredictedLegend = trackPeriod && predictedPeriodKeys.size > 0;

  const periodStatsText = useMemo(() => {
    if (!trackPeriod) return '';
    if (markedPeriodDays.size === 0)
      return 'Tap the droplet on any day to log your period. Predictions appear automatically.';
    const { periods, avgCycle, avgLen } = periodMeta;
    const lastStart = periods.length > 0 ? fromKey(periods[periods.length - 1][0]) : null;
    const nextPredicted = lastStart ? addDays(lastStart, avgCycle) : null;
    return (
      `${markedPeriodDays.size} day${markedPeriodDays.size !== 1 ? 's' : ''} logged · ` +
      `${periods.length} period${periods.length !== 1 ? 's' : ''} · ` +
      `avg cycle ${avgCycle}d · avg length ${avgLen}d` +
      (nextPredicted ? ` · next ~${fmtShort(nextPredicted)}` : '')
    );
  }, [trackPeriod, markedPeriodDays, periodMeta]);

  /* ── Disabled state ── */
  if (!nutritionEnabled) {
    return (
      <div className="screen nutrition-screen">
        <div className="nutr-disabled-wrap">
          <div className="nutr-disabled-card">
            <div className="nutr-disabled-icon">🥗</div>
            <h2 className="nutr-disabled-title">Nutrition tracking is off</h2>
            <p className="nutr-disabled-body">
              Enable <strong>Nutrition Guidance</strong>,{' '}
              <strong>Bulk / Cut Cycles</strong>, or{' '}
              <strong>Cycle Tracking</strong> in your profile to use this page.
            </p>
            <button
              className="nutr-apply-btn"
              style={{ maxWidth: 220, margin: '0 auto' }}
              onClick={() => goToScreen?.('profile')}
            >
              Go to Profile
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Main page ── */
  return (
    <div className="screen nutrition-screen">
      <div className="nutr-shell">

        {/* Banner — only when bulk/cut is enabled */}
        {showBulkCut && (
          <div className="nutr-banner">
            <div className="nutr-banner-label">Current cycle</div>
            {currentCycleInfo ? (
              <>
                <div className={`nutr-cycle-pill nutr-pill-${currentCycleInfo.type}`}>
                  <span className={`nutr-dot nutr-dot-${currentCycleInfo.type}`} />
                  {currentCycleInfo.type.charAt(0).toUpperCase() + currentCycleInfo.type.slice(1)}
                  {' '}— week {currentCycleInfo.week} of {currentCycleInfo.totalWeeks}
                </div>
                <div className="nutr-prog-wrap">
                  <div
                    className={`nutr-prog-fill nutr-prog-${currentCycleInfo.type}`}
                    style={{ width: `${currentCycleInfo.pct}%` }}
                  />
                </div>
                <div className="nutr-banner-meta">
                  <span>Started {fmtShort(currentCycleInfo.start)}</span>
                  <span>{currentCycleInfo.pct}% complete · ends {fmtShort(currentCycleInfo.end)}</span>
                </div>
              </>
            ) : (
              <div className="nutr-cycle-pill nutr-pill-none">No active cycle — click a future date to add one</div>
            )}
          </div>
        )}

        <div
          className="nutr-body"
          style={!showBulkCut ? { gridTemplateColumns: '1fr' } : {}}
        >

          {/* Calendar */}
          <div className="nutr-cal-card">
            <div className="nutr-cal-nav">
              <button className="nutr-nav-btn" onClick={prevMonth}>←</button>
              <span className="nutr-cal-month">{fmtMonthYear(viewYear, viewMonth)}</span>
              <button className="nutr-nav-btn" onClick={nextMonth}>→</button>
            </div>

            <div className="nutr-cal-dh">
              {DAY_HEADERS.map((h) => <div key={h}>{h}</div>)}
            </div>

            <div className="nutr-cal-grid">
              {cells.map((date, i) => {
                if (!date) return <div key={`e-${i}`} className="nutr-day-empty" />;

                const isPast = date < today;
                const isToday = toKey(date) === toKey(today);
                const key = toKey(date);
                const b = showBulkCut ? blockAt(date) : null;
                const isActualPeriod = trackPeriod && markedPeriodDays.has(key);
                const isPredicted = trackPeriod && !isActualPeriod && predictedPeriodKeys.has(key);
                const isSelected = selectedDate && toKey(date) === toKey(selectedDate);

                let cellClass = 'nutr-day';
                if (isPast) cellClass += ' nutr-day-past';
                if (b) cellClass += ` nutr-day-${b.type}`;
                if (isSelected) cellClass += ' nutr-day-selected';
                if (isToday) cellClass += ' nutr-day-today';

                return (
                  <div
                    key={key}
                    className={cellClass}
                    onClick={() => handleDayClick(date)}
                    role="button"
                    tabIndex={isPast || !showBulkCut ? -1 : 0}
                    onKeyDown={(e) => e.key === 'Enter' && !isPast && showBulkCut && handleDayClick(date)}
                  >
                    <span className="nutr-day-num">{date.getDate()}</span>
                    {b && <span className="nutr-day-tag">{b.type}</span>}
                    {isToday && <span className="nutr-today-dot" />}

                    {trackPeriod && (
                      <button
                        className={[
                          'nutr-droplet',
                          isActualPeriod ? 'nutr-droplet-on' : '',
                          isPredicted ? 'nutr-droplet-predicted' : '',
                        ].join(' ').trim()}
                        onClick={(e) => handleDropletClick(e, date)}
                        title={isActualPeriod ? 'Remove period log' : 'Log period day'}
                        tabIndex={-1}
                        aria-label={isActualPeriod ? 'Remove period log' : 'Log period day'}
                      >
                        <DropletIcon filled={isActualPeriod} predicted={isPredicted} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="nutr-legend">
              {showBulkCut && (
                <>
                  <div className="nutr-leg-item"><div className="nutr-leg-swatch nutr-swatch-bulk" />Bulk</div>
                  <div className="nutr-leg-item"><div className="nutr-leg-swatch nutr-swatch-cut" />Cut</div>
                  <div className="nutr-leg-item"><div className="nutr-leg-swatch nutr-swatch-maintain" />Maintain</div>
                </>
              )}
              {trackPeriod && (
                <div className="nutr-leg-item"><DropletIcon filled /><span style={{ marginLeft: 4 }}>Period</span></div>
              )}
              {showPredictedLegend && (
                <div className="nutr-leg-item"><DropletIcon predicted /><span style={{ marginLeft: 4 }}>Predicted</span></div>
              )}
            </div>

            {trackPeriod && (
              <div className="nutr-period-stats-bar">{periodStatsText}</div>
            )}
          </div>

          {/* Sidebar — only when bulk/cut is enabled */}
          {showBulkCut && (
            <div className="nutr-sidebar">
              <div className="nutr-panel">
                <div className="nutr-panel-title">Cycle editor</div>

                <div className="nutr-sel-box">
                  {selectedDate
                    ? <>Starting <strong>{fmtShort(selectedDate)}</strong></>
                    : 'Click a future date to begin'}
                </div>

                <div className="nutr-field">
                  <div className="nutr-field-label">Type</div>
                  <div className="nutr-seg">
                    {['bulk', 'cut', 'maintain'].map((t) => (
                      <button
                        key={t}
                        className={`nutr-seg-btn nutr-seg-${t}${activeType === t ? ' nutr-seg-active' : ''}`}
                        onClick={() => setActiveType(t)}
                      >
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="nutr-field">
                  <div className="nutr-field-label">Duration</div>
                  <div className="nutr-dur-grid">
                    {DURATIONS.map(({ label, days }) => (
                      <button
                        key={days}
                        className={`nutr-dur-btn${activeDur === days ? ' nutr-dur-active' : ''}`}
                        onClick={() => setActiveDur(days)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {activeDur === 0 && (
                  <div className="nutr-field">
                    <div className="nutr-field-label">Custom days</div>
                    <input
                      className="nutr-input"
                      type="number"
                      min={7}
                      max={180}
                      value={customDays}
                      onChange={(e) => setCustomDays(Math.max(7, parseInt(e.target.value) || 7))}
                    />
                  </div>
                )}

                <div className="nutr-preview-box">
                  {selectedDate && previewEnd
                    ? `${fmtShort(selectedDate)} → ${fmtShort(previewEnd)} (${getDur()} days)`
                    : 'Select a start date on the calendar'}
                </div>

                <button className="nutr-apply-btn" onClick={applyBlock} disabled={!selectedDate}>
                  Apply cycle
                </button>

                {selectedBlock && selectedDate && (
                  <button className="nutr-del-btn" onClick={removeBlock}>
                    Remove cycle
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ─── NEW: Calorie Tracker ─── */}
        <CalorieTracker
          athlete={athlete}
          cycleType={todayBlock?.type ?? null}
        />

      </div>
    </div>
  );
}
