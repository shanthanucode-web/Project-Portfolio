import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import HomePage from './pages/HomePage';
import CalendarPage from './pages/CalendarPage';
import NutritionPage from './pages/NutritionPage';
import ChatPage from './pages/ChatPage';
import ProfilePage from './pages/ProfilePage';
import LiveWorkoutPage from './pages/LiveWorkoutPage';
import WorkoutSummaryPage from './pages/WorkoutSummaryPage';
import { buildSchedule } from './pages/CalendarPage';
import { createLiveBridgeClient } from './liveBridge';
import './styles/globals.css';

const DEFAULT_ATHLETE = {
  firstName: 'Jane',
  lastName: 'Doe',
  age: 23,
  gender: 'female',
  bodyweight: 130,
  heightFt: 5,
  heightIn: 4,
  goal: 'strength',
  equipment: 'full gym',
  cycleTracking: false,
  considerations: '',
  nutritionGuidance: true,
  doesBulkCutCycles: true,
  calorieTrackingStyle: 'light',
  weightDirectionGoal: 'gain',
  progressLogFrequency: 'weekly',
};

const DEFAULT_NUTRITION = {
  bulkCutBlocks: [],
};

const DEFAULT_PROGRESS = {
  deadlift: [405, 415, 420, 425, 430],
  squat: [245, 250, 255, 255, 260],
  bench: [145, 150, 150, 152.5, 155],
};

const DEFAULT_CHAT = [
  {
    id: 1,
    role: 'assistant',
    text: 'You are primed for a stronger lower-body session today. Bar speed has looked stable, so crisp volume is probably a better call than grinding a top single.',
  },
];

const DEFAULT_LIVE_STATE = {
  active: false,
  done: false,
  currentRep: 0,
  targetReps: 0,
  setNumber: 1,
  totalSets: 1,
  velocityMps: 0,
  tiltDeg: 0,
  velocityDropoffPct: 0,
  repHistory: [],
  chartWindow: null,
  setSummary: null,
  coachResponse: null,
  liveCoachMessage: 'Waiting for first rep...',
};

const LIFT_KEY_BY_NAME = {
  'Back Squat': 'back_squat',
  'BACK SQUAT': 'back_squat',
  'Front Squat': 'front_squat',
  'Bench Press': 'bench_press',
  'BENCH PRESS': 'bench_press',
  Deadlift: 'deadlift',
  DEADLIFT: 'deadlift',
  'Overhead Press': 'overhead_press',
  OHP: 'overhead_press',
  'Romanian Deadlift': 'romanian_deadlift',
  'ROMANIAN DL': 'romanian_deadlift',
};

const DEMO_HISTORY_SECONDS = 15;
const DEMO_CHART_POINTS = 80;

function normalizeExerciseName(liftName = '') {
  if (LIFT_KEY_BY_NAME[liftName]) return LIFT_KEY_BY_NAME[liftName];
  const lower = liftName.toLowerCase();
  if (lower.includes('front squat')) return 'front_squat';
  if (lower.includes('squat')) return 'back_squat';
  if (lower.includes('bench')) return 'bench_press';
  if (lower.includes('deadlift')) return 'deadlift';
  if (lower.includes('ohp') || lower.includes('overhead')) return 'overhead_press';
  return 'back_squat';
}

function resetLiveState(overrides = {}) {
  return { ...DEFAULT_LIVE_STATE, ...overrides };
}

function buildDemoRepFeatures(workout, completedReps) {
  const targetReps = workout?.targetReps || 5;
  const count = Math.max(0, Math.min(completedReps, targetReps));
  const isHeavy = (workout?.weight || 225) >= 225;
  const baseVelocity = isHeavy ? 0.72 : 0.82;

  return Array.from({ length: count }, (_, index) => {
    const repNumber = index + 1;
    const velocity = Number(Math.max(0.38, baseVelocity - index * 0.045).toFixed(2));
    const rep1Velocity = baseVelocity;
    const velocityDrop = Math.max(0, Math.round(((rep1Velocity - velocity) / rep1Velocity) * 100));
    const avgTilt = Number((1.5 + index * 0.35).toFixed(1));
    const flags = [];
    if (velocityDrop >= 12) flags.push('pace_drop');
    if (avgTilt >= 3.0) flags.push('high_tilt');

    return {
      rep_number: repNumber,
      start_time_s: index * 2.2,
      end_time_s: index * 2.2 + 1.4,
      duration_ms: 950 + index * 80,
      peak_accel_g: Number((1.1 + velocity * 1.1).toFixed(2)),
      velocity_proxy: velocity,
      avg_tilt_deg: avgTilt,
      max_tilt_deg: Number((avgTilt + 0.4).toFixed(1)),
      tempo_change_vs_rep1_pct: index === 0 ? 0 : index * 8,
      velocity_drop_vs_rep1_pct: velocityDrop,
      flags,
    };
  });
}

function buildDemoChartWindow(workout, completedReps) {
  const reps = workout?.targetReps || 5;
  const progress = Math.min(1, completedReps / Math.max(reps, 1));
  const time = Array.from({ length: DEMO_CHART_POINTS }, (_, index) =>
    Number(((index * DEMO_HISTORY_SECONDS) / (DEMO_CHART_POINTS - 1)).toFixed(2))
  );
  const fatigue = progress * 0.18;
  const accel = { t: time, ax: [], ay: [], az: [] };
  const gyro = { t: time, gx: [], gy: [], gz: [] };
  const velocity = { t: time, v: [] };

  time.forEach((point, index) => {
    const normalized = index / Math.max(DEMO_CHART_POINTS - 1, 1);
    const wave = Math.sin((normalized * Math.max(reps, 3) + 0.1) * Math.PI);
    accel.ax.push(Number((0.08 * Math.sin(point * 1.2) + progress * 0.02).toFixed(4)));
    accel.ay.push(Number((0.06 * Math.cos(point * 1.4)).toFixed(4)));
    accel.az.push(Number((1.0 + 0.1 * wave - fatigue * 0.12).toFixed(4)));
    gyro.gx.push(Number((5.5 * Math.cos(point * 0.8)).toFixed(4)));
    gyro.gy.push(Number((4.2 * Math.sin(point * 0.7 + progress)).toFixed(4)));
    gyro.gz.push(Number((2.8 * Math.sin(point * 1.1)).toFixed(4)));
    velocity.v.push(Number((Math.max(0.18, 0.72 - fatigue - normalized * 0.12) * (0.45 + 0.55 * Math.max(0, wave))).toFixed(4)));
  });

  return {
    timestamp_s: time[time.length - 1] || 0,
    history_seconds: DEMO_HISTORY_SECONDS,
    accel,
    gyro,
    velocity,
  };
}

function buildDemoSetSummary(workout, completedReps) {
  const repFeatures = buildDemoRepFeatures(workout, completedReps || workout?.targetReps || 5);
  const velocities = repFeatures.map((rep) => rep.velocity_proxy);
  const tilts = repFeatures.map((rep) => rep.avg_tilt_deg);
  const avgTilt = tilts.length ? tilts.reduce((sum, tilt) => sum + tilt, 0) / tilts.length : 0;
  const firstVelocity = velocities[0] || 0;
  const lastVelocity = velocities[velocities.length - 1] || firstVelocity;
  const velocityDropoff = firstVelocity > 0
    ? Math.max(0, Math.round(((firstVelocity - lastVelocity) / firstVelocity) * 100))
    : 0;
  const flaggedReps = repFeatures.filter((rep) => rep.flags.length > 0).map((rep) => rep.rep_number);

  return {
    exercise: normalizeExerciseName(workout?.lift),
    set_number: workout?.currentSet || 1,
    set_mode: 'working',
    load_lbs: workout?.weight || 225,
    target_reps: workout?.targetReps || 5,
    completed_reps: repFeatures.length,
    rep_features: repFeatures,
    avg_rep_duration_ms: repFeatures.length
      ? Math.round(repFeatures.reduce((sum, rep) => sum + rep.duration_ms, 0) / repFeatures.length)
      : 0,
    slowest_rep_number: repFeatures[repFeatures.length - 1]?.rep_number || null,
    avg_tilt_deg: Number(avgTilt.toFixed(2)),
    max_tilt_deg: tilts.length ? Math.max(...tilts) : 0,
    worst_tilt_rep: tilts.length ? tilts.indexOf(Math.max(...tilts)) + 1 : null,
    velocity_dropoff_pct: velocityDropoff,
    fatigue_score: Number(Math.min(1, velocityDropoff / 30 + avgTilt / 12).toFixed(2)),
    tilt_breakdown_detected: flaggedReps.some((repNumber) =>
      repFeatures[repNumber - 1]?.flags.includes('high_tilt')
    ),
    slowdown_detected: flaggedReps.some((repNumber) =>
      repFeatures[repNumber - 1]?.flags.includes('pace_drop')
    ),
    flagged_reps: flaggedReps,
    notes: ['Demo data generated in browser because hardware bridge was unavailable.'],
  };
}

function buildDemoCoachResponse(setSummary) {
  const advice = [];
  if (setSummary.velocity_dropoff_pct >= 12) {
    advice.push('Bar speed dropped late. Rest longer before the next hard set.');
  }
  if (setSummary.tilt_breakdown_detected) {
    advice.push('Tilt increased under fatigue. Brace harder and keep pressure even.');
  }
  if (advice.length === 0) {
    advice.push('Set stayed consistent. Keep the same rhythm and repeat the setup.');
  }

  return {
    classification: [
      ...(setSummary.slowdown_detected ? ['pace_drop'] : []),
      ...(setSummary.tilt_breakdown_detected ? ['tilt_breakdown'] : []),
      ...(!setSummary.slowdown_detected && !setSummary.tilt_breakdown_detected ? ['stable_set'] : []),
    ],
    severity: setSummary.fatigue_score >= 0.7 ? 'high' : setSummary.fatigue_score >= 0.35 ? 'moderate' : 'low',
    summary: advice[0],
    coach_advice: advice,
    next_set_action: {
      rest_seconds: setSummary.fatigue_score >= 0.7 ? 240 : 180,
      load_adjustment_lbs: setSummary.tilt_breakdown_detected ? -5 : 0,
      focus_cue: setSummary.tilt_breakdown_detected ? 'Brace and keep the bar centered.' : 'Repeat the same setup.',
    },
    source: 'demo',
  };
}

function buildWorkoutSummary(workout, setSummary, coachResponse) {
  const repFeatures = setSummary?.rep_features || [];
  const velocities = repFeatures.map((rep) => rep.velocity_proxy).filter((value) => Number.isFinite(value));
  const durationSec = workout?.startedAt
    ? Math.max(1, Math.round((Date.now() - new Date(workout.startedAt).getTime()) / 1000))
    : 0;
  const minutes = Math.floor(durationSec / 60);
  const seconds = String(durationSec % 60).padStart(2, '0');

  return {
    id: workout?.id || Date.now(),
    title: workout?.title || workout?.lift || 'Training Session',
    focus: workout?.focus || 'strength',
    lift: workout?.lift || setSummary?.exercise || 'Back Squat',
    mode: workout?.mode || 'demo',
    totalSets: 1,
    totalReps: setSummary?.completed_reps || 0,
    weight: setSummary?.load_lbs || workout?.weight || 225,
    avgVelocity: velocities.length
      ? Number((velocities.reduce((sum, value) => sum + value, 0) / velocities.length).toFixed(2))
      : 0,
    avgTilt: setSummary?.avg_tilt_deg || 0,
    velocityDropoff: setSummary?.velocity_dropoff_pct || 0,
    fatigueScore: setSummary?.fatigue_score || 0,
    durationSec,
    durationLabel: `${minutes}:${seconds}`,
    coachDebrief: coachResponse?.summary || 'Set complete. Review the rep data before the next attempt.',
    setSummary,
    coachResponse,
    completedAt: new Date().toISOString(),
  };
}

function App() {
  const [screen, setScreen] = useState('home');

  const [athlete, setAthlete] = useState(DEFAULT_ATHLETE);
  const [nutrition, setNutrition] = useState(DEFAULT_NUTRITION);
  const [progress, setProgress] = useState(DEFAULT_PROGRESS);
  const [chatMessages, setChatMessages] = useState(DEFAULT_CHAT);
  const [workoutHistory, setWorkoutHistory] = useState([]);

  const [calendarSchedule, setCalendarSchedule] = useState(() =>
    buildSchedule(DEFAULT_ATHLETE, DEFAULT_NUTRITION)
  );
  const [blockedDays, setBlockedDays] = useState(new Set());
  const [activeWorkout, setActiveWorkout] = useState(null);
  const [lastWorkoutSummary, setLastWorkoutSummary] = useState(null);
  const [trainingMode, setTrainingMode] = useState('demo');
  const [bridgeConnected, setBridgeConnected] = useState(false);
  const [sourceConnected, setSourceConnected] = useState(false);
  const [bridgeError, setBridgeError] = useState('');
  const [liveState, setLiveState] = useState(() => resetLiveState());
  const bridgeClientRef = useRef(null);
  const trainingModeRef = useRef(trainingMode);
  const activeWorkoutRef = useRef(null);

  useEffect(() => {
    trainingModeRef.current = trainingMode;
  }, [trainingMode]);

  useEffect(() => {
    activeWorkoutRef.current = activeWorkout;
  }, [activeWorkout]);

  useEffect(() => {
    const rebuilt = buildSchedule(athlete, nutrition);
    setCalendarSchedule(rebuilt);
  }, [athlete, nutrition]);

  const applyAISchedule = useCallback((newScheduleDays) => {
    const base = buildSchedule(athlete, nutrition);
    const merged = base.map((day, i) => {
      const override = newScheduleDays[i];
      if (!override) return day;
      return {
        ...day,
        lift:         override.rest ? null : (override.lift ?? day.lift),
        type:         override.rest ? null : (override.type ?? day.type),
        rest:         !!override.rest,
        accessories:  (override.lift && override.lift !== day.lift) ? [] : day.accessories,
        caloricDelta: override.cal ?? day.caloricDelta,
      };
    });
    setCalendarSchedule(merged);
  }, [athlete, nutrition]);

  const toggleBlockedDay = useCallback((dateKey) => {
    setBlockedDays(prev => {
      const next = new Set(prev);
      next.has(dateKey) ? next.delete(dateKey) : next.add(dateKey);
      return next;
    });
  }, []);

  const goToScreen = (nextScreen) => {
    if (nextScreen === screen) return;
    setScreen(nextScreen);
  };

  const athleteName = useMemo(() =>
    `${athlete.firstName} ${athlete.lastName}`.trim(),
    [athlete.firstName, athlete.lastName]
  );

  const handleBridgeMessage = useCallback((message) => {
    const payload = message?.payload || {};

    switch (message?.type) {
      case 'bridge_status':
        setSourceConnected(!!(payload.source_connected ?? payload.connected));
        setLiveState((prev) => ({
          ...prev,
          active: !!payload.set_active,
          setNumber: payload.set_number || prev.setNumber,
          targetReps: payload.target_reps || prev.targetReps,
        }));
        break;
      case 'set_started': {
        const currentWorkout = activeWorkoutRef.current;
        setLiveState((prev) => resetLiveState({
          active: true,
          targetReps: payload.target_reps || prev.targetReps,
          setNumber: payload.set_number || 1,
          totalSets: currentWorkout?.setsPlanned || prev.totalSets || 1,
          liveCoachMessage: 'Hardware set started. Listening for reps...',
        }));
        break;
      }
      case 'live_metrics':
        setLiveState((prev) => ({
          ...prev,
          active: true,
          currentRep: payload.rep_count || prev.currentRep,
          targetReps: payload.target_reps || prev.targetReps,
          setNumber: payload.set_number || prev.setNumber,
          velocityMps: payload.velocity_mps ?? prev.velocityMps,
          tiltDeg: payload.tilt_deg ?? prev.tiltDeg,
        }));
        break;
      case 'chart_window':
        setLiveState((prev) => ({ ...prev, chartWindow: payload }));
        break;
      case 'rep_event':
        setLiveState((prev) => ({
          ...prev,
          currentRep: payload.rep_number || prev.currentRep,
          repHistory: [
            ...prev.repHistory.filter((rep) => rep.rep_number !== payload.rep_number),
            payload,
          ].sort((a, b) => a.rep_number - b.rep_number),
        }));
        break;
      case 'set_ended':
        setLiveState((prev) => ({
          ...prev,
          active: false,
          liveCoachMessage: 'Set ended. Waiting for summary...',
        }));
        break;
      case 'set_summary':
        setLiveState((prev) => ({
          ...prev,
          active: false,
          done: true,
          currentRep: payload.completed_reps || prev.currentRep,
          targetReps: payload.target_reps || prev.targetReps,
          velocityDropoffPct: payload.velocity_dropoff_pct || prev.velocityDropoffPct,
          repHistory: payload.rep_features || prev.repHistory,
          setSummary: payload,
          liveCoachMessage: 'Set summary received from Python.',
        }));
        break;
      case 'coach_response':
        setLiveState((prev) => ({
          ...prev,
          coachResponse: payload,
          liveCoachMessage: payload.summary || prev.liveCoachMessage,
        }));
        break;
      case 'error':
        setBridgeError(payload.message || 'Python bridge returned an error.');
        break;
      default:
        break;
    }
  }, []);

  const connectBridge = useCallback(async () => {
    if (!bridgeClientRef.current) {
      bridgeClientRef.current = createLiveBridgeClient({
        onOpen: () => {
          setBridgeConnected(true);
          setBridgeError('');
        },
        onClose: () => {
          setBridgeConnected(false);
          setSourceConnected(false);
          if (trainingModeRef.current === 'hardware') {
            setTrainingMode('demo');
            setBridgeError('Hardware bridge disconnected. Switched to demo mode.');
          }
        },
        onError: () => {
          setBridgeConnected(false);
        },
        onMessage: handleBridgeMessage,
      });
    }

    try {
      await bridgeClientRef.current.connect();
      setBridgeConnected(true);
      bridgeClientRef.current.send('ping', {});
      return true;
    } catch {
      setBridgeConnected(false);
      setSourceConnected(false);
      return false;
    }
  }, [handleBridgeMessage]);

  const sendBridgeMessage = useCallback((type, payload = {}) => {
    if (!bridgeClientRef.current?.isConnected()) return false;
    return bridgeClientRef.current.send(type, payload);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const connected = await connectBridge();
      if (cancelled) return;
      setTrainingMode(connected ? 'hardware' : 'demo');
      if (!connected) {
        setBridgeError('');
      }
    })();

    return () => {
      cancelled = true;
      bridgeClientRef.current?.disconnect();
    };
  }, [connectBridge]);

  const handleTrainingModeChange = useCallback(async (nextMode) => {
    if (nextMode === 'demo') {
      setTrainingMode('demo');
      setBridgeError('');
      return;
    }

    const connected = bridgeConnected || await connectBridge();
    if (connected) {
      setTrainingMode('hardware');
      setBridgeError('');
    } else {
      setTrainingMode('demo');
      setBridgeError('Could not connect to the Python bridge. Staying in demo mode.');
    }
  }, [bridgeConnected, connectBridge]);

  const startTodaysWorkout = useCallback(async () => {
    const todayPlan = calendarSchedule[0] || {
      lift: 'Training Session',
      type: 'strength',
      dayLabel: 'Today',
    };
    const requestedMode = trainingMode;
    let mode = requestedMode;
    const workout = {
      id: Date.now(),
      title: todayPlan.lift || 'Training Session',
      focus: todayPlan.type || 'general',
      lift: todayPlan.lift || 'Back Squat',
      setsPlanned: 5,
      currentSet: 1,
      targetReps: 5,
      repsCompleted: 0,
      weight: 225,
      startedAt: new Date().toISOString(),
      mode,
    };

    if (requestedMode === 'hardware') {
      const connected = bridgeConnected || await connectBridge();
      if (!connected) {
        mode = 'demo';
        workout.mode = 'demo';
        setTrainingMode('demo');
        setBridgeError('Python bridge unavailable. Started demo mode instead.');
      }
    }

    setActiveWorkout(workout);
    setLastWorkoutSummary(null);
    setLiveState(resetLiveState({
      active: mode === 'hardware',
      targetReps: workout.targetReps,
      totalSets: workout.setsPlanned,
      setNumber: workout.currentSet,
      chartWindow: mode === 'demo' ? buildDemoChartWindow(workout, 0) : null,
      liveCoachMessage: mode === 'hardware'
        ? 'Starting hardware set through Python bridge...'
        : 'Demo set started.',
    }));

    if (mode === 'hardware') {
      sendBridgeMessage('start_set', {
        exercise: normalizeExerciseName(workout.lift),
        load_lbs: workout.weight,
        target_reps: workout.targetReps,
        set_number: workout.currentSet,
        set_mode: 'working',
      });
    }

    setScreen('liveWorkout');
  }, [bridgeConnected, calendarSchedule, connectBridge, sendBridgeMessage, trainingMode]);

  useEffect(() => {
    if (screen !== 'liveWorkout' || !activeWorkout || activeWorkout.mode !== 'demo') return undefined;
    if (liveState.done) return undefined;

    const timer = window.setInterval(() => {
      setLiveState((prev) => {
        if (prev.done) return prev;
        const nextRep = Math.min((prev.currentRep || 0) + 1, activeWorkout.targetReps || 5);
        const repHistory = buildDemoRepFeatures(activeWorkout, nextRep);
        const latestRep = repHistory[repHistory.length - 1];
        const velocityDropoffPct = repHistory[0] && latestRep
          ? Math.max(0, Math.round(((repHistory[0].velocity_proxy - latestRep.velocity_proxy) / repHistory[0].velocity_proxy) * 100))
          : 0;
        const complete = nextRep >= (activeWorkout.targetReps || 5);
        const setSummary = complete ? buildDemoSetSummary(activeWorkout, nextRep) : null;
        const coachResponse = setSummary ? buildDemoCoachResponse(setSummary) : null;

        return {
          ...prev,
          active: !complete,
          done: complete,
          currentRep: nextRep,
          velocityMps: latestRep?.velocity_proxy || prev.velocityMps,
          tiltDeg: latestRep?.avg_tilt_deg || prev.tiltDeg,
          velocityDropoffPct,
          repHistory,
          chartWindow: buildDemoChartWindow(activeWorkout, nextRep),
          setSummary,
          coachResponse,
          liveCoachMessage: coachResponse?.summary || `Demo rep ${nextRep} captured.`,
        };
      });
    }, 1800);

    return () => window.clearInterval(timer);
  }, [activeWorkout, liveState.done, screen]);

  const handleEndSet = useCallback(() => {
    if (!activeWorkout) return;

    if (activeWorkout.mode === 'hardware') {
      if (!liveState.setSummary) {
        sendBridgeMessage('end_set', {});
        setLiveState((prev) => ({ ...prev, active: false, liveCoachMessage: 'Ending set through Python bridge...' }));
      }
      return;
    }

    const setSummary = liveState.setSummary || buildDemoSetSummary(activeWorkout, liveState.currentRep || activeWorkout.targetReps);
    const coachResponse = liveState.coachResponse || buildDemoCoachResponse(setSummary);
    setLiveState((prev) => ({
      ...prev,
      active: false,
      done: true,
      currentRep: setSummary.completed_reps,
      velocityDropoffPct: setSummary.velocity_dropoff_pct,
      repHistory: setSummary.rep_features,
      setSummary,
      coachResponse,
      liveCoachMessage: coachResponse.summary,
    }));
  }, [activeWorkout, liveState, sendBridgeMessage]);

  const finishWorkout = useCallback(() => {
    if (!activeWorkout) return;

    if (activeWorkout.mode === 'hardware' && !liveState.setSummary) {
      handleEndSet();
      setBridgeError('Requested set end. Waiting for Python set summary before logging.');
      return;
    }

    const setSummary = liveState.setSummary || buildDemoSetSummary(activeWorkout, liveState.currentRep || activeWorkout.targetReps);
    const coachResponse = liveState.coachResponse || buildDemoCoachResponse(setSummary);
    setLastWorkoutSummary(buildWorkoutSummary(activeWorkout, setSummary, coachResponse));
    setScreen('workoutSummary');
  }, [activeWorkout, handleEndSet, liveState]);

  const logWorkout = () => {
    if (!lastWorkoutSummary) return;
    setWorkoutHistory((prev) => [lastWorkoutSummary, ...prev]);
    setProgress((prev) => ({
      ...prev,
      squat: [...prev.squat, Math.min(prev.squat[prev.squat.length - 1] + 5, 999)],
    }));
    setChatMessages((prev) => [{
      id: Date.now(),
      role: 'assistant',
      text: `Logged ${lastWorkoutSummary.lift}. ${lastWorkoutSummary.coachDebrief}`,
    }, ...prev]);
    setActiveWorkout(null);
    setLastWorkoutSummary(null);
    setLiveState(resetLiveState());
    setScreen('home');
  };

  const homeSummary = useMemo(() => ({
    athleteName,
    today: calendarSchedule[0] || null,
    nutritionMode: nutrition.mode,
    nutritionAdvice: nutrition.aiAdvice,
    topInsight: chatMessages.find((m) => m.role === 'assistant')?.text ||
      'Coach insight will appear here as your training data fills in.',
    progress,
    lastWorkoutSummary,
    workoutHistoryCount: workoutHistory.length,
  }), [athleteName, calendarSchedule, nutrition, chatMessages, progress, lastWorkoutSummary, workoutHistory]);

  const navItems = [
    { key: 'home',      label: 'Home'      },
    { key: 'nutrition', label: 'Nutrition' },
    { key: 'chat',      label: 'Coach'     },
    { key: 'profile',   label: 'Profile'   },
  ];

  const showTopNav = screen !== 'liveWorkout';

  return (
    <div className="app">
      {showTopNav && (
        <div className="topnav">
          <div className="logo"><span>Coach Nova</span></div>
          <div className="nav-right">
            <div className="mode-toggle" aria-label="training data mode">
              <button
                type="button"
                className={trainingMode === 'hardware' ? 'mode-toggle-active' : ''}
                onClick={() => handleTrainingModeChange('hardware')}
              >
                Hardware
              </button>
              <button
                type="button"
                className={trainingMode === 'demo' ? 'mode-toggle-active' : ''}
                onClick={() => handleTrainingModeChange('demo')}
              >
                Demo
              </button>
            </div>
            <div className={`bridge-chip ${bridgeConnected ? 'bridge-chip-live' : 'bridge-chip-demo'}`}>
              {trainingMode === 'hardware'
                ? (sourceConnected ? 'Bridge live' : 'Bridge ready')
                : 'Demo mode'}
            </div>
            {navItems.map((item) => (
              <button key={item.key} type="button" onClick={() => goToScreen(item.key)}>
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="main-content">
        {bridgeError && (
          <div className="app-alert">
            <strong>Hardware bridge:</strong> {bridgeError}
          </div>
        )}

        {screen === 'home' && (
          <HomePage
            summary={homeSummary}
            athlete={athlete}
            schedule={calendarSchedule}
            nutrition={nutrition}
            progress={progress}
            blockedDays={blockedDays}
            onBlockToggle={toggleBlockedDay}
            goToScreen={goToScreen}
            startTodaysWorkout={startTodaysWorkout}
          />
        )}

        {screen === 'calendar' && (
          <CalendarPage
            athlete={athlete}
            nutrition={nutrition}
            schedule={calendarSchedule}
            blockedDays={blockedDays}
            onBlockToggle={toggleBlockedDay}
            goToScreen={goToScreen}
          />
        )}

        {screen === 'nutrition' && (
          <NutritionPage
            athlete={athlete}
            nutrition={nutrition}
            setNutrition={setNutrition}
            goToScreen={goToScreen}
          />
        )}

        {screen === 'chat' && (
          <ChatPage
            athlete={athlete}
            schedule={calendarSchedule}
            nutrition={nutrition}
            chatMessages={chatMessages}
            setChatMessages={setChatMessages}
            workoutHistory={workoutHistory}
            blockedDays={blockedDays}
            onApplySchedule={applyAISchedule}
            onBlockDay={toggleBlockedDay}
            goToScreen={goToScreen}
          />
        )}

        {screen === 'profile' && (
          <ProfilePage
            athlete={athlete}
            setAthlete={setAthlete}
            goToScreen={goToScreen}
          />
        )}

        {screen === 'liveWorkout' && (
          <LiveWorkoutPage
            athlete={athlete}
            activeWorkout={activeWorkout}
            liveState={liveState}
            mode={activeWorkout?.mode || trainingMode}
            bridgeConnected={bridgeConnected}
            sourceConnected={sourceConnected}
            bridgeError={bridgeError}
            onEndSet={handleEndSet}
            finishWorkout={finishWorkout}
            goBack={() => setScreen('home')}
          />
        )}

        {screen === 'workoutSummary' && (
          <WorkoutSummaryPage
            athlete={athlete}
            summary={lastWorkoutSummary}
            logWorkout={logWorkout}
            goBack={() => setScreen('liveWorkout')}
          />
        )}
      </div>
    </div>
  );
}

export default App;
