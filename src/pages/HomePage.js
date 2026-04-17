import '../styles/home.css';

/* ─── helpers (self-contained, no imports needed) ─── */
function toKey(d) {
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
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

/* ─── Mini Calorie Ring ─── */
function MiniCalorieRing({ consumed, goal }) {
  const radius = 34;
  const stroke = 6;
  const norm = radius - stroke / 2;
  const circ = 2 * Math.PI * norm;
  const pct = Math.min(consumed / goal, 1);
  const offset = circ * (1 - pct);
  const isOver = consumed > goal;
  const color = isOver ? '#ff9f63' : pct > 0.85 ? '#ffd84d' : '#57f0c0';

  return (
    <svg width={radius * 2} height={radius * 2} style={{ display: 'block', flexShrink: 0 }}>
      <circle cx={radius} cy={radius} r={norm} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
      <circle
        cx={radius} cy={radius} r={norm} fill="none"
        stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={offset}
        transform={`rotate(-90 ${radius} ${radius})`}
        style={{ transition: 'stroke-dashoffset 0.5s ease, stroke 0.4s ease' }}
      />
      <text x={radius} y={radius - 5} textAnchor="middle" fill="#f7f9ff"
        fontSize="10" fontWeight="700" fontFamily="'Space Grotesk', sans-serif">
        {consumed.toLocaleString()}
      </text>
      <text x={radius} y={radius + 7} textAnchor="middle" fill="rgba(216,226,255,0.5)"
        fontSize="7.5" fontWeight="600" fontFamily="'Inter', sans-serif">
        / {goal.toLocaleString()}
      </text>
    </svg>
  );
}

/* ─── Sparkline (unchanged) ─── */
function Sparkline({ points }) {
  const width = 120;
  const height = 42;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = Math.max(max - min, 1);

  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * width;
    const y = height - ((p - min) / range) * (height - 8) - 4;
    return `${x},${y}`;
  });

  return (
    <svg className="home-sparkline" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <polyline
        points={coords.join(' ')}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HomePage({ summary, athlete, schedule, nutrition, progress, startTodaysWorkout }) {
  const weekCards = schedule || [];
  const progressRows = [
    { name: 'Deadlift', value: `${progress.deadlift[progress.deadlift.length - 1]} lb`, points: progress.deadlift },
    { name: 'Squat',    value: `${progress.squat[progress.squat.length - 1]} lb`,    points: progress.squat },
    { name: 'Bench',    value: `${progress.bench[progress.bench.length - 1]} lb`,    points: progress.bench },
  ];

  /* ── Nutrition panel data ── */
  const todayKey = toKey(new Date());

  // Find today's active bulk/cut block
  const blocks = nutrition.bulkCutBlocks ?? [];
  const todayBlock = blocks.find((b) => todayKey >= b.start && todayKey <= b.end) ?? null;
  const cycleType = todayBlock?.type ?? null;
  const goalWeight = nutrition.goalWeight ?? null;

  // Calorie goal + today's logged meals
  const calorieGoal = calcDailyCalories(athlete, cycleType, goalWeight);
  const todayMeals = (() => {
    try { return JSON.parse(localStorage.getItem(`calorie-meals-${todayKey}`) || '[]'); }
    catch { return []; }
  })();
  const caloriesConsumed = todayMeals.reduce((s, m) => s + (m.cals || 0), 0);
  const caloriesLeft = calorieGoal - caloriesConsumed;
  const isOver = caloriesConsumed > calorieGoal;

  // Weight change summary
  const weightLog = nutrition.weightLog ?? [];
  const weightChange = weightLog.length >= 2
    ? +(weightLog[weightLog.length - 1].weight - weightLog[0].weight).toFixed(1)
    : null;
  const weightChangeLabel = weightChange === null
    ? null
    : weightChange === 0
    ? '→ no change'
    : weightChange > 0
    ? `+${weightChange} lbs`
    : `${weightChange} lbs`;
  const weightChangeColor = weightChange === null ? 'rgba(216,226,255,0.4)'
    : cycleType === 'bulk' ? (weightChange > 0 ? '#57f0c0' : '#ff9f63')
    : cycleType === 'cut'  ? (weightChange < 0 ? '#57f0c0' : '#ff9f63')
    : '#ffd84d';

  const cycleLabel = cycleType
    ? cycleType.charAt(0).toUpperCase() + cycleType.slice(1)
    : 'No active cycle';

  const cycleDotColor = { bulk: '#57a5ff', cut: '#ff6fd8', maintain: '#57f0c0' }[cycleType] || 'rgba(255,255,255,0.3)';

  return (
    <div className="screen home-screen">
      <div className="home-shell">
        <section className="home-top-row">
          <div className="home-brand glass-panel">
            <div className="home-brand-mark-wrap">
              <div className="home-brand-orbit orbit-1" />
              <div className="home-brand-orbit orbit-2" />
              <div className="home-brand-fallback">★</div>
            </div>

            <div className="home-brand-copy">
              <div className="home-eyebrow">Coach</div>
              <h1 className="home-wordmark">Nova</h1>
              <p className="home-brand-sub">
                Precision training, cosmic energy, cleaner progress.
              </p>
            </div>
          </div>

          <div className="home-week glass-panel">
            <div className="home-section-head">
              <div>
                <div className="home-kicker">Upcoming</div>
                <h2 className="home-section-title">Training week</h2>
              </div>
              <button className="home-ghost-btn" type="button">
                {athlete.firstName} {athlete.lastName}
              </button>
            </div>

            <div className="home-week-strip">
              <button className="home-strip-arrow" type="button">‹</button>

              <div className="home-week-cards">
                {weekCards.map((card) => (
                  <div
                    key={card.id}
                    className={`home-week-card ${card.status === 'active' ? 'is-active' : ''}`}
                  >
                    <div className="home-week-day">{card.day}</div>
                    <div className="home-week-date">{card.date}</div>
                    <div className="home-week-lift">{card.title}</div>
                  </div>
                ))}
              </div>

              <button className="home-strip-arrow" type="button">›</button>
            </div>
          </div>
        </section>

        <section className="home-hero glass-panel">
          <div className="home-hero-badge">Coach insight</div>

          <div className="home-hero-inner">
            <div className="home-hero-star">✦</div>

            <div className="home-hero-copy">
              <h2 className="home-hero-title">
                Start today&apos;s workout when you&apos;re ready.
              </h2>
              <p className="home-hero-text">
                {summary.topInsight}
              </p>
            </div>

            <button className="home-start-btn" type="button" onClick={startTodaysWorkout}>
              Start today&apos;s workout
            </button>
          </div>
        </section>

        <section className="home-bottom-row">
          <div className="home-phase glass-panel">
            <div className="home-section-head">
              <div>
                <div className="home-kicker">Phase</div>
                <h2 className="home-section-title">Current focus</h2>
              </div>
            </div>

            <div className="home-phase-wheel-wrap">
              <div className="home-phase-wheel">
                <div className="home-phase-center">
                  <div className="home-phase-center-top">Phase</div>
                  <div className="home-phase-center-main">{athlete.phase}</div>
                  <div className="home-phase-center-sub">
                    Week {athlete.phaseWeek} / {athlete.phaseTotalWeeks}
                  </div>
                </div>

                <div className="home-phase-node node-top">Squat</div>
                <div className="home-phase-node node-right">Bench</div>
                <div className="home-phase-node node-bottom active">Deadlift</div>
                <div className="home-phase-node node-left">Pull</div>
              </div>
            </div>
          </div>

          {/* ── Nutrition panel — enhanced ── */}
          <div className="home-nutrition glass-panel">
            <div className="home-section-head">
              <div>
                <div className="home-kicker">Nutrition</div>
                <h2 className="home-section-title">Today's intake</h2>
              </div>
              {/* Cycle badge */}
              <div style={hn.cycleBadge}>
                <span style={{ ...hn.cycleDot, background: cycleDotColor }} />
                {cycleLabel}
              </div>
            </div>

            {/* Calorie ring + stats */}
            <div style={hn.ringRow}>
              <MiniCalorieRing consumed={caloriesConsumed} goal={calorieGoal} />

              <div style={hn.ringStats}>
                <div style={hn.statItem}>
                  <span style={hn.statLabel}>Consumed</span>
                  <span style={hn.statVal}>{caloriesConsumed.toLocaleString()} <span style={hn.statUnit}>kcal</span></span>
                </div>
                <div style={hn.statItem}>
                  <span style={hn.statLabel}>{isOver ? 'Over by' : 'Remaining'}</span>
                  <span style={{ ...hn.statVal, color: isOver ? '#ff9f63' : '#57f0c0' }}>
                    {Math.abs(caloriesLeft).toLocaleString()} <span style={hn.statUnit}>kcal</span>
                  </span>
                </div>
                <div style={hn.statItem}>
                  <span style={hn.statLabel}>Target</span>
                  <span style={hn.statVal}>{calorieGoal.toLocaleString()} <span style={hn.statUnit}>kcal</span></span>
                </div>
              </div>
            </div>

            {/* Meals logged today */}
            {todayMeals.length > 0 && (
              <div style={hn.mealsPreview}>
                {todayMeals.slice(0, 3).map((m) => (
                  <div key={m.id} style={hn.mealChip}>
                    <span style={hn.mealChipName}>{m.name}</span>
                    <span style={hn.mealChipCal}>{m.cals} kcal</span>
                  </div>
                ))}
                {todayMeals.length > 3 && (
                  <div style={hn.mealChipMore}>+{todayMeals.length - 3} more</div>
                )}
              </div>
            )}

            {todayMeals.length === 0 && (
              <div style={hn.noMeals}>No meals logged yet today</div>
            )}

            {/* Weight change summary */}
            {weightChangeLabel && (
              <div style={hn.weightRow}>
                <span style={hn.weightLabel}>Weight change</span>
                <span style={{ ...hn.weightVal, color: weightChangeColor }}>
                  {weightChangeLabel}
                </span>
                {goalWeight && (
                  <span style={hn.weightGoal}>goal {goalWeight} lbs</span>
                )}
              </div>
            )}

            {!weightChangeLabel && (
              <div style={hn.noWeight}>Log a weigh-in on the Nutrition page to track progress</div>
            )}
          </div>

          <div className="home-progress glass-panel">
            <div className="home-section-head">
              <div>
                <div className="home-kicker">Progress</div>
                <h2 className="home-section-title">Recent trends</h2>
              </div>
            </div>

            <div className="home-progress-list">
              {progressRows.map((row) => (
                <div key={row.name} className="home-progress-row">
                  <div className="home-progress-meta">
                    <div className="home-progress-name">{row.name}</div>
                    <div className="home-progress-value">{row.value}</div>
                  </div>
                  <Sparkline points={row.points} />
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

/* ── Inline styles for the enhanced nutrition panel (scoped, no CSS conflicts) ── */
const hn = {
  cycleBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
    borderRadius: 999,
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.1)',
    fontSize: '0.7rem',
    fontWeight: 700,
    color: 'rgba(247,249,255,0.7)',
    fontFamily: "'Inter', sans-serif",
    whiteSpace: 'nowrap',
  },
  cycleDot: {
    width: 7, height: 7, borderRadius: '50%', flexShrink: 0, display: 'inline-block',
  },
  ringRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    margin: '12px 0 10px',
  },
  ringStats: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    flex: 1,
  },
  statItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statLabel: {
    fontSize: '0.72rem',
    fontWeight: 600,
    color: 'rgba(216,226,255,0.5)',
    fontFamily: "'Inter', sans-serif",
  },
  statVal: {
    fontSize: '0.86rem',
    fontWeight: 700,
    color: '#f7f9ff',
    fontFamily: "'Space Grotesk', sans-serif",
  },
  statUnit: {
    fontSize: '0.68rem',
    fontWeight: 600,
    color: 'rgba(216,226,255,0.45)',
    fontFamily: "'Inter', sans-serif",
  },
  mealsPreview: {
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
    marginBottom: 10,
  },
  mealChip: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 10px',
    borderRadius: 10,
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.08)',
  },
  mealChipName: {
    fontSize: '0.76rem',
    fontWeight: 600,
    color: 'rgba(247,249,255,0.78)',
    fontFamily: "'Inter', sans-serif",
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '70%',
  },
  mealChipCal: {
    fontSize: '0.72rem',
    fontWeight: 700,
    color: '#57f0c0',
    fontFamily: "'Inter', sans-serif",
    whiteSpace: 'nowrap',
  },
  mealChipMore: {
    fontSize: '0.7rem',
    fontWeight: 700,
    color: 'rgba(216,226,255,0.4)',
    fontFamily: "'Inter', sans-serif",
    paddingLeft: 10,
  },
  noMeals: {
    fontSize: '0.74rem',
    fontWeight: 600,
    color: 'rgba(216,226,255,0.35)',
    fontFamily: "'Inter', sans-serif",
    marginBottom: 8,
  },
  weightRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 10px',
    borderRadius: 12,
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.08)',
    marginTop: 4,
    flexWrap: 'wrap',
  },
  weightLabel: {
    fontSize: '0.72rem',
    fontWeight: 600,
    color: 'rgba(216,226,255,0.5)',
    fontFamily: "'Inter', sans-serif",
    flex: 1,
  },
  weightVal: {
    fontSize: '0.9rem',
    fontWeight: 800,
    fontFamily: "'Space Grotesk', sans-serif",
  },
  weightGoal: {
    fontSize: '0.68rem',
    fontWeight: 600,
    color: 'rgba(216,226,255,0.35)',
    fontFamily: "'Inter', sans-serif",
  },
  noWeight: {
    fontSize: '0.72rem',
    fontWeight: 600,
    color: 'rgba(216,226,255,0.3)',
    fontFamily: "'Inter', sans-serif",
    marginTop: 6,
    lineHeight: 1.4,
  },
};

export default HomePage;
