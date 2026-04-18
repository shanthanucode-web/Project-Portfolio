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

const LIFT_IMAGES = {
  'Back Squat':    '/backsquat.png',
  'Front Squat':   '/frontsquat.png',
  'Bench Press':   '/bench.png',
  'Deadlift':      '/deadlift.png',
  'Overhead Press':'/overhead.png',
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
  const [scheduleSource, setScheduleSource] = useState('built');

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
            setActiveWorkout={setActiveWorkout}
            finishWorkout={finishWorkout}
          />
        )}

        {screen === 'workoutSummary' && (
          <WorkoutSummaryPage
            athlete={athlete}
            summary={lastWorkoutSummary}
            logWorkout={logWorkout}
          />
        )}
      </div>
    </div>
  );
}

export default App;
