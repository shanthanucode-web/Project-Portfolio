import '../styles/home.css';

/* ─── helpers ─── */
function toKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function calcDailyCalories(athlete, cycleType, goalWeight) {
  const weightKg = (athlete.bodyweight || 130) * 0.453592;
  const heightCm = ((athlete.heightFt || 5) * 12 + (athlete.heightIn || 4)) * 2.54;
  const age = athlete.age || 25;
  const isMale = athlete.gender === 'male';
  let bmr = isMale
    ? 10 * weightKg + 6.25 * heightCm - 5 * age + 5
    : 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
  const tdee = Math.round(bmr * 1.55);
  let base = tdee;
  if (cycleType === 'bulk') base = tdee + 300;
  else if (cycleType === 'cut') base = tdee - 300;
  if (goalWeight && athlete.bodyweight) {
    const diff = goalWeight - athlete.bodyweight;
    const nudge = Math.min(Math.abs(diff) * 5, 100) * Math.sign(diff);
    base = Math.round(base + nudge);
  }
  return base;
}

/* ─── Derive workout "day type" label from lift name ─── */
function getDayType(lift) {
  if (!lift) return null;
  const l = lift.toLowerCase();
  if (l.includes('squat') || l.includes('leg') || l.includes('lower')) {
    return { label: 'Leg Day', emoji: '🦵', accent: '#57f0c0', sub: 'Quads · Hamstrings · Glutes' };
  }
  if (l.includes('bench') || l.includes('chest') || l.includes('ohp') || l.includes('overhead') || l.includes('press') || l.includes('push')) {
    return { label: 'Push Day', emoji: '💪', accent: '#57a5ff', sub: 'Chest · Shoulders · Triceps' };
  }
  if (l.includes('deadlift') || l.includes('row') || l.includes('pull') || l.includes('back') || l.includes('upper')) {
    return { label: 'Pull Day', emoji: '🏋️', accent: '#8f7cff', sub: 'Back · Biceps · Rear Delts' };
  }
  if (l.includes('recovery') || l.includes('deload') || l.includes('mobility')) {
    return { label: 'Recovery Day', emoji: '🧘', accent: '#ffd84d', sub: 'Active recovery · Mobility' };
  }
  return { label: lift, emoji: '⚡', accent: '#ff9f63', sub: 'Today\'s session' };
}

/* ─── Workout type color map ─── */
const TYPE_COLORS = {
  strength:    { color: '#8f7cff', bg: 'rgba(143,124,255,0.18)', label: 'Strength'        },
  hypertrophy: { color: '#57a5ff', bg: 'rgba(87,165,255,0.18)',  label: 'Hypertrophy'     },
  endurance:   { color: '#55d6ff', bg: 'rgba(85,214,255,0.18)',  label: 'Endurance'        },
  pr:          { color: '#ff6fd8', bg: 'rgba(255,111,216,0.18)', label: 'PR Attempt'       },
  deload:      { color: '#ffd84d', bg: 'rgba(255,216,77,0.18)',  label: 'Deload'           },
  recovery:    { color: '#57f0c0', bg: 'rgba(87,240,192,0.15)',  label: 'Active Recovery'  },
  power:       { color: '#ff6fd8', bg: 'rgba(255,111,216,0.15)', label: 'Power'            },
  buildup:     { color: '#57f0c0', bg: 'rgba(87,240,192,0.18)',  label: 'Build-Up'         },
};

/* ─── Compute recovery % per muscle group from schedule ─── */
function computeRecovery(schedule) {
  const HEAL = { legs: 3, push: 2, pull: 2 };
  const now = new Date(); now.setHours(0,0,0,0);

  let lastLegs = null, lastPush = null, lastPull = null;

  // walk schedule backwards to find most recent training day per group
  for (const day of [...schedule].reverse()) {
    if (day.rest || !day.lift) continue;
    const l = (day.lift || '').toLowerCase();
    const daysAgo = Math.round((now - day.date) / 86400000);
    if (daysAgo < 0) continue; // future
    if (!lastLegs && (l.includes('squat') || l.includes('leg') || l.includes('lower'))) lastLegs = daysAgo;
    if (!lastPush && (l.includes('bench') || l.includes('press') || l.includes('ohp'))) lastPush = daysAgo;
    if (!lastPull && (l.includes('deadlift') || l.includes('row') || l.includes('pull') || l.includes('back'))) lastPull = daysAgo;
  }

  const pct = (daysAgo, healDays) => {
    if (daysAgo === null) return 1.0;
    return Math.min(daysAgo / healDays, 1.0);
  };

  return [
    { label: 'Legs',  color: '#57f0c0', trackColor: 'rgba(87,240,192,0.13)',  r: 42, pct: pct(lastLegs, HEAL.legs) },
    { label: 'Push',  color: '#57a5ff', trackColor: 'rgba(87,165,255,0.13)',  r: 57, pct: pct(lastPush, HEAL.push) },
    { label: 'Pull',  color: '#8f7cff', trackColor: 'rgba(143,124,255,0.13)', r: 72, pct: pct(lastPull, HEAL.pull) },
  ];
}

/* ─── Recovery Rings ─── */
function RecoveryRings({ rings }) {
  const size = 152;
  const cx = size / 2, cy = size / 2;
  const strokeW = 9;
  const avgPct = Math.round(rings.reduce((s, r) => s + r.pct, 0) / rings.length * 100);

  return (
    <div className="home-recovery-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
        {rings.map(({ color, trackColor, r, pct }) => {
          const circ = 2 * Math.PI * r;
          const offset = circ * (1 - pct);
          return (
            <g key={r}>
              <circle cx={cx} cy={cy} r={r} fill="none" stroke={trackColor} strokeWidth={strokeW} />
              <circle cx={cx} cy={cy} r={r} fill="none"
                stroke={color} strokeWidth={strokeW} strokeLinecap="round"
                strokeDasharray={circ} strokeDashoffset={offset}
                transform={`rotate(-90 ${cx} ${cy})`}
                style={{ transition: 'stroke-dashoffset 0.7s ease' }}
              />
            </g>
          );
        })}
        <text x={cx} y={cy - 7} textAnchor="middle" fill="rgba(247,249,255,0.92)"
          fontSize="18" fontWeight="700" fontFamily="'Space Grotesk', sans-serif">{avgPct}%</text>
        <text x={cx} y={cy + 10} textAnchor="middle" fill="rgba(216,226,255,0.45)"
          fontSize="9.5" fontWeight="600" fontFamily="'Inter', sans-serif">recovery</text>
      </svg>
      <div className="home-recovery-legend">
        {rings.map(({ label, color, pct }) => (
          <div key={label} className="home-recovery-leg-item">
            <span className="home-recovery-leg-dot" style={{ background: color }} />
            <span className="home-recovery-leg-label">{label}</span>
            <span className="home-recovery-leg-pct" style={{ color }}>{Math.round(pct * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Mini Calorie Ring ─── */
function MiniCalorieRing({ consumed, goal }) {
  const radius = 32, stroke = 6;
  const norm = radius - stroke / 2;
  const circ = 2 * Math.PI * norm;
  const pct = Math.min(consumed / goal, 1);
  const offset = circ * (1 - pct);
  const isOver = consumed > goal;
  const color = isOver ? '#ff9f63' : pct > 0.85 ? '#ffd84d' : '#57f0c0';
  return (
    <svg width={radius*2} height={radius*2} style={{ display:'block', flexShrink:0 }}>
      <circle cx={radius} cy={radius} r={norm} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
      <circle cx={radius} cy={radius} r={norm} fill="none"
        stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={offset}
        transform={`rotate(-90 ${radius} ${radius})`}
        style={{ transition: 'stroke-dashoffset 0.5s ease' }}
      />
      <text x={radius} y={radius - 4} textAnchor="middle" fill="#f7f9ff"
        fontSize="10" fontWeight="700" fontFamily="'Space Grotesk', sans-serif">
        {consumed.toLocaleString()}
      </text>
      <text x={radius} y={radius + 7} textAnchor="middle" fill="rgba(216,226,255,0.5)"
        fontSize="7" fontWeight="600" fontFamily="'Inter', sans-serif">
        /{goal.toLocaleString()}
      </text>
    </svg>
  );
}

/* ─── Sparkline ─── */
function Sparkline({ points }) {
  const W = 100, H = 36;
  const max = Math.max(...points), min = Math.min(...points);
  const range = Math.max(max - min, 1);
  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * W;
    const y = H - ((p - min) / range) * (H - 8) - 4;
    return `${x},${y}`;
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: 90, height: 32, flexShrink: 0 }} preserveAspectRatio="none">
      <polyline points={coords.join(' ')} fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ─── DAY_SHORT for week strip ─── */
const DAY_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

/* ─── Main Component ─── */
function HomePage({ summary, athlete, schedule, nutrition, progress, startTodaysWorkout, goToScreen }) {
  const todayKey = toKey(new Date());

  /* today's schedule day */
  const todayScheduleDay = schedule?.[0] || null;
  const isRestDay = todayScheduleDay?.rest === true;
  const todayLift = todayScheduleDay?.lift || null;
  const todayType = todayScheduleDay?.type || null;
  const dayType = isRestDay
    ? { label: 'Rest Day', emoji: '😴', accent: '#ffd84d', sub: 'Recovery · Sleep · Light movement' }
    : getDayType(todayLift);

  /* nutrition */
  const blocks = nutrition?.bulkCutBlocks ?? [];
  const todayBlock = blocks.find(b => todayKey >= b.start && todayKey <= b.end) ?? null;
  const cycleType = todayBlock?.type ?? null;
  const goalWeight = nutrition?.goalWeight ?? null;
  const calorieGoal = calcDailyCalories(athlete, cycleType, goalWeight);
  const todayMeals = (() => {
    try { return JSON.parse(localStorage.getItem(`calorie-meals-${todayKey}`) || '[]'); } catch { return []; }
  })();
  const caloriesConsumed = todayMeals.reduce((s, m) => s + (m.cals || 0), 0);

  /* recovery rings */
  const recoveryRings = computeRecovery(schedule || []);

  /* training week — next 7 days from schedule */
  const weekDays = (schedule || []).slice(0, 7);

  /* progress rows */
  const progressRows = [
    { name: 'Deadlift', value: `${progress.deadlift[progress.deadlift.length-1]} lb`, points: progress.deadlift, color: '#8f7cff' },
    { name: 'Squat',    value: `${progress.squat[progress.squat.length-1]} lb`,    points: progress.squat,    color: '#57a5ff' },
    { name: 'Bench',    value: `${progress.bench[progress.bench.length-1]} lb`,    points: progress.bench,    color: '#57f0c0' },
  ];

  const typeInfo = todayType ? TYPE_COLORS[todayType] : null;
  const cycleDotColor = { bulk:'#57a5ff', cut:'#ff6fd8', maintain:'#57f0c0' }[cycleType] || 'rgba(255,255,255,0.3)';

  return (
    <div className="screen home-screen">
      <div className="home-shell">

        {/* ── HERO: Today's Workout ── */}
        <section className="home-hero-workout glass-panel">
          <div className="home-hero-eyebrow">
            <span className="home-hero-kicker">Today · {new Date().toLocaleDateString('en-US', { weekday:'long', month:'short', day:'numeric' })}</span>
            {typeInfo && !isRestDay && (
              <span className="home-hero-type-pill" style={{ color: typeInfo.color, background: typeInfo.bg, borderColor: typeInfo.color + '44' }}>
                {typeInfo.label}
              </span>
            )}
          </div>

          <div className="home-hero-main">
            <div className="home-hero-left">
              <div className="home-hero-day-emoji" style={{ color: dayType?.accent }}>
                {dayType?.emoji}
              </div>
              <div className="home-hero-copy">
                <h1 className="home-hero-day-label" style={{ color: dayType?.accent }}>
                  {dayType?.label}
                </h1>
                <p className="home-hero-day-sub">{dayType?.sub}</p>
                {todayLift && !isRestDay && (
                  <p className="home-hero-lift-name">{todayLift}</p>
                )}
              </div>
            </div>

            <div className="home-hero-right">
              {!isRestDay ? (
                <button className="home-start-btn" onClick={startTodaysWorkout} style={{ '--accent': dayType?.accent || '#57f0c0' }}>
                  <span className="home-start-btn-label">Start workout</span>
                  <span className="home-start-btn-arrow">›</span>
                </button>
              ) : (
                <div className="home-rest-badge">
                  <span>Rest up</span>
                  <span className="home-rest-sub">See you tomorrow</span>
                </div>
              )}
            </div>
          </div>

          {summary?.topInsight && (
            <div className="home-coach-insight">
              <span className="home-coach-spark">✦</span>
              <p className="home-coach-text">{summary.topInsight}</p>
            </div>
          )}
        </section>

        {/* ── TRAINING WEEK + RECOVERY ── */}
        <section className="home-mid-row">

          {/* Week strip */}
          <div className="home-week-panel glass-panel">
            <div className="home-panel-head">
              <span className="home-panel-kicker">Schedule</span>
              <h2 className="home-panel-title">Training week</h2>
            </div>
            <div className="home-week-cards">
              {weekDays.map((day, i) => {
                const wt = day.type ? TYPE_COLORS[day.type] : null;
                const dt = !day.rest ? getDayType(day.lift) : null;
                const isToday = i === 0;
                return (
                  <div key={day.dateKey} className={`home-week-card ${isToday ? 'home-week-card-today' : ''} ${day.rest ? 'home-week-card-rest' : ''}`}
                    style={ isToday && dt ? { borderColor: dt.accent + '55', background: dt.accent + '0d' } : {} }>
                    <div className="home-wc-day">{DAY_SHORT[day.weekday]}</div>
                    <div className={`home-wc-num ${isToday ? 'home-wc-num-today' : ''}`} style={ isToday && dt ? { color: dt.accent } : {} }>
                      {day.dayNum}
                    </div>
                    {day.rest ? (
                      <div className="home-wc-rest">Rest</div>
                    ) : (
                      <>
                        <div className="home-wc-lift">{day.lift?.replace('Back ', '')}</div>
                        {wt && <div className="home-wc-type" style={{ color: wt.color, background: wt.bg }}>{wt.label}</div>}
                      </>
                    )}
                    {isToday && <div className="home-wc-today-dot" style={{ background: dt?.accent || '#fff' }} />}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recovery rings */}
          <div className="home-recovery-panel glass-panel">
            <div className="home-panel-head">
              <span className="home-panel-kicker">Muscle status</span>
              <h2 className="home-panel-title">Recovery</h2>
            </div>
            <RecoveryRings rings={recoveryRings} />
          </div>
        </section>

        {/* ── NUTRITION + PROGRESS ── */}
        <section className="home-bottom-row">

          {/* Nutrition */}
          <div className="home-nutr-panel glass-panel">
            <div className="home-panel-head">
              <span className="home-panel-kicker">Nutrition</span>
              <h2 className="home-panel-title">Today's intake</h2>
              {cycleType && (
                <span className="home-nutr-cycle-pill">
                  <span className="home-nutr-cycle-dot" style={{ background: cycleDotColor }} />
                  {cycleType.charAt(0).toUpperCase() + cycleType.slice(1)}
                </span>
              )}
            </div>

            <div className="home-nutr-ring-row">
              <MiniCalorieRing consumed={caloriesConsumed} goal={calorieGoal} />
              <div className="home-nutr-stats">
                <div className="home-nutr-stat">
                  <span className="home-nutr-stat-label">Consumed</span>
                  <span className="home-nutr-stat-val">{caloriesConsumed.toLocaleString()} <span className="home-nutr-stat-unit">kcal</span></span>
                </div>
                <div className="home-nutr-stat">
                  <span className="home-nutr-stat-label">{caloriesConsumed > calorieGoal ? 'Over by' : 'Remaining'}</span>
                  <span className="home-nutr-stat-val" style={{ color: caloriesConsumed > calorieGoal ? '#ff9f63' : '#57f0c0' }}>
                    {Math.abs(calorieGoal - caloriesConsumed).toLocaleString()} <span className="home-nutr-stat-unit">kcal</span>
                  </span>
                </div>
                <div className="home-nutr-stat">
                  <span className="home-nutr-stat-label">Target</span>
                  <span className="home-nutr-stat-val">{calorieGoal.toLocaleString()} <span className="home-nutr-stat-unit">kcal</span></span>
                </div>
              </div>
            </div>

            {todayMeals.length > 0 ? (
              <div className="home-nutr-meals">
                {todayMeals.slice(0, 3).map(m => (
                  <div key={m.id} className="home-nutr-meal-row">
                    <span className="home-nutr-meal-name">{m.name}</span>
                    <span className="home-nutr-meal-cal">{m.cals} kcal</span>
                  </div>
                ))}
                {todayMeals.length > 3 && <div className="home-nutr-meal-more">+{todayMeals.length - 3} more meals</div>}
              </div>
            ) : (
              <div className="home-nutr-empty">No meals logged yet — <button className="home-nutr-link" onClick={() => goToScreen?.('nutrition')}>go to nutrition →</button></div>
            )}
          </div>

          {/* Progress */}
          <div className="home-progress-panel glass-panel">
            <div className="home-panel-head">
              <span className="home-panel-kicker">Progress</span>
              <h2 className="home-panel-title">Recent trends</h2>
            </div>
            <div className="home-progress-list">
              {progressRows.map(row => (
                <div key={row.name} className="home-progress-row">
                  <div className="home-progress-meta">
                    <span className="home-progress-name">{row.name}</span>
                    <span className="home-progress-val" style={{ color: row.color }}>{row.value}</span>
                  </div>
                  <div style={{ color: row.color }}>
                    <Sparkline points={row.points} />
                  </div>
                </div>
              ))}
            </div>
          </div>

        </section>
      </div>
    </div>
  );
}

export default HomePage;
