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

/* ─── FOOD CATALOG ─── */
const FOOD_CATALOG = [
  { id: 'f1',  name: 'Oatmeal with banana',         cals: 350, protein: 10, carbs: 65, fat: 6,  tag: 'Breakfast' },
  { id: 'f2',  name: 'Scrambled eggs (3) & toast',  cals: 380, protein: 24, carbs: 28, fat: 18, tag: 'Breakfast' },
  { id: 'f3',  name: 'Greek yogurt & berries',       cals: 220, protein: 18, carbs: 28, fat: 3,  tag: 'Breakfast' },
  { id: 'f4',  name: 'Protein pancakes (3)',         cals: 420, protein: 32, carbs: 48, fat: 8,  tag: 'Breakfast' },
  { id: 'f5',  name: 'Avocado toast & eggs',         cals: 450, protein: 18, carbs: 38, fat: 24, tag: 'Breakfast' },
  { id: 'f6',  name: 'Chicken breast & rice',        cals: 480, protein: 45, carbs: 52, fat: 8,  tag: 'Lunch' },
  { id: 'f7',  name: 'Turkey & avocado wrap',        cals: 520, protein: 36, carbs: 44, fat: 18, tag: 'Lunch' },
  { id: 'f8',  name: 'Tuna salad on greens',         cals: 340, protein: 38, carbs: 12, fat: 14, tag: 'Lunch' },
  { id: 'f9',  name: 'Salmon & sweet potato',        cals: 560, protein: 42, carbs: 48, fat: 16, tag: 'Lunch' },
  { id: 'f10', name: 'Beef & veggie stir fry',       cals: 500, protein: 38, carbs: 44, fat: 16, tag: 'Lunch' },
  { id: 'f11', name: 'Ground turkey & pasta',        cals: 620, protein: 44, carbs: 72, fat: 14, tag: 'Dinner' },
  { id: 'f12', name: 'Grilled steak & broccoli',     cals: 540, protein: 52, carbs: 12, fat: 26, tag: 'Dinner' },
  { id: 'f13', name: 'Chicken stir fry & rice',      cals: 580, protein: 46, carbs: 62, fat: 12, tag: 'Dinner' },
  { id: 'f14', name: 'Shrimp & quinoa bowl',         cals: 460, protein: 36, carbs: 52, fat: 10, tag: 'Dinner' },
  { id: 'f15', name: 'Lean beef burger (no bun)',    cals: 420, protein: 40, carbs: 6,  fat: 24, tag: 'Dinner' },
  { id: 'f16', name: 'Protein shake',                cals: 160, protein: 25, carbs: 8,  fat: 3,  tag: 'Snack' },
  { id: 'f17', name: 'Cottage cheese & fruit',       cals: 200, protein: 22, carbs: 18, fat: 4,  tag: 'Snack' },
  { id: 'f18', name: 'Rice cakes & peanut butter',   cals: 280, protein: 8,  carbs: 32, fat: 12, tag: 'Snack' },
  { id: 'f19', name: 'Hard boiled eggs (2)',          cals: 140, protein: 12, carbs: 1,  fat: 10, tag: 'Snack' },
  { id: 'f20', name: 'Almonds (1 oz)',                cals: 160, protein: 6,  carbs: 6,  fat: 14, tag: 'Snack' },
  { id: 'f21', name: 'Banana & peanut butter',       cals: 280, protein: 8,  carbs: 36, fat: 10, tag: 'Snack' },
  { id: 'f22', name: 'Whey + oat smoothie',          cals: 380, protein: 30, carbs: 48, fat: 6,  tag: 'Snack' },
];

/* ─── Food Catalog Modal ─── */
function FoodCatalogModal({ onAdd, onClose }) {
  const [search, setSearch] = useState('');
  const [activeTag, setActiveTag] = useState('All');
  const [customName, setCustomName] = useState('');
  const [customCals, setCustomCals] = useState('');
  const [customProtein, setCustomProtein] = useState('');
  const [customCarbs, setCustomCarbs] = useState('');
  const [customFat, setCustomFat] = useState('');
  const [customErr, setCustomErr] = useState('');
  const [tab, setTab] = useState('catalog');

  // AI tab state
  const [aiQuery, setAiQuery] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [aiError, setAiError] = useState('');

  const tags = ['All', 'Breakfast', 'Lunch', 'Dinner', 'Snack'];

  const filtered = FOOD_CATALOG.filter((f) => {
    const matchTag = activeTag === 'All' || f.tag === activeTag;
    const matchSearch = f.name.toLowerCase().includes(search.toLowerCase());
    return matchTag && matchSearch;
  });

  function handleAdd(food) {
    onAdd({ id: Date.now(), name: food.name, cals: food.cals, protein: food.protein, carbs: food.carbs, fat: food.fat });
  }

  function handleCustomAdd() {
    const cals = parseInt(customCals, 10);
    const protein = parseInt(customProtein, 10) || 0;
    const carbs = parseInt(customCarbs, 10) || 0;
    const fat = parseInt(customFat, 10) || 0;
    if (!customName.trim()) { setCustomErr('Please enter a name.'); return; }
    if (!cals || cals <= 0) { setCustomErr('Please enter valid calories.'); return; }
    setCustomErr('');
    onAdd({ id: Date.now(), name: customName.trim(), cals, protein, carbs, fat });
    setCustomName(''); setCustomCals(''); setCustomProtein(''); setCustomCarbs(''); setCustomFat('');
  }

  async function handleAiEstimate() {
    if (!aiQuery.trim()) { setAiError('Please describe a meal first.'); return; }
    setAiLoading(true);
    setAiResult(null);
    setAiError('');
    try {
      const res = await fetch('/api/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          max_tokens: 300,
          messages: [
            {
              role: 'system',
              content: `You are a precise nutrition estimator. When given a food or meal description, respond ONLY with a JSON object (no markdown, no extra text) in this exact format:
{"name":"<short meal name>","cals":<integer>,"protein":<integer grams>,"carbs":<integer grams>,"fat":<integer grams>,"note":"<one short sentence about accuracy or assumptions>"}
Use realistic, research-backed values. For fast food, use the actual published nutrition data. For home-cooked meals, use standard portion sizes. Always return integers for numeric fields.`,
            },
            { role: 'user', content: aiQuery.trim() },
          ],
        }),
      });
      const data = await res.json();
      const clean = (data.output || '').replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);
      if (!parsed.cals || !parsed.name) throw new Error('Invalid response');
      setAiResult(parsed);
    } catch {
      setAiError('Could not estimate this meal — try rephrasing or use the Custom tab.');
    } finally {
      setAiLoading(false);
    }
  }

  function handleAiConfirm() {
    if (!aiResult) return;
    onAdd({ id: Date.now(), name: aiResult.name, cals: aiResult.cals, protein: aiResult.protein || 0, carbs: aiResult.carbs || 0, fat: aiResult.fat || 0 });
    setAiQuery('');
    setAiResult(null);
  }

  const TABS = [
    { key: 'catalog', label: '📋 Catalog' },
    { key: 'custom',  label: '✏️ Custom' },
  ];

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalBox} onClick={(e) => e.stopPropagation()}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={styles.modalHeader}>
          <span style={styles.modalTitle}>Add Food</span>
          <button style={styles.modalClose} onClick={onClose}>×</button>
        </div>
        <div style={styles.modalTabs}>
          {TABS.map((t) => (
            <button key={t.key} style={{ ...styles.modalTab, ...(tab === t.key ? styles.modalTabActive : {}) }} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'catalog' && (
          <>
            <input style={styles.modalSearch} placeholder="Search meals..." value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
            <div style={styles.tagRow}>
              {tags.map((t) => (
                <button key={t} style={{ ...styles.tagBtn, ...(activeTag === t ? styles.tagBtnActive : {}) }} onClick={() => setActiveTag(t)}>{t}</button>
              ))}
            </div>
            <div style={styles.foodList}>
              {filtered.length === 0 && <div style={styles.noResults}>No meals found — try the AI Estimate tab!</div>}
              {filtered.map((f) => (
                <div key={f.id} style={styles.foodRow}>
                  <div style={styles.foodInfo}>
                    <div style={styles.foodName}>{f.name}</div>
                    <div style={styles.foodMacros}>
                      <span style={{ color: '#57a5ff' }}>P {f.protein}g</span>
                      <span style={{ color: '#ffd84d' }}>C {f.carbs}g</span>
                      <span style={{ color: '#ff9f63' }}>F {f.fat}g</span>
                      <span style={{ color: 'rgba(216,226,255,0.45)' }}>{f.cals} kcal</span>
                    </div>
                  </div>
                  <button style={styles.foodAddBtn} onClick={() => handleAdd(f)}>+ Add</button>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'custom' && (
          <div style={styles.customForm}>
            <input style={styles.addInput} placeholder="Meal name *" value={customName} onChange={(e) => setCustomName(e.target.value)} />
            <div style={styles.customGrid}>
              <div><div style={styles.customLabel}>Calories *</div><input style={styles.addInput} type="number" min="1" placeholder="e.g. 500" value={customCals} onChange={(e) => setCustomCals(e.target.value)} /></div>
              <div><div style={styles.customLabel}>Protein (g)</div><input style={styles.addInput} type="number" min="0" placeholder="e.g. 30" value={customProtein} onChange={(e) => setCustomProtein(e.target.value)} /></div>
              <div><div style={styles.customLabel}>Carbs (g)</div><input style={styles.addInput} type="number" min="0" placeholder="e.g. 50" value={customCarbs} onChange={(e) => setCustomCarbs(e.target.value)} /></div>
              <div><div style={styles.customLabel}>Fat (g)</div><input style={styles.addInput} type="number" min="0" placeholder="e.g. 15" value={customFat} onChange={(e) => setCustomFat(e.target.value)} /></div>
            </div>
            {customErr && <div style={styles.errorText}>{customErr}</div>}
            <button style={styles.addBtn} onClick={handleCustomAdd}>+ Add to log</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Macro Progress Bar ─── */
function MacroBar({ label, consumed, goal, color }) {
  const pct = Math.min((consumed / goal) * 100, 100);
  const isOver = consumed > goal;
  return (
    <div style={styles.macroBarWrap}>
      <div style={styles.macroBarHeader}>
        <span style={styles.macroBarLabel}>{label}</span>
        <span style={{ ...styles.macroBarVal, color: isOver ? '#ff9f63' : color }}>
          {consumed}g <span style={styles.macroBarGoal}>/ {goal}g</span>
        </span>
      </div>
      <div style={styles.macroTrack}>
        <div style={{
          ...styles.macroFill,
          width: `${pct}%`,
          background: isOver ? 'linear-gradient(90deg,#ff9f63,#ffbd4e)' : `linear-gradient(90deg,${color},${color}99)`,
          boxShadow: `0 0 10px ${color}55`,
          transition: 'width 0.5s ease',
        }} />
      </div>
    </div>
  );
}

/* ─── NEW: Calorie calculator helper ─── */
function calcDailyCalories(athlete, cycleType, goalWeight) {
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

  // Base cycle adjustment
  let base = tdee;
  if (cycleType === 'bulk') base = tdee + 300;
  else if (cycleType === 'cut') base = tdee - 300;

  // Goal weight nudge: if far from goal, add up to ±100 extra cals
  if (goalWeight && athlete.bodyweight) {
    const diff = goalWeight - athlete.bodyweight;
    const nudge = Math.min(Math.abs(diff) * 5, 100) * Math.sign(diff);
    base = Math.round(base + nudge);
  }

  return base;
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

/* ─── AI Meal Estimator ─── */
function AiMealEstimator({ onAdd }) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  async function handleEstimate() {
    if (!query.trim()) { setError('Please describe a meal first.'); return; }
    setLoading(true);
    setResult(null);
    setError('');
    try {
      const res = await fetch('/api/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          max_tokens: 300,
          messages: [
            {
              role: 'system',
              content: `You are a precise nutrition estimator. When given a food or meal description, respond ONLY with a JSON object (no markdown, no extra text) in this exact format:
{"name":"<short meal name>","cals":<integer>,"protein":<integer grams>,"carbs":<integer grams>,"fat":<integer grams>,"note":"<one short sentence about accuracy or assumptions>"}
Use realistic research-backed values. For fast food use actual published nutrition data. For home-cooked meals use standard portion sizes. Always return integers for numeric fields.`,
            },
            { role: 'user', content: query.trim() },
          ],
        }),
      });
      const data = await res.json();
      const clean = (data.output || '').replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);
      if (!parsed.cals || !parsed.name) throw new Error('bad response');
      setResult(parsed);
    } catch {
      setError('Could not estimate — try rephrasing (e.g. "Big Mac meal large size").');
    } finally {
      setLoading(false);
    }
  }

  function handleConfirm() {
    if (!result) return;
    onAdd({ id: Date.now(), name: result.name, cals: result.cals, protein: result.protein || 0, carbs: result.carbs || 0, fat: result.fat || 0 });
    setQuery('');
    setResult(null);
  }

  const EXAMPLES = [
    'Big Mac meal large fries Coke',
    'Chipotle chicken bowl rice black beans guac',
    'Starbucks grande iced latte oat milk',
    'Grilled salmon 6oz with roasted asparagus',
  ];

  return (
    <div style={styles.aiEstimatorWrap}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={styles.aiEstimatorHeader}>
        <span style={styles.aiEstimatorTitle}>🤖 Describe a meal</span>
        <span style={styles.aiEstimatorSub}>AI will estimate the calories & macros</span>
      </div>

      {/* Example chips */}
      <div style={styles.aiExamples}>
        {EXAMPLES.map((ex) => (
          <span key={ex} style={styles.aiExampleChip} onClick={() => { setQuery(ex); setResult(null); setError(''); }}>{ex}</span>
        ))}
      </div>

      {/* Input row */}
      <div style={styles.aiInputRow}>
        <input
          style={{ ...styles.addInput, flex: 1 }}
          placeholder="e.g. 'Chick-fil-A spicy deluxe with waffle fries' or '2 eggs scrambled with toast'"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setResult(null); setError(''); }}
          onKeyDown={(e) => e.key === 'Enter' && !loading && handleEstimate()}
        />
        <button
          style={{ ...styles.addBtn, minWidth: 100, opacity: loading ? 0.65 : 1 }}
          onClick={handleEstimate}
          disabled={loading}
        >
          {loading ? '...' : 'Estimate'}
        </button>
      </div>

      {loading && (
        <div style={styles.aiLoadingWrap}>
          <div style={styles.aiSpinner} />
          <span style={styles.aiLoadingText}>Analysing nutrition data…</span>
        </div>
      )}

      {error && <div style={styles.errorText}>{error}</div>}

      {result && (
        <div style={styles.aiResultCard}>
          <div style={styles.aiResultName}>{result.name}</div>
          <div style={styles.aiResultMacros}>
            <div style={styles.aiMacroPill}>
              <span style={styles.aiMacroVal}>{result.cals}</span>
              <span style={styles.aiMacroLbl}>kcal</span>
            </div>
            <div style={{ ...styles.aiMacroPill, borderColor: 'rgba(87,165,255,0.3)' }}>
              <span style={{ ...styles.aiMacroVal, color: '#57a5ff' }}>{result.protein}g</span>
              <span style={styles.aiMacroLbl}>protein</span>
            </div>
            <div style={{ ...styles.aiMacroPill, borderColor: 'rgba(255,216,77,0.3)' }}>
              <span style={{ ...styles.aiMacroVal, color: '#ffd84d' }}>{result.carbs}g</span>
              <span style={styles.aiMacroLbl}>carbs</span>
            </div>
            <div style={{ ...styles.aiMacroPill, borderColor: 'rgba(255,159,99,0.3)' }}>
              <span style={{ ...styles.aiMacroVal, color: '#ff9f63' }}>{result.fat}g</span>
              <span style={styles.aiMacroLbl}>fat</span>
            </div>
          </div>
          {result.note && <div style={styles.aiResultNote}>ℹ️ {result.note}</div>}
          <div style={styles.aiResultActions}>
            <button style={styles.addBtn} onClick={handleConfirm}>✓ Add to log</button>
            <button style={styles.aiRetryBtn} onClick={() => setResult(null)}>Try again</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Weigh-In Inline Editor (shown in sidebar when a cycle is active) ─── */
function WeighInEditor({ nutrition, setNutrition, athlete }) {
  const todayKey = toKey(new Date());
  const weightLog = nutrition.weightLog ?? [];
  const goalWeight = nutrition.goalWeight ?? '';
  const todayLogged = weightLog.find((e) => e.date === todayKey);

  const [editWeight, setEditWeight] = useState('');
  const [editGoal, setEditGoal] = useState(String(goalWeight));
  const [saved, setSaved] = useState(false);

  // Weigh-in frequency — weekly default (setting removed from profile)
  const freq = 'weekly';
  const freqDays = freq === 'daily' ? 1 : freq === 'biweekly' ? 14 : 7;
  const lastLog = weightLog.length > 0 ? weightLog[weightLog.length - 1] : null;
  const daysSinceLast = lastLog
    ? Math.round((new Date() - fromKey(lastLog.date)) / 86400000)
    : 999;
  const isDue = daysSinceLast >= freqDays;

  function logWeight() {
    const w = parseFloat(editWeight);
    if (!w || w < 50 || w > 500) return;
    const gw = parseFloat(editGoal) || nutrition.goalWeight;
    const existing = weightLog.filter((e) => e.date !== todayKey);
    setNutrition((prev) => ({
      ...prev,
      goalWeight: gw || prev.goalWeight,
      weightLog: [...existing, { date: todayKey, weight: w }].sort((a, b) => a.date.localeCompare(b.date)),
    }));
    setEditWeight('');
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div style={wStyles.wrap}>
      <div style={wStyles.header}>
        <span style={wStyles.title}>⚖️ Weight tracking</span>
        {isDue && !todayLogged && <span style={wStyles.dueBadge}>Weigh-in due</span>}
      </div>

      {todayLogged && !saved && (
        <div style={wStyles.todayRow}>
          <span style={wStyles.todayLabel}>Today</span>
          <span style={wStyles.todayVal}>{todayLogged.weight} lbs</span>
        </div>
      )}

      {saved && <div style={wStyles.savedMsg}>✓ Logged!</div>}

      <div style={wStyles.inputRow}>
        <input
          style={wStyles.smallInput}
          type="number"
          min="50" max="500"
          placeholder="Current (lbs)"
          value={editWeight}
          onChange={(e) => setEditWeight(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && logWeight()}
        />
        <input
          style={wStyles.smallInput}
          type="number"
          min="50" max="500"
          placeholder="Goal (lbs)"
          value={editGoal}
          onChange={(e) => setEditGoal(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && logWeight()}
        />
        <button style={wStyles.logBtn} onClick={logWeight}>Log</button>
      </div>

      {lastLog && (
        <div style={wStyles.lastLog}>
          Last logged: {lastLog.weight} lbs on {fmtShort(fromKey(lastLog.date))}
          {' · '}next due in {Math.max(0, freqDays - daysSinceLast)}d
        </div>
      )}
    </div>
  );
}

const wStyles = {
  wrap: {
    marginTop: 14,
    padding: '12px 14px',
    borderRadius: 16,
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    fontFamily: "'Inter', sans-serif",
  },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  title: { fontSize: '0.8rem', fontWeight: 700, color: 'rgba(247,249,255,0.8)' },
  dueBadge: {
    fontSize: '0.64rem', fontWeight: 800, padding: '3px 8px', borderRadius: 999,
    background: 'rgba(255,216,77,0.15)', border: '1px solid rgba(255,216,77,0.3)', color: '#ffd84d',
    textTransform: 'uppercase', letterSpacing: '0.08em',
  },
  todayRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  todayLabel: { fontSize: '0.74rem', color: 'rgba(216,226,255,0.5)', fontWeight: 600 },
  todayVal: { fontSize: '0.86rem', fontWeight: 700, color: '#57f0c0' },
  savedMsg: { fontSize: '0.78rem', fontWeight: 700, color: '#57f0c0' },
  inputRow: { display: 'flex', gap: 6, alignItems: 'center' },
  smallInput: {
    flex: 1,
    minHeight: 36,
    borderRadius: 10,
    padding: '0 10px',
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.12)',
    color: '#f7f9ff',
    fontSize: '0.78rem',
    fontWeight: 600,
    outline: 'none',
    fontFamily: "'Inter', sans-serif",
    minWidth: 0,
  },
  logBtn: {
    minHeight: 36,
    padding: '0 12px',
    borderRadius: 10,
    background: 'linear-gradient(135deg,#fff4b0,#ffd84d 30%,#fff 60%,#c6deff)',
    color: '#06101f',
    fontSize: '0.78rem',
    fontWeight: 800,
    cursor: 'pointer',
    border: 'none',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  lastLog: { fontSize: '0.68rem', color: 'rgba(216,226,255,0.4)', fontWeight: 600 },
};

/* ─── Weight Trend Graph ─── */
function WeightTrendGraph({ weightLog, goalWeight, athlete }) {
  if (weightLog.length === 0) {
    return (
      <div style={gStyles.emptyWrap}>
        <div style={gStyles.emptyTitle}>📈 Weight trend</div>
        <div style={gStyles.emptyMsg}>Log your first weigh-in by applying a cycle — your progress graph will appear here.</div>
      </div>
    );
  }

  const W = 600, H = 200, PAD = { top: 20, right: 20, bottom: 36, left: 44 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const weights = weightLog.map((e) => e.weight);
  const allWeights = goalWeight ? [...weights, goalWeight] : weights;
  const minW = Math.min(...allWeights) - 5;
  const maxW = Math.max(...allWeights) + 5;

  const n = weightLog.length;
  const xScale = (i) => PAD.left + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yScale = (w) => PAD.top + innerH - ((w - minW) / (maxW - minW)) * innerH;

  const points = weightLog.map((e, i) => ({ x: xScale(i), y: yScale(e.weight), ...e }));
  const polyline = points.map((p) => `${p.x},${p.y}`).join(' ');

  // Area fill path
  const areaPath = points.length > 1
    ? `M ${points[0].x},${PAD.top + innerH} ` +
      points.map((p) => `L ${p.x},${p.y}`).join(' ') +
      ` L ${points[points.length - 1].x},${PAD.top + innerH} Z`
    : '';

  // Y axis ticks
  const yTicks = 4;
  const yTickVals = Array.from({ length: yTicks + 1 }, (_, i) => minW + ((maxW - minW) / yTicks) * i);

  // Goal weight Y
  const goalY = goalWeight ? yScale(goalWeight) : null;

  // Trend: up/down/flat
  const trend = weights.length >= 2
    ? weights[weights.length - 1] - weights[0]
    : 0;
  const trendColor = trend < -0.5 ? '#57f0c0' : trend > 0.5 ? '#57a5ff' : '#ffd84d';
  const trendLabel = trend < -0.5 ? `↓ ${Math.abs(trend).toFixed(1)} lbs` : trend > 0.5 ? `↑ ${trend.toFixed(1)} lbs` : '→ stable';

  return (
    <div style={gStyles.wrap}>
      <div style={gStyles.header}>
        <div>
          <div style={gStyles.title}>📈 Weight trend</div>
          <div style={gStyles.sub}>{weightLog.length} weigh-in{weightLog.length !== 1 ? 's' : ''} logged</div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {goalWeight && (
            <div style={gStyles.goalChip}>
              <span style={gStyles.goalDash}>- - -</span>
              Goal: {goalWeight} lbs
            </div>
          )}
          <div style={{ ...gStyles.trendChip, color: trendColor, borderColor: trendColor + '44', background: trendColor + '18' }}>
            {trendLabel}
          </div>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 300, display: 'block' }}>
          {/* Y grid lines + labels */}
          {yTickVals.map((v, i) => (
            <g key={i}>
              <line
                x1={PAD.left} y1={yScale(v)} x2={PAD.left + innerW} y2={yScale(v)}
                stroke="rgba(255,255,255,0.06)" strokeWidth="1"
              />
              <text x={PAD.left - 6} y={yScale(v) + 4} textAnchor="end"
                fill="rgba(216,226,255,0.35)" fontSize="9" fontFamily="'Inter', sans-serif">
                {Math.round(v)}
              </text>
            </g>
          ))}

          {/* Area fill */}
          {areaPath && (
            <path d={areaPath} fill="url(#wGrad)" opacity="0.18" />
          )}

          {/* Gradient def */}
          <defs>
            <linearGradient id="wGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8f7cff" />
              <stop offset="100%" stopColor="#8f7cff" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Goal weight dashed line */}
          {goalY !== null && (
            <g>
              <line
                x1={PAD.left} y1={goalY} x2={PAD.left + innerW} y2={goalY}
                stroke="#ffd84d" strokeWidth="1.5" strokeDasharray="6 4" opacity="0.7"
              />
              <text x={PAD.left + innerW + 4} y={goalY + 4}
                fill="#ffd84d" fontSize="9" fontFamily="'Inter', sans-serif" opacity="0.8">
                goal
              </text>
            </g>
          )}

          {/* Line */}
          {points.length > 1 && (
            <polyline
              points={polyline}
              fill="none"
              stroke="#8f7cff"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Dots + X labels */}
          {points.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r="4" fill="#8f7cff" stroke="rgba(10,16,36,0.9)" strokeWidth="2" />
              <text x={p.x} y={PAD.top + innerH + 16} textAnchor="middle"
                fill="rgba(216,226,255,0.4)" fontSize="8.5" fontFamily="'Inter', sans-serif">
                {fmtShort(fromKey(p.date))}
              </text>
              {/* Tooltip weight label on hover approximated as always-shown for latest */}
              {i === points.length - 1 && (
                <text x={p.x} y={p.y - 9} textAnchor="middle"
                  fill="#f7f9ff" fontSize="10" fontWeight="700" fontFamily="'Inter', sans-serif">
                  {p.weight}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

const gStyles = {
  wrap: {
    marginTop: 18,
    paddingTop: 16,
    borderTop: '1px solid rgba(255,255,255,0.08)',
  },
  emptyWrap: {
    marginTop: 16,
    borderRadius: 24,
    padding: '22px 20px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    textAlign: 'center',
  },
  emptyTitle: {
    fontFamily: "'Space Grotesk', sans-serif",
    fontSize: '0.95rem', fontWeight: 700, color: '#f7f9ff', marginBottom: 8,
  },
  emptyMsg: { fontSize: '0.8rem', color: 'rgba(216,226,255,0.45)', fontWeight: 600, lineHeight: 1.5 },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  title: { fontFamily: "'Space Grotesk', sans-serif", fontSize: '1rem', fontWeight: 700, color: '#f7f9ff', marginBottom: 2 },
  sub: { fontSize: '0.72rem', fontWeight: 600, color: 'rgba(216,226,255,0.45)' },
  goalChip: {
    display: 'flex', alignItems: 'center', gap: 6,
    fontSize: '0.72rem', fontWeight: 700, color: '#ffd84d',
    padding: '4px 10px', borderRadius: 999,
    background: 'rgba(255,216,77,0.1)', border: '1px solid rgba(255,216,77,0.22)',
  },
  goalDash: { letterSpacing: 1, opacity: 0.7 },
  trendChip: {
    fontSize: '0.74rem', fontWeight: 800,
    padding: '4px 10px', borderRadius: 999, border: '1px solid',
  },
  wmHint: { fontSize: '0.8rem', color: 'rgba(216,226,255,0.5)', fontWeight: 600, lineHeight: 1.5 },
};

/* ─── NEW: Calorie Tracker Component ─── */
function CalorieTracker({ athlete, cycleType, goalWeight }) {
  const todayKey = toKey(new Date());
  const storageKey = `calorie-meals-${todayKey}`;

  const [meals, setMeals] = useState(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch { return []; }
  });
  const [showModal, setShowModal] = useState(false);

  const goal = useMemo(() => calcDailyCalories(athlete, cycleType, goalWeight), [athlete, cycleType, goalWeight]);
  const consumed = useMemo(() => meals.reduce((s, m) => s + m.cals, 0), [meals]);

  const macroGoals = useMemo(() => ({
    protein: Math.round((goal * 0.30) / 4),
    carbs:   Math.round((goal * 0.40) / 4),
    fat:     Math.round((goal * 0.30) / 9),
  }), [goal]);

  const macroConsumed = useMemo(() => ({
    protein: meals.reduce((s, m) => s + (m.protein || 0), 0),
    carbs:   meals.reduce((s, m) => s + (m.carbs || 0), 0),
    fat:     meals.reduce((s, m) => s + (m.fat || 0), 0),
  }), [meals]);

  function saveMeals(next) {
    setMeals(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
  }

  function handleAddMeal(meal) {
    saveMeals([...meals, meal]);
  }

  function removeMeal(id) {
    saveMeals(meals.filter((m) => m.id !== id));
  }

  const cycleLabel = cycleType ? cycleType.charAt(0).toUpperCase() + cycleType.slice(1) : 'Maintenance';
  const cycleDotColor = { bulk: '#57a5ff', cut: '#ff6fd8', maintain: '#57f0c0' }[cycleType] || 'rgba(255,255,255,0.4)';

  return (
    <>
      {showModal && <FoodCatalogModal onAdd={handleAddMeal} onClose={() => setShowModal(false)} />}

      <div style={styles.trackerWrap}>
        {/* Header */}
        <div style={styles.trackerHeader}>
          <div>
            <div style={styles.trackerTitle}>Daily Calories &amp; Macros</div>
            <div style={styles.trackerSub}>
              <span style={{ ...styles.cycleDot, background: cycleDotColor }} />
              {cycleLabel} · {goal.toLocaleString()} kcal target
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={styles.dateChip}>{new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>
            <button style={styles.addBtn} onClick={() => setShowModal(true)}>+ Add meal</button>
          </div>
        </div>

        {/* Ring + meals side by side */}
        <div style={styles.trackerBody}>
          <div style={styles.ringWrap}>
            <CalorieRing consumed={consumed} goal={goal} />
            <div style={styles.ringMeta}>
              <div style={styles.ringMetaItem}>
                <span style={styles.ringMetaDot} />
                <span style={styles.ringMetaText}>{meals.length} meal{meals.length !== 1 ? 's' : ''} logged</span>
              </div>
            </div>
          </div>

          <div style={styles.mealsCol}>
            {meals.length === 0 ? (
              <div style={styles.emptyMeals}>No meals logged yet — click <strong style={{ color: 'rgba(247,249,255,0.7)' }}>+ Add meal</strong> to get started</div>
            ) : (
              <div style={styles.mealList}>
                {meals.map((m) => (
                  <div key={m.id} style={styles.mealRow}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={styles.mealName}>{m.name}</div>
                      {(m.protein || m.carbs || m.fat) ? (
                        <div style={styles.mealMacroLine}>
                          <span style={{ color: '#57a5ff' }}>P {m.protein || 0}g</span>
                          <span style={{ color: '#ffd84d' }}>C {m.carbs || 0}g</span>
                          <span style={{ color: '#ff9f63' }}>F {m.fat || 0}g</span>
                        </div>
                      ) : null}
                    </div>
                    <span style={styles.mealCals}>{m.cals.toLocaleString()} kcal</span>
                    <button style={styles.mealRemove} onClick={() => removeMeal(m.id)} title="Remove">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* AI Estimator */}
        <AiMealEstimator onAdd={handleAddMeal} />

        {/* Macro bars */}
        <div style={styles.macroBarsWrap}>
          <div style={styles.macroBarsTitle}>Macros</div>
          <MacroBar label="Protein" consumed={macroConsumed.protein} goal={macroGoals.protein} color="#57a5ff" />
          <MacroBar label="Carbs"   consumed={macroConsumed.carbs}   goal={macroGoals.carbs}   color="#ffd84d" />
          <MacroBar label="Fat"     consumed={macroConsumed.fat}     goal={macroGoals.fat}     color="#ff9f63" />
          <div style={styles.macroNote}>Goals: 30% protein · 40% carbs · 30% fat · based on {goal.toLocaleString()} kcal</div>
        </div>
      </div>
    </>
  );
}

/* ─── Inline styles (scoped, no conflicts with existing CSS) ─── */
const styles = {
  /* --- tracker card --- */
  trackerWrap: {
    marginTop: 20,
    borderRadius: 28,
    padding: '22px 22px 20px',
    background: 'linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.07) 100%)',
    backdropFilter: 'blur(24px) saturate(140%)',
    WebkitBackdropFilter: 'blur(24px) saturate(140%)',
    border: '1px solid rgba(255,255,255,0.12)',
    boxShadow: '0 10px 30px rgba(0,0,0,0.22)',
    fontFamily: "'Inter', sans-serif",
  },
  trackerHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
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
    marginBottom: 20,
    flexWrap: 'wrap',
  },
  ringWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
  },
  ringMeta: { display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' },
  ringMetaItem: { display: 'flex', alignItems: 'center', gap: 6 },
  ringMetaDot: { width: 7, height: 7, borderRadius: '50%', background: 'rgba(255,255,255,0.3)', flexShrink: 0 },
  ringMetaText: { fontSize: '0.72rem', fontWeight: 600, color: 'rgba(216,226,255,0.56)' },
  mealsCol: { flex: 1, minWidth: 180 },
  emptyMeals: { fontSize: '0.82rem', color: 'rgba(216,226,255,0.4)', fontWeight: 600, padding: '14px 0', lineHeight: 1.5 },
  mealList: { display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 240, overflowY: 'auto', paddingRight: 4 },
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
    fontSize: '0.86rem',
    fontWeight: 600,
    color: 'rgba(247,249,255,0.85)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  mealMacroLine: {
    display: 'flex',
    gap: 8,
    marginTop: 2,
    fontSize: '0.72rem',
    fontWeight: 700,
  },
  mealCals: { fontSize: '0.82rem', fontWeight: 700, color: '#57f0c0', whiteSpace: 'nowrap' },
  mealRemove: {
    width: 24, height: 24, borderRadius: '50%',
    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(247,249,255,0.5)', cursor: 'pointer', fontSize: '1rem',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, padding: 0,
  },
  /* --- macro bars --- */
  macroBarsWrap: {
    borderTop: '1px solid rgba(255,255,255,0.08)',
    paddingTop: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  macroBarsTitle: {
    fontFamily: "'Space Grotesk', sans-serif",
    fontSize: '0.72rem',
    fontWeight: 800,
    color: 'rgba(216,226,255,0.5)',
    textTransform: 'uppercase',
    letterSpacing: '0.18em',
    marginBottom: 2,
  },
  macroBarWrap: { display: 'flex', flexDirection: 'column', gap: 5 },
  macroBarHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  macroBarLabel: { fontSize: '0.78rem', fontWeight: 700, color: 'rgba(247,249,255,0.7)' },
  macroBarVal: { fontSize: '0.78rem', fontWeight: 700 },
  macroBarGoal: { fontSize: '0.72rem', fontWeight: 600, color: 'rgba(216,226,255,0.4)' },
  macroTrack: { height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' },
  macroFill: { height: '100%', borderRadius: 999 },
  macroNote: { fontSize: '0.7rem', color: 'rgba(216,226,255,0.35)', fontWeight: 600, marginTop: 4 },
  /* --- shared inputs / buttons --- */
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
    boxSizing: 'border-box',
    width: '100%',
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
    whiteSpace: 'nowrap',
  },
  errorText: { marginTop: 8, fontSize: '0.76rem', fontWeight: 700, color: '#ff9f63' },
  /* --- modal --- */
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 999,
    background: 'rgba(5,8,22,0.72)',
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalBox: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '85vh',
    borderRadius: 26,
    background: 'linear-gradient(180deg, rgba(20,28,52,0.98), rgba(12,18,36,0.98))',
    border: '1px solid rgba(255,255,255,0.14)',
    boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    fontFamily: "'Inter', sans-serif",
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '18px 20px 14px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    flexShrink: 0,
  },
  modalTitle: {
    fontFamily: "'Space Grotesk', sans-serif",
    fontSize: '1.05rem',
    fontWeight: 700,
    color: '#f7f9ff',
  },
  modalClose: {
    width: 32, height: 32, borderRadius: '50%',
    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)',
    color: '#f7f9ff', cursor: 'pointer', fontSize: '1.1rem',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  modalTabs: { display: 'flex', gap: 8, padding: '12px 20px 0', flexShrink: 0 },
  modalTab: {
    flex: 1,
    minHeight: 38,
    borderRadius: 12,
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: 'rgba(247,249,255,0.6)',
    fontSize: '0.82rem',
    fontWeight: 700,
    cursor: 'pointer',
  },
  modalTabActive: {
    background: 'linear-gradient(135deg, rgba(143,124,255,0.2), rgba(85,214,255,0.12))',
    border: '1px solid rgba(143,124,255,0.3)',
    color: '#f7f9ff',
  },
  modalSearch: {
    margin: '12px 20px 0',
    minHeight: 42,
    borderRadius: 12,
    padding: '0 14px',
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.12)',
    color: '#f7f9ff',
    fontSize: '0.86rem',
    fontWeight: 600,
    outline: 'none',
    fontFamily: "'Inter', sans-serif",
    flexShrink: 0,
  },
  tagRow: { display: 'flex', gap: 6, padding: '10px 20px 0', flexWrap: 'wrap', flexShrink: 0 },
  tagBtn: {
    padding: '5px 12px',
    borderRadius: 999,
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(247,249,255,0.55)',
    fontSize: '0.74rem',
    fontWeight: 700,
    cursor: 'pointer',
  },
  tagBtnActive: {
    background: 'linear-gradient(180deg, rgba(87,165,255,0.2), rgba(255,255,255,0.08))',
    border: '1px solid rgba(87,165,255,0.3)',
    color: '#f7f9ff',
  },
  foodList: {
    flex: 1,
    overflowY: 'auto',
    padding: '10px 20px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 7,
  },
  noResults: { fontSize: '0.82rem', color: 'rgba(216,226,255,0.4)', fontWeight: 600, padding: '20px 0', textAlign: 'center' },
  foodRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 12px',
    borderRadius: 14,
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.08)',
  },
  foodInfo: { flex: 1, minWidth: 0 },
  foodName: { fontSize: '0.86rem', fontWeight: 600, color: 'rgba(247,249,255,0.88)', marginBottom: 3 },
  foodMacros: { display: 'flex', gap: 10, fontSize: '0.72rem', fontWeight: 700 },
  foodAddBtn: {
    minHeight: 34,
    padding: '0 12px',
    borderRadius: 10,
    background: 'linear-gradient(135deg, #fff4b0, #ffd84d 30%, #fff 60%, #c6deff)',
    color: '#06101f',
    fontSize: '0.78rem',
    fontWeight: 800,
    cursor: 'pointer',
    border: 'none',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  customForm: { padding: '14px 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 },
  customGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  /* --- AI tab --- */
  aiTabWrap: { padding: '14px 20px 20px', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' },
  aiHint: { fontSize: '0.8rem', fontWeight: 600, color: 'rgba(216,226,255,0.55)', lineHeight: 1.5 },
  aiExamples: { display: 'flex', flexWrap: 'wrap', gap: 7 },
  aiExampleChip: {
    padding: '5px 12px', borderRadius: 999,
    background: 'rgba(143,124,255,0.12)', border: '1px solid rgba(143,124,255,0.22)',
    color: 'rgba(247,249,255,0.75)', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer',
  },
  aiInputRow: { display: 'flex', gap: 8, alignItems: 'center' },
  aiLoadingWrap: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' },
  aiSpinner: {
    width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
    border: '2px solid rgba(255,255,255,0.12)',
    borderTopColor: '#8f7cff',
    animation: 'spin 0.8s linear infinite',
  },
  aiLoadingText: { fontSize: '0.8rem', fontWeight: 600, color: 'rgba(216,226,255,0.5)' },
  aiResultCard: {
    borderRadius: 18, padding: '14px 16px',
    background: 'linear-gradient(135deg, rgba(143,124,255,0.12), rgba(85,214,255,0.08))',
    border: '1px solid rgba(143,124,255,0.22)',
    display: 'flex', flexDirection: 'column', gap: 10,
  },
  aiResultName: { fontSize: '0.95rem', fontWeight: 700, color: '#f7f9ff' },
  aiResultMacros: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  aiMacroPill: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '7px 12px', borderRadius: 12,
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
    minWidth: 60,
  },
  aiMacroVal: { fontSize: '1rem', fontWeight: 800, color: '#f7f9ff', lineHeight: 1.1 },
  aiMacroLbl: { fontSize: '0.66rem', fontWeight: 700, color: 'rgba(216,226,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 2 },
  aiResultNote: { fontSize: '0.74rem', fontWeight: 600, color: 'rgba(216,226,255,0.45)', lineHeight: 1.4 },
  aiResultActions: { display: 'flex', gap: 8, alignItems: 'center' },
  aiEstimatorWrap: {
    marginTop: 16,
    borderRadius: 22,
    padding: '16px 18px 18px',
    background: 'linear-gradient(135deg, rgba(143,124,255,0.10), rgba(85,214,255,0.07))',
    border: '1px solid rgba(143,124,255,0.2)',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    fontFamily: "'Inter', sans-serif",
  },
  aiEstimatorHeader: { display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' },
  aiEstimatorTitle: {
    fontFamily: "'Space Grotesk', sans-serif",
    fontSize: '0.95rem', fontWeight: 700, color: '#f7f9ff',
  },
  aiEstimatorSub: { fontSize: '0.74rem', fontWeight: 600, color: 'rgba(216,226,255,0.5)' },
  aiRetryBtn: {
    minHeight: 44, padding: '0 16px', borderRadius: 14,
    background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(247,249,255,0.65)', fontSize: '0.86rem', fontWeight: 700, cursor: 'pointer',
  },
    customLabel: { fontSize: '0.7rem', fontWeight: 800, color: 'rgba(216,226,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 5 },
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
  // Page only fully disabled if nutritionGuidance is off AND no cycle tracking
  // doesBulkCutCycles=false just hides cycle-specific UI, not the whole page
  const nutritionEnabled = (athlete?.nutritionGuidance) || trackPeriod;

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

  // Weight log modal state (separate from cycle apply modal)
  const [showWeightLogModal, setShowWeightLogModal] = useState(false);
  const [weightLogDate, setWeightLogDate] = useState(null);
  const [weightLogValue, setWeightLogValue] = useState('');
  const [weightLogErr, setWeightLogErr] = useState('');

  function handleDayClick(date) {
    if (showBulkCut) setSelectedDate(date);
  }

  function confirmWeightLog() {
    const w = parseFloat(weightLogValue);
    if (!w || w < 50 || w > 500) { setWeightLogErr('Please enter a valid weight (lbs).'); return; }
    const key = toKey(weightLogDate);
    const existing = (nutrition.weightLog ?? []).filter((e) => e.date !== key);
    setNutrition((prev) => ({
      ...prev,
      weightLog: [...existing, { date: key, weight: w }].sort((a, b) => a.date.localeCompare(b.date)),
    }));
    setShowWeightLogModal(false);
    setWeightLogDate(null);
    setWeightLogValue('');
  }

  function deleteWeightLog() {
    const key = toKey(weightLogDate);
    setNutrition((prev) => ({
      ...prev,
      weightLog: (prev.weightLog ?? []).filter((e) => e.date !== key),
    }));
    setShowWeightLogModal(false);
  }

  function handleDropletClick(e, date) {
    e.stopPropagation();
    const key = toKey(date);
    const next = new Set(markedPeriodDays);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setNutrition((prev) => ({ ...prev, periodDays: [...next] }));
  }

  // Weight modal state
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [pendingCycleWeight, setPendingCycleWeight] = useState('');
  const [pendingGoalWeight, setPendingGoalWeight] = useState('');
  const [weightModalErr, setWeightModalErr] = useState('');

  function applyBlock() {
    if (!selectedDate) return;
    // Open weight modal first — cycle saves only after weights are entered
    setPendingCycleWeight(String(athlete?.bodyweight || ''));
    setPendingGoalWeight(String(nutrition.goalWeight || ''));
    setWeightModalErr('');
    setShowWeightModal(true);
  }

  function confirmApplyBlock() {
    const cw = parseFloat(pendingCycleWeight);
    const gw = parseFloat(pendingGoalWeight);
    if (!cw || cw < 50 || cw > 500) { setWeightModalErr('Please enter a valid current weight (lbs).'); return; }
    if (!gw || gw < 50 || gw > 500) { setWeightModalErr('Please enter a valid goal weight (lbs).'); return; }
    const dur = getDur();
    const startKey = toKey(selectedDate);
    const endKey = toKey(addDays(selectedDate, dur - 1));
    const nb = { type: activeType, start: startKey, end: endKey, startWeight: cw, goalWeight: gw };
    const filtered = blocks.filter((b) => nb.end < b.start || nb.start > b.end);
    const sorted = [...filtered, nb].sort((a, b) => a.start.localeCompare(b.start));
    // Log a weigh-in entry
    const newEntry = { date: startKey, weight: cw };
    const existingLogs = nutrition.weightLog ?? [];
    const dedupedLogs = existingLogs.filter((e) => e.date !== startKey);
    setNutrition((prev) => ({
      ...prev,
      bulkCutBlocks: sorted,
      goalWeight: gw,
      weightLog: [...dedupedLogs, newEntry].sort((a, b) => a.date.localeCompare(b.date)),
    }));
    setShowWeightModal(false);
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
              Enable <strong>Nutrition Guidance</strong> or{' '}
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
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && handleDayClick(date)}
                  >
                    <span className="nutr-day-num">{date.getDate()}</span>
                    {b && <span className="nutr-day-tag">{b.type}</span>}
                    {isToday && <span className="nutr-today-dot" />}
                    {(isPast || isToday) && (
                      <button
                        className={[
                          'nutr-weight-btn',
                          (nutrition.weightLog ?? []).some((e) => e.date === key) ? 'nutr-weight-btn-logged' : '',
                        ].join(' ').trim()}
                        onClick={(e) => { e.stopPropagation(); handleDayClick(date); }}
                        title={
                          (nutrition.weightLog ?? []).some((e) => e.date === key)
                            ? `Edit weight · ${(nutrition.weightLog.find(e => e.date === key))?.weight} lbs`
                            : 'Log weight'
                        }
                        tabIndex={-1}
                        aria-label="Log weight"
                      >
                        {(nutrition.weightLog ?? []).some((e) => e.date === key) ? '⚖' : '+'}
                      </button>
                    )}

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

            {/* Weight trend graph — shown inside the calendar card */}
            <WeightTrendGraph
              weightLog={nutrition.weightLog ?? []}
              goalWeight={nutrition.goalWeight ?? null}
              athlete={athlete}
            />
          </div>

          {/* Sidebar — only when bulk/cut is enabled */}
          {!showBulkCut && (
            <div style={{ padding: '14px 0 4px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'rgba(247,249,255,0.6)', fontFamily: "'Space Grotesk', sans-serif" }}>
                Weight tracking
              </div>
              <div style={{ fontSize: '0.74rem', color: 'rgba(216,226,255,0.45)', fontWeight: 600, lineHeight: 1.5, fontFamily: "'Inter', sans-serif" }}>
                Click any past or today's date on the calendar to log your weight and build your trend graph.
              </div>
            </div>
          )}
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

                {/* ── Inline weight editor ── */}
                {todayBlock && (
                  <WeighInEditor
                    nutrition={nutrition}
                    setNutrition={setNutrition}
                    athlete={athlete}
                  />
                )}
              </div>
            </div>
          )}

          {/* ── Weight modal — shown when applying a new cycle ── */}
          {showWeightModal && (
            <div style={styles.modalOverlay} onClick={() => setShowWeightModal(false)}>
              <div style={{ ...styles.modalBox, maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
                <div style={styles.modalHeader}>
                  <span style={styles.modalTitle}>Set weights for this cycle</span>
                  <button style={styles.modalClose} onClick={() => setShowWeightModal(false)}>×</button>
                </div>
                <div style={{ padding: '18px 20px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={styles.wmHint}>
                    Enter your current weight and goal weight. These will refine your daily calorie target.
                  </div>
                  <div>
                    <div style={styles.customLabel}>Current weight (lbs)</div>
                    <input
                      style={styles.addInput}
                      type="number"
                      min="50" max="500"
                      placeholder="e.g. 145"
                      value={pendingCycleWeight}
                      onChange={(e) => { setPendingCycleWeight(e.target.value); setWeightModalErr(''); }}
                      autoFocus
                    />
                  </div>
                  <div>
                    <div style={styles.customLabel}>Goal weight (lbs)</div>
                    <input
                      style={styles.addInput}
                      type="number"
                      min="50" max="500"
                      placeholder="e.g. 135"
                      value={pendingGoalWeight}
                      onChange={(e) => { setPendingGoalWeight(e.target.value); setWeightModalErr(''); }}
                    />
                  </div>
                  {weightModalErr && <div style={styles.errorText}>{weightModalErr}</div>}
                  <button style={styles.addBtn} onClick={confirmApplyBlock}>Save &amp; apply cycle</button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Weight log modal — click any past/today date ── */}
        {showWeightLogModal && weightLogDate && (
          <div style={styles.modalOverlay} onClick={() => setShowWeightLogModal(false)}>
            <div style={{ ...styles.modalBox, maxWidth: 340 }} onClick={(e) => e.stopPropagation()}>
              <div style={styles.modalHeader}>
                <span style={styles.modalTitle}>
                  Log weight · {weightLogDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
                <button style={styles.modalClose} onClick={() => setShowWeightLogModal(false)}>×</button>
              </div>
              <div style={{ padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={styles.wmHint}>
                  Enter your weight for this day. It will appear on your trend graph.
                </div>
                <input
                  style={styles.addInput}
                  type="number"
                  min="50" max="500"
                  placeholder="e.g. 143.5"
                  value={weightLogValue}
                  onChange={(e) => { setWeightLogValue(e.target.value); setWeightLogErr(''); }}
                  onKeyDown={(e) => e.key === 'Enter' && confirmWeightLog()}
                  autoFocus
                />
                {weightLogErr && <div style={styles.errorText}>{weightLogErr}</div>}
                <button style={styles.addBtn} onClick={confirmWeightLog}>Save weight</button>
                {(nutrition.weightLog ?? []).some((e) => e.date === toKey(weightLogDate)) && (
                  <button style={styles.aiRetryBtn} onClick={deleteWeightLog}>Remove this entry</button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─── NEW: Calorie Tracker ─── */}
        {athlete?.nutritionGuidance && (
          <CalorieTracker
            athlete={athlete}
            cycleType={todayBlock?.type ?? null}
            goalWeight={nutrition.goalWeight ?? null}
            currentBlock={todayBlock ?? null}
          />
        )}

      </div>
    </div>
  );
}
