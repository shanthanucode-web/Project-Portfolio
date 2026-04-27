# Agent Notes

## Project Overview

Coach NOVA / BarbellBuddy is a Vite/React frontend paired with a Python/PySide6 hardware bridge for ESP32 IMU workout data. The current target loop is:

```text
ESP32-C3 + LSM6DS3 -> USB serial -> Python bridge -> WebSocket -> React session state -> Vite AI backend -> OpenAI Responses API
```

- Frontend entrypoint: `src/index.jsx`
- Main React app: `src/App.jsx`
- Vite config: `vite.config.mjs`
- Vitest config: `vitest.config.mjs`
- Python GUI/bridge entrypoint: `app/main.py`
- WebSocket bridge: `app/live_bridge.py`
- Serial IMU reader: `app/serial_reader.py`
- Firmware entrypoint: `src/main.cpp`

## Run Commands

Install frontend dependencies from the lockfile:

```bash
npm ci --include=dev
```

Start the frontend:

```bash
npm start
```

Open:

```text
http://127.0.0.1:3000
```

Prefer `npm start` without `--force` for normal work. `npm start -- --force` forces Vite dependency re-optimization and can make startup take 30+ seconds. Use it only when dependency prebundling is genuinely stale.

Start the Python hardware GUI/bridge in a separate terminal:

```bash
python3 app/main.py
```

In the Python GUI, select the ESP32 serial port, keep baud at `115200`, and click `Connect`.

## Current Frontend/AI Behavior

React owns workout/session state, calibration, alerts, and AI trigger orchestration.

- Fixed demo athlete: Jane Doe.
- Calibration is stored in browser storage under `coachNova.calibration.v1`.
- First completed hardware set for an exercise becomes the baseline when no baseline exists.
- Later sets compare against the stored baseline for alert context.
- AI triggers handled by React:
  - `POST_SET` after a real WebSocket `set_summary`
  - `POST_WORKOUT` when the athlete finishes the workout
  - `ATHLETE_MESSAGE` when the athlete sends a coach/chat message

Vite owns OpenAI calls through local API routes:

- `POST /api/coach`
- `POST /api/openai`

The OpenAI import is intentionally dynamic inside request handling so Vitest/config startup does not import the OpenAI package.

The current `/api/coach` route uses the Responses API prompt:

```text
prompt ID: pmpt_69eeba8541c88194b6f50f216d4fe82e05db3bc50f219040
version: 1
```

`OPENAI_API_KEY` must stay server-side in `.env`. Missing key should return a local fallback response instead of crashing the app.

## Hardware Bridge Behavior

The frontend attempts to connect to:

```text
ws://127.0.0.1:8765
ws://localhost:8765
```

If the bridge is unavailable, the app falls back to demo mode. Failed WebSocket console errors for port `8765` are expected when `python3 app/main.py` is not running or no bridge is available.

The firmware serial format expected by `SerialImuSource` is:

```text
ax,ay,az,gx,gy,gz,temp
```

Rep events are expected as:

```text
REP,<rep_number>,<duration_ms>,<peak_accel_g>
```

Python should remain signal processing only during live sessions. OpenAI coaching should go through the Vite backend, not Python-side live-session calls.

Set summaries are the canonical frontend trigger for post-set AI. The Python analyzer is expected to support target-rep finalization plus rest-based automatic finalization after completed reps and several seconds of near-stationary/rest state.

## Vite Dev Server Notes

The blank-page failure was not caused by React rendering or the hardware WebSocket. Vite was serving `index.html`, then hanging while transforming app modules such as `/src/index.jsx` and `/src/App.jsx`.

Current `vite.config.mjs` mitigations:

- `server.host` is pinned to `127.0.0.1`.
- `server.strictPort` is enabled for port `3000`.
- `server.hmr` is disabled because the hang was in the React dev Fast Refresh/Babel transform path.
- OpenAI middleware is mounted only on `/api/coach` and `/api/openai`, so normal Vite asset/module requests bypass it.
- `node_modules.broken-*` folders are ignored by the dev server watcher.

Expected normal startup is usually under a few seconds after dependencies are already optimized. A 30+ second startup usually means Vite is rebuilding dependency prebundles, often because `--force` was used, `node_modules/.vite` was deleted, dependencies changed, or the cache was invalidated.

## Important Local Gotchas

Do not keep broken or backup `node_modules` folders inside the Vite project root. Directories like `node_modules.broken-*` can cause Vite to scan huge dependency trees and hang while serving `localhost:3000`.

Broken dependency backups were moved outside the project root to:

```text
/Users/shanthanu/Documents/BarbellBuddy-node-modules-backups
```

`vite.config.mjs` also ignores `node_modules.broken-*` in the dev server watcher, but the safest state is still to keep those folders outside the repo root.

`localhost` can resolve through IPv6 first on macOS. Use the exact Vite URL printed by the server, currently:

```text
http://127.0.0.1:3000/
```

When the Python bridge is not running, browser console WebSocket errors for `ws://127.0.0.1:8765` and `ws://localhost:8765` are expected and should not blank the page.

## Vitest Notes

Vitest previously appeared to hang for two separate reasons:

- `vite.config.mjs` imported `openai` at top level, and importing that package was slow in this environment.
- The old app smoke test rendered the full app and could open live WebSocket/timer paths.

Current test isolation:

- `vitest.config.mjs` uses the Node environment instead of jsdom.
- App smoke testing imports the module with mocks and avoids opening a real live bridge.
- `src/liveBridge.test.js` unit-tests bridge retry behavior with a fake WebSocket.
- OpenAI is dynamically imported only inside API request handling.

## Verification

Useful checks:

```bash
node --input-type=module -e "console.time('config'); import('./vite.config.mjs').then(() => console.timeEnd('config'))"
npx vitest list --reporter=verbose
npm test
npm run build
rg '<{7}|={7}|>{7}' .
```

Expected passing state:

- Config import completes quickly, around hundreds of milliseconds.
- `npx vitest list --reporter=verbose` exits and lists tests.
- `npm test` passes `src/App.test.jsx` and `src/liveBridge.test.js`.
- `npm run build` completes successfully.
- `curl -I http://127.0.0.1:3000/` returns `200 OK` when Vite is running.
- Browser renders the Coach Nova home dashboard with the top nav and training cards.

Last verified state from the Vite blank-page fix:

- Config import: about `150ms`.
- `npm test`: 2 test files passed.
- `npm run build`: passed.
- Playwright browser snapshot rendered the Coach Nova home dashboard.
