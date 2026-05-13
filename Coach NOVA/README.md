# Coach NOVA

**AI-augmented wearable coaching platform for competitive powerlifters.**

UC Berkeley ME292C / DESINV 190: Human-AI Design Methods · HP Partnership

---

## Overview

Coach NOVA is a real-time AI coaching system that combines a barbell-mounted wearable sensor, a Python signal processing bridge, and a React training dashboard to deliver the experience of working with a professional strength coach — without one physically present.

The system senses every rep through a 6-axis IMU mounted on the barbell, extracts velocity, tilt, and fatigue metrics in real time, and feeds structured session data to an AI coach that provides personalized, data-backed feedback after each set and at the end of every workout. Athletes can also message the coach mid-workout at any time.

**Primary users:** Competitive and semi-competitive powerlifters training without consistent coach access.

**Secondary users:** Coaches and trainers who need consolidated athlete performance data across sessions.

---

## System Architecture

```
ESP32-C3 + LSM6DS3 IMU (barbell-mounted)
  │
  │  USB serial at 115200 baud
  ▼
Python PySide6 bridge + signal processor (app/main.py)
  │  - Complementary filter / gravity compensation
  │  - Rep phase validation (descent + ascent detection)
  │  - Set auto-finalization (rest detection)
  │
  │  WebSocket  ws://127.0.0.1:8765
  ▼
React + Vite frontend  http://localhost:3000
  │  - Live workout UI (rep counter, velocity, tilt, session timer)
  │  - Calibration baseline management
  │  - Session history accumulation
  │
  │  POST /api/coach
  ▼
Vite backend → OpenAI Responses API
  │  - Post-set feedback (automatic)
  │  - Post-workout summary (automatic)
  │  - On-demand athlete prompts (mid-workout chat)
```

---

## Hardware

### Components

| Component | Part |
|---|---|
| Microcontroller | ESP32-C3 Super Mini |
| IMU | LSM6DS3 6-axis (SparkFun breakout) |
| Connection | USB-C (serial at 115200 baud) |

### Wiring

| LSM6DS3 Pin | ESP32-C3 Pin | Notes |
|---|---|---|
| VIN | 3.3V | Do not use 5V |
| GND | GND | Common ground |
| SDA | GPIO8 | I2C data |
| SCL | GPIO9 | I2C clock |
| CS | 3.3V | Tie HIGH for I2C mode |
| SAO | GND | Tie LOW → I2C address 0x6A |

The SparkFun LSM6DS3 breakout includes I2C pull-up resistors. No external pull-ups required.

---

## Prerequisites

Install the following before proceeding. Instructions are provided for both macOS and Windows.

### 1. Git

**macOS:** Git is included with Xcode Command Line Tools.
```bash
xcode-select --install
```

**Windows:** Download and install from [git-scm.com](https://git-scm.com/download/win). Use all default options during installation.

---

### 2. Node.js (v18 or later)

**macOS:**
```bash
# Install using Homebrew (recommended)
brew install node

# Verify
node --version
npm --version
```

**Windows:** Download the LTS installer from [nodejs.org](https://nodejs.org). Run the installer and accept all defaults. Verify in a new terminal:
```cmd
node --version
npm --version
```

---

### 3. Python 3.10 or later

**macOS:**
```bash
brew install python3

# Verify
python3 --version
```

**Windows:** Download from [python.org](https://www.python.org/downloads/). During installation, check **"Add Python to PATH"** before clicking Install. Verify in a new terminal:
```cmd
python --version
```

---

### 4. Python dependencies

**macOS:**
```bash
pip3 install PySide6 pyqtgraph pyserial --break-system-packages
```

**Windows:**
```cmd
pip install PySide6 pyqtgraph pyserial
```

---

### 5. PlatformIO (for firmware flashing only)

PlatformIO is required to compile and flash the ESP32-C3 firmware. If you are not flashing firmware and the ESP32 is already programmed, skip this section.

**macOS and Windows (recommended — VS Code extension):**

1. Install [Visual Studio Code](https://code.visualstudio.com/)
2. Open VS Code → Extensions (Cmd+Shift+X / Ctrl+Shift+X)
3. Search **PlatformIO IDE** and install it
4. Restart VS Code after installation

**macOS (command line alternative):**
```bash
pip3 install platformio --break-system-packages

# Verify
pio --version
```

**Windows (command line alternative):**
```cmd
pip install platformio

# Verify
pio --version
```

---

### 6. OpenAI API key

The AI coach requires an OpenAI API key. Obtain one at [platform.openai.com](https://platform.openai.com).

Create a `.env` file in the project root:
```
OPENAI_API_KEY=your_key_here
```

The key is loaded by the Vite backend at runtime. It is never exposed to the browser.

---

## Installation

### Clone the repository

**macOS:**
```bash
git clone https://github.com/dakkameka/BarbellBuddy.git
cd BarbellBuddy
git checkout shanthanu-main
```

**Windows (Git Bash or PowerShell):**
```cmd
git clone https://github.com/dakkameka/BarbellBuddy.git
cd BarbellBuddy
git checkout shanthanu-main
```

---

### Install frontend dependencies

```bash
npm ci --include=dev
```

This installs all Node.js packages from the lockfile. Run this once after cloning and again any time `package.json` changes.

---

## Flashing the Firmware

Skip this section if the ESP32-C3 is already programmed.

### Using VS Code + PlatformIO

1. Open the project folder in VS Code
2. PlatformIO will detect `platformio.ini` automatically
3. Connect the ESP32-C3 via USB-C
4. Click the **Upload** button (→ arrow) in the PlatformIO toolbar at the bottom of VS Code
5. Wait for "SUCCESS" in the terminal output

### Using the command line

```bash
# macOS
pio run --target upload

# Windows
pio run --target upload
```

If the upload fails, verify the ESP32-C3 is in flash mode. Hold the BOOT button on the ESP32-C3 while pressing RESET, then retry the upload.

### Verify firmware is running

**macOS:**
```bash
# List available serial ports — look for usbmodem or usbserial
ls /dev/cu.*

# Monitor serial output
pio device monitor --baud 115200
```

**Windows:**
1. Open Device Manager → Ports (COM & LPT)
2. Note the COM port number (e.g., COM3)
3. In PlatformIO terminal: `pio device monitor --baud 115200`

You should see a stream of comma-separated IMU values:
```
0.0123,-0.0041,1.0024,0.1200,-0.0300,0.0800,24.50
0.0118,-0.0039,1.0021,0.1180,-0.0310,0.0790,24.52
```

Press Ctrl+C to stop monitoring.

---

## Running the Application

The application requires two processes running simultaneously: the Python bridge and the React frontend.

### Terminal 1 — React frontend

**macOS:**
```bash
npm start
```

**Windows:**
```cmd
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser. The app starts in demo mode (simulated data) if the Python bridge is not yet connected.

---

### Terminal 2 — Python bridge

**macOS:**
```bash
python3 app/main.py
```

**Windows:**
```cmd
python app/main.py
```

The Python GUI window will open. Follow these steps:

1. Click **Refresh Ports** to scan for connected serial devices
2. Select the ESP32-C3 port from the dropdown
   - macOS: typically `/dev/cu.usbmodem101` or similar
   - Windows: typically `COM3`, `COM4`, or similar
3. Confirm baud rate is set to `115200`
4. Click **Connect**
5. The status bar should turn green: `Connected to [port] @ 115200 baud`

Once connected, return to the browser. The frontend will automatically detect the Python bridge and switch from demo mode to live hardware mode. You will see **BRIDGE CONNECTED** and **IMU SOURCE CONNECTED** in the top right of the live workout screen.

---

## Starting a Workout

1. On the home screen, click **Start workout**
2. A setup modal will appear — enter your planned number of sets and target reps per set
3. Confirm to enter the live workout screen
4. Mount the sensor on the barbell and get into position
5. **Perform your first rep** — the system will detect it automatically and begin tracking
6. Complete your set. The system auto-finalizes after approximately 3.5 seconds of rest
7. Coach NOVA feedback will appear in the coach panel
8. Click **Start next set** to begin the next set without touching the Python GUI
9. After your final planned set, click **Review summary** to see the post-workout report
10. Click **Log workout** to save the session and return home

---

## Running Tests

```bash
# Frontend tests
npm test

# Python tests
python3 -m unittest discover -s tests   # macOS
python -m unittest discover -s tests    # Windows

# Build verification
npm run build
```

---

## Troubleshooting

### Browser shows blank page after `npm start`

A stale Vite process may be holding port 3000.

**macOS:**
```bash
lsof -ti:3000 | xargs kill -9
npm start
```

**Windows (PowerShell):**
```powershell
netstat -ano | findstr :3000
taskkill /PID <PID_NUMBER> /F
npm start
```

---

### Python bridge does not connect

- Verify the ESP32-C3 appears as a serial device (see Flashing section above)
- Verify the correct port is selected in the Python GUI
- Verify baud rate is 115200
- Verify the firmware is running (open serial monitor and confirm CSV data is streaming)
- Verify wiring: CS tied HIGH, SAO tied LOW

---

### No reps detected during workout

- Confirm the sensor is mounted securely on the barbell — it should not rotate or slide
- Confirm the velocity axis in the Python GUI is set to **Z** (vertical)
- Perform a slow, controlled rep with a clear descent and ascent phase
- The system validates reps by detecting both a descent (negative velocity) and ascent (positive velocity) — erratic or partial movements will not register

---

### AI coach shows "Backend pending" and never responds

- Verify `OPENAI_API_KEY` is set in your `.env` file
- Verify `npm start` is running (the Vite backend handles API calls)
- Check the browser console for network errors on `POST /api/coach`

---

### `npm ci` fails with dependency errors

```bash
rm -rf node_modules
npm ci --include=dev
```

If `node_modules.broken-*` folders exist in the project root, move them outside the project directory. Vite can scan these and hang.

---

## Project Structure

```
BarbellBuddy/
├── src/                        # ESP32 firmware (PlatformIO)
│   └── main.cpp
├── platformio.ini              # Firmware build config
├── app/                        # Python bridge and signal processor
│   ├── main.py                 # PySide6 GUI, serial reader, bridge
│   ├── live_bridge.py          # WebSocket server
│   ├── serial_reader.py        # Serial parser and rep event detection
│   ├── motion_estimator.py     # Complementary filter, velocity integration
│   ├── set_analyzer.py         # Rep validation, set summary, fatigue scoring
│   └── session_logger.py       # Session data logging
├── src/                        # React frontend
│   ├── App.jsx                 # Root component, workout state, AI triggers
│   ├── liveBridge.js           # WebSocket client
│   ├── calibration.js          # Baseline storage and alert logic
│   ├── coachClient.js          # AI coach API client
│   └── pages/
│       ├── HomePage.jsx
│       ├── LiveWorkoutPage.jsx
│       ├── WorkoutSummaryPage.jsx
│       ├── ChatPage.jsx
│       ├── NutritionPage.jsx
│       ├── CalendarPage.jsx
│       └── ProfilePage.jsx
├── vite.config.mjs             # Vite config + /api/coach backend route
├── vitest.config.mjs           # Test config
├── tests/                      # Python unit tests
│   └── test_set_analyzer.py
└── .env                        # API keys (not committed)
```

---

## Serial Protocol Reference

**Raw IMU stream** (50 Hz):
```
ax,ay,az,gx,gy,gz,temp
```

**Rep event:**
```
REP,<rep_number>,<duration_ms>,<peak_accel_g>
```

**Example:**
```
0.0123,-0.0041,1.0024,0.1200,-0.0300,0.0800,24.50
REP,3,1240,1.87
```

---

## Notes for Developers

- Keep `node_modules` backup folders outside the repository root or Vite will hang on startup
- The firmware serial format in `main.cpp` and the parser in `app/serial_reader.py` must stay in sync — change both together or not at all
- The WebSocket message contract between `app/live_bridge.py` and `src/liveBridge.js` must stay stable when modifying live workout behavior
- All OpenAI API calls go through the Vite backend (`vite.config.mjs`) — the API key must never appear in frontend code
- The published OpenAI prompt ID is `pmpt_69eeba8541c88194b6f50f216d4fe82e05db3bc50f219040` — update the version number in `vite.config.mjs` when the prompt is revised on the platform