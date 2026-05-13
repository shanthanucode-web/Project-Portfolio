import unittest
from types import SimpleNamespace

from app.main import ImuViewerWindow
from app.serial_reader import RepEvent
from app.set_analyzer import SetAnalyzer, SetContext


def make_context(set_number):
    return SetContext(
        exercise="Back Squat",
        load_lbs=225,
        target_reps=3,
        set_number=set_number,
        set_mode="working",
        timestamp_start="2026-04-27T00:00:00Z",
    )


def make_rep(rep_number, timestamp_s):
    return SimpleNamespace(
        rep_number=rep_number,
        timestamp_s=timestamp_s,
        duration_ms=800,
        peak_accel_g=1.2,
    )

def add_velocity_cycle(analyzer, start_s, velocities=None):
    """
    Default simulates a squat: descent samples BEFORE the rep event,
    ascent samples AFTER. Rep events fire at the bottom of the squat.
    """
    velocities = velocities or [-0.08, -0.12, -0.06, 0.06, 0.10, 0.08, 0.02, 0.0]
    for index, velocity in enumerate(velocities):
        analyzer.ingest_sample(
            SimpleNamespace(timestamp=start_s + index * 0.2),
            SimpleNamespace(velocity_mps=velocity, pitch_deg=0.0, roll_deg=0.0),
        )


class SetAnalyzerRepNumberTest(unittest.TestCase):
    def test_rep_numbers_reset_per_set_when_firmware_is_cumulative(self):
        analyzer = SetAnalyzer()

        analyzer.start_set(make_context(set_number=1))
        add_velocity_cycle(analyzer, start_s=0.2)
        first_rep = analyzer.ingest_rep_event(make_rep(rep_number=41, timestamp_s=1.0))
        add_velocity_cycle(analyzer, start_s=1.2)
        second_rep = analyzer.ingest_rep_event(make_rep(rep_number=42, timestamp_s=2.0))
        add_velocity_cycle(analyzer, start_s=2.2)
        third_rep = analyzer.ingest_rep_event(make_rep(rep_number=43, timestamp_s=3.0))
        first_set_reps = [
            first_rep,
            second_rep,
            third_rep,
        ]
        self.assertEqual([rep.rep_number for rep in first_set_reps], [1, 2, 3])

        analyzer.end_set()
        analyzer.start_set(make_context(set_number=2))
        add_velocity_cycle(analyzer, start_s=3.2)
        second_set_rep = analyzer.ingest_rep_event(make_rep(rep_number=44, timestamp_s=4.0))

        self.assertEqual(second_set_rep.rep_number, 1)

    def test_candidate_rep_without_full_velocity_cycle_is_rejected(self):
        analyzer = SetAnalyzer()
        analyzer.start_set(make_context(set_number=1))
        add_velocity_cycle(analyzer, start_s=0.2, velocities=[-0.08, -0.12, -0.06, -0.02, 0.0])

        rep = analyzer.ingest_rep_event(make_rep(rep_number=41, timestamp_s=1.0))
        summary = analyzer.end_set()

        self.assertIsNone(rep)
        self.assertEqual(summary.completed_reps, 0)

    def test_candidate_rep_requires_return_to_near_zero(self):
        analyzer = SetAnalyzer()
        analyzer.start_set(make_context(set_number=1))
        add_velocity_cycle(analyzer, start_s=0.2, velocities=[-0.08, -0.12, 0.09, 0.07, 0.06])

        rep = analyzer.ingest_rep_event(make_rep(rep_number=41, timestamp_s=1.0))
        summary = analyzer.end_set()

        self.assertIsNone(rep)
        self.assertEqual(summary.completed_reps, 0)


class _FakeLabel:
    def __init__(self):
        self.text = None

    def setText(self, text):
        self.text = text


class _FakeStyleTarget:
    def setStyleSheet(self, _style):
        pass


class _FakeTimer:
    def start(self, _milliseconds):
        pass


class _FakeSource:
    is_connected = True
    connected_name = "SIMULATED"


class _FakeSpin:
    def __init__(self, value=0):
        self._value = value

    def value(self):
        return self._value

    def setValue(self, value):
        self._value = value


class _FakeCombo:
    def __init__(self, value="Back Squat"):
        self._value = value

    def currentText(self):
        return self._value

    def findText(self, text):
        return 0

    def setCurrentText(self, text):
        self._value = text


class _FakeCheckbox:
    def __init__(self):
        self.checked = False

    def setChecked(self, checked):
        self.checked = checked


class PreparedSetRepStartTest(unittest.TestCase):
    def make_window(self):
        window = ImuViewerWindow.__new__(ImuViewerWindow)
        window.active_set_context = None
        window.pending_set_payload = {
            "exercise": "Back Squat",
            "load_lbs": 225,
            "target_reps": 3,
            "set_number": 1,
            "set_mode": "working",
        }
        window.set_analyzer = SetAnalyzer()
        window.logger = None
        window.bridge_available = False
        window._rep_count = 0
        window._last_rep_duration_ms = 0
        window._last_rep_peak_g = 0.0
        window.rep_group = _FakeStyleTarget()
        window._rep_flash_timer = _FakeTimer()
        window.value_labels = {
            "rep_count": _FakeLabel(),
            "rep_duration": _FakeLabel(),
            "rep_peak": _FakeLabel(),
        }

        def apply_payload(_payload):
            pass

        def start_set():
            payload = window.pending_set_payload
            context = SetContext(
                exercise=payload["exercise"],
                load_lbs=payload["load_lbs"],
                target_reps=payload["target_reps"],
                set_number=payload["set_number"],
                set_mode=payload["set_mode"],
                timestamp_start="2026-04-27T00:00:00Z",
            )
            window.active_set_context = context
            window.set_analyzer.start_set(context)

        window._apply_set_payload_to_controls = apply_payload
        window.start_set = start_set
        return window

    def test_prepared_set_starts_on_first_rep_and_counts_that_rep(self):
        window = self.make_window()
        window._activate_prepared_set_if_needed()
        add_velocity_cycle(window.set_analyzer, start_s=0.2)

        window._handle_rep_event(RepEvent(
            timestamp_s=1.0,
            rep_number=41,
            duration_ms=800,
            peak_accel_g=1.2,
        ))

        self.assertIsNotNone(window.active_set_context)
        self.assertEqual(window.pending_set_payload, None)
        self.assertEqual(window._rep_count, 1)
        self.assertEqual(window.value_labels["rep_count"].text, "1")

        summary = window.set_analyzer.end_set()
        self.assertEqual(summary.completed_reps, 1)
        self.assertEqual(summary.rep_features[0].rep_number, 1)

        window.pending_set_payload = {
            "exercise": "Back Squat",
            "load_lbs": 225,
            "target_reps": 3,
            "set_number": 2,
            "set_mode": "working",
        }
        window.active_set_context = None
        window._activate_prepared_set_if_needed()
        add_velocity_cycle(window.set_analyzer, start_s=1.2)
        window._handle_rep_event(RepEvent(
            timestamp_s=2.0,
            rep_number=42,
            duration_ms=790,
            peak_accel_g=1.1,
        ))

        self.assertEqual(window._rep_count, 1)
        summary = window.set_analyzer.end_set()
        self.assertEqual(summary.set_number, 2)
        self.assertEqual(summary.rep_features[0].rep_number, 1)

    def test_prepare_set_resets_stale_rep_display(self):
        window = ImuViewerWindow.__new__(ImuViewerWindow)
        window.active_set_context = None
        window.source = _FakeSource()
        window.pending_set_payload = None
        window.exercise_combo = _FakeCombo()
        window.load_spin = _FakeSpin(225)
        window.target_reps_spin = _FakeSpin(5)
        window.set_number_spin = _FakeSpin(2)
        window.pr_attempt_checkbox = _FakeCheckbox()
        window.set_status_label = _FakeLabel()
        window.value_labels = {
            "rep_count": _FakeLabel(),
            "rep_duration": _FakeLabel(),
            "rep_peak": _FakeLabel(),
        }
        window._rep_count = 5
        window._last_rep_duration_ms = 900
        window._last_rep_peak_g = 1.4
        window._update_set_controls = lambda: None
        window._update_info_label = lambda: None
        window._bridge_send = lambda _type, _payload: None
        window._bridge_error = lambda _message: None

        window.handle_prepare_set({
            "exercise": "Back Squat",
            "target_reps": 3,
            "set_number": 2,
        })

        self.assertEqual(window._rep_count, 0)
        self.assertEqual(window._last_rep_duration_ms, 0)
        self.assertEqual(window._last_rep_peak_g, 0.0)
        self.assertEqual(window.value_labels["rep_count"].text, "0")
        self.assertEqual(window.value_labels["rep_duration"].text, "--")
        self.assertEqual(window.value_labels["rep_peak"].text, "--")


if __name__ == "__main__":
    unittest.main()
