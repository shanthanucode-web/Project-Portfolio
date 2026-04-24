from __future__ import annotations

import csv
import json
from dataclasses import asdict, is_dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional


class SessionLogger:
    """Persist raw sensor data and derived summaries for replay and debugging."""

    def __init__(self, base_dir: Optional[Path] = None) -> None:
        self.base_dir = Path(base_dir or Path(__file__).resolve().parent.parent / "logs")
        self.session_dir: Optional[Path] = None
        self._samples_file = None
        self._samples_writer = None
        self._rep_events_file = None
        self._rep_events_writer = None
        self._set_summaries_file = None

    def start_session(self, metadata: Optional[dict[str, Any]] = None) -> Path:
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        self.session_dir = self.base_dir / f"session_{timestamp}"
        self.session_dir.mkdir(parents=True, exist_ok=True)

        samples_path = self.session_dir / "raw_samples.csv"
        self._samples_file = samples_path.open("w", newline="", encoding="utf-8")
        self._samples_writer = csv.DictWriter(
            self._samples_file,
            fieldnames=[
                "timestamp_s",
                "set_number",
                "exercise",
                "set_mode",
                "ax",
                "ay",
                "az",
                "gx",
                "gy",
                "gz",
                "temp",
                "velocity_mps",
                "linear_accel_axis_mps2",
                "pitch_deg",
                "roll_deg",
            ],
        )
        self._samples_writer.writeheader()

        rep_events_path = self.session_dir / "rep_events.csv"
        self._rep_events_file = rep_events_path.open("w", newline="", encoding="utf-8")
        self._rep_events_writer = csv.DictWriter(
            self._rep_events_file,
            fieldnames=[
                "timestamp_s",
                "set_number",
                "rep_number",
                "duration_ms",
                "peak_accel_g",
            ],
        )
        self._rep_events_writer.writeheader()

        summaries_path = self.session_dir / "set_summaries.jsonl"
        self._set_summaries_file = summaries_path.open("w", encoding="utf-8")

        if metadata:
            metadata_path = self.session_dir / "session_metadata.json"
            metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")

        return self.session_dir

    def log_sample(
        self,
        sample: Any,
        motion_estimate: Optional[Any] = None,
        set_context: Optional[Any] = None,
    ) -> None:
        if self._samples_writer is None:
            return

        row = {
            "timestamp_s": getattr(sample, "timestamp", None),
            "set_number": getattr(set_context, "set_number", None),
            "exercise": getattr(set_context, "exercise", None),
            "set_mode": getattr(set_context, "set_mode", None),
            "ax": getattr(sample, "ax", None),
            "ay": getattr(sample, "ay", None),
            "az": getattr(sample, "az", None),
            "gx": getattr(sample, "gx", None),
            "gy": getattr(sample, "gy", None),
            "gz": getattr(sample, "gz", None),
            "temp": getattr(sample, "temp", None),
            "velocity_mps": getattr(motion_estimate, "velocity_mps", None),
            "linear_accel_axis_mps2": getattr(motion_estimate, "linear_accel_axis_mps2", None),
            "pitch_deg": getattr(motion_estimate, "pitch_deg", None),
            "roll_deg": getattr(motion_estimate, "roll_deg", None),
        }
        self._samples_writer.writerow(row)
        self._samples_file.flush()

    def log_rep_event(self, rep_event: Any, set_number: Optional[int]) -> None:
        if self._rep_events_writer is None:
            return

        self._rep_events_writer.writerow(
            {
                "timestamp_s": getattr(rep_event, "timestamp_s", None),
                "set_number": set_number,
                "rep_number": getattr(rep_event, "rep_number", None),
                "duration_ms": getattr(rep_event, "duration_ms", None),
                "peak_accel_g": getattr(rep_event, "peak_accel_g", None),
            }
        )
        self._rep_events_file.flush()

    def log_set_summary(self, set_summary: Any) -> None:
        if self._set_summaries_file is None:
            return

        payload = self._coerce_jsonable(set_summary)
        self._set_summaries_file.write(json.dumps(payload) + "\n")
        self._set_summaries_file.flush()

    def close(self) -> None:
        for handle_name in (
            "_samples_file",
            "_rep_events_file",
            "_set_summaries_file",
        ):
            handle = getattr(self, handle_name)
            if handle is not None:
                handle.close()
                setattr(self, handle_name, None)

        self._samples_writer = None
        self._rep_events_writer = None

    def _coerce_jsonable(self, value: Any) -> Any:
        if is_dataclass(value):
            return {key: self._coerce_jsonable(item) for key, item in asdict(value).items()}
        if isinstance(value, dict):
            return {key: self._coerce_jsonable(item) for key, item in value.items()}
        if isinstance(value, list):
            return [self._coerce_jsonable(item) for item in value]
        return value
