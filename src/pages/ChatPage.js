import { useState, useRef, useEffect, useMemo } from 'react';

/* ─── Direct API call — JSON enforced at every layer ─── */
async function callCoach(systemPrompt, conversationHistory) {
  const res = await fetch('/api/openai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 2000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        ...conversationHistory,
      ],
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'API error');

  const raw = data.output || data.choices?.[0]?.message?.content || '';

  // Strip any markdown code fences the model might add despite instructions
  const clean = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  try {
    const parsed = JSON.parse(clean);
    // Validate newSchedule length if present
    if (parsed.newSchedule && parsed.newSchedule.length !== 14) {
      console.warn('AI schedule wrong length:', parsed.newSchedule.length, '— fixing');
      while (parsed.newSchedule.length < 14) parsed.newSchedule.push({ lift: null, type: null, rest: true });
      parsed.newSchedule = parsed.newSchedule.slice(0, 14);
    }
    return parsed;
  } catch {
    // AI returned plain text despite instructions — wrap it
    return { reply: clean.slice(0, 400), newSchedule: null };
  }
}

/* ─── Build system prompt from all athlete context ─── */
function buildSystemPrompt({ athlete, schedule, nutrition, workoutHistory, blockedDays }) {
  const bw = athlete?.bodyweight ? `${athlete.bodyweight} lbs` : 'unknown';
  const height = athlete?.heightFt != null
    ? `${athlete.heightFt}'${athlete.heightIn ?? 0}"`
    : 'unknown';

  const bulkCutBlocks = nutrition?.bulkCutBlocks ?? [];
  const periodDays    = nutrition?.periodDays ?? [];

  const cycleText = bulkCutBlocks.length > 0
    ? bulkCutBlocks.map((b) => `  • ${b.type.toUpperCase()} from ${b.start} to ${b.end}`).join('\n')
    : '  None logged.';

  const periodText = periodDays.length > 0
    ? `  ${periodDays.length} days logged (last 10): ${[...periodDays].sort().slice(-10).join(', ')}`
    : '  None logged.';

  const blockedText = blockedDays && blockedDays.size > 0
    ? `  ${[...blockedDays].join(', ')}`
    : '  None.';

  // ── Inject real dates into every schedule row ──
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const scheduleText = schedule && schedule.length > 0
    ? schedule.map((d, i) => {
        const date = new Date(now);
        date.setDate(now.getDate() + i);
        const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });
        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const isWeekend = date.getDay() === 0 || date.getDay() === 6;
        const label = `${weekday} ${dateStr}${isWeekend ? ' [WEEKEND]' : ''}`;
        return `  [${i}] ${label}: ${d.rest ? 'REST' : `${d.lift} (${d.type})`}${d.caloricDelta ? ` · ${d.caloricDelta}` : ''}`;
      }).join('\n')
    : '  No schedule.';

  // Human-readable today string for the prompt header
  const todayFull = now.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  // Compute which indices are this coming Saturday and Sunday
  const todayDow = now.getDay(); // 0=Sun … 6=Sat
  const daysUntilSat = todayDow === 6 ? 0 : (6 - todayDow);
  const daysUntilSun = todayDow === 0 ? 0 : (7 - todayDow);
  const thisWeekendText = `Saturday = index ${daysUntilSat}, Sunday = index ${daysUntilSun}`;

  const historyText = workoutHistory && workoutHistory.length > 0
    ? workoutHistory.slice(0, 6).map((w) =>
        `  • ${w.title} (${w.lift}): ${w.totalSets}×${Math.round(w.totalReps / w.totalSets)} @ ${w.weight} lbs, avg velocity ${w.avgVelocity} m/s`
      ).join('\n')
    : '  No workout history yet.';

  return `You are Coach Nova, a strength and conditioning AI coach with DIRECT WRITE ACCESS to the athlete's training calendar. Every message you send either updates the calendar or explains why no change is needed today.

YOU ALWAYS RESPOND WITH VALID JSON. NOTHING ELSE. No greetings, no explanations outside the JSON, no markdown. The app feeds your raw response directly into JSON.parse() — non-JSON crashes the UI.

═══════════════════════════════════════
RESPONSE SCHEMA (always one of these):
═══════════════════════════════════════

When NO change needed:
{"reply":"Short coaching message.","newSchedule":null}

When ANY change is made:
{"reply":"Short message confirming what changed and why.","newSchedule":[...14 day objects...]}

Every day object is one of:
  Training: {"lift":"Exercise Name","type":"strength","rest":false}
  Rest:      {"lift":null,"type":null,"rest":true}

type must be one of: strength | hypertrophy | endurance | pr | buildup | deload | recovery | power

CRITICAL REPLY RULES:
- The "reply" value must be a plain human sentence — 1 to 3 sentences max.
- NO JSON inside reply. NO curly braces. NO square brackets. NO code. NO lists.
- If your reply contains { or [ or } or ] characters you have made a critical error — rewrite it as plain English.
- Good example: "Blocked Saturday and Sunday, moved those sessions to Monday and Tuesday."
- Bad example: {"newSchedule": [...]} or "Here is your updated schedule: [{"lift":..."

═══════════════════════════
WHEN TO UPDATE THE SCHEDULE
═══════════════════════════
Update the schedule for ANY of these (and similar requests):
- "make today leg day" → swap today's lift with a leg session, push the displaced session forward
- "I'm busy this weekend" → use the WEEKEND INDEX MAP below to identify Sat/Sun, make them rest, move sessions to nearest weekdays
- "no weekends" → find all [WEEKEND] tagged entries in the schedule, make them rest, redistribute sessions to weekdays
- "my arms hurt" / "shoulder injury" → remove arm/shoulder movements, replace with lower body or cardio equivalents
- "I want more squats" → increase squat frequency in the schedule
- "drop OHP" → remove overhead press days, replace with another lift
- "I'm traveling Mon-Wed" → mark those days rest, compress the training into remaining days
- "deload this week" → swap all training days in week 1 to deload type, reduce intensity
- "I need an extra rest day" → add a rest day, shift remaining sessions
- "swap Tuesday and Thursday" → use the schedule's weekday labels to identify the correct indices, then swap
- "push today to tomorrow" → move today's session to tomorrow, make today rest
- "I have a meet on day 10" → taper: make days 8-9 buildup, day 10 pr attempt, day 11-12 recovery
- Any injury mention → immediately remove that movement pattern for the affected days

WEEKEND INDEX MAP (use these exact indices when athlete mentions "this weekend"):
  ${thisWeekendText}
Any entry tagged [WEEKEND] in the schedule below is also a weekend day — make it rest if athlete asks.

SWAPPING LOGIC — when athlete asks to swap days or move a session:
1. Find the two day indices by matching the weekday name in the schedule labels (e.g. "Tuesday" → find index where label contains "Tuesday")
2. Swap their lift and type values
3. Keep rest days as rest — do not pack rest into training days
4. Return the full 14-day array with the swap applied

INJURY LOGIC:
- Shoulder/arm injury → replace bench, OHP, rows with squat, deadlift, leg press, cardio
- Knee injury → replace squat, leg press with upper body and pulls
- Back injury → replace deadlift, squat with upper body accessories and cardio
- General pain → switch to recovery or deload type, keep the session light

═══════════════════
SCHEDULE CONSTRAINTS
═══════════════════
- EXACTLY 14 entries in newSchedule — no more, no less
- No more than 3 training days in a row (insert rest after 3 consecutive)
- At least 2 rest days per week (indices 0-6 and 7-13)
- Preserve today (index 0) unless athlete explicitly asks to change it
- Keep sessions athlete didn't mention exactly as they are in the current schedule

━━━ TODAY ━━━
${todayFull}
Index 0 = today. Index 1 = tomorrow. The schedule runs 14 days forward from today.

━━━ ATHLETE PROFILE ━━━
Name: ${athlete?.firstName ?? 'Athlete'} ${athlete?.lastName ?? ''}
Age: ${athlete?.age ?? 'unknown'} | Gender: ${athlete?.gender ?? 'unknown'}
Bodyweight: ${bw} | Height: ${height}
Goal: ${athlete?.goal ?? 'unknown'} | Equipment: ${athlete?.equipment ?? 'unknown'}
Cycle tracking: ${athlete?.cycleTracking ? 'yes' : 'no'}
Injuries / considerations: ${athlete?.considerations || 'none'}

━━━ CURRENT 14-DAY SCHEDULE ━━━
(Each entry shows: [index] Weekday Month Day [WEEKEND if Sat/Sun]: session)
${scheduleText}

━━━ BLOCKED DAYS ━━━
${blockedText}

━━━ NUTRITION CYCLES ━━━
${cycleText}

━━━ PERIOD TRACKING ━━━
${periodText}

━━━ RECENT WORKOUT HISTORY ━━━
${historyText}`;
}

/* ─── Suggested prompts ─── */
const SUGGESTIONS = [
  'How should I eat today given my current cycle?',
  "What's my weakest point based on my recent lifts?",
  'I tweaked my shoulder — adjust my plan',
  "I'm traveling next week, only have a hotel gym",
  'Push my squat focus this week',
  'I want to deload — rebuild my schedule',
];

function TypingDots() {
  return (
    <div className="chat-typing-dots">
      <span /><span /><span />
    </div>
  );
}

/* ─── Schedule change preview banner ─── */
function ScheduleChangedBanner({ schedule, onDismiss }) {
  if (!schedule) return null;
  const workDays = schedule.filter(d => !d.rest).length;
  const restDays = schedule.filter(d => d.rest).length;
  return (
    <div style={{
      margin: '0 16px 12px',
      padding: '12px 16px',
      borderRadius: 16,
      background: 'linear-gradient(135deg, rgba(87,240,192,0.1), rgba(87,165,255,0.08))',
      border: '1px solid rgba(87,240,192,0.25)',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
    }}>
      <div style={{ fontSize: 18, flexShrink: 0 }}>📅</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#57f0c0', marginBottom: 3 }}>
          Calendar updated
        </div>
        <div style={{ fontSize: '0.74rem', color: 'rgba(216,226,255,0.65)', fontWeight: 600 }}>
          {workDays} training days · {restDays} rest days · changes live on your calendar
        </div>
        <div style={{
          marginTop: 8,
          display: 'flex',
          gap: 4,
          flexWrap: 'wrap',
        }}>
          {schedule.slice(0, 7).map((d, i) => (
            <div key={i} style={{
              padding: '3px 8px',
              borderRadius: 8,
              fontSize: '0.66rem',
              fontWeight: 700,
              background: d.rest
                ? 'rgba(255,255,255,0.06)'
                : 'rgba(87,165,255,0.15)',
              color: d.rest ? 'rgba(216,226,255,0.4)' : '#57a5ff',
              border: `1px solid ${d.rest ? 'rgba(255,255,255,0.08)' : 'rgba(87,165,255,0.25)'}`,
              whiteSpace: 'nowrap',
            }}>
              {d.rest ? 'Rest' : (d.lift || '—').split(' ').slice(0, 2).join(' ')}
            </div>
          ))}
          <div style={{
            padding: '3px 8px', borderRadius: 8, fontSize: '0.66rem',
            fontWeight: 700, color: 'rgba(216,226,255,0.4)',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            +7 more →
          </div>
        </div>
      </div>
      <button
        onClick={onDismiss}
        style={{
          flexShrink: 0, width: 24, height: 24, borderRadius: '50%',
          background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
          color: 'rgba(247,249,255,0.5)', cursor: 'pointer', fontSize: '0.9rem',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        ×
      </button>
    </div>
  );
}

function MessageBubble({ msg }) {
  const isCoach = msg.role === 'assistant';
  return (
    <div className={`chat-msg-row ${isCoach ? 'chat-msg-coach' : 'chat-msg-user'}`}>
      {isCoach && <div className="chat-avatar"><span>N</span></div>}
      <div className={`chat-bubble ${isCoach ? 'chat-bubble-coach' : 'chat-bubble-user'}`}>
        {msg.text}
        {msg.scheduleChanged && (
          <div style={{
            marginTop: 8, paddingTop: 8,
            borderTop: '1px solid rgba(87,240,192,0.2)',
            fontSize: '0.72rem', fontWeight: 700,
            color: '#57f0c0',
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <span>📅</span> Calendar updated — check the Calendar tab
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChatPage({
  athlete,
  schedule,
  nutrition,
  chatMessages,
  setChatMessages,
  workoutHistory,
  blockedDays,
  onApplySchedule,
  onBlockDay,
  goToScreen,
}) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastNewSchedule, setLastNewSchedule] = useState(null);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  const systemPrompt = useMemo(
    () => buildSystemPrompt({ athlete, schedule, nutrition, workoutHistory, blockedDays }),
    [athlete, schedule, nutrition, workoutHistory, blockedDays]
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, loading]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
  }, [input]);

  async function send(text) {
    const trimmed = (text ?? input).trim();
    if (!trimmed || loading) return;
    setInput('');
    setError(null);

    const userMsg = { id: Date.now(), role: 'user', text: trimmed };

    // Build conversation history for API — oldest first, max 40 messages
    const history = [...chatMessages]
      .reverse()
      .slice(0, 39)
      .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.text }));
    history.push({ role: 'user', content: trimmed });

    setChatMessages((prev) => [userMsg, ...prev]);
    setLoading(true);

    try {
      const result = await callCoach(systemPrompt, history);

      const scheduleChanged = !!result.newSchedule;

      // Apply schedule if AI returned one
      if (scheduleChanged && onApplySchedule) {
        onApplySchedule(result.newSchedule);
        setLastNewSchedule(result.newSchedule);
      }

      const assistantMsg = {
        id: Date.now() + 1,
        role: 'assistant',
        text: result.reply || result,
        scheduleChanged,
      };

      setChatMessages((prev) => [assistantMsg, ...prev]);
    } catch (err) {
      console.error('Chat error:', err);
      setError('Failed to reach Coach Nova. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const showSuggestions = chatMessages.length === 0 && !loading;

  return (
    <div className="screen chat-screen">
      <style>{`
        .chat-screen {
          display: flex;
          flex-direction: column;
          height: calc(100vh - 56px);
          padding: 0;
          overflow: hidden;
        }
        .chat-header {
          flex-shrink: 0;
          padding: 18px 20px 14px;
          border-bottom: 1px solid rgba(255,255,255,0.07);
          display: flex;
          align-items: center;
          gap: 12px;
          background: rgba(255,255,255,0.03);
          backdrop-filter: blur(12px);
        }
        .chat-header-avatar {
          width: 38px; height: 38px; border-radius: 12px;
          background: linear-gradient(135deg, rgba(87,165,255,0.3), rgba(155,168,255,0.3));
          border: 1px solid rgba(87,165,255,0.25);
          display: flex; align-items: center; justify-content: center;
          font-size: 1rem; font-weight: 800; color: #bcdcff; flex-shrink: 0;
        }
        .chat-header-name {
          font-size: 0.92rem; font-weight: 800; color: var(--text); line-height: 1.2;
        }
        .chat-header-sub {
          font-size: 0.68rem; color: var(--muted); font-weight: 600; margin-top: 1px;
        }
        .chat-header-dot {
          display: inline-block; width: 6px; height: 6px; border-radius: 50%;
          background: var(--mint); box-shadow: 0 0 6px rgba(87,240,192,0.8);
          margin-right: 5px; vertical-align: middle;
        }
        .chat-context-strip {
          flex-shrink: 0;
          padding: 8px 16px;
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          border-bottom: 1px solid rgba(255,255,255,0.05);
          background: rgba(255,255,255,0.02);
        }
        .chat-ctx-chip {
          padding: 3px 10px;
          border-radius: 999px;
          font-size: 0.68rem;
          font-weight: 700;
          border: 1px solid;
        }
        .chat-messages {
          flex: 1; overflow-y: auto; padding: 16px 16px 8px;
          display: flex; flex-direction: column-reverse; gap: 12px;
          scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.1) transparent;
        }
        .chat-messages::-webkit-scrollbar { width: 4px; }
        .chat-messages::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
        .chat-msg-row { display: flex; align-items: flex-end; gap: 8px; max-width: 680px; }
        .chat-msg-coach { align-self: flex-start; }
        .chat-msg-user { align-self: flex-end; flex-direction: row-reverse; }
        .chat-avatar {
          width: 28px; height: 28px; border-radius: 8px;
          background: linear-gradient(135deg, rgba(87,165,255,0.25), rgba(155,168,255,0.25));
          border: 1px solid rgba(87,165,255,0.2);
          display: flex; align-items: center; justify-content: center;
          font-size: 0.7rem; font-weight: 800; color: #bcdcff; flex-shrink: 0;
        }
        .chat-bubble {
          padding: 10px 14px; border-radius: 16px; font-size: 0.87rem;
          line-height: 1.6; max-width: 520px; white-space: pre-wrap; word-break: break-word;
        }
        .chat-bubble-coach {
          background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.1);
          color: var(--text); border-bottom-left-radius: 4px;
        }
        .chat-bubble-user {
          background: linear-gradient(135deg, rgba(87,165,255,0.22), rgba(155,168,255,0.18));
          border: 1px solid rgba(87,165,255,0.25); color: #daeeff; border-bottom-right-radius: 4px;
        }
        .chat-typing-row { display: flex; align-items: flex-end; gap: 8px; align-self: flex-start; }
        .chat-typing-bubble {
          padding: 12px 16px; background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; border-bottom-left-radius: 4px;
        }
        .chat-typing-dots { display: flex; gap: 4px; align-items: center; }
        .chat-typing-dots span {
          width: 5px; height: 5px; border-radius: 50%; background: var(--muted);
          animation: chatDot 1.2s infinite ease-in-out;
        }
        .chat-typing-dots span:nth-child(2) { animation-delay: 0.2s; }
        .chat-typing-dots span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes chatDot {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-4px); opacity: 1; }
        }
        .chat-empty {
          display: flex; flex-direction: column; align-items: center;
          justify-content: flex-end; flex: 1; padding: 0 16px 8px; gap: 12px;
        }
        .chat-empty-label {
          font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.18em;
          font-weight: 800; color: var(--muted);
        }
        .chat-suggestions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; max-width: 580px; }
        .chat-suggestion-btn {
          padding: 8px 14px; background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.1); border-radius: 999px;
          font-size: 0.78rem; font-weight: 600; color: var(--text-soft);
          cursor: pointer; transition: background 0.15s, transform 0.15s, border-color 0.15s; text-align: center;
        }
        .chat-suggestion-btn:hover {
          background: rgba(87,165,255,0.12); border-color: rgba(87,165,255,0.25);
          color: #bcdcff; transform: translateY(-1px);
        }
        .chat-error {
          font-size: 0.76rem; color: #ffb8b8; text-align: center; padding: 6px 16px; flex-shrink: 0;
        }
        .chat-input-bar {
          flex-shrink: 0; padding: 8px 16px 16px;
          border-top: 1px solid rgba(255,255,255,0.07);
          background: rgba(255,255,255,0.02); backdrop-filter: blur(12px);
        }
        .chat-input-row {
          display: flex; align-items: flex-end; gap: 10px;
          background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.11);
          border-radius: 18px; padding: 8px 8px 8px 16px; transition: border-color 0.15s;
        }
        .chat-input-row:focus-within { border-color: rgba(87,165,255,0.35); }
        .chat-textarea {
          flex: 1; background: transparent; border: none; outline: none; resize: none;
          color: var(--text); font-size: 0.88rem; line-height: 1.5; font-family: inherit;
          min-height: 24px; max-height: 140px; overflow-y: auto; padding: 2px 0; scrollbar-width: thin;
        }
        .chat-textarea::placeholder { color: var(--muted); }
        .chat-send-btn {
          width: 34px; height: 34px; border-radius: 12px; border: none;
          background: linear-gradient(135deg, rgba(87,165,255,0.5), rgba(155,168,255,0.4));
          color: #fff; cursor: pointer; display: flex; align-items: center;
          justify-content: center; flex-shrink: 0; transition: transform 0.14s, filter 0.14s, opacity 0.14s;
        }
        .chat-send-btn:hover:not(:disabled) { transform: scale(1.07); filter: brightness(1.15); }
        .chat-send-btn:disabled { opacity: 0.3; cursor: not-allowed; }
        .chat-input-hint {
          font-size: 0.63rem; color: var(--muted); text-align: center; margin-top: 7px; opacity: 0.6;
        }
        .chat-cal-btn {
          display: flex; align-items: center; gap: 6px;
          padding: 6px 14px; border-radius: 999px;
          background: rgba(87,240,192,0.1); border: 1px solid rgba(87,240,192,0.25);
          color: #57f0c0; font-size: 0.74rem; font-weight: 700;
          cursor: pointer; transition: background 0.15s;
          margin-top: 8px;
        }
        .chat-cal-btn:hover { background: rgba(87,240,192,0.18); }
      `}</style>

      {/* Header */}
      <div className="chat-header">
        <div className="chat-header-avatar">N</div>
        <div>
          <div className="chat-header-name">Coach Nova</div>
          <div className="chat-header-sub">
            <span className="chat-header-dot" />
            Live · reads your schedule, nutrition &amp; history
          </div>
        </div>
      </div>

      {/* Context strip — shows what Nova currently knows */}
      <div className="chat-context-strip">
        <span className="chat-ctx-chip" style={{ color: 'var(--violet)', borderColor: 'rgba(143,124,255,0.3)', background: 'rgba(143,124,255,0.1)' }}>
          {athlete?.goal ?? 'goal unknown'}
        </span>
        {athlete?.considerations && (
          <span className="chat-ctx-chip" style={{ color: '#ffd84d', borderColor: 'rgba(255,216,77,0.3)', background: 'rgba(255,216,77,0.1)' }}>
            ⚠ {athlete.considerations.slice(0, 30)}{athlete.considerations.length > 30 ? '…' : ''}
          </span>
        )}
        {(() => {
          const today = new Date(); today.setHours(0,0,0,0);
          const todayKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
          const block = (nutrition?.bulkCutBlocks ?? []).find(b => todayKey >= b.start && todayKey <= b.end);
          return block ? (
            <span className="chat-ctx-chip" style={{ color: block.type === 'bulk' ? 'var(--mint)' : block.type === 'cut' ? 'var(--orange)' : 'var(--blue)', borderColor: 'rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)' }}>
              {block.type} phase
            </span>
          ) : null;
        })()}
        {blockedDays?.size > 0 && (
          <span className="chat-ctx-chip" style={{ color: 'rgba(216,226,255,0.5)', borderColor: 'rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)' }}>
            {blockedDays.size} day{blockedDays.size !== 1 ? 's' : ''} blocked
          </span>
        )}
        <span className="chat-ctx-chip" style={{ color: 'rgba(216,226,255,0.4)', borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}>
          {schedule?.filter(d => !d.rest).length ?? 0} training days ahead
        </span>
      </div>

      {/* Schedule change banner */}
      {lastNewSchedule && (
        <ScheduleChangedBanner
          schedule={schedule}
          onDismiss={() => setLastNewSchedule(null)}
        />
      )}

      {/* Messages or suggestions */}
      {showSuggestions ? (
        <div className="chat-empty">
          <div className="chat-empty-label">Ask your coach</div>
          <div className="chat-suggestions">
            {SUGGESTIONS.map((s) => (
              <button key={s} className="chat-suggestion-btn" onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
          {goToScreen && (
            <button className="chat-cal-btn" onClick={() => goToScreen('calendar')}>
              📅 View your calendar
            </button>
          )}
        </div>
      ) : (
        <div className="chat-messages">
          <div ref={bottomRef} />
          {loading && (
            <div className="chat-typing-row">
              <div className="chat-avatar">N</div>
              <div className="chat-typing-bubble"><TypingDots /></div>
            </div>
          )}
          {chatMessages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} />
          ))}
        </div>
      )}

      {error && <div className="chat-error">{error}</div>}

      <div className="chat-input-bar">
        <div className="chat-input-row">
          <textarea
            ref={textareaRef}
            className="chat-textarea"
            placeholder="Tell Nova anything — injury, travel, new goal, blocked days…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
          />
          <button
            className="chat-send-btn"
            onClick={() => send()}
            disabled={!input.trim() || loading}
            aria-label="Send message"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 13L13 7L1 1V5.5L9 7L1 8.5V13Z" fill="currentColor" />
            </svg>
          </button>
        </div>
        <div className="chat-input-hint">Enter to send · Shift+Enter for new line · schedule updates live</div>
      </div>
    </div>
  );
}
