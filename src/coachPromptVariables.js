export function buildCoachPromptVariables(payload = {}) {
  return {
    athlete_name: payload.athlete?.firstName || 'Jane',
    athlete_goal: payload.athlete?.goal || 'increase squat 1RM',
    training_block: 'Strength phase, week 3 of 6',
    exercises_today: payload.currentSet?.exercise || payload.sessionHistory?.[0]?.exercise || 'Back Squat',
    current_set: String(payload.currentSet?.setSummary?.set_number || 1),
  };
}
