import '../styles/live.css';

function formatDuration(startedAt) {
  if (!startedAt) return '0:00';
  const elapsed = Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 1000));
  const minutes = Math.floor(elapsed / 60);
  const seconds = String(elapsed % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function metricTone(value, warnAt) {
  return value >= warnAt ? 'warn' : 'ok';
}

function StatCard({ label, value, unit, note, tone = 'neutral' }) {
  return (
    <div className={`live-stat live-stat-${tone}`}>
      <div className="live-stat-label">{label}</div>
      <div className="live-stat-value">
        {value}
        {unit && <span>{unit}</span>}
      </div>
      <div className="live-stat-note">{note}</div>
    </div>
  );
}

function LineChart({ time = [], series = [], suffix = '' }) {
  const width = 560;
  const height = 170;
  const padding = 18;
  const values = series.flatMap((entry) => entry.values || []);
  const xValues = time.length ? time : values.map((_, index) => index);

  if (!xValues.length || !values.length) {
    return <div className="live-chart-empty">Waiting for chart data...</div>;
  }

  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const rawMinY = Math.min(...values);
  const rawMaxY = Math.max(...values);
  const yPad = rawMinY === rawMaxY ? 1 : (rawMaxY - rawMinY) * 0.16;
  const minY = rawMinY - yPad;
  const maxY = rawMaxY + yPad;
  const toX = (value) => padding + ((value - minX) / Math.max(maxX - minX, 1)) * (width - padding * 2);
  const toY = (value) => height - padding - ((value - minY) / Math.max(maxY - minY, 1)) * (height - padding * 2);
  const grid = Array.from({ length: 4 }, (_, index) => minY + ((maxY - minY) * index) / 3);

  return (
    <div className="live-chart-shell">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="live IMU chart">
        {grid.map((value, index) => (
          <line
            key={`grid-${index}`}
            x1={padding}
            x2={width - padding}
            y1={toY(value)}
            y2={toY(value)}
            className="live-chart-gridline"
          />
        ))}
        {series.map((entry) => {
          const points = (entry.values || [])
            .map((value, index) => `${toX(xValues[index] ?? index)},${toY(value)}`)
            .join(' ');
          return (
            <polyline
              key={entry.key}
              points={points}
              fill="none"
              stroke={entry.color}
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}
      </svg>
      <div className="live-chart-axis">
        <span>{minX.toFixed(0)}s</span>
        <span>{maxY.toFixed(1)}{suffix ? ` ${suffix}` : ''}</span>
        <span>now</span>
      </div>
    </div>
  );
}

function ChartCard({ title, badge, time, series, suffix }) {
  return (
    <div className="live-panel">
      <div className="live-panel-head">
        <h3>{title}</h3>
        <span>{badge}</span>
      </div>
      <div className="live-legend">
        {series.map((entry) => (
          <div key={entry.key}>
            <i style={{ background: entry.color }} />
            {entry.label}
          </div>
        ))}
      </div>
      <LineChart time={time} series={series} suffix={suffix} />
    </div>
  );
}

function ChartPanels({ chartWindow, mode }) {
  const accel = chartWindow?.accel || { t: [], ax: [], ay: [], az: [] };
  const gyro = chartWindow?.gyro || { t: [], gx: [], gy: [], gz: [] };
  const velocity = chartWindow?.velocity || { t: [], v: [] };
  const badge = mode === 'hardware' ? 'Python bridge' : 'Demo stream';

  return (
    <div className="live-chart-grid">
      <ChartCard
        title="Acceleration"
        badge={badge}
        time={accel.t}
        suffix="g"
        series={[
          { key: 'ax', label: 'X', color: '#ff7a7a', values: accel.ax },
          { key: 'ay', label: 'Y', color: '#57f0c0', values: accel.ay },
          { key: 'az', label: 'Z', color: '#57a5ff', values: accel.az },
        ]}
      />
      <ChartCard
        title="Gyroscope"
        badge={badge}
        time={gyro.t}
        suffix="dps"
        series={[
          { key: 'gx', label: 'X', color: '#ff7a7a', values: gyro.gx },
          { key: 'gy', label: 'Y', color: '#57f0c0', values: gyro.gy },
          { key: 'gz', label: 'Z', color: '#57a5ff', values: gyro.gz },
        ]}
      />
      <ChartCard
        title="Velocity"
        badge={badge}
        time={velocity.t}
        suffix="m/s"
        series={[
          { key: 'v', label: 'Bar velocity', color: '#ffd84d', values: velocity.v },
        ]}
      />
    </div>
  );
}

function RepTable({ reps }) {
  if (!reps?.length) {
    return <div className="live-empty-copy">No completed reps yet.</div>;
  }

  return (
    <div className="live-rep-table">
      <div className="live-rep-row live-rep-head">
        <span>Rep</span>
        <span>Velocity</span>
        <span>Tilt</span>
        <span>Flags</span>
      </div>
      {reps.map((rep) => (
        <div key={rep.rep_number} className="live-rep-row">
          <span>{rep.rep_number}</span>
          <span>{Number(rep.velocity_proxy || 0).toFixed(2)} m/s</span>
          <span>{Number(rep.avg_tilt_deg || rep.max_tilt_deg || 0).toFixed(1)} deg</span>
          <span>{rep.flags?.length ? rep.flags.join(', ') : 'clear'}</span>
        </div>
      ))}
    </div>
  );
}

function LiveWorkoutPage({
  activeWorkout,
  liveState,
  mode,
  bridgeConnected,
  sourceConnected,
  bridgeError,
  onEndSet,
  finishWorkout,
  goBack,
}) {
  if (!activeWorkout) {
    return (
      <div className="screen blank-page">
        <div className="live-empty">
          <h2>No active workout</h2>
          <button type="button" onClick={goBack}>Back home</button>
        </div>
      </div>
    );
  }

  const repPct = Math.round((liveState.currentRep / Math.max(liveState.targetReps || activeWorkout.targetReps || 1, 1)) * 100);
  const coachResponse = liveState.coachResponse;

  return (
    <div className="screen live-screen">
      <header className="live-hero">
        <div>
          <div className="live-kicker">{mode === 'hardware' ? 'Live hardware workout' : 'Demo workout'}</div>
          <h1>{activeWorkout.lift}</h1>
          <p>{activeWorkout.focus} · {activeWorkout.weight} lb · Set {liveState.setNumber || activeWorkout.currentSet}</p>
        </div>
        <div className="live-status-stack">
          <span className={`live-status ${mode === 'hardware' && bridgeConnected ? 'live-status-on' : 'live-status-demo'}`}>
            {mode === 'hardware'
              ? (bridgeConnected ? 'Bridge connected' : 'Bridge offline')
              : 'Demo data'}
          </span>
          {mode === 'hardware' && (
            <span className={`live-status ${sourceConnected ? 'live-status-on' : 'live-status-wait'}`}>
              {sourceConnected ? 'IMU source connected' : 'Connect sensor in Python'}
            </span>
          )}
        </div>
      </header>

      {bridgeError && (
        <div className="live-warning">{bridgeError}</div>
      )}

      <div className="live-stat-grid">
        <StatCard
          label="Reps"
          value={liveState.done ? 'Done' : liveState.currentRep}
          unit={liveState.done ? '' : `/${liveState.targetReps || activeWorkout.targetReps}`}
          note={liveState.done ? 'Set summary ready' : `${repPct}% of target set`}
          tone={liveState.done ? 'ok' : 'neutral'}
        />
        <StatCard
          label="Bar velocity"
          value={Number(liveState.velocityMps || 0).toFixed(2)}
          unit="m/s"
          note={liveState.velocityDropoffPct ? `${liveState.velocityDropoffPct}% drop from rep 1` : 'Live metric'}
          tone={metricTone(liveState.velocityDropoffPct || 0, 20)}
        />
        <StatCard
          label="Bar tilt"
          value={Number(liveState.tiltDeg || 0).toFixed(1)}
          unit="deg"
          note={(liveState.tiltDeg || 0) >= 3 ? 'Form flag' : 'Acceptable'}
          tone={metricTone(liveState.tiltDeg || 0, 3)}
        />
        <StatCard
          label="Session time"
          value={formatDuration(activeWorkout.startedAt)}
          note={mode === 'hardware' ? 'Python owned data' : 'Browser demo data'}
          tone="neutral"
        />
      </div>

      <section className="live-panel live-coach-panel">
        <div className="live-panel-head">
          <h3>Coach Nova</h3>
          <span>{coachResponse?.source === 'openai' ? 'Python AI' : mode === 'hardware' ? 'Python coach' : 'Demo coach'}</span>
        </div>
        <p className="live-coach-message">
          {liveState.liveCoachMessage || 'Waiting for set data...'}
        </p>
        {coachResponse?.coach_advice?.length > 0 && (
          <ul className="live-coach-list">
            {coachResponse.coach_advice.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
      </section>

      <ChartPanels chartWindow={liveState.chartWindow} mode={mode} />

      <section className="live-panel">
        <div className="live-panel-head">
          <h3>Rep History</h3>
          <span>{liveState.repHistory?.length || 0} reps</span>
        </div>
        <RepTable reps={liveState.repHistory} />
      </section>

      <div className="live-actions">
        <button type="button" className="live-secondary-btn" onClick={goBack}>Back home</button>
        <button type="button" className="live-secondary-btn" onClick={onEndSet} disabled={liveState.done}>
          End set
        </button>
        <button type="button" className="live-primary-btn" onClick={finishWorkout}>
          {liveState.setSummary ? 'Review summary' : mode === 'hardware' ? 'End and wait for summary' : 'Finish demo workout'}
        </button>
      </div>
    </div>
  );
}

export default LiveWorkoutPage;
