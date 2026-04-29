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
import { callCoachTrigger, coachResponseToAdvice, coachResponseToText } from './coachClient';
import {
  averageRepMetric,
  baselineFromSet,
  buildSetAlerts,
  displayExercise,
  athleteKey,
  exerciseKey,
  getExerciseBaseline,
  loadCalibrationStore,
  saveCalibrationStore,
  upsertExerciseBaseline,
} from './calibration';
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
  currentRep: 0,
  targetReps: 5,
  velocityMps: 0,
  velocityDropoffPct: 0,
  tiltDeg: 0,
  liveCoachMessage: 'Waiting for first rep...',
  coachResponse: null,
  chartWindow: null,
  repHistory: [],
  setNumber: 1,
  done: false,
  setSummary: null,
  calibrationStatus: null,
  alerts: [],
};

const DEFAULT_WORKOUT_SETUP = {
  setsPlanned: 5,
  targetReps: 5,
};

function clampNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

export function sanitizeWorkoutSetup(setup = {}) {
  return {
    setsPlanned: clampNumber(setup.setsPlanned, DEFAULT_WORKOUT_SETUP.setsPlanned, 1, 10),
    targetReps: clampNumber(setup.targetReps, DEFAULT_WORKOUT_SETUP.targetReps, 1, 20),
  };
}

export function getNextSetStartState(activeWorkout, liveState) {
  const nextSetNumber = Number(liveState?.setNumber || activeWorkout?.currentSet || 1) + 1;
  const targetReps = Number(liveState?.targetReps || activeWorkout?.targetReps || 5);

  return {
    nextSetNumber,
    targetReps,
    nextLiveState: {
      ...DEFAULT_LIVE_STATE,
      setNumber: nextSetNumber,
      targetReps,
    },
    nextActiveWorkout: {
      ...activeWorkout,
      currentSet: nextSetNumber,
    },
    startSetPayload: {
      exercise: activeWorkout?.lift,
      target_reps: targetReps,
      set_number: nextSetNumber,
    },
  };
}

function startSetPayloadFromWorkout(activeWorkout, setNumber = activeWorkout?.currentSet || 1) {
  return {
    exercise: activeWorkout?.lift,
    target_reps: Number(activeWorkout?.targetReps || 5),
    set_number: Number(setNumber || 1),
  };
}

function setIdFromSummary(setSummary, fallbackWorkout) {
  return [
    setSummary?.exercise || fallbackWorkout?.lift || 'session',
    setSummary?.set_number || fallbackWorkout?.currentSet || 1,
    setSummary?.completed_reps ?? 'reps',
    setSummary?.avg_rep_duration_ms ?? 'duration',
  ].join(':');
}

function summaryFromSet(activeWorkout, liveState, mode, sessionHistory, coachResponse = liveState.coachResponse) {
  const currentSet = liveState.setSummary || {
    exercise: activeWorkout.lift,
    set_number: activeWorkout.currentSet,
    target_reps: liveState.targetReps,
    completed_reps: liveState.repHistory?.length || liveState.currentRep || 0,
    rep_features: liveState.repHistory || [],
    avg_rep_duration_ms: averageRepMetric({ rep_features: liveState.repHistory }, 'duration_ms'),
    avg_tilt_deg: averageRepMetric({ rep_features: liveState.repHistory }, 'avg_tilt_deg'),
    velocity_dropoff_pct: liveState.velocityDropoffPct || 0,
    flagged_reps: [],
  };
  const setRecords = sessionHistory.length
    ? sessionHistory
    : [{ setSummary: currentSet, alerts: liveState.alerts || [], calibrationRole: liveState.calibrationStatus }];
  const reps = setRecords.flatMap((record) => record.setSummary?.rep_features || []);
  const totalReps = setRecords.reduce((sum, record) => sum + Number(record.setSummary?.completed_reps || 0), 0);
  const avgVelocity = reps.length
    ? reps.reduce((sum, rep) => sum + Number(rep.velocity_proxy || 0), 0) / reps.length
    : averageRepMetric(currentSet, 'velocity_proxy');
  const avgTilt = setRecords.length
    ? setRecords.reduce((sum, record) => sum + Number(record.setSummary?.avg_tilt_deg || 0), 0) / setRecords.length
    : 0;

  return {
    id: activeWorkout.id,
    title: activeWorkout.title,
    focus: activeWorkout.focus,
    lift: activeWorkout.lift,
    setsPlanned: activeWorkout.setsPlanned,
    targetReps: liveState.targetReps || activeWorkout.targetReps || 5,
    totalSets: Math.max(setRecords.length, 1),
    totalReps,
    weight: activeWorkout.weight,
    avgVelocity: Number(avgVelocity.toFixed(2)),
    avgTilt: Number(avgTilt.toFixed(1)),
    velocityDropoff: Number(currentSet.velocity_dropoff_pct || 0),
    durationSec: Math.max(0, Math.round((Date.now() - new Date(activeWorkout.startedAt).getTime()) / 1000)),
    durationLabel: activeWorkout.sessionTime || 'Live session',
    coachDebrief: coachResponseToText(coachResponse) || 'Set data captured. Review the rep metrics before loading the next attempt.',
    coachResponse,
    setSummary: currentSet,
    sessionHistory: setRecords,
    mode,
    completedAt: new Date().toISOString(),
  };
}

function WorkoutSetupModal({ plan, setup, setSetup, onCancel, onConfirm }) {
  if (!plan) return null;

  const updateField = (field) => (event) => {
    setSetup((prev) => ({
      ...prev,
      [field]: event.target.value,
    }));
  };

  return (
    <div className="setup-modal-backdrop" role="presentation">
      <div className="setup-modal" role="dialog" aria-modal="true" aria-labelledby="setup-title">
        <div className="setup-modal-head">
          <span>Workout setup</span>
          <button type="button" className="setup-close-btn" onClick={onCancel} aria-label="Close setup">x</button>
        </div>
        <h2 id="setup-title">{plan.lift || 'Back Squat'}</h2>
        <div className="setup-field-grid">
          <label className="setup-field">
            <span>Number of sets</span>
            <input
              type="number"
              min="1"
              max="10"
              value={setup.setsPlanned}
              onChange={updateField('setsPlanned')}
            />
          </label>
          <label className="setup-field">
            <span>Target reps per set</span>
            <input
              type="number"
              min="1"
              max="20"
              value={setup.targetReps}
              onChange={updateField('targetReps')}
            />
          </label>
        </div>
        <div className="setup-actions">
          <button type="button" className="setup-secondary-btn" onClick={onCancel}>Cancel</button>
          <button type="button" className="setup-primary-btn" onClick={onConfirm}>Enter live workout</button>
        </div>
      </div>
    </div>
  );
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
  const [workoutSetupPlan, setWorkoutSetupPlan] = useState(null);
  const [workoutSetup, setWorkoutSetup] = useState(DEFAULT_WORKOUT_SETUP);
  const [scheduleSource, setScheduleSource] = useState('built');
  const [calibrationStore, setCalibrationStore] = useState(() => loadCalibrationStore());
  const [sessionHistory, setSessionHistory] = useState([]);

  // ─── Live hardware bridge ─────────────────────────────────────────
  const [mode, setMode] = useState('demo');
  const [bridgeConnected, setBridgeConnected] = useState(false);
  const [sourceConnected, setSourceConnected] = useState(false);
  const [bridgeError, setBridgeError] = useState(null);
  const [liveState, setLiveState] = useState(DEFAULT_LIVE_STATE);
  const bridgeRef = useRef(null);
  const setStartedRef = useRef(false);
  const processedSetIdsRef = useRef(new Set());

  useEffect(() => {
    const client = createLiveBridgeClient({
      onOpen: () => {
        setBridgeConnected(true);
        setMode('hardware');
        setBridgeError(null);
      },
      onClose: () => {
        setBridgeConnected(false);
        setMode('demo');
      },
      onError: () => {
        setBridgeConnected(false);
      },
      onMessage: (msg) => {
        const { type, payload } = msg;
        if (type === 'bridge_status') {
          setSourceConnected(payload.source_connected ?? false);
        } else if (type === 'set_started') {
          setStartedRef.current = true;
          setLiveState((prev) => ({
            ...prev,
            setNumber: payload.set_number ?? prev.setNumber,
            targetReps: payload.target_reps ?? prev.targetReps,
            liveCoachMessage: `Set ${payload.set_number ?? prev.setNumber} started.`,
          }));
        } else if (type === 'live_metrics') {
          setLiveState((prev) => ({
            ...prev,
            currentRep: payload.rep_count ?? prev.currentRep,
            targetReps: payload.target_reps ?? prev.targetReps,
            velocityMps: payload.velocity_mps ?? prev.velocityMps,
            tiltDeg: payload.tilt_deg ?? prev.tiltDeg,
            setNumber: payload.set_number ?? prev.setNumber,
          }));
        } else if (type === 'rep_event') {
          setStartedRef.current = true;
          setLiveState((prev) => ({
            ...prev,
            currentRep: payload.rep_number ?? prev.currentRep,
            repHistory: [...prev.repHistory, payload],
          }));
        } else if (type === 'set_summary') {
          setLiveState((prev) => ({ ...prev, setSummary: payload, done: true }));
        } else if (type === 'coach_response') {
          setLiveState((prev) => ({
            ...prev,
            coachResponse: payload,
            liveCoachMessage: payload.coach_advice?.[0] || prev.liveCoachMessage,
          }));
        } else if (type === 'chart_window') {
          setLiveState((prev) => ({ ...prev, chartWindow: payload }));
        } else if (type === 'error') {
          setBridgeError(payload.message);
        }
      },
    });
    bridgeRef.current = client;
    client.connect(800).catch(() => {
      // no bridge running — stay in demo mode
    });
    return () => client.disconnect();
  }, []);

  useEffect(() => {
    const setSummary = liveState.setSummary;
    if (!setSummary || !activeWorkout) return;

    const setId = setIdFromSummary(setSummary, activeWorkout);
    if (processedSetIdsRef.current.has(setId)) return;
    processedSetIdsRef.current.add(setId);

    const exercise = setSummary.exercise || activeWorkout.lift;
    const existingBaseline = getExerciseBaseline(calibrationStore, athlete, exercise);
    const capturedBaseline = existingBaseline || baselineFromSet(setSummary);
    const calibrationRole = existingBaseline ? 'comparison' : 'baseline_capture';
    const alerts = buildSetAlerts(setSummary, existingBaseline);

    if (!existingBaseline) {
      setCalibrationStore((prev) => upsertExerciseBaseline(prev, athlete, exercise, capturedBaseline));
    }

    const sessionSet = {
      id: setId,
      exercise: displayExercise(exercise),
      completedAt: new Date().toISOString(),
      setSummary: { ...setSummary, exercise: displayExercise(exercise) },
      calibrationRole,
      baseline: capturedBaseline,
      alerts,
    };

    setSessionHistory((prev) => [...prev, sessionSet]);
    setLiveState((prev) => ({
      ...prev,
      calibrationStatus: calibrationRole,
      alerts,
      liveCoachMessage: calibrationRole === 'baseline_capture'
        ? `${displayExercise(exercise)} baseline captured.`
        : alerts.length
          ? `Form alerts: ${alerts.join(', ')}`
          : 'Set complete. Metrics are within baseline range.',
    }));

    callCoachTrigger({
      trigger: 'POST_SET',
      athlete,
      calibration: { exercise: displayExercise(exercise), baseline: capturedBaseline, status: calibrationRole },
      sessionHistory: [...sessionHistory, sessionSet],
      currentSet: sessionSet,
      workoutSummary: null,
      message: null,
    })
      .then((response) => {
        const coachResponse = {
          ...response,
          coach_advice: coachResponseToAdvice(response),
        };
        setLiveState((prev) => ({
          ...prev,
          coachResponse,
          liveCoachMessage: coachResponseToText(response) || prev.liveCoachMessage,
        }));
      })
      .catch((error) => {
        setLiveState((prev) => ({
          ...prev,
          liveCoachMessage: `Coach API unavailable: ${error.message}`,
        }));
      });
  }, [activeWorkout, athlete, calibrationStore, liveState.setSummary, sessionHistory]);

  // Demo ticker: simulate live data when no bridge connected
  useEffect(() => {
    if (mode !== 'demo' || screen !== 'liveWorkout') return;
    const interval = setInterval(() => {
      setLiveState((prev) => {
        if (prev.done) return prev;
        const nextRep = Math.min(prev.currentRep + 1, prev.targetReps);
        const velocity = parseFloat((0.72 - nextRep * 0.03 + Math.random() * 0.04).toFixed(2));
        const tilt = parseFloat((1.5 + nextRep * 0.2 + Math.random() * 0.3).toFixed(1));
        const drop = nextRep > 1 ? Math.round(((0.72 - velocity) / 0.72) * 100) : 0;
        const rep = { rep_number: nextRep, velocity_proxy: velocity, avg_tilt_deg: tilt, flags: [] };
        return {
          ...prev,
          currentRep: nextRep,
          velocityMps: velocity,
          tiltDeg: tilt,
          velocityDropoffPct: drop,
          liveCoachMessage: nextRep >= prev.targetReps
            ? 'Set complete — good work.'
            : `Rep ${nextRep} of ${prev.targetReps}. Stay tight.`,
          repHistory: [...prev.repHistory, rep],
          done: nextRep >= prev.targetReps,
        };
      });
    }, 2500);
    return () => clearInterval(interval);
  }, [mode, screen]);

  useEffect(() => {
    const rebuilt = buildSchedule(athlete, nutrition);
    setCalendarSchedule(rebuilt);
    setScheduleSource('built');
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
    setScheduleSource('ai');
  }, [athlete, nutrition]);

  const toggleBlockedDay = useCallback((dateKey) => {
    setBlockedDays(prev => {
      const next = new Set(prev);
      next.has(dateKey) ? next.delete(dateKey) : next.add(dateKey);
      return next;
    });
  }, []);

  // ─── Navigation ──────────────────────────────────────────────────
  const goToScreen = (nextScreen) => {
    if (nextScreen === screen) return;
    setScreen(nextScreen);
  };

  const goBack = () => setScreen('home');

  const athleteName = useMemo(() =>
    `${athlete.firstName} ${athlete.lastName}`.trim(),
    [athlete.firstName, athlete.lastName]
  );

  const resetCalibration = useCallback((exercise = null) => {
    setCalibrationStore((prev) => {
      const next = { ...(prev || {}) };
      const personKey = athleteKey(athlete);

      if (exercise) {
        if (next[personKey]) {
          next[personKey] = { ...next[personKey] };
          delete next[personKey][exerciseKey(exercise)];
          if (!Object.keys(next[personKey]).length) {
            delete next[personKey];
          }
        }
      } else {
        delete next[personKey];
      }

      saveCalibrationStore(next);
      return next;
    });
  }, [athlete]);

  // ─── Workout flow ─────────────────────────────────────────────────
  const prepareHardwareSet = (payload) => {
    if (bridgeRef.current?.isConnected()) {
      bridgeRef.current.send('prepare_set', payload);
    }
  };

  const todayWorkoutPlan = (planOverride = null) => planOverride || calendarSchedule[0] || {
      lift: 'Training Session',
      type: 'strength',
      dayLabel: 'Today',
    };

  const beginWorkoutFromPlan = (plan, setupOverride = {}) => {
    const todayPlan = todayWorkoutPlan(plan);
    const cleanSetup = sanitizeWorkoutSetup({
      setsPlanned: setupOverride.setsPlanned ?? DEFAULT_WORKOUT_SETUP.setsPlanned,
      targetReps: setupOverride.targetReps ?? todayPlan.targetReps ?? DEFAULT_WORKOUT_SETUP.targetReps,
    });
    const workout = {
      id: Date.now(),
      title: todayPlan.lift || 'Training Session',
      focus: todayPlan.type || 'general',
      lift: todayPlan.lift || 'Back Squat',
      setsPlanned: cleanSetup.setsPlanned,
      targetReps: cleanSetup.targetReps,
      currentSet: 1,
      repsCompleted: 0,
      weight: 225,
      startedAt: new Date().toISOString(),
      sessionTime: '0:00',
      barVelocity: 0.72,
      barTilt: 1.8,
      liveCoachMessage: 'Waiting for first rep...',
    };

    setActiveWorkout({
      ...workout,
    });
    setLastWorkoutSummary(null);
    setSessionHistory([]);
    setWorkoutSetupPlan(null);
    setStartedRef.current = false;
    processedSetIdsRef.current = new Set();
    setLiveState({ ...DEFAULT_LIVE_STATE, targetReps: cleanSetup.targetReps, setNumber: 1 });
    setScreen('liveWorkout');
    prepareHardwareSet(startSetPayloadFromWorkout(workout, 1));
  };

  const startTodaysWorkout = (planOverride = null) => {
    const todayPlan = todayWorkoutPlan(planOverride);
    setWorkoutSetupPlan(todayPlan);
    setWorkoutSetup({
      setsPlanned: DEFAULT_WORKOUT_SETUP.setsPlanned,
      targetReps: todayPlan.targetReps || DEFAULT_WORKOUT_SETUP.targetReps,
    });
  };

  const confirmWorkoutSetup = () => {
    if (!workoutSetupPlan) return;
    beginWorkoutFromPlan(workoutSetupPlan, workoutSetup);
  };

  const cancelWorkoutSetup = () => {
    setWorkoutSetupPlan(null);
  };

  const onEndSet = () => {
    if (mode === 'hardware' && bridgeRef.current?.isConnected()) {
      bridgeRef.current.send('end_set', {});
    } else {
      setLiveState((prev) => ({ ...prev, done: true }));
    }
  };

  const onStartNextSet = () => {
    if (!activeWorkout) return;

    const { nextLiveState, nextActiveWorkout, startSetPayload } =
      getNextSetStartState(activeWorkout, liveState);

    setStartedRef.current = false;
    setLiveState(nextLiveState);
    setActiveWorkout(nextActiveWorkout);
    prepareHardwareSet(startSetPayload);
  };

  const finishWorkout = () => {
    if (!activeWorkout) return;
    const summary = summaryFromSet(activeWorkout, liveState, mode, sessionHistory);
    setLastWorkoutSummary(summary);
    setScreen('workoutSummary');

    callCoachTrigger({
      trigger: 'POST_WORKOUT',
      athlete,
      calibration: calibrationStore[athleteName] || {},
      sessionHistory,
      currentSet: liveState.setSummary,
      workoutSummary: summary,
      message: null,
    })
      .then((response) => {
        const coachResponse = {
          ...response,
          coach_advice: coachResponseToAdvice(response),
        };
        setLastWorkoutSummary((prev) => prev ? {
          ...prev,
          coachDebrief: coachResponseToText(response) || prev.coachDebrief,
          coachResponse,
        } : prev);
      })
      .catch(() => {});
  };

  const recordWorkout = (summary) => {
    if (!summary) return;
    setWorkoutHistory((prev) => [summary, ...prev]);
    setProgress((prev) => ({
      ...prev,
      squat: [...prev.squat, Math.min(prev.squat[prev.squat.length - 1] + 5, 999)],
    }));
    setChatMessages((prev) => [{
      id: Date.now(),
      role: 'assistant',
      text: `Logged ${summary.lift}. Nice work — ${summary.coachDebrief}`,
    }, ...prev]);
  };

  const logWorkout = () => {
    if (!lastWorkoutSummary) return;
    recordWorkout(lastWorkoutSummary);
    setActiveWorkout(null);
    setLastWorkoutSummary(null);
    setScreen('home');
  };

  const restartWorkout = () => {
    if (!lastWorkoutSummary) return;
    const summary = lastWorkoutSummary;
    recordWorkout(summary);
    beginWorkoutFromPlan(
      {
        lift: summary.lift,
        type: summary.focus || 'strength',
        targetReps: summary.targetReps || summary.setSummary?.target_reps || DEFAULT_WORKOUT_SETUP.targetReps,
      },
      {
        setsPlanned: summary.setsPlanned || DEFAULT_WORKOUT_SETUP.setsPlanned,
        targetReps: summary.targetReps || summary.setSummary?.target_reps || DEFAULT_WORKOUT_SETUP.targetReps,
      }
    );
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

  // Calendar removed from nav — it's embedded in the home page now
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
            {navItems.map((item) => (
              <button key={item.key} type="button" onClick={() => goToScreen(item.key)}>
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="main-content">
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
            calibration={calibrationStore[athleteName] || {}}
            sessionHistory={sessionHistory}
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
            resetCalibration={resetCalibration}
            goBack={goBack}
          />
        )}

        {screen === 'liveWorkout' && (
          <LiveWorkoutPage
            athlete={athlete}
            activeWorkout={activeWorkout}
            liveState={liveState}
            mode={mode}
            bridgeConnected={bridgeConnected}
            sourceConnected={sourceConnected}
            bridgeError={bridgeError}
            calibrationStatus={liveState.calibrationStatus}
            alerts={liveState.alerts}
            resetCalibration={resetCalibration}
            onEndSet={onEndSet}
            onStartNextSet={onStartNextSet}
            finishWorkout={finishWorkout}
            goBack={goBack}
          />
        )}

        {screen === 'workoutSummary' && (
          <WorkoutSummaryPage
            athlete={athlete}
            summary={lastWorkoutSummary}
            logWorkout={logWorkout}
            restartWorkout={restartWorkout}
            goBack={() => setScreen('liveWorkout')}
          />
        )}
      </div>
      <WorkoutSetupModal
        plan={workoutSetupPlan}
        setup={workoutSetup}
        setSetup={setWorkoutSetup}
        onCancel={cancelWorkoutSetup}
        onConfirm={confirmWorkoutSetup}
      />
    </div>
  );
}

export default App;
