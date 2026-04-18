import '../styles/home.css';
import { useState, useCallback } from 'react';

// ─────────────────────────────────────────────────────────────
// RE-USED FROM CALENDAR
// ─────────────────────────────────────────────────────────────

const DAY_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

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
// LIFT IMAGE MAP
// ─────────────────────────────────────────────────────────────

function getLiftImage(lift) {
  if (!lift) return null;
  const l = lift.toLowerCase();
  if (l.includes('front squat'))                                          return '/frontsquat.png';
  if (l.includes('squat') || l.includes('leg') || l.includes('lower'))   return '/backsquat.png';
  if (l.includes('overhead') || l.includes('ohp'))                        return '/overhead.png';
  if (l.includes('bench') || l.includes('chest') || l.includes('push'))  return '/bench.png';
  if (l.includes('deadlift') || l.includes('pull') || l.includes('back') || l.includes('row')) return '/deadlift.png';
  return null;
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

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

function getDayType(lift) {
  if (!lift) return null;
  const l = lift.toLowerCase();
  if (l.includes('squat') || l.includes('leg') || l.includes('lower'))
    return { label: 'Leg Day', emoji: '🦵', accent: '#57f0c0', sub: 'Quads · Hamstrings · Glutes' };
  if (l.includes('bench') || l.includes('chest') || l.includes('ohp') || l.includes('overhead') || l.includes('press') || l.includes('push'))
    return { label: 'Push Day', emoji: '💪', accent: '#57a5ff', sub: 'Chest · Shoulders · Triceps' };
  if (l.includes('deadlift') || l.includes('row') || l.includes('pull') || l.includes('back') || l.includes('upper'))
    return { label: 'Pull Day', emoji: '🏋️', accent: '#8f7cff', sub: 'Back · Biceps · Rear Delts' };
  if (l.includes('recovery') || l.includes('deload') || l.includes('mobility'))
    return { label: 'Recovery Day', emoji: '🧘', accent: '#ffd84d', sub: 'Active recovery · Mobility' };
  return { label: lift, emoji: '⚡', accent: '#ff9f63', sub: "Today's session" };
}

const TYPE_COLORS = {
  strength:    { color: '#8f7cff', bg: 'rgba(143,124,255,0.18)', label: 'Strength'       },
  hypertrophy: { color: '#57a5ff', bg: 'rgba(87,165,255,0.18)',  label: 'Hypertrophy'    },
  endurance:   { color: '#55d6ff', bg: 'rgba(85,214,255,0.18)',  label: 'Endurance'      },
  pr:          { color: '#ff6fd8', bg: 'rgba(255,111,216,0.18)', label: 'PR Attempt'     },
  deload:      { color: '#ffd84d', bg: 'rgba(255,216,77,0.18)',  label: 'Deload'         },
  recovery:    { color: '#57f0c0', bg: 'rgba(87,240,192,0.15)',  label: 'Active Recovery'},
  power:       { color: '#ff6fd8', bg: 'rgba(255,111,216,0.15)', label: 'Power'          },
  buildup:     { color: '#57f0c0', bg: 'rgba(87,240,192,0.18)',  label: 'Build-Up'       },
};

function computeRecovery(schedule) {
  const HEAL = { legs: 3, push: 2, pull: 2 };
  const now = new Date(); now.setHours(0,0,0,0);
  let lastLegs = null, lastPush = null, lastPull = null;
  for (const day of [...schedule].reverse()) {
    if (day.rest || !day.lift) continue;
    const l = (day.lift || '').toLowerCase();
    const daysAgo = Math.round((now - day.date) / 86400000);
    if (daysAgo < 0) continue;
    if (!lastLegs && (l.includes('squat') || l.includes('leg') || l.includes('lower'))) lastLegs = daysAgo;
    if (!lastPush && (l.includes('bench') || l.includes('press') || l.includes('ohp')))  lastPush = daysAgo;
    if (!lastPull && (l.includes('deadlift') || l.includes('row') || l.includes('pull') || l.includes('back'))) lastPull = daysAgo;
  }
  const pct = (daysAgo, healDays) => daysAgo === null ? 1.0 : Math.min(daysAgo / healDays, 1.0);
  return [
    { label: 'Legs', color: '#57f0c0', trackColor: 'rgba(87,240,192,0.13)',  r: 42, pct: pct(lastLegs, HEAL.legs) },
    { label: 'Push', color: '#57a5ff', trackColor: 'rgba(87,165,255,0.13)',  r: 57, pct: pct(lastPush, HEAL.push) },
    { label: 'Pull', color: '#8f7cff', trackColor: 'rgba(143,124,255,0.13)', r: 72, pct: pct(lastPull, HEAL.pull) },
  ];
}

// ─────────────────────────────────────────────────────────────
// FULL WEEK STRIP
// ─────────────────────────────────────────────────────────────

function FullWeekStrip({ days, blocked, onDayClick, onBlockToggle, accDone, weekOffset, onWeekChange }) {
  const today = new Date(); today.setHours(0,0,0,0);
  const startDate = new Date(today);
  startDate.setDate(today.getDate() + weekOffset * 7);
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 6);
  const weekLabel = `${MONTH_NAMES[startDate.getMonth()]} ${startDate.getDate()} – ${MONTH_NAMES[endDate.getMonth()]} ${endDate.getDate()}`;

  const btnBase = {
    padding: '5px 14px', borderRadius: 999, fontSize: '0.74rem', fontWeight: 700,
    fontFamily: "'Space Grotesk', sans-serif", border: '1px solid', cursor: 'pointer',
    whiteSpace: 'nowrap', transition: 'background 0.15s',
  };

  return (
    <div className="home-full-calendar glass-panel" style={{ padding: '20px 20px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
        <div>
          <div style={{ fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'rgba(216,226,255,0.4)', fontFamily: "'Inter', sans-serif", marginBottom: 3 }}>
            Schedule
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'rgba(247,249,255,0.9)', fontFamily: "'Space Grotesk', sans-serif" }}>
            Training Calendar
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <button
            disabled={weekOffset === 0}
            onClick={() => onWeekChange(0)}
            style={{ ...btnBase, background: weekOffset === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(87,165,255,0.12)', borderColor: weekOffset === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(87,165,255,0.3)', color: weekOffset === 0 ? 'rgba(216,226,255,0.25)' : '#57a5ff', cursor: weekOffset === 0 ? 'default' : 'pointer' }}
          >
            ← Wk 1
          </button>
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'rgba(247,249,255,0.75)', fontFamily: "'Space Grotesk', sans-serif", whiteSpace: 'nowrap', minWidth: 112, textAlign: 'center' }}>
            {weekLabel}
          </span>
          <button
            disabled={weekOffset === 1}
            onClick={() => onWeekChange(1)}
            style={{ ...btnBase, background: weekOffset === 1 ? 'rgba(255,255,255,0.04)' : 'rgba(87,165,255,0.12)', borderColor: weekOffset === 1 ? 'rgba(255,255,255,0.08)' : 'rgba(87,165,255,0.3)', color: weekOffset === 1 ? 'rgba(216,226,255,0.25)' : '#57a5ff', cursor: weekOffset === 1 ? 'default' : 'pointer' }}
          >
            Wk 2 →
          </button>
        </div>
      </div>

      <div className="cal-week-strip">
        {days.map(day => {
          const isBlocked = blocked.has(day.dateKey);
          const wt = day.type ? WORKOUT_TYPES[day.type] : null;
          const accs = day.accessories || [];
          const dayAcc = accDone[day.dateKey] || {};
          const doneAcc = Object.values(dayAcc).filter(Boolean).length;

          const cycleColor   = (day.cycleOptIn && day.cycleInfo) ? day.cycleInfo.phase.colorRaw : null;
          const bulkCutColor =
            day.bulkCutBlock?.type === 'bulk'     ? '#57f0c0' :
            day.bulkCutBlock?.type === 'cut'      ? '#ff9f63' :
            day.bulkCutBlock?.type === 'maintain' ? '#57a5ff' : null;

          const liftImg = !day.rest && !isBlocked ? getLiftImage(day.lift) : null;

          return (
            <div
              key={day.dateKey}
              className={[
                'cal-day-card',
                day.isToday ? 'cal-day-today' : '',
                isBlocked   ? 'cal-day-blocked' : '',
                day.rest    ? 'cal-day-rest' : '',
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
                <span className={`cal-day-num ${day.isToday ? 'cal-day-num-today' : ''}`}>{day.dayNum}</span>
              </div>

              {!isBlocked && day.cycleOptIn && day.cycleInfo && (
                <div className="cal-card-cycle-label" style={{ color: cycleColor || 'var(--muted)' }}>
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
                  {/* Lift image if available, otherwise just show lift name */}
                  {liftImg && (
                    <img
                      src={liftImg}
                      alt={day.lift}
                      style={{
                        width: 136, height: 136, objectFit: 'contain',
                        filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.4))',
                        margin: '2px 0',
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <div className="cal-day-lift">{day.lift}</div>
                  {wt && <div className="cal-day-type" style={{ color: wt.color }}>{wt.label}</div>}
                  {bulkCutColor && (
                    <div className="cal-day-nutr" style={{ color: bulkCutColor }}>
                      {day.bulkCutBlock.type.charAt(0).toUpperCase() + day.bulkCutBlock.type.slice(1)}
                      {day.caloricDelta ? ` · ${day.caloricDelta}` : ''}
                    </div>
                  )}
                  {accs.length > 0 && (
                    <div className="cal-day-acc-progress">
                      <div className="cal-day-acc-bar" style={{ width: `${(doneAcc / accs.length) * 100}%` }} />
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// DAY MODAL
// ─────────────────────────────────────────────────────────────

function DayModal({ day, athlete, onClose, onBlock, onStartLift, onToggleAcc, accDone }) {
  const wt        = day.type ? WORKOUT_TYPES[day.type] : null;
  const accs      = day.accessories || [];
  const dayAcc    = accDone[day.dateKey] || {};
  const doneCount = Object.values(dayAcc).filter(Boolean).length;

  return (
    <div className="cal-modal-overlay" onClick={e => e.target.classList.contains('cal-modal-overlay') && onClose()}>
      <div className="cal-modal">
        <div className="cal-modal-head">
          <div>
            <div className="cal-modal-date">
              {day.dayLabel}
              {day.isToday && <span className="cal-today-tag">Today</span>}
            </div>
            <div className="cal-modal-title">{day.rest ? 'Rest Day' : (day.lift || '—')}</div>
          </div>
          <button className="cal-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="cal-modal-badges">
          {wt && (
            <span className="cal-type-pill" style={{ color: wt.color, background: wt.bg, borderColor: wt.border }}>
              {wt.label}
            </span>
          )}
          {day.cycleOptIn && day.cycleInfo && (
            <span className="cal-cycle-pill" style={{
              color: day.cycleInfo.phase.color,
              borderColor: day.cycleInfo.phase.colorRaw + '55',
              background: day.cycleInfo.phase.colorRaw + '1a',
            }}>
              {day.cycleInfo.phase.label} · D{day.cycleInfo.cycleDay}
              {day.cycleInfo.phase.intensityMod < 1 && ` · ×${day.cycleInfo.phase.intensityMod}`}
            </span>
          )}
          {!day.rest && day.bulkCutBlock && (() => {
            const map = {
              bulk:     { color:'var(--mint)',   border:'rgba(87,240,192,0.35)',  bg:'rgba(87,240,192,0.12)'  },
              cut:      { color:'var(--orange)', border:'rgba(255,159,99,0.35)',  bg:'rgba(255,159,99,0.12)'  },
              maintain: { color:'var(--blue)',   border:'rgba(87,165,255,0.35)',  bg:'rgba(87,165,255,0.12)'  },
            };
            const c = map[day.bulkCutBlock.type] || map.maintain;
            return (
              <span className="cal-nutr-pill" style={{ color: c.color, borderColor: c.border, background: c.bg }}>
                {day.bulkCutBlock.type.charAt(0).toUpperCase() + day.bulkCutBlock.type.slice(1)}
                {day.caloricDelta ? ` · ${day.caloricDelta}` : ''}
              </span>
            );
          })()}
        </div>

        {day.cycleOptIn && day.cycleInfo && (
          <div className="cal-modal-section cal-modal-section-cycle"
            style={{ borderColor: day.cycleInfo.phase.colorRaw + '44', background: day.cycleInfo.phase.colorRaw + '0d' }}>
            <div className="cal-modal-section-label" style={{ color: day.cycleInfo.phase.color }}>
              {day.cycleInfo.phase.label} · Cycle day {day.cycleInfo.cycleDay}
            </div>
            <p className="cal-modal-body">{day.cycleInfo.phase.workoutTip}</p>
            {day.cycleInfo.phase.intensityMod < 1 && (
              <div className="cal-intensity-chip" style={{
                color: day.cycleInfo.phase.color,
                borderColor: day.cycleInfo.phase.colorRaw + '55',
                background: day.cycleInfo.phase.colorRaw + '12',
              }}>
                Target intensity: ~{Math.round(day.cycleInfo.phase.intensityMod * 100)}% of normal working weights
              </div>
            )}
            <p className="cal-modal-body-muted" style={{ marginTop: 8 }}>
              <strong style={{ color: day.cycleInfo.phase.color }}>Nutrition: </strong>
              {day.cycleInfo.phase.nutritionTip}
            </p>
          </div>
        )}

        {day.bulkCutBlock && (
          <div className={`cal-modal-section cal-modal-nutr-${day.bulkCutBlock.type}`}>
            <div className={`cal-modal-section-label cal-nutr-label-${day.bulkCutBlock.type}`}>
              {day.bulkCutBlock.type.charAt(0).toUpperCase() + day.bulkCutBlock.type.slice(1)} phase
              {day.caloricDelta && ` · ${day.caloricDelta} today`}
            </div>
            <p className="cal-modal-body">{day.nutr}</p>
          </div>
        )}

        <div className="cal-modal-section">
          <div className="cal-modal-section-label">Why this is scheduled</div>
          <p className="cal-modal-body">{day.reason}</p>
        </div>

        {!day.bulkCutBlock && !day.cycleInfo && (
          <div className="cal-modal-section">
            <div className="cal-modal-section-label">Nutrition today</div>
            <p className="cal-modal-body">{day.nutr}</p>
          </div>
        )}

        {accs.length > 0 && (
          <div className="cal-modal-section">
            <div className="cal-modal-section-label-row">
              <span className="cal-modal-section-label">Accessories · {athlete?.equipment || 'full gym'}</span>
              <span className="cal-modal-acc-count">{doneCount}/{accs.length} done</span>
            </div>
            <div className="cal-modal-acc-list">
              {accs.map((acc, idx) => {
                const done = !!dayAcc[idx];
                return (
                  <div key={idx} className={`cal-acc-row ${done ? 'cal-acc-done' : ''}`}
                    onClick={() => onToggleAcc(day.dateKey, idx)}>
                    <div className={`cal-acc-check ${done ? 'cal-acc-check-done' : ''}`}>{done ? '✓' : ''}</div>
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
// RECOVERY RINGS
// ─────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────
// MINI CALORIE RING
// ─────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────
// SPARKLINE
// ─────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────
// HOME PAGE
// ─────────────────────────────────────────────────────────────

function HomePage({
  summary,
  athlete,
  schedule,
  nutrition,
  progress,
  blockedDays,
  onBlockToggle,
  startTodaysWorkout,
  goToScreen,
}) {
  const todayKey = toKey(new Date());

  const [weekOffset, setWeekOffset] = useState(0);
  const [accDone,    setAccDone]    = useState({});
  const [modalDay,   setModalDay]   = useState(null);

  const toggleAcc = useCallback((dateKey, idx) => {
    setAccDone(prev => ({
      ...prev,
      [dateKey]: { ...(prev[dateKey] || {}), [idx]: !(prev[dateKey]?.[idx]) },
    }));
  }, []);

  const visibleDays = (schedule || []).slice(weekOffset * 7, weekOffset * 7 + 7);

  const todayScheduleDay = schedule?.[0] || null;
  const isRestDay = todayScheduleDay?.rest === true;
  const todayLift = todayScheduleDay?.lift || null;
  const todayType = todayScheduleDay?.type || null;
  const dayType = isRestDay
    ? { label: 'Rest Day', emoji: '😴', accent: '#ffd84d', sub: 'Recovery · Sleep · Light movement' }
    : getDayType(todayLift);

  // Hero lift image
  const heroLiftImage = !isRestDay ? getLiftImage(todayLift) : null;

  const blocks = nutrition?.bulkCutBlocks ?? [];
  const todayBlock = blocks.find(b => todayKey >= b.start && todayKey <= b.end) ?? null;
  const cycleType = todayBlock?.type ?? null;
  const goalWeight = nutrition?.goalWeight ?? null;
  const calorieGoal = calcDailyCalories(athlete, cycleType, goalWeight);
  const todayMeals = (() => {
    try { return JSON.parse(localStorage.getItem(`calorie-meals-${todayKey}`) || '[]'); } catch { return []; }
  })();
  const caloriesConsumed = todayMeals.reduce((s, m) => s + (m.cals || 0), 0);

  const recoveryRings = computeRecovery(schedule || []);

  const progressRows = [
    { name: 'Deadlift', value: `${progress.deadlift[progress.deadlift.length-1]} lb`, points: progress.deadlift, color: '#8f7cff' },
    { name: 'Squat',    value: `${progress.squat[progress.squat.length-1]} lb`,       points: progress.squat,    color: '#57a5ff' },
    { name: 'Bench',    value: `${progress.bench[progress.bench.length-1]} lb`,       points: progress.bench,    color: '#57f0c0' },
  ];

  const typeInfo = todayType ? TYPE_COLORS[todayType] : null;
  const cycleDotColor = { bulk:'#57a5ff', cut:'#ff6fd8', maintain:'#57f0c0' }[cycleType] || 'rgba(255,255,255,0.3)';

  return (
    <div className="screen home-screen">
      <div className="home-shell">

        {/* ── HERO: Today's Workout ── */}
        <section className="home-hero-workout glass-panel">
          <div className="home-hero-eyebrow">
            <span className="home-hero-kicker">
              Today · {new Date().toLocaleDateString('en-US', { weekday:'long', month:'short', day:'numeric' })}
            </span>
            {typeInfo && !isRestDay && (
              <span className="home-hero-type-pill"
                style={{ color: typeInfo.color, background: typeInfo.bg, borderColor: typeInfo.color + '44' }}>
                {typeInfo.label}
              </span>
            )}
          </div>

          <div className="home-hero-main">
            <div className="home-hero-left">
              {/* Lift image if we have one, otherwise fall back to emoji */}
              <div className="home-hero-day-emoji" style={{ color: dayType?.accent }}>
                {heroLiftImage ? (
                  <img
                    src={heroLiftImage}
                    alt={todayLift}
                    style={{
                      width: 232, height: 232,
                      objectFit: 'contain',
                      filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.45))',
                      display: 'block',
                    }}
                  />
                ) : (
                  dayType?.emoji
                )}
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
                <button className="home-start-btn" onClick={startTodaysWorkout}
                  style={{ '--accent': dayType?.accent || '#57f0c0' }}>
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

        {/* ── FULL CALENDAR ── */}
        <FullWeekStrip
          days={visibleDays}
          blocked={blockedDays || new Set()}
          onDayClick={setModalDay}
          onBlockToggle={onBlockToggle}
          accDone={accDone}
          weekOffset={weekOffset}
          onWeekChange={setWeekOffset}
        />

        {/* ── PROGRESS + RECOVERY ── */}
        <section className="home-mid-row">
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

          <div className="home-recovery-panel glass-panel">
            <div className="home-panel-head">
              <span className="home-panel-kicker">Muscle status</span>
              <h2 className="home-panel-title">Recovery</h2>
            </div>
            <RecoveryRings rings={recoveryRings} />
          </div>
        </section>

        {/* ── NUTRITION ── */}
        <section className="home-bottom-row">
          <div className="home-nutr-panel glass-panel" style={{ flex: 1 }}>
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
                  <span className="home-nutr-stat-val">
                    {caloriesConsumed.toLocaleString()} <span className="home-nutr-stat-unit">kcal</span>
                  </span>
                </div>
                <div className="home-nutr-stat">
                  <span className="home-nutr-stat-label">
                    {caloriesConsumed > calorieGoal ? 'Over by' : 'Remaining'}
                  </span>
                  <span className="home-nutr-stat-val"
                    style={{ color: caloriesConsumed > calorieGoal ? '#ff9f63' : '#57f0c0' }}>
                    {Math.abs(calorieGoal - caloriesConsumed).toLocaleString()}{' '}
                    <span className="home-nutr-stat-unit">kcal</span>
                  </span>
                </div>
                <div className="home-nutr-stat">
                  <span className="home-nutr-stat-label">Target</span>
                  <span className="home-nutr-stat-val">
                    {calorieGoal.toLocaleString()} <span className="home-nutr-stat-unit">kcal</span>
                  </span>
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
                {todayMeals.length > 3 && (
                  <div className="home-nutr-meal-more">+{todayMeals.length - 3} more meals</div>
                )}
              </div>
            ) : (
              <div className="home-nutr-empty">
                No meals logged yet —{' '}
                <button className="home-nutr-link" onClick={() => goToScreen?.('nutrition')}>
                  go to nutrition →
                </button>
              </div>
            )}
          </div>
        </section>

      </div>

      {/* ── DAY MODAL ── */}
      {modalDay && (
        <DayModal
          day={modalDay}
          athlete={athlete}
          onClose={() => setModalDay(null)}
          onBlock={onBlockToggle}
          onStartLift={() => { startTodaysWorkout?.(); setModalDay(null); }}
          onToggleAcc={toggleAcc}
          accDone={accDone}
        />
      )}
    </div>
  );
}

export default HomePage;
