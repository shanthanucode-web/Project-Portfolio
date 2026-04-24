#include <Arduino.h>
#include <Wire.h>
#include <SparkFunLSM6DS3.h>
#include <math.h>

LSM6DS3 imu(I2C_MODE, 0x6A);

// ─── Rep detection constants ──────────────────────────────────────────────────
// How much filtered acceleration (in g) must exceed the resting baseline before
// we consider the bar to be in motion. 0.3g sits well above sensor noise (~0.05g)
// but below the typical powerlifting concentric spike (0.5–2g).
const float REP_THRESHOLD_G = 0.3;

// Number of consecutive samples that must agree before we change rep phase.
// At 50Hz, 3 samples = 60ms — long enough to ignore a single bump or footstep,
// short enough to catch the fast acceleration spike at the start of a lift.
const int DEBOUNCE_SAMPLES = 3;

// How fast the gravity-baseline average tracks slow changes in sensor orientation.
// 0.98 means the average moves very slowly — it follows long-term tilt but ignores
// the fast motion of an actual lift. This is the "high-pass" effect.
const float HP_ALPHA = 0.98;

// ─── Rep detection state ──────────────────────────────────────────────────────
// A rep moves through three phases:
//   IDLE       → bar is not moving (at rest between reps)
//   CONCENTRIC → bar is accelerating (the "lifting" phase — from floor/chest to lockout)
//   LOCKOUT    → bar has decelerated back down; rep is recorded, then resets to IDLE
enum RepPhase { IDLE, CONCENTRIC, LOCKOUT };

RepPhase repPhase  = IDLE;   // which phase the bar is currently in
int      repCount  = 0;      // total completed reps since power-on
uint32_t repStartMs = 0;     // timestamp (ms) when the current rep began
float    peakAccelG = 0.0;   // highest filtered acceleration seen during this rep
int      aboveCount = 0;     // consecutive samples above threshold (for debounce)
int      belowCount = 0;     // consecutive samples below threshold (for debounce)
float    magnitudeAvg = 1.0; // running average of accel magnitude — starts at 1g (gravity at rest)

// ─── Gyro bias calibration ────────────────────────────────────────────────────
// The gyroscope produces a small non-zero output even when perfectly still.
// This is called "bias" or "zero-rate offset". If we don't remove it, integrating
// the gyro over time (to get angle or velocity) causes the estimate to drift.
// We measure the bias at startup — while the sensor is stationary — and subtract
// it from every subsequent gyro reading.
float gyroBiasX = 0.0;
float gyroBiasY = 0.0;
float gyroBiasZ = 0.0;

// ─────────────────────────────────────────────────────────────────────────────
// calibrateGyro()
// Collects 100 samples while the sensor is stationary (~2 seconds at 50Hz) and
// averages them to find the gyro's resting offset. Must be called before the
// main loop starts, with the sensor sitting completely still on a flat surface.
// ─────────────────────────────────────────────────────────────────────────────
void calibrateGyro() {
  Serial.println("Calibrating gyro — keep sensor still for 2 seconds...");

  const int N = 100;       // number of samples to average
  double sumX = 0, sumY = 0, sumZ = 0;

  for (int i = 0; i < N; i++) {
    sumX += imu.readFloatGyroX();
    sumY += imu.readFloatGyroY();
    sumZ += imu.readFloatGyroZ();
    delay(20); // match the main loop rate (50Hz) so the average is representative
  }

  // Store the average as the bias — we'll subtract this from every gyro reading
  gyroBiasX = sumX / N;
  gyroBiasY = sumY / N;
  gyroBiasZ = sumZ / N;

  Serial.printf("Gyro bias: X=%.3f  Y=%.3f  Z=%.3f dps\n",
    gyroBiasX, gyroBiasY, gyroBiasZ);
}

// ─────────────────────────────────────────────────────────────────────────────
// detectRep(ax, ay, az)
// Called every sample with the current accelerometer readings (in g).
// Runs a simple state machine to detect when a powerlifting rep starts and ends.
// When a rep completes, prints a REP summary line to serial.
// ─────────────────────────────────────────────────────────────────────────────
void detectRep(float ax, float ay, float az) {

  // Step 1 — Compute total acceleration magnitude.
  // Combining X, Y, Z into one number means rep detection works regardless of
  // how the sensor is mounted on the bar (no need to align any specific axis).
  float magnitude = sqrt(ax*ax + ay*ay + az*az);

  // Step 2 — High-pass filter: remove gravity from the signal.
  // At rest the magnitude is ~1g (gravity). We track a slow-moving average of
  // the magnitude; subtracting it leaves only the dynamic bar movement.
  // Think of it as: "how much MORE than normal gravity is the bar experiencing?"
  magnitudeAvg = HP_ALPHA * magnitudeAvg + (1.0 - HP_ALPHA) * magnitude;
  float filtered = magnitude - magnitudeAvg;

  // Step 3 & 4 — State machine: detect rep START and END.

  if (repPhase == IDLE) {
    // Bar is at rest. Watch for acceleration rising above the threshold.
    if (filtered > REP_THRESHOLD_G) {
      aboveCount++;
      if (aboveCount >= DEBOUNCE_SAMPLES) {
        // Confirmed: bar has started moving upward. Rep begins now.
        repPhase   = CONCENTRIC;
        repStartMs = millis();  // record when this rep started
        peakAccelG = filtered;  // start tracking peak acceleration
        aboveCount = 0;
      }
    } else {
      aboveCount = 0; // not enough consecutive samples — probably noise, reset counter
    }
  }

  else if (repPhase == CONCENTRIC) {
    // Bar is in motion. Track the highest acceleration seen during this rep —
    // this correlates with bar velocity (faster lifts = higher peak accel).
    if (filtered > peakAccelG) peakAccelG = filtered;

    // Watch for the bar to decelerate back below threshold (rep ending at lockout).
    if (filtered < REP_THRESHOLD_G) {
      belowCount++;
      if (belowCount >= DEBOUNCE_SAMPLES) {
        // Confirmed: bar has stopped. The rep is complete.
        repPhase   = LOCKOUT;
        belowCount = 0;
      }
    } else {
      belowCount = 0;
    }
  }

  else if (repPhase == LOCKOUT) {
    // Rep is complete — record it and broadcast the summary.
    repCount++;
    uint32_t durationMs = millis() - repStartMs;

    // Print a REP summary line immediately after the CSV stream.
    // The format is intentionally different from CSV so the Python app and future
    // BLE layer can distinguish rep events from raw sensor data without any
    // changes to the normal streaming format.
    // Format: REP,<rep_number>,<duration_ms>,<peak_accel_g>
    // Example: REP,3,1240,1.87
    Serial.printf("REP,%d,%lu,%.2f\n", repCount, durationMs, peakAccelG);

    repPhase = IDLE; // reset — ready to detect the next rep
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// setup()
// Runs once on power-on. Initialises serial, I2C, IMU, and gyro calibration.
// ─────────────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  while (!Serial) delay(10); // wait for USB serial — required on ESP32-C3 Super Mini

  delay(500); // short pause so the host has time to open the serial monitor

  Wire.begin(8, 9); // start I2C bus on SDA=GPIO8, SCL=GPIO9

  if (imu.begin() != 0) {
    Serial.println("IMU init failed. Check wiring.");
    while (1); // halt — nothing else will work without the sensor
  }

  // Calibrate the gyro before streaming begins.
  // The bar (and sensor) must be completely still during these ~2 seconds.
  calibrateGyro();

  Serial.println("IMU ready!"); // signals to the Python parser that CSV stream is starting
}

// ─────────────────────────────────────────────────────────────────────────────
// loop()
// Runs continuously at 50Hz. Reads IMU, streams CSV, and runs rep detection.
// ─────────────────────────────────────────────────────────────────────────────
void loop() {
  // Read all sensor axes. Subtract the calibrated gyro bias so gyro readings
  // are zero when stationary, preventing velocity estimates from drifting.
  float ax   = imu.readFloatAccelX();
  float ay   = imu.readFloatAccelY();
  float az   = imu.readFloatAccelZ();
  float gx   = imu.readFloatGyroX() - gyroBiasX; // bias-corrected gyro X
  float gy   = imu.readFloatGyroY() - gyroBiasY; // bias-corrected gyro Y
  float gz   = imu.readFloatGyroZ() - gyroBiasZ; // bias-corrected gyro Z
  float temp = imu.readTempC();

  // Stream the raw sensor data as CSV. This is the format the Python GUI expects
  // and must not change — field order and count are fixed.
  Serial.printf("%.4f,%.4f,%.4f,%.4f,%.4f,%.4f,%.2f\n",
    ax, ay, az, gx, gy, gz, temp
  );

  // Run rep detection. If a rep completes this sample, detectRep() will print
  // a REP summary line immediately after the CSV line above.
  detectRep(ax, ay, az);

  // 20ms delay = 50Hz sample rate. This is 5x faster than the original 10Hz and
  // gives enough resolution to catch the sharp acceleration spike (~100–200ms)
  // at the start of a powerlifting rep.
  delay(20);
}
