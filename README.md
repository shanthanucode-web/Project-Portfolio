# Coach NOVA

AI-augmented wearable coaching platform for competitive powerlifters.

UC Berkeley ME292C / DESINV 190: Human-AI Design Methods · HP Partnership

BarbellBuddy is the working implementation of Coach NOVA. The system combines an ESP32-C3 wearable IMU, a Python serial/WebSocket bridge, a React training dashboard, and AI-generated coaching feedback.

## System Architecture

```text
ESP32-C3 + LSM6DS3
  -> USB serial IMU stream
  -> Python PySide6 bridge and visualizer
  -> WebSocket bridge at ws://127.0.0.1:8765
  -> React/Vite frontend at http://localhost:3000
  -> live workout UI, rep history, set summaries, and Coach NOVA feedback
```

Core paths:

- Firmware: `src/main.cpp`
- Firmware config: `platformio.ini`
- Python GUI and serial bridge: `app/main.py`
- WebSocket bridge: `app/live_bridge.py`
- Serial parser: `app/serial_reader.py`
- React app: `src/App.jsx`
- Frontend bridge client: `src/liveBridge.js`

## Hardware Wiring

The wearable uses an ESP32-C3 Super Mini and an LSM6DS3 6-axis IMU breakout over I2C.

| LSM6DS3 Pin | ESP32-C3 Connection | Notes |
| --- | --- | --- |
| `VIN` | `3.3V` | Power the sensor at 3.3V, not 5V. |
| `GND` | `GND` | Common ground. |
| `SDA` | `GPIO8` | I2C data line. |
| `SCL` | `GPIO9` | I2C clock line. |
| `CS` | `3.3V` | Tie HIGH to select I2C mode. |
| `SAO` | `GND` | Tie LOW to use I2C address `0x6A`. |

The firmware initializes I2C with:

```cpp
Wire.begin(8, 9);
LSM6DS3 imu(I2C_MODE, 0x6A);
```

The SparkFun LSM6DS3 breakout includes I2C pull-up resistors, so external pull-ups are not required for the current board.

## Firmware

The PlatformIO environment is:

```ini
[env:esp32-c3-devkitm-1]
platform = espressif32
board = esp32-c3-devkitm-1
framework = arduino
monitor_speed = 115200
```

The firmware:

- reads accelerometer, gyroscope, and temperature data at 50 Hz
- calibrates gyroscope bias on boot
- streams raw IMU data over USB serial
- runs a simple acceleration-threshold rep detector
- emits rep summary events after completed reps

Serial baud rate:

```text
115200
```

Raw IMU serial format:

```text
ax,ay,az,gx,gy,gz,temp
```

Rep event format:

```text
REP,<rep_number>,<duration_ms>,<peak_accel_g>
```

Example:

```text
0.0123,-0.0041,1.0024,0.1200,-0.0300,0.0800,24.50
REP,3,1240,1.87
```

## Local Startup

Install frontend dependencies:

```bash
npm ci --include=dev
```

Start the React frontend:

```bash
npm start
```

Open:

```text
http://localhost:3000
```

Start the Python GUI and hardware bridge in a second terminal:

```bash
python3 app/main.py
```

In the Python GUI:

1. Select the ESP32 serial port.
2. Keep baud at `115200`.
3. Click `Connect`.
4. Start a workout from the web app or start a set from the Python GUI.

When the Python bridge is running, the frontend connects to:

```text
ws://127.0.0.1:8765
ws://localhost:8765
```

If the bridge is unavailable, the frontend stays in demo mode.

## AI Coaching

The Python app and frontend include AI coaching flows for live workout guidance, post-set feedback, nutrition advice, and schedule adjustment.

For OpenAI-backed features, set:

```bash
OPENAI_API_KEY=...
```

The Vite dev server also includes a local `/api/openai` proxy for frontend calls.

## Verification

Run a production build:

```bash
npm run build
```

Run tests:

```bash
npm test
```

When Vite is running, this should return `200 OK`:

```bash
curl -I http://127.0.0.1:3000/
```

## Troubleshooting

If `npm start` says Vite is ready but the browser stays blank, make sure there are no broken dependency backups inside the repo root:

```text
node_modules.broken-*
```

Move those folders outside the project root. Vite can scan large dependency backup trees and hang while serving modules.

If needed, clear Vite's cache:

```bash
rm -rf node_modules/.vite
npm start -- --force
```

Failed browser console connections to `ws://127.0.0.1:8765` are expected until `python3 app/main.py` is running.

If hardware does not connect:

- verify the ESP32 appears as a serial device
- verify the selected serial port in the Python GUI
- verify baud is `115200`
- verify wiring matches the table above
- verify the firmware is emitting `ax,ay,az,gx,gy,gz,temp`
- verify `CS` is tied HIGH and `SAO` is tied LOW

## Notes for Future Work

- Keep backup `node_modules` folders outside the repository root.
- Keep the firmware serial format stable unless `app/serial_reader.py` is updated at the same time.
- Keep the WebSocket message contract between `app/live_bridge.py` and `src/liveBridge.js` stable when changing live workout behavior.
