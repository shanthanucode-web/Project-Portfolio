from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Optional

try:
    from openai import OpenAI
except ImportError:  # pragma: no cover - exercised only when dependency is installed
    OpenAI = None

try:
    from .set_analyzer import SetSummary, WorkoutContext
except ImportError:
    from set_analyzer import SetSummary, WorkoutContext


@dataclass
class NextSetAction:
    rest_seconds: int
    load_adjustment_lbs: int
    focus_cue: str


@dataclass
class CoachResponse:
    classification: list[str] = field(default_factory=list)
    severity: str = "low"
    summary: str = ""
    coach_advice: list[str] = field(default_factory=list)
    next_set_action: NextSetAction = field(
        default_factory=lambda: NextSetAction(rest_seconds=180, load_adjustment_lbs=0, focus_cue="")
    )
    source: str = "heuristic"

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["next_set_action"] = asdict(self.next_set_action)
        return payload


class OpenAICoach:
    def __init__(self, model: Optional[str] = None) -> None:
        self._load_repo_env_file()
        self.model = model or os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        self.api_key = os.getenv("OPENAI_API_KEY", "").strip()
        self.client = OpenAI(api_key=self.api_key) if self.api_key and OpenAI is not None else None

    def _load_repo_env_file(self) -> None:
        repo_root = Path(__file__).resolve().parent.parent
        env_path = repo_root / ".env"
        if not env_path.exists():
            return

        try:
            for raw_line in env_path.read_text(encoding="utf-8").splitlines():
                line = raw_line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if key and key not in os.environ:
                    os.environ[key] = value
        except OSError:
            return

    def get_post_set_advice(
        self,
        workout_context: WorkoutContext,
        set_summary: SetSummary,
    ) -> CoachResponse:
        heuristic = self._heuristic_response(workout_context, set_summary)
        if self.client is None:
            return heuristic

        system_prompt = (
            "You are an expert strength coach analyzing one completed barbell set from structured IMU-derived data. "
            "You must distinguish between normal fatigue and a PR attempt grind. Use only the supplied metrics. "
            "Return strict JSON with keys classification, severity, summary, coach_advice, and next_set_action. "
            "next_set_action must include rest_seconds, load_adjustment_lbs, and focus_cue."
        )
        user_prompt = json.dumps(
            {
                "workout_context": asdict(workout_context),
                "set_summary": set_summary.to_dict(),
            },
            indent=2,
        )

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                temperature=0.2,
                max_tokens=500,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            )
            content = response.choices[0].message.content.strip()
            parsed = json.loads(content)
            return self._parse_response(parsed, fallback=heuristic)
        except Exception:
            return heuristic

    def _parse_response(self, payload: dict[str, Any], fallback: CoachResponse) -> CoachResponse:
        try:
            action = payload.get("next_set_action", {})
            return CoachResponse(
                classification=list(payload.get("classification", fallback.classification)),
                severity=str(payload.get("severity", fallback.severity)),
                summary=str(payload.get("summary", fallback.summary)),
                coach_advice=list(payload.get("coach_advice", fallback.coach_advice)),
                next_set_action=NextSetAction(
                    rest_seconds=int(action.get("rest_seconds", fallback.next_set_action.rest_seconds)),
                    load_adjustment_lbs=int(action.get("load_adjustment_lbs", fallback.next_set_action.load_adjustment_lbs)),
                    focus_cue=str(action.get("focus_cue", fallback.next_set_action.focus_cue)),
                ),
                source="openai",
            )
        except Exception:
            return fallback

    def _heuristic_response(
        self,
        workout_context: WorkoutContext,
        set_summary: SetSummary,
    ) -> CoachResponse:
        classification: list[str] = []
        advice: list[str] = []
        summary_parts: list[str] = []

        if set_summary.tilt_breakdown_detected:
            classification.append("tilt_breakdown")
            summary_parts.append("bar tilt rose late in the set")
            advice.append("Brace harder before each rep and keep pressure balanced through both feet.")

        if set_summary.slowdown_detected:
            classification.append("pace_drop")
            summary_parts.append("rep speed slowed across the set")
            advice.append("Take a full breath and reset your brace before the sticking point.")

        if workout_context.set_mode == "pr_attempt" and set_summary.slowdown_detected:
            classification.append("pr_grind")
            summary_parts.append("the slowdown matches a hard PR-style effort")
            advice.append("Treat the grind as expected effort, but do not stack fatigue with another all-out set.")

        if not classification:
            classification.append("stable_set")
            summary_parts.append("the set stayed relatively consistent")
            advice.append("Keep the same setup and repeat the set with the same rhythm.")

        if set_summary.fatigue_score >= 0.7:
            classification.append("fatigue")
        if set_summary.fatigue_score >= 0.7 and workout_context.set_mode != "pr_attempt":
            advice.append("Extend your rest before the next set to let bar speed recover.")

        severity = "low"
        if set_summary.fatigue_score >= 0.75 or (
            set_summary.tilt_breakdown_detected and set_summary.slowdown_detected
        ):
            severity = "high"
        elif set_summary.fatigue_score >= 0.4 or classification != ["stable_set"]:
            severity = "moderate"

        if workout_context.set_mode == "pr_attempt":
            rest_seconds = 240
            load_adjustment_lbs = 0
        else:
            rest_seconds = 180 if severity == "low" else 210 if severity == "moderate" else 240
            load_adjustment_lbs = -5 if severity == "high" and set_summary.tilt_breakdown_detected else 0

        focus_cue = "Stay stacked and drive evenly."
        if set_summary.tilt_breakdown_detected:
            focus_cue = "Keep the bar centered and brace before the descent."
        elif set_summary.slowdown_detected:
            focus_cue = "Stay patient off the bottom and keep bar speed consistent."

        summary = summary_parts[0].capitalize()
        if len(summary_parts) > 1:
            summary = f"{summary}; {', '.join(summary_parts[1:])}."
        else:
            summary = f"{summary}."

        return CoachResponse(
            classification=classification,
            severity=severity,
            summary=summary,
            coach_advice=advice[:3],
            next_set_action=NextSetAction(
                rest_seconds=rest_seconds,
                load_adjustment_lbs=load_adjustment_lbs,
                focus_cue=focus_cue,
            ),
            source="heuristic",
        )
