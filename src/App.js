import { useMemo, useState } from 'react';
import HomePage from './pages/HomePage';
import CalendarPage from './pages/CalendarPage';
import NutritionPage from './pages/NutritionPage';
import ChatPage from './pages/ChatPage';
import ProfilePage from './pages/ProfilePage';
import LiveWorkoutPage from './pages/LiveWorkoutPage';
import WorkoutSummaryPage from './pages/WorkoutSummaryPage';
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

const DEFAULT_SCHEDULE = [
  { id: 1, day: 'Today', date: 'Apr 11', title: 'Lower Power', focus: 'Squat + posterior chain', status: 'active' },
  { id: 2, day: 'Sun', date: 'Apr 12', title: 'Recovery', focus: 'Walk + mobility', status: 'upcoming' },
  { id: 3, day: 'Mon', date: 'Apr 13', title: 'Bench Focus', focus: 'Bench + triceps', status: 'upcoming' },
  { id: 4, day: 'Tue', date: 'Apr 14', title: 'Squat Volume', focus: 'Volume lower day', status: 'upcoming' },
  { id: 5, day: 'Wed', date: 'Apr 15', title: 'Upper Pull', focus: 'Back + biceps', status: 'upcoming' },
];

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

const DEFAULT_WORKOUT_HISTORY = [];

function App() {
  const [screen, setScreen] = useState('home');
  const [screenHistory, setScreenHistory] = useState([]);

  const [athlete, setAthlete] = useState(DEFAULT_ATHLETE);
  const [schedule, setSchedule] = useState(DEFAULT_SCHEDULE);
  const [nutrition, setNutrition] = useState(DEFAULT_NUTRITION);
  const [progress, setProgress] = useState(DEFAULT_PROGRESS);
  const [chatMessages, setChatMessages] = useState(DEFAULT_CHAT);
  const [workoutHistory, setWorkoutHistory] = useState(DEFAULT_WORKOUT_HISTORY);

  const [activeWorkout, setActiveWorkout] = useState(null);
  const [lastWorkoutSummary, setLastWorkoutSummary] = useState(null);

  const goToScreen = (nextScreen) => {
    if (nextScreen === screen) return;
    setScreenHistory((prev) => [...prev, screen]);
    setScreen(nextScreen);
  };

  const goBack = () => {
    setScreenHistory((prev) => {
      if (prev.length === 0) {
        setScreen('home');
        return prev;
      }

      const last = prev[prev.length - 1];
      setScreen(last);
      return prev.slice(0, -1);
    });
  };

  const canGoBack = screen !== 'home' || screenHistory.length > 0;

  const athleteName = useMemo(() => {
    return `${athlete.firstName} ${athlete.lastName}`.trim();
  }, [athlete.firstName, athlete.lastName]);

  const startTodaysWorkout = () => {
    const todayPlan = schedule[0] || {
      title: 'Training Session',
      focus: 'General training',
      day: 'Today',
      date: '',
    };

    const newWorkout = {
      id: Date.now(),
      title: todayPlan.title,
      focus: todayPlan.focus,
      day: todayPlan.day,
      date: todayPlan.date,
      lift: 'Back Squat',
      setsPlanned: 5,
      currentSet: 1,
      repsCompleted: 0,
      weight: 225,
      startedAt: new Date().toISOString(),
      sessionTime: '0:00',
      barVelocity: 0.72,
      barTilt: 1.8,
      liveCoachMessage: 'Waiting for first rep...',
    };

    setActiveWorkout(newWorkout);
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
      coachDebrief:
        'Strong session. Bar speed stayed controlled through the middle sets and only faded slightly near the end.',
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

    setChatMessages((prev) => [
      {
        id: Date.now(),
        role: 'assistant',
        text: `Logged ${lastWorkoutSummary.lift}. Nice work — ${lastWorkoutSummary.coachDebrief}`,
      },
      ...prev,
    ]);

    setActiveWorkout(null);
    setLastWorkoutSummary(null);
    setScreenHistory([]);
    setScreen('home');
  };

  const homeSummary = useMemo(() => {
    const today = schedule[0] || null;
    const topInsight =
      chatMessages.find((m) => m.role === 'assistant')?.text ||
      'Coach insight will appear here as your training data fills in.';

    return {
      athleteName,
      today,
      nutritionMode: nutrition.mode,
      nutritionAdvice: nutrition.aiAdvice,
      topInsight,
      progress,
      lastWorkoutSummary,
      workoutHistoryCount: workoutHistory.length,
    };
  }, [athleteName, schedule, nutrition, chatMessages, progress, lastWorkoutSummary, workoutHistory]);

  const navItems = [
    { key: 'home', label: 'Home' },
    { key: 'calendar', label: 'Calendar' },
    { key: 'nutrition', label: 'Nutrition' },
    { key: 'chat', label: 'Coach' },
    { key: 'profile', label: 'Profile' },
  ];

  const showTopNav = screen !== 'liveWorkout';

  return (
    <div className="app">
      {showTopNav && (
        <div className="topnav">
          <div className="logo">
            <span>Coach Nova</span>
          </div>

          <div className="nav-right">
            {canGoBack && (
              <button type="button" onClick={goBack}>
                Back
              </button>
            )}

            {navItems.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => goToScreen(item.key)}
              >
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
            schedule={schedule}
            nutrition={nutrition}
            progress={progress}
            goToScreen={goToScreen}
            startTodaysWorkout={startTodaysWorkout}
          />
        )}

        {screen === 'calendar' && (
          <CalendarPage
            athlete={athlete}
            schedule={schedule}
            nutrition={nutrition}
            setSchedule={setSchedule}
            goBack={goBack}
            goToScreen={goToScreen}
          />
        )}
        // {screen === 'calendar' && (
        //   <CalendarPage
        //     athlete={athlete}
        //     nutrition={nutrition}     // ← this line must be added
        //     goToScreen={goToScreen}
        //   />
        // )}

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
            schedule={schedule}
            nutrition={nutrition}
            chatMessages={chatMessages}
            setChatMessages={setChatMessages}
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
