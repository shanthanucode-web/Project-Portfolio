from __future__ import annotations

import math
from dataclasses import asdict, dataclass, field
from typing import Any, Optional


SLOW_REP_THRESHOLD_PCT = 15.0
VELOCITY_DROP_THRESHOLD_PCT = 12.0
HIGH_TILT_THRESHOLD_DEG = 8.0
REST_FINALIZE_SECONDS = 6
TARGET_REP_FALLBACK_SECONDS = 1.0
REST_VELOCITY_THRESHOLD_MPS = 0.04
REP_PHASE_VELOCITY_THRESHOLD_MPS = 0.05


@dataclass
class WorkoutContext:
    athlete_id: str
    exercise: str
    load_lbs: int
    target_reps: int
    set_number: int
    set_mode: str
    timestamp_start: str


@dataclass
class SetContext:
    exercise: str
    load_lbs: int
    target_reps: int
    set_number: int
    set_mode: str
    timestamp_start: str


@dataclass
class RepFeature:
    rep_number: int
    start_time_s: float
    end_time_s: float
    duration_ms: int
    peak_accel_g: float
    velocity_proxy: float
    avg_tilt_deg: float
    max_tilt_deg: float
    tempo_change_vs_rep1_pct: float
    velocity_drop_vs_rep1_pct: float
    flags: list[str] = field(default_factory=list)


@dataclass
class SetSummary:
    exercise: str
    set_number: int
    set_mode: str
    load_lbs: int
    target_reps: int
    completed_reps: int
    rep_features: list[RepFeature]
    avg_rep_duration_ms: float
    slowest_rep_number: Optional[int]
    avg_tilt_deg: float
    max_tilt_deg: float
    worst_tilt_rep: Optional[int]
    velocity_dropoff_pct: float
    fatigue_score: float
    tilt_breakdown_detected: bool
    slowdown_detected: bool
    flagged_reps: list[int]
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class _SamplePoint:
    timestamp_s: float
    velocity_mps: float
    pitch_deg: float
    roll_deg: float


class SetAnalyzer:
    def __init__(self) -> None:
        self.active_context: Optional[SetContext] = None
        self._samples: list[_SamplePoint] = []
        self._rep_features: list[RepFeature] = []
        self._pending_reps: list[tuple[Any, float]] = []  # (rep_event, extended_end_s)

    @property
    def is_active(self) -> bool:
        return self.active_context is not None

    def start_set(self, set_context: SetContext) -> None:
        self.active_context = set_context
        self._samples = []
        self._rep_features = []
        self._pending_reps = []

    def ingest_sample(self, sample: Any, motion_estimate: Any) -> None:
        if not self.is_active or motion_estimate is None:
            return

        self._samples.append(
            _SamplePoint(
                timestamp_s=float(getattr(sample, "timestamp", 0.0)),
                velocity_mps=float(getattr(motion_estimate, "velocity_mps", 0.0)),
                pitch_deg=float(getattr(motion_estimate, "pitch_deg", 0.0)),
                roll_deg=float(getattr(motion_estimate, "roll_deg", 0.0)),
            )
        )
        

    def ingest_rep_event(self, rep_event: Any) -> Optional[RepFeature]:
        if not self.is_active:
            return None
        end_time_s = float(getattr(rep_event, "timestamp_s", 0.0))
        duration_ms = int(getattr(rep_event, "duration_ms", 0))
        extended_end_s = end_time_s + (duration_ms / 1000.0)
        # Queue the rep — ascent samples haven't arrived yet when firmware fires REP
        self._pending_reps.append((rep_event, extended_end_s))
        return None

    def flush_pending_reps(self) -> list[RepFeature]:
        if not self._samples or not self._pending_reps:
            return []

        latest_time = self._samples[-1].timestamp_s
        ready = []
        still_pending = []

        for rep_event, extended_end_s in self._pending_reps:
            if latest_time >= extended_end_s:
                ready.append((rep_event, extended_end_s))
            else:
                still_pending.append((rep_event, extended_end_s))

        self._pending_reps = still_pending
        confirmed = []

        for rep_event, extended_end_s in ready:
            duration_ms = int(getattr(rep_event, "duration_ms", 0))
            end_time_s = float(getattr(rep_event, "timestamp_s", 0.0))
            start_time_s = max(0.0, end_time_s - (duration_ms / 1000.0))

            rep_samples = [
                s for s in self._samples
                if start_time_s <= s.timestamp_s <= extended_end_s
            ]

            if not self._rep_is_complete_movement(rep_samples):
                continue

            tilt_series = [self._tilt_magnitude_deg(s) for s in rep_samples]
            velocity_series = [abs(s.velocity_mps) for s in rep_samples]

            avg_tilt_deg = sum(tilt_series) / len(tilt_series) if tilt_series else 0.0
            max_tilt_deg = max(tilt_series) if tilt_series else 0.0
            velocity_proxy = max(velocity_series) if velocity_series else 0.0

            first_rep = self._rep_features[0] if self._rep_features else None
            tempo_change = self._pct_change(duration_ms, first_rep.duration_ms) if first_rep else 0.0
            velocity_drop = (
                self._pct_drop(first_rep.velocity_proxy, velocity_proxy)
                if first_rep and first_rep.velocity_proxy > 0.0
                else 0.0
            )

            flags: list[str] = []
            if first_rep and tempo_change >= SLOW_REP_THRESHOLD_PCT:
                flags.append("slow_rep")
            if first_rep and velocity_drop >= VELOCITY_DROP_THRESHOLD_PCT:
                flags.append("pace_drop")
            if max_tilt_deg >= HIGH_TILT_THRESHOLD_DEG:
                flags.append("high_tilt")

            rep_feature = RepFeature(
                rep_number=len(self._rep_features) + 1,
                start_time_s=start_time_s,
                end_time_s=end_time_s,
                duration_ms=duration_ms,
                peak_accel_g=float(getattr(rep_event, "peak_accel_g", 0.0)),
                velocity_proxy=velocity_proxy,
                avg_tilt_deg=avg_tilt_deg,
                max_tilt_deg=max_tilt_deg,
                tempo_change_vs_rep1_pct=tempo_change,
                velocity_drop_vs_rep1_pct=velocity_drop,
                flags=flags,
            )
            self._rep_features.append(rep_feature)
            confirmed.append(rep_feature)

        return confirmed

    def _rep_is_complete_movement(self, rep_samples: list[_SamplePoint]) -> bool:
        if not rep_samples:
            return False

        velocities = [sample.velocity_mps for sample in rep_samples]
        had_descent = any(v < -REP_PHASE_VELOCITY_THRESHOLD_MPS for v in velocities)
        had_ascent = any(v > REP_PHASE_VELOCITY_THRESHOLD_MPS for v in velocities)
        return had_descent and had_ascent

    def should_auto_finalize(self) -> bool:
        if not self.is_active or self.active_context is None:
            return False
        if not self._rep_features or not self._samples:
            return False

        latest_sample_time = self._samples[-1].timestamp_s
        last_rep_time = self._rep_features[-1].end_time_s
        seconds_since_rep = latest_sample_time - last_rep_time

        if self._has_rest_after_last_rep(seconds_since_rep, latest_sample_time):
            return True

        return (
            len(self._rep_features) >= self.active_context.target_reps
            and seconds_since_rep >= TARGET_REP_FALLBACK_SECONDS
        )

    def end_set(self) -> Optional[SetSummary]:
        if not self.is_active or self.active_context is None:
            return None

        rep_features = self._rep_features[:]
        context = self.active_context
        self.active_context = None
        self._samples = []
        self._rep_features = []
        self._pending_reps = []

        if not rep_features:
            return SetSummary(
                exercise=context.exercise,
                set_number=context.set_number,
                set_mode=context.set_mode,
                load_lbs=context.load_lbs,
                target_reps=context.target_reps,
                completed_reps=0,
                rep_features=[],
                avg_rep_duration_ms=0.0,
                slowest_rep_number=None,
                avg_tilt_deg=0.0,
                max_tilt_deg=0.0,
                worst_tilt_rep=None,
                velocity_dropoff_pct=0.0,
                fatigue_score=0.0,
                tilt_breakdown_detected=False,
                slowdown_detected=False,
                flagged_reps=[],
                notes=["No reps were recorded for this set."],
            )

        avg_duration = sum(rep.duration_ms for rep in rep_features) / len(rep_features)
        slowest_rep = max(rep_features, key=lambda rep: rep.duration_ms)
        worst_tilt_rep = max(rep_features, key=lambda rep: rep.max_tilt_deg)
        avg_tilt = sum(rep.avg_tilt_deg for rep in rep_features) / len(rep_features)
        max_tilt = max(rep.max_tilt_deg for rep in rep_features)

        first_velocity = rep_features[0].velocity_proxy
        last_velocity = rep_features[-1].velocity_proxy
        velocity_dropoff = self._pct_drop(first_velocity, last_velocity) if first_velocity > 0.0 else 0.0

        flagged_reps = sorted({
            rep.rep_number
            for rep in rep_features
            if rep.flags
        })

        slowdown_detected = any(
            ("slow_rep" in rep.flags) or ("pace_drop" in rep.flags)
            for rep in rep_features
        )
        tilt_breakdown_detected = any("high_tilt" in rep.flags for rep in rep_features)

        fatigue_components = [
            min(1.0, max(0.0, velocity_dropoff / 30.0)),
            min(1.0, max(0.0, (slowest_rep.duration_ms - rep_features[0].duration_ms) / 600.0)),
            min(1.0, max(0.0, max_tilt / 12.0)),
        ]
        fatigue_score = round(sum(fatigue_components) / len(fatigue_components), 2)

        notes: list[str] = []
        if context.set_mode == "pr_attempt":
            notes.append("Interpret late-set slowdown in the context of a PR attempt.")
        if len(rep_features) < context.target_reps:
            notes.append("Set ended before the target rep count.")

        return SetSummary(
            exercise=context.exercise,
            set_number=context.set_number,
            set_mode=context.set_mode,
            load_lbs=context.load_lbs,
            target_reps=context.target_reps,
            completed_reps=len(rep_features),
            rep_features=rep_features,
            avg_rep_duration_ms=round(avg_duration, 1),
            slowest_rep_number=slowest_rep.rep_number,
            avg_tilt_deg=round(avg_tilt, 2),
            max_tilt_deg=round(max_tilt, 2),
            worst_tilt_rep=worst_tilt_rep.rep_number,
            velocity_dropoff_pct=round(velocity_dropoff, 2),
            fatigue_score=fatigue_score,
            tilt_breakdown_detected=tilt_breakdown_detected,
            slowdown_detected=slowdown_detected,
            flagged_reps=flagged_reps,
            notes=notes,
        )

    def _tilt_magnitude_deg(self, sample: _SamplePoint) -> float:
        return math.sqrt(sample.pitch_deg * sample.pitch_deg + sample.roll_deg * sample.roll_deg)

    def _pct_change(self, value: float, baseline: float) -> float:
        if baseline <= 0:
            return 0.0
        return max(0.0, ((value - baseline) / baseline) * 100.0)

    def _pct_drop(self, baseline: float, value: float) -> float:
        if baseline <= 0:
            return 0.0
        return max(0.0, ((baseline - value) / baseline) * 100.0)

    def _has_rest_after_last_rep(self, seconds_since_rep: float, latest_sample_time: float) -> bool:
        if seconds_since_rep < REST_FINALIZE_SECONDS:
            return False

        rest_window_start = latest_sample_time - REST_FINALIZE_SECONDS
        rest_samples = [
            sample for sample in self._samples
            if sample.timestamp_s >= rest_window_start
        ]
        if not rest_samples:
            return False

        moving_samples = [
            sample for sample in rest_samples
            if abs(sample.velocity_mps) > REST_VELOCITY_THRESHOLD_MPS
        ]
        return len(moving_samples) / len(rest_samples) <= 0.2