import { describe, expect, it, vi } from 'vitest';

vi.mock('./liveBridge', () => ({
  createLiveBridgeClient: vi.fn(() => ({
    connect: vi.fn(() => Promise.reject(new Error('Bridge unavailable'))),
    disconnect: vi.fn(),
    isConnected: vi.fn(() => false),
    send: vi.fn(() => false),
  })),
}));

vi.mock('./pages/CalendarPage', () => ({
  buildSchedule: () => [{ lift: 'Back Squat', type: 'strength', targetReps: 5 }],
  default: () => null,
}));

vi.mock('./pages/HomePage', () => ({ default: () => null }));
vi.mock('./pages/LiveWorkoutPage', () => ({ default: () => null }));
vi.mock('./pages/NutritionPage', () => ({ default: () => null }));
vi.mock('./pages/ChatPage', () => ({ default: () => null }));
vi.mock('./pages/ProfilePage', () => ({ default: () => null }));
vi.mock('./pages/WorkoutSummaryPage', () => ({ default: () => null }));

describe('App module', () => {
  it('loads without opening the live bridge during module import', async () => {
    const bridge = await import('./liveBridge');
    const { default: App } = await import('./App.jsx');

    expect(typeof App).toBe('function');
    expect(bridge.createLiveBridgeClient).not.toHaveBeenCalled();
  }, 15000);

  it('builds next-set state without treating planned sets as target reps', async () => {
    const { getNextSetStartState } = await import('./App.jsx');
    const activeWorkout = {
      lift: 'Back Squat',
      currentSet: 1,
      setsPlanned: 5,
    };
    const liveState = {
      setNumber: 1,
      targetReps: 3,
    };

    const result = getNextSetStartState(activeWorkout, liveState);

    expect(result.nextSetNumber).toBe(2);
    expect(result.targetReps).toBe(3);
    expect(result.nextLiveState).toMatchObject({
      currentRep: 0,
      setNumber: 2,
      targetReps: 3,
      done: false,
      setSummary: null,
    });
    expect(result.nextActiveWorkout).toMatchObject({
      currentSet: 2,
      setsPlanned: 5,
    });
    expect(result.startSetPayload).toEqual({
      exercise: 'Back Squat',
      target_reps: 3,
      set_number: 2,
    });
  });

  it('falls back to five target reps when neither live nor workout target reps are set', async () => {
    const { getNextSetStartState } = await import('./App.jsx');

    const result = getNextSetStartState(
      { lift: 'Back Squat', currentSet: 2, setsPlanned: 8 },
      { setNumber: 2 }
    );

    expect(result.nextSetNumber).toBe(3);
    expect(result.targetReps).toBe(5);
  });

  it('sanitizes workout setup values into supported ranges', async () => {
    const { sanitizeWorkoutSetup } = await import('./App.jsx');

    expect(sanitizeWorkoutSetup({ setsPlanned: 12, targetReps: 0 })).toEqual({
      setsPlanned: 10,
      targetReps: 1,
    });
    expect(sanitizeWorkoutSetup({ setsPlanned: '4', targetReps: '8' })).toEqual({
      setsPlanned: 4,
      targetReps: 8,
    });
  });

  it('builds coach prompt variables from live payload context', async () => {
    const { buildCoachPromptVariables } = await import('./coachPromptVariables');

    expect(buildCoachPromptVariables({
      athlete: { firstName: 'Jane', goal: 'strength' },
      currentSet: {
        exercise: 'Back Squat',
        setSummary: { set_number: 3 },
      },
    })).toEqual({
      athlete_name: 'Jane',
      athlete_goal: 'strength',
      training_block: 'Strength phase, week 3 of 6',
      exercises_today: 'Back Squat',
      current_set: '3',
    });
  });
});
