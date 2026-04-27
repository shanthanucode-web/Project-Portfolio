export const CALIBRATION_STORAGE_KEY = 'coachNova.calibration.v1';

export function athleteKey(athlete = {}) {
  return `${athlete.firstName || 'Athlete'} ${athlete.lastName || ''}`.trim();
}

export function exerciseKey(exercise = '') {
  return String(exercise || 'Training Session')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

export function displayExercise(exercise = '') {
  return exerciseKey(exercise).replace(/\b\w/g, (char) => char.toUpperCase());
}

export function loadCalibrationStore() {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.localStorage.getItem(CALIBRATION_STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

export function saveCalibrationStore(store) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(store));
}

export function getExerciseBaseline(store, athlete, exercise) {
  return store?.[athleteKey(athlete)]?.[exerciseKey(exercise)] || null;
}

export function averageRepMetric(setSummary, field) {
  const reps = setSummary?.rep_features || [];
  if (!reps.length) return 0;
  const total = reps.reduce((sum, rep) => sum + Number(rep[field] || 0), 0);
  return total / reps.length;
}

export function baselineFromSet(setSummary) {
  const reps = setSummary?.rep_features || [];
  return {
    capturedAt: new Date().toISOString(),
    avgVelocityMps: Number(averageRepMetric(setSummary, 'velocity_proxy').toFixed(3)),
    avgTiltDeg: Number(setSummary?.avg_tilt_deg || 0),
    avgRepDurationMs: Number(setSummary?.avg_rep_duration_ms || 0),
    peakAccelG: Number(Math.max(0, ...reps.map((rep) => Number(rep.peak_accel_g || 0))).toFixed(3)),
    repCount: Number(setSummary?.completed_reps || reps.length || 0),
  };
}

export function upsertExerciseBaseline(store, athlete, exercise, baseline) {
  const next = { ...(store || {}) };
  const person = athleteKey(athlete);
  next[person] = { ...(next[person] || {}) };
  next[person][exerciseKey(exercise)] = {
    exercise: displayExercise(exercise),
    ...baseline,
  };
  saveCalibrationStore(next);
  return next;
}

export function buildSetAlerts(setSummary, baseline) {
  if (!setSummary) return [];
  const alerts = [];
  const avgVelocity = averageRepMetric(setSummary, 'velocity_proxy');
  const avgDuration = Number(setSummary.avg_rep_duration_ms || 0);
  const avgTilt = Number(setSummary.avg_tilt_deg || 0);

  if (!baseline) {
    return ['calibration_baseline_captured'];
  }

  if (baseline.avgVelocityMps > 0) {
    const velocityDropPct = ((baseline.avgVelocityMps - avgVelocity) / baseline.avgVelocityMps) * 100;
    if (velocityDropPct >= 12) alerts.push('velocity_below_baseline');
  }

  if (baseline.avgRepDurationMs > 0) {
    const durationIncreasePct = ((avgDuration - baseline.avgRepDurationMs) / baseline.avgRepDurationMs) * 100;
    if (durationIncreasePct >= 15) alerts.push('tempo_slower_than_baseline');
  }

  if (baseline.avgTiltDeg >= 0 && avgTilt - baseline.avgTiltDeg >= 3) {
    alerts.push('tilt_above_baseline');
  }

  if (setSummary.flagged_reps?.length) alerts.push('rep_flags_detected');
  return [...new Set(alerts)];
}
