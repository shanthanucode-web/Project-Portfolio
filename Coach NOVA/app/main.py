from __future__ import annotations

import math
import sys
from collections import deque
from datetime import datetime, timezone
from queue import Empty, Queue
from typing import Deque, Dict, Optional, Protocol, Tuple

import pyqtgraph as pg
from PySide6.QtCore import QTimer, Qt
from PySide6.QtGui import QFont
from PySide6.QtWidgets import (
    QApplication,
    QCheckBox,
    QComboBox,
    QGridLayout,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QMainWindow,
    QPushButton,
    QScrollArea,
    QSplitter,
    QSpinBox,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

try:
    from .live_bridge import LiveBridgeServer
    from .motion_estimator import GravityCompensatedVelocityEstimator, MotionEstimate
    from .session_logger import SessionLogger
    from .set_analyzer import SetAnalyzer, SetContext
    from .serial_reader import ImuSample, RepEvent, SerialImuSource, SIMULATED_PORT_NAME
    from .simulator import SimulatedImuSource
except ImportError:
    from live_bridge import LiveBridgeServer
    from motion_estimator import GravityCompensatedVelocityEstimator, MotionEstimate
    from session_logger import SessionLogger
    from set_analyzer import SetAnalyzer, SetContext
    from serial_reader import ImuSample, RepEvent, SerialImuSource, SIMULATED_PORT_NAME
    from simulator import SimulatedImuSource


APP_TITLE = "ESP32 IMU Viewer"
DEFAULT_BAUDRATE = 115200
DEFAULT_HISTORY_SECONDS = 15.0
POLL_INTERVAL_MS = 20
UI_REFRESH_INTERVAL_MS = 50
MAX_BUFFERED_SAMPLES = 5000
BRIDGE_HOST = "127.0.0.1"
BRIDGE_PORT = 8765
BRIDGE_METRICS_INTERVAL_S = 0.15
DEFAULT_EXERCISES = (
    "back_squat",
    "bench_press",
    "deadlift",
    "overhead_press",
    "front_squat",
    "romanian_deadlift",
)


class ImuSource(Protocol):
    connected_name: str
    good_lines: int
    bad_lines: int

    @property
    def is_connected(self) -> bool:
        ...

    def connect(self, port_name: str, baud_rate: int):
        ...

    def disconnect(self) -> None:
        ...

    def poll(self, max_lines: int = 250):
        ...


class ImuViewerWindow(QMainWindow):
    def __init__(self) -> None:
        super().__init__()

        self.setWindowTitle(APP_TITLE)
        self.resize(1260, 980)

        self.history_seconds = DEFAULT_HISTORY_SECONDS
        self.source: Optional[ImuSource] = None
        self.latest_sample: Optional[ImuSample] = None
        self.latest_motion_estimate: Optional[MotionEstimate] = None
        self.motion_estimator = GravityCompensatedVelocityEstimator()
        self.logger: Optional[SessionLogger] = None
        self.set_analyzer = SetAnalyzer()
        self.active_set_context: Optional[SetContext] = None
        self.pending_set_payload: Optional[dict[str, object]] = None
        self.bridge_commands: Queue = Queue()
        self.bridge = LiveBridgeServer(
            self.bridge_commands,
            status_provider=self._bridge_status_payload,
            host=BRIDGE_HOST,
            port=BRIDGE_PORT,
        )
        self.bridge_available = self.bridge.start()
        self._last_bridge_metrics_sent_s = 0.0

        # Rep counter state — updated when confirmed reps arrive via flush_pending_reps
        self._rep_count = 0
        self._last_rep_duration_ms = 0
        self._last_rep_peak_g = 0.0
        self._rep_flash_timer = QTimer(self)
        self._rep_flash_timer.setSingleShot(True)
        self._rep_flash_timer.timeout.connect(self._clear_rep_flash)

        self.timestamps: Deque[float] = deque(maxlen=MAX_BUFFERED_SAMPLES)
        self.ax_data: Deque[float] = deque(maxlen=MAX_BUFFERED_SAMPLES)
        self.ay_data: Deque[float] = deque(maxlen=MAX_BUFFERED_SAMPLES)
        self.az_data: Deque[float] = deque(maxlen=MAX_BUFFERED_SAMPLES)
        self.gx_data: Deque[float] = deque(maxlen=MAX_BUFFERED_SAMPLES)
        self.gy_data: Deque[float] = deque(maxlen=MAX_BUFFERED_SAMPLES)
        self.gz_data: Deque[float] = deque(maxlen=MAX_BUFFERED_SAMPLES)
        self.temp_data: Deque[float] = deque(maxlen=MAX_BUFFERED_SAMPLES)
        self.velocity_timestamps: Deque[float] = deque(maxlen=MAX_BUFFERED_SAMPLES)
        self.velocity_data: Deque[float] = deque(maxlen=MAX_BUFFERED_SAMPLES)

        self.value_labels: Dict[str, QLabel] = {}
        self.status_label: QLabel
        self.info_label: QLabel
        self.port_combo: QComboBox
        self.baud_spin: QSpinBox
        self.connect_button: QPushButton
        self.disconnect_button: QPushButton
        self.refresh_button: QPushButton
        self.exercise_combo: QComboBox
        self.load_spin: QSpinBox
        self.target_reps_spin: QSpinBox
        self.set_number_spin: QSpinBox
        self.pr_attempt_checkbox: QCheckBox
        self.start_set_button: QPushButton
        self.end_set_button: QPushButton
        self.set_status_label: QLabel
        self.velocity_axis_combo: QComboBox
        self.reset_velocity_button: QPushButton
        self.drift_suppression_checkbox: QCheckBox
        self.coach_summary_label: QLabel
        self.coach_meta_label: QLabel
        self.coach_text: QTextEdit

        self.accel_plot: pg.PlotWidget
        self.gyro_plot: pg.PlotWidget
        self.velocity_plot: pg.PlotWidget
        self.accel_curves: Dict[str, pg.PlotDataItem] = {}
        self.gyro_curves: Dict[str, pg.PlotDataItem] = {}
        self.velocity_curve: pg.PlotDataItem

        self._build_ui()
        self._build_timers()
        self.refresh_ports()
        self._set_status("Disconnected.", "#666666")
        self._update_connection_controls()
        self._update_set_controls()
        self._update_info_label()
        self.bridge_timer.start()

    def _build_ui(self) -> None:
        scroll_area = QScrollArea()
        scroll_area.setWidgetResizable(True)
        scroll_area.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)
        scroll_area.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)
        self.setCentralWidget(scroll_area)

        central = QWidget()
        scroll_area.setWidget(central)
        root_layout = QVBoxLayout(central)
        root_layout.setContentsMargins(12, 12, 12, 12)
        root_layout.setSpacing(10)

        controls_group = QGroupBox("Connection")
        controls_layout = QGridLayout(controls_group)

        self.port_combo = QComboBox()
        self.port_combo.setEditable(True)
        self.port_combo.setInsertPolicy(QComboBox.InsertPolicy.NoInsert)
        self.port_combo.setMinimumWidth(220)

        self.baud_spin = QSpinBox()
        self.baud_spin.setRange(300, 3000000)
        self.baud_spin.setValue(DEFAULT_BAUDRATE)
        self.baud_spin.setSingleStep(100)

        self.refresh_button = QPushButton("Refresh Ports")
        self.connect_button = QPushButton("Connect")
        self.disconnect_button = QPushButton("Disconnect")
        self.velocity_axis_combo = QComboBox()
        self.velocity_axis_combo.addItems(("X", "Y", "Z"))
        self.velocity_axis_combo.setCurrentText("Z")
        self.reset_velocity_button = QPushButton("Reset Velocity")
        self.drift_suppression_checkbox = QCheckBox("Drift Suppression")
        self.drift_suppression_checkbox.setChecked(True)

        self.refresh_button.clicked.connect(self.refresh_ports)
        self.connect_button.clicked.connect(self.connect_to_source)
        self.disconnect_button.clicked.connect(self.disconnect_from_source)
        self.velocity_axis_combo.currentTextChanged.connect(self.change_velocity_axis)
        self.reset_velocity_button.clicked.connect(self.reset_velocity)
        self.drift_suppression_checkbox.toggled.connect(self.toggle_drift_suppression)

        controls_layout.addWidget(QLabel("Port"), 0, 0)
        controls_layout.addWidget(self.port_combo, 0, 1)
        controls_layout.addWidget(QLabel("Baud"), 0, 2)
        controls_layout.addWidget(self.baud_spin, 0, 3)
        controls_layout.addWidget(self.refresh_button, 0, 4)
        controls_layout.addWidget(self.connect_button, 0, 5)
        controls_layout.addWidget(self.disconnect_button, 0, 6)

        controls_layout.addWidget(QLabel("Velocity Axis"), 1, 0)
        controls_layout.addWidget(self.velocity_axis_combo, 1, 1)
        controls_layout.addWidget(self.drift_suppression_checkbox, 1, 2, 1, 2)
        controls_layout.addWidget(self.reset_velocity_button, 1, 4, 1, 3)

        self.status_label = QLabel()
        self.status_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        controls_layout.addWidget(self.status_label, 2, 0, 1, 7)

        self.info_label = QLabel()
        self.info_label.setStyleSheet("color: #444444;")
        controls_layout.addWidget(self.info_label, 3, 0, 1, 7)

        root_layout.addWidget(controls_group)

        set_group = QGroupBox("Set Context")
        set_layout = QGridLayout(set_group)

        self.exercise_combo = QComboBox()
        self.exercise_combo.addItems(DEFAULT_EXERCISES)
        self.exercise_combo.setCurrentText("back_squat")

        self.load_spin = QSpinBox()
        self.load_spin.setRange(45, 1000)
        self.load_spin.setSingleStep(5)
        self.load_spin.setValue(225)

        self.target_reps_spin = QSpinBox()
        self.target_reps_spin.setRange(1, 20)
        self.target_reps_spin.setValue(5)

        self.set_number_spin = QSpinBox()
        self.set_number_spin.setRange(1, 20)
        self.set_number_spin.setValue(1)

        self.pr_attempt_checkbox = QCheckBox("PR Attempt")
        self.start_set_button = QPushButton("Start Set")
        self.end_set_button = QPushButton("End Set")
        self.end_set_button.setEnabled(False)
        self.set_status_label = QLabel("No active set.")
        self.set_status_label.setStyleSheet("color: #555555; font-weight: 600;")

        self.start_set_button.clicked.connect(self.start_set)
        self.end_set_button.clicked.connect(self.end_set)

        set_layout.addWidget(QLabel("Exercise"), 0, 0)
        set_layout.addWidget(self.exercise_combo, 0, 1)
        set_layout.addWidget(QLabel("Load (lbs)"), 0, 2)
        set_layout.addWidget(self.load_spin, 0, 3)
        set_layout.addWidget(QLabel("Target Reps"), 0, 4)
        set_layout.addWidget(self.target_reps_spin, 0, 5)

        set_layout.addWidget(QLabel("Set Number"), 1, 0)
        set_layout.addWidget(self.set_number_spin, 1, 1)
        set_layout.addWidget(self.pr_attempt_checkbox, 1, 2, 1, 2)
        set_layout.addWidget(self.start_set_button, 1, 4)
        set_layout.addWidget(self.end_set_button, 1, 5)
        set_layout.addWidget(self.set_status_label, 2, 0, 1, 6)

        root_layout.addWidget(set_group)

        coach_group = QGroupBox("Post-Set Coach")
        coach_layout = QVBoxLayout(coach_group)
        self.coach_summary_label = QLabel("No completed set yet.")
        self.coach_summary_label.setWordWrap(True)
        self.coach_summary_label.setStyleSheet("font-weight: 700; color: #1f3c88;")

        self.coach_meta_label = QLabel("Structured labels and next-set actions will appear here.")
        self.coach_meta_label.setWordWrap(True)
        self.coach_meta_label.setStyleSheet("color: #555555;")

        self.coach_text = QTextEdit()
        self.coach_text.setReadOnly(True)
        self.coach_text.setMinimumHeight(120)

        coach_layout.addWidget(self.coach_summary_label)
        coach_layout.addWidget(self.coach_meta_label)
        coach_layout.addWidget(self.coach_text)

        root_layout.addWidget(coach_group)

        readouts_layout = QHBoxLayout()
        readouts_layout.setSpacing(10)
        readouts_layout.addWidget(
            self._create_value_group(
                "Accelerometer [g]",
                (("ax", "X"), ("ay", "Y"), ("az", "Z")),
            )
        )
        readouts_layout.addWidget(
            self._create_value_group(
                "Gyroscope [dps]",
                (("gx", "X"), ("gy", "Y"), ("gz", "Z")),
            )
        )
        readouts_layout.addWidget(
            self._create_value_group(
                "Temperature [C]",
                (("temp", "TEMP"),),
            )
        )
        readouts_layout.addWidget(
            self._create_value_group(
                "Motion Estimate",
                (
                    ("velocity", "VEL"),
                    ("lin_accel", "LINACC"),
                    ("pitch", "PITCH"),
                    ("roll", "ROLL"),
                ),
            )
        )

        self.rep_group = self._create_value_group(
            "Rep Counter",
            (
                ("rep_count", "REPS"),
                ("rep_duration", "TIME (ms)"),
                ("rep_peak", "PEAK (g)"),
            ),
        )
        readouts_layout.addWidget(self.rep_group)

        root_layout.addLayout(readouts_layout)

        pg.setConfigOptions(antialias=True)
        pg.setConfigOption("background", "w")
        pg.setConfigOption("foreground", "#202020")

        self.accel_plot = self._create_plot_widget("Acceleration", "Acceleration (g)")
        self.gyro_plot = self._create_plot_widget("Gyroscope", "Angular Rate (dps)")
        self.velocity_plot = self._create_plot_widget("Velocity", "Velocity (m/s)")

        for plot in (self.accel_plot, self.gyro_plot, self.velocity_plot):
            plot.setMinimumHeight(170)

        self.accel_curves = {
            "ax": self.accel_plot.plot(name="Accel X", pen=pg.mkPen("#d62728", width=2)),
            "ay": self.accel_plot.plot(name="Accel Y", pen=pg.mkPen("#2ca02c", width=2)),
            "az": self.accel_plot.plot(name="Accel Z", pen=pg.mkPen("#1f77b4", width=2)),
        }
        self.gyro_curves = {
            "gx": self.gyro_plot.plot(name="Gyro X", pen=pg.mkPen("#d62728", width=2)),
            "gy": self.gyro_plot.plot(name="Gyro Y", pen=pg.mkPen("#2ca02c", width=2)),
            "gz": self.gyro_plot.plot(name="Gyro Z", pen=pg.mkPen("#1f77b4", width=2)),
        }
        self.velocity_curve = self.velocity_plot.plot(
            name="Velocity",
            pen=pg.mkPen("#9467bd", width=2),
        )

        plots_splitter = QSplitter(Qt.Orientation.Vertical)
        plots_splitter.addWidget(self.accel_plot)
        plots_splitter.addWidget(self.gyro_plot)
        plots_splitter.addWidget(self.velocity_plot)
        plots_splitter.setChildrenCollapsible(False)
        plots_splitter.setStretchFactor(0, 1)
        plots_splitter.setStretchFactor(1, 1)
        plots_splitter.setStretchFactor(2, 1)
        plots_splitter.setSizes([260, 260, 260])

        root_layout.addWidget(plots_splitter, stretch=1)

    def _build_timers(self) -> None:
        self.poll_timer = QTimer(self)
        self.poll_timer.setInterval(POLL_INTERVAL_MS)
        self.poll_timer.timeout.connect(self.poll_data_source)

        self.ui_timer = QTimer(self)
        self.ui_timer.setInterval(UI_REFRESH_INTERVAL_MS)
        self.ui_timer.timeout.connect(self.refresh_live_view)

        self.bridge_timer = QTimer(self)
        self.bridge_timer.setInterval(UI_REFRESH_INTERVAL_MS)
        self.bridge_timer.timeout.connect(self._process_bridge_commands)

    def _create_value_group(
        self,
        title: str,
        items: Tuple[Tuple[str, str], ...],
    ) -> QGroupBox:
        group = QGroupBox(title)
        layout = QGridLayout(group)

        label_font = QFont()
        label_font.setPointSize(11)

        value_font = QFont("Consolas")
        value_font.setPointSize(20)
        value_font.setBold(True)

        for row, (key, display_label) in enumerate(items):
            axis_label = QLabel(display_label)
            axis_label.setFont(label_font)

            value_label = QLabel("--")
            value_label.setFont(value_font)
            value_label.setAlignment(
                Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter
            )
            value_label.setMinimumWidth(140)

            self.value_labels[key] = value_label

            layout.addWidget(axis_label, row, 0)
            layout.addWidget(value_label, row, 1)

        return group

    def _create_plot_widget(self, title: str, y_label: str) -> pg.PlotWidget:
        plot = pg.PlotWidget(title=title)
        plot.addLegend(offset=(10, 10))
        plot.showGrid(x=True, y=True, alpha=0.25)
        plot.setLabel("bottom", "Time", units="s")
        plot.setLabel("left", y_label)
        plot.setClipToView(True)
        plot.setDownsampling(auto=True, mode="peak")
        return plot

    def _bridge_status_payload(self) -> dict[str, object]:
        return {
            "bridge_online": True,
            "source_connected": self.source is not None and self.source.is_connected,
            "source": self.source.connected_name if self.source is not None else None,
            "set_active": self.active_set_context is not None,
            "set_mode": self.active_set_context.set_mode if self.active_set_context is not None else None,
            "set_number": self.active_set_context.set_number if self.active_set_context is not None else None,
            "exercise": self.active_set_context.exercise if self.active_set_context is not None else None,
            "target_reps": self.active_set_context.target_reps if self.active_set_context is not None else None,
            "set_prepared": self.pending_set_payload is not None,
        }

    def _bridge_send(self, message_type: str, payload: dict[str, object]) -> None:
        if not self.bridge_available:
            return
        self.bridge.broadcast(message_type, payload)

    def _bridge_error(self, message: str) -> None:
        self._bridge_send("error", {"message": message})

    def _process_bridge_commands(self) -> None:
        while True:
            try:
                message = self.bridge_commands.get_nowait()
            except Empty:
                break

            message_type = message.get("type")
            payload = message.get("payload", {})
            if message_type == "start_set":
                self.handle_start_set(payload)
            elif message_type == "prepare_set":
                self.handle_prepare_set(payload)
            elif message_type == "end_set":
                self.handle_end_set(payload)
            elif message_type == "ping":
                self._bridge_send("bridge_status", self._bridge_status_payload())

    def _apply_set_payload_to_controls(self, payload: dict[str, object]) -> None:
        exercise = str(payload.get("exercise", self.exercise_combo.currentText()))
        if self.exercise_combo.findText(exercise) >= 0:
            self.exercise_combo.setCurrentText(exercise)

        self.load_spin.setValue(int(payload.get("load_lbs", self.load_spin.value())))
        self.target_reps_spin.setValue(int(payload.get("target_reps", self.target_reps_spin.value())))
        self.set_number_spin.setValue(int(payload.get("set_number", self.set_number_spin.value())))
        set_mode = str(payload.get("set_mode", "working"))
        self.pr_attempt_checkbox.setChecked(set_mode == "pr_attempt")

    def handle_prepare_set(self, payload: dict[str, object]) -> None:
        # Silently close any stale set before preparing the next one
        if self.active_set_context is not None:
            self._finalize_active_set()
        if self.source is None or not self.source.is_connected:
            self._bridge_error("Cannot prepare a set because no IMU source is connected.")
            return

        self.pending_set_payload = dict(payload)
        self._apply_set_payload_to_controls(self.pending_set_payload)
        # Reset rep display counters immediately so live_metrics broadcasts 0
        self._rep_count = 0
        self._last_rep_duration_ms = 0
        self._last_rep_peak_g = 0.0
        self.value_labels["rep_count"].setText("0")
        self.value_labels["rep_duration"].setText("--")
        self.value_labels["rep_peak"].setText("--")
        self.set_status_label.setText(
            f"Set {self.set_number_spin.value()} prepared. Waiting for the first detected rep."
        )
        self._update_set_controls()
        self._update_info_label()
        self._bridge_send("bridge_status", self._bridge_status_payload())

    def _activate_prepared_set_if_needed(self) -> None:
        if self.active_set_context is not None or self.pending_set_payload is None:
            return
        self._apply_set_payload_to_controls(self.pending_set_payload)
        self.start_set()
        self.pending_set_payload = None

    def handle_start_set(self, payload: dict[str, object]) -> None:
        if self.source is None or not self.source.is_connected:
            self._bridge_error("Cannot start a set because no IMU source is connected.")
            return
        if self.active_set_context is not None:
            self._finalize_active_set()

        self.pending_set_payload = None
        self._apply_set_payload_to_controls(payload)
        self.start_set()

    def handle_end_set(self, payload: dict[str, object]) -> None:
        _ = payload
        if self.active_set_context is None:
            self._bridge_error("No active set is running.")
            return
        self.end_set()

    def refresh_ports(self) -> None:
        previous_text = self.port_combo.currentText().strip()
        port_names = SerialImuSource.list_ports()

        self.port_combo.blockSignals(True)
        self.port_combo.clear()
        self.port_combo.addItems(port_names)
        self.port_combo.blockSignals(False)

        if previous_text:
            index = self.port_combo.findText(previous_text)
            if index >= 0:
                self.port_combo.setCurrentIndex(index)
            else:
                self.port_combo.setEditText(previous_text)
        else:
            self.port_combo.setCurrentText(SIMULATED_PORT_NAME)

    def connect_to_source(self) -> None:
        port_name = self.port_combo.currentText().strip()
        baud_rate = int(self.baud_spin.value())

        if port_name.upper() == SIMULATED_PORT_NAME:
            source: ImuSource = SimulatedImuSource()
        else:
            source = SerialImuSource()

        success, message = source.connect(port_name, baud_rate)
        if not success:
            self.source = None
            self._set_status(message, "#b00020")
            self._update_connection_controls()
            self._update_info_label()
            return

        self.source = source
        self._clear_history()
        self.motion_estimator.set_axis(self.velocity_axis_combo.currentText())
        self.motion_estimator.reset()
        self._reset_live_readouts()
        self._ensure_logger_started()
        self._set_status(message, "#146c2e")
        self._update_connection_controls()
        self._update_set_controls()
        self._update_info_label()
        self._bridge_send("bridge_status", self._bridge_status_payload())
        self.poll_timer.start()
        self.ui_timer.start()

    def disconnect_from_source(self) -> None:
        self.poll_timer.stop()
        self.ui_timer.stop()

        if self.active_set_context is not None:
            self._finalize_active_set()

        if self.source is not None:
            self.source.disconnect()
        self.source = None
        if self.logger is not None:
            self.logger.close()
        self.logger = None

        self._set_status("Disconnected.", "#666666")
        self._update_connection_controls()
        self._update_set_controls()
        self._update_info_label()
        self._bridge_send("bridge_status", self._bridge_status_payload())

    def start_set(self) -> None:
        if self.source is None or not self.source.is_connected:
            self._set_status("Connect to a live or simulated source before starting a set.", "#b00020")
            return
        if self.active_set_context is not None:
            self._set_status("A set is already active.", "#b00020")
            return

        timestamp_start = datetime.now(timezone.utc).isoformat()
        set_mode = "pr_attempt" if self.pr_attempt_checkbox.isChecked() else "working"
        self.active_set_context = SetContext(
            exercise=self.exercise_combo.currentText(),
            load_lbs=int(self.load_spin.value()),
            target_reps=int(self.target_reps_spin.value()),
            set_number=int(self.set_number_spin.value()),
            set_mode=set_mode,
            timestamp_start=timestamp_start,
        )
        self.set_analyzer.start_set(self.active_set_context)
        self._rep_count = 0
        self._last_rep_duration_ms = 0
        self._last_rep_peak_g = 0.0
        self.value_labels["rep_count"].setText("0")
        self.value_labels["rep_duration"].setText("--")
        self.value_labels["rep_peak"].setText("--")
        self._clear_coach_panel()
        self.set_status_label.setText(
            f"Set {self.active_set_context.set_number} active: {self.active_set_context.exercise} "
            f"@ {self.active_set_context.load_lbs} lbs for {self.active_set_context.target_reps} reps "
            f"({self.active_set_context.set_mode})."
        )
        self._update_set_controls()
        self._update_info_label()
        self._bridge_send(
            "set_started",
            {
                "exercise": self.active_set_context.exercise,
                "load_lbs": self.active_set_context.load_lbs,
                "target_reps": self.active_set_context.target_reps,
                "set_number": self.active_set_context.set_number,
                "set_mode": self.active_set_context.set_mode,
                "timestamp_start": self.active_set_context.timestamp_start,
            },
        )
        self._bridge_send("bridge_status", self._bridge_status_payload())

    def end_set(self) -> None:
        if self.active_set_context is None:
            self._set_status("No active set to end.", "#b00020")
            return
        self._finalize_active_set()

    def _ensure_logger_started(self) -> None:
        if self.logger is not None:
            return
        self.logger = SessionLogger()
        self.logger.start_session(
            {
                "source": self.source.connected_name if self.source is not None else None,
                "baud_rate": self.baud_spin.value(),
                "app_title": APP_TITLE,
            }
        )

    def _finalize_active_set(self) -> None:
        if self.active_set_context is None:
            return

        set_context = self.active_set_context
        set_summary = self.set_analyzer.end_set()

        self.active_set_context = None
        self.pending_set_payload = None
        self._update_set_controls()

        if set_summary is None:
            self.set_status_label.setText("Set ended without any recorded data.")
            return

        if self.logger is not None:
            self.logger.log_set_summary(set_summary)

        self._bridge_send("set_ended", {"set_number": set_context.set_number})
        self._bridge_send("set_summary", set_summary.to_dict())

        self.set_status_label.setText(
            f"Set {set_context.set_number} complete with {set_summary.completed_reps} recorded reps."
        )

        self._show_set_summary_only(set_summary)

        self.set_number_spin.setValue(set_context.set_number + 1)
        self.pr_attempt_checkbox.setChecked(False)
        self._update_info_label()
        self._bridge_send("bridge_status", self._bridge_status_payload())

    def poll_data_source(self) -> None:
        if self.source is None:
            return

        samples, error_message = self.source.poll()
        if error_message:
            self.source.disconnect()
            self.source = None
            self.poll_timer.stop()
            self._set_status(error_message, "#b00020")
            self._update_connection_controls()
            self._update_info_label()
            self._bridge_send("bridge_status", self._bridge_status_payload())
            return

        if not samples:
            if hasattr(self.source, "drain_rep_events"):
                for rep in self.source.drain_rep_events():
                    self._handle_rep_event(rep)
            self._update_info_label()
            return

        for sample in samples:
            self._append_sample(sample)

        self.latest_sample = samples[-1]
        self._trim_history(self.latest_sample.timestamp)

        if hasattr(self.source, "drain_rep_events"):
            for rep in self.source.drain_rep_events():
                self._handle_rep_event(rep)

        self._update_info_label()

    def _handle_rep_event(self, rep: RepEvent) -> None:
        """
        Receive a firmware REP candidate event.
        Activates a prepared set on the first rep, logs the raw event,
        and queues it in SetAnalyzer for phase validation.
        Confirmed reps are processed in _append_sample via flush_pending_reps.
        """
        # If a set is prepared and waiting, activate it on the first rep
        self._activate_prepared_set_if_needed()

        # Flash the rep counter group green for immediate visual feedback
        self.rep_group.setStyleSheet(
            "QGroupBox { background-color: #00c853; border-radius: 6px; }"
        )
        self._rep_flash_timer.start(600)

        # Log the raw firmware rep event
        if self.logger is not None:
            self.logger.log_rep_event(
                rep,
                self.active_set_context.set_number if self.active_set_context is not None else None,
            )

        # Queue the rep for phase validation — confirmed reps emerge from
        # flush_pending_reps which is called after each sample in _append_sample
        if self.active_set_context is not None:
            self.set_analyzer.ingest_rep_event(rep)

    def _clear_rep_flash(self) -> None:
        """Reset the rep counter group background after the flash fades."""
        self.rep_group.setStyleSheet("")

    def change_velocity_axis(self, axis: str) -> None:
        self.motion_estimator.set_axis(axis)
        self.reset_velocity()

    def toggle_drift_suppression(self, enabled: bool) -> None:
        self.motion_estimator.set_drift_suppression_enabled(enabled)
        self._update_info_label()

    def reset_velocity(self) -> None:
        self.motion_estimator.reset(self.latest_sample)
        self.velocity_timestamps.clear()
        self.velocity_data.clear()
        self.velocity_curve.setData([], [])

        if self.latest_motion_estimate is not None:
            self.latest_motion_estimate.velocity_mps = 0.0
            self.latest_motion_estimate.linear_accel_axis_mps2 = 0.0
            self.latest_motion_estimate.stationary = True

        self.value_labels["velocity"].setText("0.000")
        self.value_labels["lin_accel"].setText("0.000")
        self._update_info_label()

    def refresh_live_view(self) -> None:
        self._refresh_value_labels()
        self._refresh_plots()

    def _append_sample(self, sample: ImuSample) -> None:
        self.timestamps.append(sample.timestamp)
        self.ax_data.append(sample.ax)
        self.ay_data.append(sample.ay)
        self.az_data.append(sample.az)
        self.gx_data.append(sample.gx)
        self.gy_data.append(sample.gy)
        self.gz_data.append(sample.gz)
        self.temp_data.append(sample.temp)

        self.latest_motion_estimate = self.motion_estimator.update(sample)
        self.velocity_timestamps.append(sample.timestamp)
        self.velocity_data.append(self.latest_motion_estimate.velocity_mps)

        # Activate a prepared set if samples are arriving and one is waiting
        if self.pending_set_payload is not None and self.active_set_context is None:
            self._activate_prepared_set_if_needed()

        if self.active_set_context is not None:
            self.set_analyzer.ingest_sample(sample, self.latest_motion_estimate)

            # Check if any queued rep candidates are now fully validated
            # (ascent samples have arrived since the firmware REP event fired)
            confirmed_reps = self.set_analyzer.flush_pending_reps()
            for rep_feature in confirmed_reps:
                self._rep_count = rep_feature.rep_number
                self.value_labels["rep_count"].setText(str(rep_feature.rep_number))
                self.value_labels["rep_duration"].setText(str(rep_feature.duration_ms))
                self.value_labels["rep_peak"].setText(f"{rep_feature.peak_accel_g:.2f}")
                self._bridge_send(
                    "rep_event",
                    {
                        "rep_number": rep_feature.rep_number,
                        "velocity_proxy": rep_feature.velocity_proxy,
                        "avg_tilt_deg": rep_feature.avg_tilt_deg,
                        "max_tilt_deg": rep_feature.max_tilt_deg,
                        "flags": rep_feature.flags,
                        "set_number": self.active_set_context.set_number if self.active_set_context else None,
                        "exercise": self.active_set_context.exercise if self.active_set_context else None,
                        "set_mode": self.active_set_context.set_mode if self.active_set_context else None,
                        "duration_ms": rep_feature.duration_ms,
                        "peak_accel_g": rep_feature.peak_accel_g,
                    },
                )
                # Check auto-finalize after each confirmed rep
                if self.set_analyzer.should_auto_finalize():
                    self._finalize_active_set()
                    break
            # Check auto-finalize on every sample, not just when confirming reps.
            # This is what triggers rest-based finalization after the athlete stops.
            if self.active_set_context is not None and self.set_analyzer.should_auto_finalize():
                self._finalize_active_set()

        if self.logger is not None:
            self.logger.log_sample(sample, self.latest_motion_estimate, self.active_set_context)

        current_time = float(getattr(sample, "timestamp", 0.0))
        if (
            current_time - self._last_bridge_metrics_sent_s >= BRIDGE_METRICS_INTERVAL_S
            and self.latest_motion_estimate is not None
        ):
            tilt_deg = math.sqrt(
                self.latest_motion_estimate.pitch_deg * self.latest_motion_estimate.pitch_deg
                + self.latest_motion_estimate.roll_deg * self.latest_motion_estimate.roll_deg
            )
            self._bridge_send(
                "live_metrics",
                {
                    "timestamp_s": current_time,
                    "velocity_mps": round(self.latest_motion_estimate.velocity_mps, 4),
                    "tilt_deg": round(tilt_deg, 3),
                    "rep_count": self._rep_count,
                    "set_number": self.active_set_context.set_number if self.active_set_context is not None else None,
                    "exercise": self.active_set_context.exercise if self.active_set_context is not None else None,
                    "set_mode": self.active_set_context.set_mode if self.active_set_context is not None else None,
                    "target_reps": self.active_set_context.target_reps if self.active_set_context is not None else None,
                },
            )
            self._bridge_send("chart_window", self._current_chart_window_payload(current_time))
            self._last_bridge_metrics_sent_s = current_time

    def _current_chart_window_payload(self, current_time: float) -> dict[str, object]:
        _ = current_time
        accel_times = [round(timestamp, 3) for timestamp in self.timestamps]
        velocity_times = [round(timestamp, 3) for timestamp in self.velocity_timestamps]
        return {
            "timestamp_s": round(self.latest_sample.timestamp, 3) if self.latest_sample is not None else 0.0,
            "history_seconds": self.history_seconds,
            "accel": {
                "t": accel_times,
                "ax": [round(value, 4) for value in self.ax_data],
                "ay": [round(value, 4) for value in self.ay_data],
                "az": [round(value, 4) for value in self.az_data],
            },
            "gyro": {
                "t": accel_times,
                "gx": [round(value, 4) for value in self.gx_data],
                "gy": [round(value, 4) for value in self.gy_data],
                "gz": [round(value, 4) for value in self.gz_data],
            },
            "velocity": {
                "t": velocity_times,
                "v": [round(value, 4) for value in self.velocity_data],
            },
        }

    def _trim_history(self, current_time: float) -> None:
        while self.timestamps and (current_time - self.timestamps[0]) > self.history_seconds:
            self.timestamps.popleft()
            self.ax_data.popleft()
            self.ay_data.popleft()
            self.az_data.popleft()
            self.gx_data.popleft()
            self.gy_data.popleft()
            self.gz_data.popleft()
            self.temp_data.popleft()

        while self.velocity_timestamps and (
            current_time - self.velocity_timestamps[0]
        ) > self.history_seconds:
            self.velocity_timestamps.popleft()
            self.velocity_data.popleft()

    def _refresh_value_labels(self) -> None:
        if self.latest_sample is not None:
            self.value_labels["ax"].setText(f"{self.latest_sample.ax:+0.3f}")
            self.value_labels["ay"].setText(f"{self.latest_sample.ay:+0.3f}")
            self.value_labels["az"].setText(f"{self.latest_sample.az:+0.3f}")
            self.value_labels["gx"].setText(f"{self.latest_sample.gx:+0.2f}")
            self.value_labels["gy"].setText(f"{self.latest_sample.gy:+0.2f}")
            self.value_labels["gz"].setText(f"{self.latest_sample.gz:+0.2f}")
            self.value_labels["temp"].setText(f"{self.latest_sample.temp:0.2f}")

        if self.latest_motion_estimate is not None:
            self.value_labels["velocity"].setText(
                f"{self.latest_motion_estimate.velocity_mps:+0.3f}"
            )
            self.value_labels["lin_accel"].setText(
                f"{self.latest_motion_estimate.linear_accel_axis_mps2:+0.3f}"
            )
            self.value_labels["pitch"].setText(
                f"{self.latest_motion_estimate.pitch_deg:+0.1f}"
            )
            self.value_labels["roll"].setText(
                f"{self.latest_motion_estimate.roll_deg:+0.1f}"
            )

    def _refresh_plots(self) -> None:
        accel_times = list(self.timestamps)
        velocity_times = list(self.velocity_timestamps)

        if accel_times:
            self.accel_curves["ax"].setData(accel_times, list(self.ax_data))
            self.accel_curves["ay"].setData(accel_times, list(self.ay_data))
            self.accel_curves["az"].setData(accel_times, list(self.az_data))
            self.gyro_curves["gx"].setData(accel_times, list(self.gx_data))
            self.gyro_curves["gy"].setData(accel_times, list(self.gy_data))
            self.gyro_curves["gz"].setData(accel_times, list(self.gz_data))

        if velocity_times:
            self.velocity_curve.setData(velocity_times, list(self.velocity_data))

        if not accel_times and not velocity_times:
            return

        x_candidates = []
        if accel_times:
            x_candidates.append(accel_times[-1])
        if velocity_times:
            x_candidates.append(velocity_times[-1])

        x_max = max(x_candidates)
        x_min = max(0.0, x_max - self.history_seconds)
        self.accel_plot.setXRange(x_min, x_max, padding=0.02)
        self.gyro_plot.setXRange(x_min, x_max, padding=0.02)
        self.velocity_plot.setXRange(x_min, x_max, padding=0.02)

    def _set_status(self, text: str, color: str) -> None:
        self.status_label.setText(text)
        self.status_label.setStyleSheet(
            f"padding: 6px 10px; border: 1px solid {color}; "
            f"border-radius: 4px; color: {color}; background: #fafafa;"
        )

    def _update_info_label(self) -> None:
        source_name = self.source.connected_name if self.source is not None else "None"
        good_lines = self.source.good_lines if self.source is not None else 0
        bad_lines = self.source.bad_lines if self.source is not None else 0
        drift_label = "On" if self.drift_suppression_checkbox.isChecked() else "Off"
        active_set_label = (
            f"Set {self.active_set_context.set_number}"
            if self.active_set_context is not None
            else "None"
        )
        stationary_label = (
            "Yes"
            if self.latest_motion_estimate is not None and self.latest_motion_estimate.stationary
            else "No"
        )
        if self.bridge_available:
            bridge_label = f"Bridge ({self.bridge.backend}): ws://{BRIDGE_HOST}:{BRIDGE_PORT}"
        else:
            bridge_label = "Bridge: unavailable"
            if self.bridge.startup_error:
                bridge_label = f"{bridge_label} ({self.bridge.startup_error})"

        self.info_label.setText(
            f"Source: {source_name} | Good lines: {good_lines} | "
            f"Malformed lines ignored: {bad_lines} | "
            f"Velocity axis: {self.velocity_axis_combo.currentText()} | "
            f"Drift suppression: {drift_label} | "
            f"Active set: {active_set_label} | "
            f"Stationary: {stationary_label} | "
            f"Buffered samples: {len(self.timestamps)} | "
            f"History: {self.history_seconds:.0f}s | "
            f"{bridge_label}"
        )

    def _update_connection_controls(self) -> None:
        connected = self.source is not None and self.source.is_connected
        self.connect_button.setEnabled(not connected)
        self.disconnect_button.setEnabled(connected)
        self.port_combo.setEnabled(not connected)
        self.baud_spin.setEnabled(not connected)
        self.refresh_button.setEnabled(not connected)

    def _update_set_controls(self) -> None:
        set_active = self.active_set_context is not None
        connected = self.source is not None and self.source.is_connected
        self.exercise_combo.setEnabled(not set_active)
        self.load_spin.setEnabled(not set_active)
        self.target_reps_spin.setEnabled(not set_active)
        self.set_number_spin.setEnabled(not set_active)
        self.pr_attempt_checkbox.setEnabled(not set_active)
        self.start_set_button.setEnabled(connected and not set_active)
        self.end_set_button.setEnabled(set_active)

    def _clear_coach_panel(self) -> None:
        self.coach_summary_label.setText("No completed set yet.")
        self.coach_meta_label.setText("Structured labels and next-set actions will appear here.")
        self.coach_text.clear()

    def _show_set_summary_only(self, set_summary) -> None:
        self.coach_summary_label.setText(
            f"Set {set_summary.set_number} ended with {set_summary.completed_reps} reps recorded."
        )
        self.coach_meta_label.setText(
            f"Flags: {', '.join(map(str, set_summary.flagged_reps)) if set_summary.flagged_reps else 'none'} | "
            f"Mode: {set_summary.set_mode}"
        )
        self.coach_text.setPlainText(
            f"Average tilt: {set_summary.avg_tilt_deg:.2f} deg\n"
            f"Max tilt: {set_summary.max_tilt_deg:.2f} deg\n"
            f"Velocity dropoff: {set_summary.velocity_dropoff_pct:.2f}%\n"
            f"Fatigue score: {set_summary.fatigue_score:.2f}"
        )

    def _clear_history(self) -> None:
        self.active_set_context = None
        self.pending_set_payload = None
        self._rep_count = 0
        self._last_rep_duration_ms = 0
        self._last_rep_peak_g = 0.0
        self._rep_flash_timer.stop()
        self._clear_rep_flash()
        for key in ("rep_count", "rep_duration", "rep_peak"):
            self.value_labels[key].setText("--")

        self.timestamps.clear()
        self.ax_data.clear()
        self.ay_data.clear()
        self.az_data.clear()
        self.gx_data.clear()
        self.gy_data.clear()
        self.gz_data.clear()
        self.temp_data.clear()
        self.velocity_timestamps.clear()
        self.velocity_data.clear()
        self.latest_sample = None
        self.latest_motion_estimate = None

        self.accel_curves["ax"].setData([], [])
        self.accel_curves["ay"].setData([], [])
        self.accel_curves["az"].setData([], [])
        self.gyro_curves["gx"].setData([], [])
        self.gyro_curves["gy"].setData([], [])
        self.gyro_curves["gz"].setData([], [])
        self.velocity_curve.setData([], [])
        self._clear_coach_panel()
        self.set_status_label.setText("No active set.")
        self._update_set_controls()

    def _reset_live_readouts(self) -> None:
        for key, label in self.value_labels.items():
            label.setText("0.000" if key in {"velocity", "lin_accel", "pitch", "roll"} else "--")

    def closeEvent(self, event) -> None:  # type: ignore[override]
        self.disconnect_from_source()
        self.bridge_timer.stop()
        self.bridge.stop()
        super().closeEvent(event)


def main() -> int:
    app = QApplication(sys.argv)
    app.setStyle("Fusion")

    window = ImuViewerWindow()
    window.show()

    return app.exec()


if __name__ == "__main__":
    sys.exit(main())