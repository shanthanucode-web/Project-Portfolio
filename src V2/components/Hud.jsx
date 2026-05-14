import { useCallback, useRef, useState } from 'react';

export function TutorialPanel({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="tutorial-backdrop">
      <section className="tutorial-panel" aria-label="Portfolio tutorial">
        <div className="tutorial-heading-row">
          <span className="tutorial-kicker">Forest Portfolio</span>
          <button type="button" className="panel-x-btn" onClick={onClose} aria-label="Close tutorial">
            ✕
          </button>
        </div>
        <h1>Drive the <em>rover.</em></h1>
        <p>
          Guide a compact robot through a forest clearing where glowing artifacts, mossy project
          stations, and hidden lore chips reveal each engineering build.
        </p>
        <div className="tutorial-controls">
          <div className="tc-card">
            <span className="tc-label">Move</span>
            <div className="tc-keys">
              <span className="tc-key">W</span>
              <span className="tc-key">A</span>
              <span className="tc-key">S</span>
              <span className="tc-key">D</span>
            </div>
            <span className="tc-desc">Arrow keys also work</span>
          </div>
          <div className="tc-card">
            <span className="tc-label">Inspect</span>
            <div className="tc-keys">
              <span className="tc-key">↵</span>
            </div>
            <span className="tc-desc">Near a glowing project ring</span>
          </div>
          <div className="tc-card">
            <span className="tc-label">Discover</span>
            <div className="tc-keys">
              <span className="tc-key">E</span>
            </div>
            <span className="tc-desc">Near chips or switches</span>
          </div>
          <div className="tc-card">
            <span className="tc-label">Mobile</span>
            <div className="tc-keys">
              <span className="tc-key">☝</span>
            </div>
            <span className="tc-desc">Joystick and action buttons</span>
          </div>
        </div>
        <button type="button" className="tutorial-start" onClick={onClose}>
          Start exploring →
        </button>
      </section>
    </div>
  );
}

export function Hud({
  nearest,
  selectedProject,
  nearbyLore,
  nearbySwitch,
  discoveredCount,
  totalLoreCount,
  activeLore,
  systemMessage,
  onOpen,
  onClose,
  onTutorial,
}) {
  const actionText = nearbyLore
    ? `E — collect "${nearbyLore.title}"`
    : nearbySwitch
      ? `E — ${nearbySwitch.label}`
      : nearest.canInteract
        ? `↵ Enter — inspect ${nearest.project?.title}`
        : 'Drive to a project bay';

  const progressPct = totalLoreCount > 0 ? (discoveredCount / totalLoreCount) * 100 : 0;

  return (
    <>
      <div className="hud">
        <div className="brand-block">
          <span>Shanthanu Saravanan</span>
          <strong>Forest Portfolio</strong>
        </div>

        <div className="status-pill">
          <div className="mission-label">
            <span className="mission-dot" />
            {actionText}
          </div>
          <div className="lore-track">
            <div className="lore-pips">
              {Array.from({ length: totalLoreCount }).map((_, i) => (
                <div key={i} className={`lore-pip${i < discoveredCount ? ' found' : ''}`} />
              ))}
            </div>
            <span className="lore-label">{discoveredCount}/{totalLoreCount} lore chips</span>
          </div>
          <div className="hud-bar">
            <div className="hud-bar-fill" style={{ width: `${progressPct}%` }} />
          </div>
        </div>

        <div className="hud-actions">
          <button type="button" className="hud-btn" onClick={onTutorial}>
            <span className="key-chip">?</span>
            Guide
          </button>
          {selectedProject ? (
            <button type="button" className="hud-btn" onClick={onClose}>
              <span className="key-chip">ESC</span>
              Close
            </button>
          ) : (
            <button
              type="button"
              className={`hud-btn${nearest.canInteract ? ' active-btn' : ''}`}
              disabled={!nearest.canInteract}
              onClick={() => onOpen(nearest.project)}
            >
              <span className="key-chip">↵</span>
              Inspect
            </button>
          )}
        </div>
      </div>

      {(activeLore || systemMessage) && (
        <div className="lore-toast">
          {activeLore ? (
            <>
              <span className="lore-toast-project">{activeLore.projectTitle}</span>
              <strong className="lore-toast-title">{activeLore.title}</strong>
              <p className="lore-toast-body">{activeLore.body}</p>
            </>
          ) : (
            <p className="lore-toast-body">{systemMessage}</p>
          )}
        </div>
      )}
    </>
  );
}

export function MobileControls({ mobileInputRef, onInspect, onInteract, canInspect, canInteract }) {
  const padRef = useRef(null);
  const pointerId = useRef(null);
  const [stick, setStick] = useState({ x: 0, y: 0 });

  const updateStick = useCallback(
    (event) => {
      const rect = padRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      const y = ((event.clientY - rect.top) / rect.height - 0.5) * -2;
      const length = Math.min(1, Math.hypot(x, y));
      const angle = Math.atan2(y, x);
      const next = { x: Math.cos(angle) * length, y: Math.sin(angle) * length };
      mobileInputRef.current = next;
      setStick(next);
    },
    [mobileInputRef],
  );

  const stopStick = useCallback(() => {
    pointerId.current = null;
    mobileInputRef.current = { x: 0, y: 0 };
    setStick({ x: 0, y: 0 });
  }, [mobileInputRef]);

  return (
    <div className="mobile-controls">
      <div
        ref={padRef}
        className="stick-pad"
        onPointerDown={(e) => {
          pointerId.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          updateStick(e);
        }}
        onPointerMove={(e) => {
          if (pointerId.current === e.pointerId) updateStick(e);
        }}
        onPointerUp={stopStick}
        onPointerCancel={stopStick}
      >
        <div
          className="stick-thumb"
          style={{ transform: `translate(${stick.x * 28}px, ${stick.y * -28}px)` }}
        />
      </div>
      <div className="mobile-action-stack">
        <button type="button" disabled={!canInteract} onClick={onInteract}>
          Use
        </button>
        <button type="button" disabled={!canInspect} onClick={onInspect}>
          Inspect
        </button>
      </div>
    </div>
  );
}
