from __future__ import annotations

import time
from dataclasses import dataclass
from typing import List, Optional, Tuple

import serial
from serial import SerialException
from serial.tools import list_ports


SIMULATED_PORT_NAME = "SIMULATED"
MAX_LINES_PER_POLL = 250


@dataclass
class RepEvent:
    """A completed rep reported by the on-device rep detector.

    Parsed from firmware serial lines in the format:
        REP,<rep_number>,<duration_ms>,<peak_accel_g>
    """
    timestamp_s: float
    rep_number: int
    duration_ms: int
    peak_accel_g: float


@dataclass
class ImuSample:
    timestamp: float
    ax: float
    ay: float
    az: float
    gx: float
    gy: float
    gz: float
    temp: float


class ImuCsvParser:
    """Parse lines in the format: ax,ay,az,gx,gy,gz,temp."""

    EXPECTED_FIELDS = 7

    def parse_line(self, raw_line: bytes, timestamp: float) -> Optional[ImuSample]:
        text = raw_line.decode("utf-8", errors="ignore").strip()
        if not text:
            return None

        parts = text.split(",")
        if len(parts) != self.EXPECTED_FIELDS:
            return None

        try:
            values = [float(part.strip()) for part in parts]
        except ValueError:
            return None

        return ImuSample(
            timestamp=timestamp,
            ax=values[0],
            ay=values[1],
            az=values[2],
            gx=values[3],
            gy=values[4],
            gz=values[5],
            temp=values[6],
        )


class SerialImuSource:
    def __init__(self, parser: Optional[ImuCsvParser] = None) -> None:
        self.parser = parser or ImuCsvParser()
        self.serial_port: Optional[serial.Serial] = None
        self.connected_name = ""
        self.baud_rate = 115200
        self.good_lines = 0
        self.bad_lines = 0
        self._session_start = 0.0
        self._serial_buffer = bytearray()
        self._pending_rep_events: List[RepEvent] = []  # rep events waiting to be picked up by the GUI

    def drain_rep_events(self) -> List[RepEvent]:
        """Return all rep events received since the last call, then clear the queue."""
        events = self._pending_rep_events[:]
        self._pending_rep_events.clear()
        return events

    @staticmethod
    def _parse_rep_line(text: str, timestamp: float) -> Optional[RepEvent]:
        """Try to parse a REP summary line from the firmware.

        Expected format: REP,<rep_number>,<duration_ms>,<peak_accel_g>
        Returns None if the line doesn't match.
        """
        parts = text.split(",")
        if len(parts) != 4 or parts[0] != "REP":
            return None
        try:
            return RepEvent(
                timestamp_s=timestamp,
                rep_number=int(parts[1]),
                duration_ms=int(parts[2]),
                peak_accel_g=float(parts[3]),
            )
        except ValueError:
            return None

    @property
    def is_connected(self) -> bool:
        return self.serial_port is not None and self.serial_port.is_open

    @staticmethod
    def list_ports() -> List[str]:
        return [SIMULATED_PORT_NAME] + [port.device for port in list_ports.comports()]

    def connect(self, port_name: str, baud_rate: int) -> Tuple[bool, str]:
        self.disconnect()

        selected_port = port_name.strip()
        if not selected_port:
            return False, "Enter a COM port or choose SIMULATED."

        self.baud_rate = baud_rate
        self.good_lines = 0
        self.bad_lines = 0
        self._serial_buffer.clear()
        self._session_start = time.perf_counter()

        try:
            self.serial_port = serial.Serial(
                port=selected_port,
                baudrate=baud_rate,
                timeout=0,
            )
            try:
                self.serial_port.reset_input_buffer()
            except (SerialException, OSError):
                pass

            self.connected_name = selected_port
            return True, f"Connected to {selected_port} @ {baud_rate} baud."
        except (SerialException, OSError) as exc:
            self.serial_port = None
            self.connected_name = ""
            return False, f"Could not open {selected_port}: {exc}"

    def disconnect(self) -> None:
        self.connected_name = ""
        self._serial_buffer.clear()

        if self.serial_port is not None:
            try:
                self.serial_port.close()
            except (SerialException, OSError):
                pass
            self.serial_port = None

    def poll(
        self, max_lines: int = MAX_LINES_PER_POLL
    ) -> Tuple[List[ImuSample], Optional[str]]:
        if self.serial_port is None or not self.serial_port.is_open:
            return [], None

        samples: List[ImuSample] = []

        try:
            waiting = self.serial_port.in_waiting
            if waiting > 0:
                chunk = self.serial_port.read(waiting)
                if chunk:
                    self._serial_buffer.extend(chunk)

            while len(samples) < max_lines:
                newline_index = self._serial_buffer.find(b"\n")
                if newline_index < 0:
                    break

                raw_line = bytes(self._serial_buffer[:newline_index])
                del self._serial_buffer[: newline_index + 1]

                sample = self.parser.parse_line(
                    raw_line,
                    timestamp=time.perf_counter() - self._session_start,
                )
                if sample is None:
                    # Check if this is a REP summary line from the firmware
                    # before counting it as a bad/malformed line.
                    text = raw_line.decode("utf-8", errors="ignore").strip()
                    rep_event = self._parse_rep_line(
                        text,
                        timestamp=time.perf_counter() - self._session_start,
                    )
                    if rep_event is not None:
                        self._pending_rep_events.append(rep_event)
                    else:
                        self.bad_lines += 1
                    continue

                self.good_lines += 1
                samples.append(sample)

            return samples, None
        except (SerialException, OSError) as exc:
            self.disconnect()
            return samples, f"Serial connection lost: {exc}"
