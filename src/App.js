import { useMemo, useState, useCallback, useEffect } from 'react';
import HomePage from './pages/HomePage';
import CalendarPage from './pages/CalendarPage';
import NutritionPage from './pages/NutritionPage';
import ChatPage from './pages/ChatPage';
import ProfilePage from './pages/ProfilePage';
import LiveWorkoutPage from './pages/LiveWorkoutPage';
import WorkoutSummaryPage from './pages/WorkoutSummaryPage';
import { buildSchedule } from './pages/CalendarPage';
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

function App() {
  const [screen, setScreen] = useState('home');
  const [screenHistory, setScreenHistory] = useState([]);

  const [athlete, setAthlete] = useState(DEFAULT_ATHLETE);
  const [nutrition, setNutrition] = useState(DEFAULT_NUTRITION);
  const [progress, setProgress] = useState(DEFAULT_PROGRESS);
  const [chatMessages, setChatMessages] = useState(DEFAULT_CHAT);
  const [workoutHistory, setWorkoutHistory] = useState([]);

  // ─── Live schedule state — single source of truth ───────────────
  // Initially built from athlete + nutrition. Can be overridden by AI chat.
  const [calendarSchedule, setCalendarSchedule] = useState(() =>
    buildSchedule(DEFAULT_ATHLETE, DEFAULT_NUTRITION)
  );

  // Blocked days live here at App level so chat/calendar stay in sync
  const [blockedDays, setBlockedDays] = useState(new Set());

  const [activeWorkout, setActiveWorkout] = useState(null);
  const [lastWorkoutSummary, setLastWorkoutSummary] = useState(null);

  // ─── Rebuild calendar when athlete profile or nutrition changes ──
  // But preserve any AI-injected overrides (newSchedule from chat)
  // We track whether the schedule was last set by AI or by build
  const [scheduleSource, setScheduleSource] = useState('built'); // 'built' | 'ai'

  useEffect(() => {
    // When athlete or nutrition changes, always rebuild from source
    // (AI override resets — profile change is more authoritative)
    const rebuilt = buildSchedule(athlete, nutrition);
    setCalendarSchedule(rebuilt);
    setScheduleSource('built');
  }, [athlete, nutrition]);

  // ─── Schedule mutation from AI chat ─────────────────────────────
  // Called by ChatPage when AI returns a newSchedule
  const applyAISchedule = useCallback((newScheduleDays) => {
    // newScheduleDays is the minimal format from getChatCoachReply:
    // [{ lift, type, cal, rest }, ...] — 14 entries
    // We need to merge with the existing schedule to fill in dates, accessories, etc.
    const base = buildSchedule(athlete, nutrition);

    const merged = base.map((day, i) => {
      const override = newScheduleDays[i];
      if (!override) return day;
      return {
        ...day,
        lift:    override.rest ? null : (override.lift ?? day.lift),
        type:    override.rest ? null : (override.type ?? day.type),
        rest:    !!override.rest,
        // Preserve accessories if same lift, clear if different
        accessories: (override.lift && override.lift !== day.lift) ? [] : day.accessories,
        // AI caloric delta overrides if provided
        caloricDelta: override.cal ?? day.caloricDelta,
      };
    });

    setCalendarSchedule(merged);
    setScheduleSource('ai');
  }, [athlete, nutrition]);

  // ─── Block day handler (used by both calendar and chat) ──────────
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
    setScreenHistory((prev) => [...prev, screen]);
    setScreen(nextScreen);
  };

  const goBack = () => {
    setScreenHistory((prev) => {
      if (prev.length === 0) { setScreen('home'); return prev; }
      const last = prev[prev.length - 1];
      setScreen(last);
      return prev.slice(0, -1);
    });
  };

  const canGoBack = screen !== 'home' || screenHistory.length > 0;

  const athleteName = useMemo(() =>
    `${athlete.firstName} ${athlete.lastName}`.trim(),
    [athlete.firstName, athlete.lastName]
  );

  // ─── Workout flow ─────────────────────────────────────────────────
  const startTodaysWorkout = () => {
    const todayPlan = calendarSchedule[0] || {
      lift: 'Training Session',
      type: 'strength',
      dayLabel: 'Today',
    };
    setActiveWorkout({
      id: Date.now(),
      title: todayPlan.lift || 'Training Session',
      focus: todayPlan.type || 'general',
      lift: todayPlan.lift || 'Back Squat',
      setsPlanned: 5,
      currentSet: 1,
      repsCompleted: 0,
      weight: 225,
      startedAt: new Date().toISOString(),
      sessionTime: '0:00',
      barVelocity: 0.72,
      barTilt: 1.8,
      liveCoachMessage: 'Waiting for first rep...',
    });
    setLastWorkoutSummary(null);
    setScreenHistory((prev) => [...prev, 'home']);
    setScreen('liveWorkout');
  };

  const finishWorkout = () => {
    if (!activeWorkout) return;
    const summary = {
      id: activeWorkout.id,
      title: activeWorkout.title,
      focus: activeWorkout.focus,
      lift: activeWorkout.lift,
      totalSets: activeWorkout.setsPlanned,
      totalReps: 25,
      weight: activeWorkout.weight,
      avgVelocity: 0.68,
      avgTilt: 1.9,
      durationSec: 1320,
      durationLabel: '22 min',
      coachDebrief: 'Strong session. Bar speed stayed controlled through the middle sets.',
      completedAt: new Date().toISOString(),
    };
    setLastWorkoutSummary(summary);
    setScreenHistory((prev) => [...prev, 'liveWorkout']);
    setScreen('workoutSummary');
  };

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
      text: `Logged ${lastWorkoutSummary.lift}. Nice work — ${lastWorkoutSummary.coachDebrief}`,
    }, ...prev]);
    setActiveWorkout(null);
    setLastWorkoutSummary(null);
    setScreenHistory([]);
    setScreen('home');
  };

  // ─── Home summary ─────────────────────────────────────────────────
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
    { key: 'calendar',  label: 'Calendar'  },
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
            {canGoBack && <button type="button" onClick={goBack}>Back</button>}
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
            goBack={goBack}
            goToScreen={goToScreen}
          />
        )}

        {screen === 'nutrition' && (
          <NutritionPage
            athlete={athlete}
            nutrition={nutrition}
            setNutrition={setNutrition}
            goBack={goBack}
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
            goBack={goBack}
            goToScreen={goToScreen}
          />
        )}

        {screen === 'profile' && (
          <ProfilePage
            athlete={athlete}
            setAthlete={setAthlete}
            goBack={goBack}
            goToScreen={goToScreen}
          />
        )}

        {screen === 'liveWorkout' && (
          <LiveWorkoutPage
            athlete={athlete}
            activeWorkout={activeWorkout}
            setActiveWorkout={setActiveWorkout}
            finishWorkout={finishWorkout}
            goBack={goBack}
          />
        )}

        {screen === 'workoutSummary' && (
          <WorkoutSummaryPage
            athlete={athlete}
            summary={lastWorkoutSummary}
            logWorkout={logWorkout}
            goBack={goBack}
          />
        )}
      </div>
    </div>
  );
}

export default App;
