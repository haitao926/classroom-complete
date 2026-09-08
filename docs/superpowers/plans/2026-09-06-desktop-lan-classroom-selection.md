# Desktop LAN Classroom Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the desktop app use the fixed school server, ask for a classroom only on first launch, and use the main action for temporary class changes.

**Architecture:** The desktop client uses `http://10.15.46.72:8020/` as its immutable server origin. A public classroom listing endpoint supports first-run selection; subsequent state, adjustment, and record requests carry the saved room id in a LAN header. Existing device-token requests remain compatible for web clients and older installations.

**Tech Stack:** Node.js native HTTP server, SQLite, Electron, native HTML/CSS/JavaScript, Node test runner, electron-builder.

## Global Constraints

- No activation code or new dependency.
- The classroom is selected once and persisted in Electron user data.
- The daily header action is `调课`; server and device credential fields are not shown.
- The fixed server origin is `http://10.15.46.72:8020/`.
- Existing token-authenticated web and desktop clients remain supported.

### Task 1: LAN classroom API

**Files:** `server.js`, `tests/periods.test.js`

- [ ] Add `GET /api/device/rooms` returning `{rooms:[{id,name}]}` without login.
- [ ] Resolve a LAN room from `X-Classroom-Room` and use it for state, adjustments, and record creation when no device token is supplied.
- [ ] Preserve token precedence and reject unknown/inactive room ids.
- [ ] Add an integration assertion for room selection and room-scoped state.

### Task 2: Desktop first-run flow

**Files:** `desktop/main.cjs`, `desktop/panel.html`, `desktop/panel.js`, `desktop/panel.css`

- [ ] Replace the configurable server/token form with a first-run classroom selector loaded from `/api/device/rooms`.
- [ ] Persist `roomId` and `room` in settings; force the fixed server origin on load.
- [ ] Send `X-Classroom-Room` on state, adjustment, record, and queue-flush requests.
- [ ] Replace the gear action with `调课`; expose classroom re-selection only from the orb context menu.

### Task 3: Verification and packaging

**Files:** `desktop/打包Mac安装包.sh`, generated `desktop/dist/*`

- [ ] Run server tests and desktop syntax checks.
- [ ] Build the Apple Silicon DMG with the fixed server configuration.
- [ ] Verify DMG checksum and packaged source files.
