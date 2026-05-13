from __future__ import annotations

import math
import random
import time
from typing import List, Optional, Tuple

try:
    from .serial_reader import ImuSample, MAX_LINES_PER_POLL, RepEvent, SIMULATED_PORT_NAME
except ImportError:
    from serial_reader import ImuSample, MAX_LINES_PER_POLL, RepEvent, SIMULATED_PORT_NAME


class SimulatedImuSource:
    def __init__(self, sample_rate_hz: float = 50.0) -> None:
        self.sample_rate_hz = sample_rate_hz
        self.connected_name = ""
        self.good_lines = 0
        self.bad_lines = 0
        self._session_start = 0.0
        self._last_emit = 0.0
        self._connected = False
        self._pending_rep_events: List[RepEvent] = []
        self._next_rep_emit_s = 2.4
        self._rep_number = 0

    @property
    def is_connected(self) -> bool:
        return self._connected

    def drain_rep_events(self) -> List[RepEvent]:
        events = self._pending_rep_events[:]
        self._pending_rep_events.clear()
        return events

    def connect(self, port_name: str, baud_rate: int) -> Tuple[bool, str]:
        _ = port_name
        _ = baud_rate

        self.connected_name = SIMULATED_PORT_NAME
        self.good_lines = 0
        self.bad_lines = 0
        self._session_start = time.perf_counter()
        self._last_emit = self._session_start
        self._pending_rep_events.clear()
        self._next_rep_emit_s = 2.4
        self._rep_number = 0
        self._connected = True
        return True, "Connected to simulated IMU data."

    def disconnect(self) -> None:
        self.connected_name = ""
        self._connected = False
        self._pending_rep_events.clear()

    def poll(
        self, max_lines: int = MAX_LINES_PER_POLL
    ) -> Tuple[List[ImuSample], Optional[str]]:
        if not self._connected:
            return [], None

        now = time.perf_counter()
        interval = 1.0 / self.sample_rate_hz
        samples: List[ImuSample] = []

        while len(samples) < max_lines and (self._last_emit + interval) <= now:
            self._last_emit += interval
            elapsed = self._last_emit - self._session_start
            samples.append(self._build_sample(elapsed))
            self.good_lines += 1

        elapsed_now = now - self._session_start
        while self._next_rep_emit_s <= elapsed_now:
            self._rep_number += 1
            duration_ms = 1350 + ((self._rep_number - 1) % 4) * 90
            peak_accel_g = 1.15 + 0.05 * math.sin(self._rep_number * 0.8)
            self._pending_rep_events.append(
                RepEvent(
                    timestamp_s=self._next_rep_emit_s,
                    rep_number=self._rep_number,
                    duration_ms=duration_ms,
                    peak_accel_g=round(peak_accel_g, 2),
                )
            )
            self._next_rep_emit_s += 2.4

        return samples, None

    def _build_sample(self, elapsed: float) -> ImuSample:
        # Simulate a gentle changing tilt so accel and gyro agree well enough for
        # a complementary filter demo.
        roll_deg = 8.0 * math.sin(2.0 * math.pi * 0.08 * elapsed)
        pitch_deg = 6.0 * math.sin(2.0 * math.pi * 0.05 * elapsed + 0.6)

        roll_rad = math.radians(roll_deg)
        pitch_rad = math.radians(pitch_deg)

        gx = 8.0 * (2.0 * math.pi * 0.08) * math.cos(2.0 * math.pi * 0.08 * elapsed)
        gy = 6.0 * (2.0 * math.pi * 0.05) * math.cos(2.0 * math.pi * 0.05 * elapsed + 0.6)
        gz = 3.0 * math.sin(2.0 * math.pi * 0.12 * elapsed)

        gravity_x_g = -math.sin(pitch_rad)
        gravity_y_g = math.sin(roll_rad) * math.cos(pitch_rad)
        gravity_z_g = math.cos(roll_rad) * math.cos(pitch_rad)

        # Add a small linear acceleration on all axes so velocity has something to
        # integrate after gravity compensation.
        linear_ax_g = 0.08 * math.sin(2.0 * math.pi * 0.70 * elapsed)
        linear_ay_g = 0.05 * math.cos(2.0 * math.pi * 0.55 * elapsed + 0.4)
        linear_az_g = 0.10 * math.sin(2.0 * math.pi * 0.85 * elapsed + 1.0)

        ax = gravity_x_g + linear_ax_g + random.uniform(-0.005, 0.005)
        ay = gravity_y_g + linear_ay_g + random.uniform(-0.005, 0.005)
        az = gravity_z_g + linear_az_g + random.uniform(-0.005, 0.005)

        temp = 26.0 + 0.4 * math.sin(2.0 * math.pi * 0.03 * elapsed) + random.uniform(-0.05, 0.05)

        return ImuSample(
            timestamp=elapsed,
            ax=ax,
            ay=ay,
            az=az,
            gx=gx,
            gy=gy,
            gz=gz,
            temp=temp,
        )
