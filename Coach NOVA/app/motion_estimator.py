from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Optional

try:
    from .serial_reader import ImuSample
except ImportError:
    from serial_reader import ImuSample


@dataclass
class MotionEstimate:
    velocity_mps: float
    linear_accel_axis_mps2: float
    pitch_deg: float
    roll_deg: float
    stationary: bool


class GravityCompensatedVelocityEstimator:
    """Complementary-filter pitch/roll estimate plus gravity-compensated velocity.

    This is intentionally practical rather than perfect. The filter integrates
    gyro pitch/roll rates for short-term responsiveness, blends them toward the
    accelerometer tilt estimate to reduce long-term drift, computes the gravity
    vector from the fused orientation, subtracts gravity from the measured
    acceleration, and integrates only the selected axis into velocity.
    """

    GRAVITY_MS2 = 9.80665
    COMPLEMENTARY_ALPHA = 0.98
    DEFAULT_DEADBAND_MS2 = 0.15
    STATIONARY_GYRO_THRESHOLD_DPS = 4.0
    STATIONARY_ACCEL_MAG_TOLERANCE_G = 0.15  # raw accel magnitude must be within 0.15g of 1.0g
    VELOCITY_ZERO_SNAP_MPS = 0.03
    VELOCITY_DAMPING = 0.90
    BIAS_CALIBRATION_SAMPLES = 50  # average first N stationary samples to estimate accel bias

    def __init__(
        self,
        axis: str = "Z",
        drift_suppression_enabled: bool = True,
        deadband_ms2: float = DEFAULT_DEADBAND_MS2,
    ) -> None:
        self.axis = axis.upper()
        self.drift_suppression_enabled = drift_suppression_enabled
        self.deadband_ms2 = deadband_ms2

        self.velocity_mps = 0.0
        self.pitch_rad = 0.0
        self.roll_rad = 0.0
        self.last_timestamp: Optional[float] = None
        self._needs_initial_alignment = True
        # Accel bias calibration: accumulate first N samples, then subtract mean
        self._bias_ax = 0.0
        self._bias_ay = 0.0
        self._bias_az = 0.0
        self._bias_samples: list = []
        self._bias_ready = False

    def set_axis(self, axis: str) -> None:
        self.axis = axis.upper()

    def set_drift_suppression_enabled(self, enabled: bool) -> None:
        self.drift_suppression_enabled = enabled

    def reset(self, sample: Optional[ImuSample] = None) -> None:
        self.velocity_mps = 0.0
        self._bias_ax = 0.0
        self._bias_ay = 0.0
        self._bias_az = 0.0
        self._bias_samples = []
        self._bias_ready = False

        if sample is None:
            self.last_timestamp = None
            self.pitch_rad = 0.0
            self.roll_rad = 0.0
            self._needs_initial_alignment = True
            return

        self.last_timestamp = sample.timestamp
        self.roll_rad, self.pitch_rad = self._accel_roll_pitch(sample)
        self._needs_initial_alignment = False

    def update(self, sample: ImuSample) -> MotionEstimate:
        accel_roll_rad, accel_pitch_rad = self._accel_roll_pitch(sample)
        dt_s = 0.0

        if self._needs_initial_alignment or self.last_timestamp is None:
            self.roll_rad = accel_roll_rad
            self.pitch_rad = accel_pitch_rad
            self.last_timestamp = sample.timestamp
            self._needs_initial_alignment = False
        else:
            dt_s = sample.timestamp - self.last_timestamp
            self.last_timestamp = sample.timestamp

            if 0.0 < dt_s <= 0.5:
                gyro_roll_rate = math.radians(sample.gx)
                gyro_pitch_rate = math.radians(sample.gy)

                predicted_roll = self.roll_rad + gyro_roll_rate * dt_s
                predicted_pitch = self.pitch_rad + gyro_pitch_rate * dt_s

                self.roll_rad = (
                    self.COMPLEMENTARY_ALPHA * predicted_roll
                    + (1.0 - self.COMPLEMENTARY_ALPHA) * accel_roll_rad
                )
                self.pitch_rad = (
                    self.COMPLEMENTARY_ALPHA * predicted_pitch
                    + (1.0 - self.COMPLEMENTARY_ALPHA) * accel_pitch_rad
                )

        # Accumulate bias calibration from the first N samples
        if not self._bias_ready:
            self._bias_samples.append((sample.ax, sample.ay, sample.az))
            if len(self._bias_samples) >= self.BIAS_CALIBRATION_SAMPLES:
                xs, ys, zs = zip(*self._bias_samples)
                mean_ax = sum(xs) / len(xs)
                mean_ay = sum(ys) / len(ys)
                mean_az = sum(zs) / len(zs)
                # Gravity vector at calibration pose (from initial alignment)
                gx_g, gy_g, gz_g = self._gravity_sensor_g()
                # Bias = measured mean minus expected gravity
                self._bias_ax = mean_ax - gx_g
                self._bias_ay = mean_ay - gy_g
                self._bias_az = mean_az - gz_g
                self._bias_ready = True

        gravity_x_g, gravity_y_g, gravity_z_g = self._gravity_sensor_g()

        linear_ax_ms2 = (sample.ax - self._bias_ax - gravity_x_g) * self.GRAVITY_MS2
        linear_ay_ms2 = (sample.ay - self._bias_ay - gravity_y_g) * self.GRAVITY_MS2
        linear_az_ms2 = (sample.az - self._bias_az - gravity_z_g) * self.GRAVITY_MS2

        linear_accel_axis_mps2 = self._select_axis_component(
            linear_ax_ms2, linear_ay_ms2, linear_az_ms2
        )

        stationary = self._is_stationary(
            sample,
            linear_ax_ms2,
            linear_ay_ms2,
            linear_az_ms2,
        )

        if self.drift_suppression_enabled:
            if stationary:
                # When we are likely still, trust the accelerometer tilt estimate,
                # snap velocity to zero, and suppress tiny residual acceleration.
                self.roll_rad = accel_roll_rad
                self.pitch_rad = accel_pitch_rad
                self.velocity_mps = 0.0
                linear_accel_axis_mps2 = 0.0
            elif abs(linear_accel_axis_mps2) < self.deadband_ms2:
                linear_accel_axis_mps2 = 0.0
                self.velocity_mps *= self.VELOCITY_DAMPING
                if abs(self.velocity_mps) < self.VELOCITY_ZERO_SNAP_MPS:
                    self.velocity_mps = 0.0

        if 0.0 < dt_s <= 0.5 and not stationary:
            self.velocity_mps += linear_accel_axis_mps2 * dt_s

        return MotionEstimate(
            velocity_mps=self.velocity_mps,
            linear_accel_axis_mps2=linear_accel_axis_mps2,
            pitch_deg=math.degrees(self.pitch_rad),
            roll_deg=math.degrees(self.roll_rad),
            stationary=stationary,
        )

    def _accel_roll_pitch(self, sample: ImuSample) -> tuple[float, float]:
        roll_rad = math.atan2(sample.ay, sample.az)
        pitch_rad = math.atan2(-sample.ax, math.sqrt(sample.ay * sample.ay + sample.az * sample.az))
        return roll_rad, pitch_rad

    def _gravity_sensor_g(self) -> tuple[float, float, float]:
        cos_pitch = math.cos(self.pitch_rad)
        sin_pitch = math.sin(self.pitch_rad)
        cos_roll = math.cos(self.roll_rad)
        sin_roll = math.sin(self.roll_rad)

        gravity_x_g = -sin_pitch
        gravity_y_g = sin_roll * cos_pitch
        gravity_z_g = cos_roll * cos_pitch
        return gravity_x_g, gravity_y_g, gravity_z_g

    def _select_axis_component(self, ax: float, ay: float, az: float) -> float:
        if self.axis == "X":
            return ax
        if self.axis == "Y":
            return ay
        return az

    def _is_stationary(
        self,
        sample: ImuSample,
        linear_ax_ms2: float,
        linear_ay_ms2: float,
        linear_az_ms2: float,
    ) -> bool:
        # Use raw accel magnitude deviation from 1g — orientation-independent.
        # When stationary, |accel| ≈ 1.0g regardless of sensor tilt.
        # This is robust even when the gravity model has drifted.
        accel_mag_g = math.sqrt(sample.ax ** 2 + sample.ay ** 2 + sample.az ** 2)
        accel_quiet = abs(accel_mag_g - 1.0) < self.STATIONARY_ACCEL_MAG_TOLERANCE_G

        gyro_mag_dps = math.sqrt(sample.gx * sample.gx + sample.gy * sample.gy + sample.gz * sample.gz)
        gyro_quiet = gyro_mag_dps < self.STATIONARY_GYRO_THRESHOLD_DPS
        return accel_quiet and gyro_quiet
