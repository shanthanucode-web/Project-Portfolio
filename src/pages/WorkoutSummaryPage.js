import '../styles/live.css';

function WorkoutSummaryPage({ summary, logWorkout, goBack }) {
  if (!summary) {
    return (
      <div className="screen blank-page">
        <div className="live-empty">
          <h2>No workout summary</h2>
          <button type="button" onClick={goBack}>Back</button>
        </div>
      </div>
    );
  }

  const setSummary = summary.setSummary || {};
  const coachResponse = summary.coachResponse || {};
  const reps = setSummary.rep_features || [];

  return (
    <div className="screen live-screen">
      <header className="live-hero">
        <div>
          <div className="live-kicker">{summary.mode === 'hardware' ? 'Hardware set summary' : 'Demo set summary'}</div>
          <h1>{summary.lift}</h1>
          <p>{summary.durationLabel} · {summary.weight} lb · {summary.totalReps} reps logged</p>
        </div>
        <span className="live-status live-status-on">Ready to log</span>
      </header>

      <div className="live-stat-grid">
        <div className="live-stat live-stat-ok">
          <div className="live-stat-label">Total volume</div>
          <div className="live-stat-value">{(summary.weight * summary.totalReps).toLocaleString()}<span>lb</span></div>
          <div className="live-stat-note">Captured this set</div>
        </div>
        <div className="live-stat live-stat-neutral">
          <div className="live-stat-label">Avg velocity</div>
          <div className="live-stat-value">{Number(summary.avgVelocity || 0).toFixed(2)}<span>m/s</span></div>
          <div className="live-stat-note">Rep history average</div>
        </div>
        <div className={`live-stat ${summary.velocityDropoff >= 20 ? 'live-stat-warn' : 'live-stat-ok'}`}>
          <div className="live-stat-label">Velocity drop</div>
          <div className="live-stat-value">{summary.velocityDropoff || 0}<span>%</span></div>
          <div className="live-stat-note">{summary.velocityDropoff >= 20 ? 'Fatigue flag' : 'Within range'}</div>
        </div>
        <div className={`live-stat ${summary.avgTilt >= 3 ? 'live-stat-warn' : 'live-stat-ok'}`}>
          <div className="live-stat-label">Avg tilt</div>
          <div className="live-stat-value">{Number(summary.avgTilt || 0).toFixed(1)}<span>deg</span></div>
          <div className="live-stat-note">{summary.avgTilt >= 3 ? 'Form flag' : 'Stable bar path'}</div>
        </div>
      </div>

      <section className="live-panel live-coach-panel">
        <div className="live-panel-head">
          <h3>Coach Debrief</h3>
          <span>{coachResponse.source || 'summary'}</span>
        </div>
        <p className="live-coach-message">{summary.coachDebrief}</p>
        {coachResponse.coach_advice?.length > 0 && (
          <ul className="live-coach-list">
            {coachResponse.coach_advice.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="live-panel">
        <div className="live-panel-head">
          <h3>Velocity Per Rep</h3>
          <span>{reps.length} reps</span>
        </div>
        <div className="summary-bars">
          {reps.length > 0 ? reps.map((rep) => {
            const baseline = reps[0]?.velocity_proxy || 1;
            const height = Math.max(18, Math.round((rep.velocity_proxy / Math.max(baseline, 0.01)) * 100));
            return (
              <div key={rep.rep_number} className="summary-bar-wrap">
                <span>{Number(rep.velocity_proxy || 0).toFixed(2)}</span>
                <div className={height < 85 ? 'summary-bar summary-bar-warn' : 'summary-bar'} style={{ height: `${height}%` }} />
                <small>{rep.rep_number}</small>
              </div>
            );
          }) : (
            <div className="live-empty-copy">No rep velocity data available.</div>
          )}
        </div>
      </section>

      <div className="live-actions">
        <button type="button" className="live-secondary-btn" onClick={goBack}>Back to workout</button>
        <button type="button" className="live-primary-btn" onClick={logWorkout}>Log workout</button>
      </div>
    </div>
  );
}

export default WorkoutSummaryPage;
