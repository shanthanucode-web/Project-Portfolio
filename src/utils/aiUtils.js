
const MODEL = 'gpt-4o-mini';

async function askGPT(systemPrompt, userPrompt, conversationHistory = []) {
  const messages = conversationHistory.length > 0
    ? [{ role: 'system', content: systemPrompt }, ...conversationHistory]
    : [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ];

  const res = await fetch('/api/openai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 1500, messages }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'OpenAI API error');
  return data.output;
}

export async function getPostSessionDebrief(s) {
  const system = `You are an expert strength coach analyzing barbell IMU sensor data.
Respond with EXACTLY 3 bullet points:
- [performance observation]
- [form/imbalance observation]
- [next session progressive overload recommendation]
Each bullet under 25 words. Be specific and data-driven. No fluff.`;

  const user = `Session data:
Lift: ${s.lift} | Weight: ${s.weight} lbs | Sets: ${s.setsCompleted}/${s.totalSets} | Reps: ${s.repsPerSet}
Rep 1 velocity: ${s.rep1Velocity} m/s | Last rep: ${s.lastRepVelocity} m/s | Dropoff: ${s.velocityDropoff}%
Avg tilt: ${s.avgTilt}° left | Fatigue index: ${s.fatigueIndex}%
Phase: ${s.nutritionPhase} | Caloric target: ${s.caloricTarget} kcal
Bodyweight: ${s.bodyweight} lbs | Training age: ${s.trainingAge} years`;

  return await askGPT(system, user);
}

export async function getLiveCoachMessage(d) {
  const system = `You are a real-time barbell coach. Give ONE coaching cue (max 18 words).
Direct, punchy, like a coach on the gym floor. No bullet points. No preamble.`;

  const user = `${d.lift} - Rep ${d.currentRep}/${d.targetReps}, Set ${d.setNumber}/${d.totalSets}
Velocity this rep: ${d.thisRepVelocity} m/s (rep 1 was ${d.rep1Velocity} m/s, dropoff: ${d.velocityDropoff}%)
Bar tilt: ${d.tilt}° left | Phase: ${d.nutritionPhase}`;

  return await askGPT(system, user);
}

export async function getCalendarAdjustment(d) {
  const system = `You are a periodization expert. Respond with EXACTLY 3 bullet points:
- [load recommendation for next session]
- [exercise swap or addition based on data]
- [recovery priority this week]
Each bullet under 30 words. Reference the numbers directly.`;

  const user = `Athlete schedule data:
Phase: ${d.phase} (week ${d.phaseWeek}/${d.phaseTotalWeeks})
Recent fatigue: ${d.avgFatigue}% | Velocity dropoff: ${d.avgVelocityDropoff}%
Tilt issue: ${d.tiltIssue ? 'Yes, ' + d.avgTilt + '° left persistent' : 'No'}
Blocked days: ${d.blockedDays} | Caloric delta: ${d.caloricDelta} kcal
Bodyweight trend: ${d.bodyweightTrend}
Upcoming schedule: ${d.upcomingSchedule || 'standard program'}`;

  return await askGPT(system, user);
}

export async function getNutritionAdvice(d) {
  const system = `You are a sports nutritionist for strength athletes.
Respond with EXACTLY 2 bullet points:
- [specific advice for today based on the numbers]
- [phase/long-term strategy advice]
Each bullet under 25 words. Reference actual numbers.`;

  const user = `Nutrition data:
Phase: ${d.phase} | Target: ${d.caloricTarget} kcal | Logged: ${d.caloriesLogged} kcal
Protein: ${d.protein}g/${d.proteinTarget}g | Carbs: ${d.carbs}g/${d.carbTarget}g | Fat: ${d.fat}g/${d.fatTarget}g
Today's lift: ${d.todaysLift} | Last session fatigue: ${d.lastFatigue}%
Bodyweight: ${d.bodyweight} lbs | Phase week: ${d.phaseWeek}/${d.phaseTotalWeeks}`;

  return await askGPT(system, user);
}

/**
 * getChatCoachReply
 *
 * Now accepts a pre-built systemPrompt from ChatPage (which includes full
 * athlete context, schedule, blocked days, nutrition, etc).
 *
 * Returns { reply: string, newSchedule: array|null }
 * where newSchedule is 14 entries of { lift, type, cal, rest }
 */
export async function getChatCoachReply(conversationHistory, systemPrompt, currentSchedule) {
  const raw = await askGPT(systemPrompt, '', conversationHistory);

  try {
    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    // Validate structure
    if (typeof parsed.reply !== 'string') {
      throw new Error('Missing reply field');
    }

    // Validate newSchedule if present
    if (parsed.newSchedule !== null && parsed.newSchedule !== undefined) {
      if (!Array.isArray(parsed.newSchedule) || parsed.newSchedule.length !== 14) {
        console.warn('AI returned schedule with wrong length, ignoring:', parsed.newSchedule?.length);
        return { reply: parsed.reply, newSchedule: null };
      }
    }

    return {
      reply: parsed.reply,
      newSchedule: parsed.newSchedule || null,
    };
  } catch (err) {
    console.warn('Failed to parse AI response as JSON:', err.message);
    // Graceful fallback — return the raw text as a reply with no schedule change
    const replyText = raw
      .replace(/[{[\]"]/g, '')
      .replace(/newSchedule.*$/s, '')
      .replace(/reply\s*:\s*/i, '')
      .trim()
      .slice(0, 300);
    return { reply: replyText || raw.slice(0, 200), newSchedule: null };
  }
}
