# 节次驱动课堂自动匹配实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让教室设备按日期、教室和第几节课自动确定当前课堂，并支持客户端创建仅对本节生效的临时调课。

**Architecture:** 在现有 SQLite 模型上增加学校级节次配置和临时调课表；固定课表继续保存教师、班级、课程，但以 `period` 为主并由服务端生成时间。设备状态接口统一返回“当前课堂实例”，临时调课优先于固定课表；桌面端轮询状态，在课堂切换时自动刷新并打开面板。

**Tech Stack:** Node.js 24 `node:sqlite`、原生 HTTP 服务、Electron、原生 HTML/CSS/JS、Node test runner。

## Global Constraints

- 不新增第三方依赖。
- 保留旧课表 `start/end` 数据的读取兼容性。
- 教师正常上课不需要登录或手动选班级。
- 临时调课不修改固定课表，且必须可审计。
- 记录必须保存实际课堂实例的班级、教师、课程、教室快照。

### Task 1: 数据库迁移与节次模型

**Files:**
- Modify: `lib/db.js`
- Create: `docs/superpowers/specs/2026-09-06-classroom-session-design.md` (already present)

**Interfaces:**
- Produce `setting('periods')` default list and `schedule.period` nullable column.
- Produce `temporary_adjustments` table with room/date/period and replacement lesson fields.

- [ ] **Step 1: Add migration-safe schema changes**

在建表 SQL 中增加 `period INTEGER`；数据库初始化后检测旧表列并执行 `ALTER TABLE schedule ADD COLUMN period INTEGER`。创建 `temporary_adjustments` 表，唯一键为 `room_id,date,period`，并保存 `source_schedule_id`, `class_id`, `teacher`, `subject`, `reason`, `created_by`, `created_at`。

- [ ] **Step 2: Add default periods setting**

当 `settings.periods` 不存在时写入 1—8 节的默认时间，格式为 `[{number:1,start:'08:00',end:'08:40'}, ...]`，管理员可后续修改。

- [ ] **Step 3: Run syntax check**

Run: `node --check lib/db.js`
Expected: exit code 0。

### Task 2: 服务端节次匹配与临时调课 API

**Files:**
- Modify: `server.js`
- Modify: `lib/db.js`
- Modify: `templates/schedule.csv`

**Interfaces:**
- `slots(roomId, date)` returns lessons with `period` and uses configured period times.
- `resolveLesson(roomId, at)` returns `{lesson, source, conflict, period}`.
- `POST /api/device/adjustments` accepts `{date,period,scheduleId,reason}` using device auth.
- `GET /api/device/adjustments/options?date=...&period=...` returns candidate lessons for the device room.

- [ ] **Step 1: Write failing integration tests**

Add tests covering period-only schedule import, current lesson resolution, duplicate current lesson conflict, temporary adjustment priority, and automatic fallback to fixed schedule after a different period/date is requested.

- [ ] **Step 2: Update schedule normalization**

Accept `节次`/`period`/`课次`; when present validate integer 1—20 and derive `start/end` from configured periods. When absent preserve legacy `start/end` imports and infer a matching period when possible. Reject rows missing both period and valid times.

- [ ] **Step 3: Implement resolver**

Use Beijing local date/time, derive active period from `settings.periods`, apply date and odd/even week filters, query temporary adjustment first, then fixed schedule. Return a conflict state instead of selecting the first overlapping row.

- [ ] **Step 4: Expose device state**

Return `periods`, `currentLesson`, `currentSource`, `currentConflict`, and `currentPeriod` in `/api/device/state`; keep `current` and legacy schedule payloads for compatibility.

- [ ] **Step 5: Add temporary adjustment endpoints**

Options endpoint lists only lessons valid for the device room/date/period. Create endpoint validates device, date, period, candidate schedule belongs to the same room, writes or replaces the adjustment, audits it, and returns the resolved lesson. No endpoint mutates `schedule`.

- [ ] **Step 6: Update import template and validation messages**

Change `templates/schedule.csv` headers to include `节次` and remove required start/end fields while retaining optional legacy columns in parser support.

- [ ] **Step 7: Run integration tests**

Run: `npm test`
Expected: all existing and new tests pass。

### Task 3: Desktop auto-open and temporary adjustment UI

**Files:**
- Modify: `desktop/main.cjs`
- Modify: `desktop/panel.html`
- Modify: `desktop/panel.js`
- Modify: `desktop/panel.css`

**Interfaces:**
- Desktop state polling calls `/api/device/state` every 15 seconds.
- Panel displays current period, class, teacher and subject from `currentLesson`.
- `调换课` dialog calls the two device adjustment endpoints and reloads state.

- [ ] **Step 1: Add UI controls**

Add current lesson metadata and a `调换课` button/dialog. The dialog has date defaulting to today, period selector populated from server periods, candidate complete lessons, optional reason, and confirm/cancel actions. Do not expose start/end inputs.

- [ ] **Step 2: Add desktop IPC request support**

Add `desktop.call('adjust-options', payload)` and `desktop.call('adjust', payload)` handlers in `main.cjs`, both using the bound device token and current server URL.

- [ ] **Step 3: Add polling and transition detection**

When a new `currentLesson` or conflict state differs from the previous state, send state to the panel and show it. If a valid lesson begins and the panel is hidden, open it automatically once per lesson transition. Keep manual toggle behavior unchanged.

- [ ] **Step 4: Render lesson state and adjustment flow**

Update `panel.js` to render current lesson, disable student selection during conflicts/no-class, populate candidate options, submit adjustment, then reload seats. Preserve offline cache behavior for recording.

- [ ] **Step 5: Style and copy**

Add compact dialog styles and clear states: `按第N节自动匹配`, `临时调课已生效`, `当前无课`, `课表冲突，请联系管理员`。

- [ ] **Step 6: Run desktop syntax checks**

Run: `node --check desktop/main.cjs && node --check desktop/panel.js`
Expected: exit code 0。

### Task 4: Web classroom compatibility and documentation

**Files:**
- Modify: `public/classroom.js`
- Modify: `public/classroom.html`
- Modify: `README.md`
- Modify: `快速开始.md`

**Interfaces:**
- Web classroom consumes the enriched `/api/device/state` payload.

- [ ] **Step 1: Render current lesson safely**

Use `currentLesson` and `currentConflict`; do not assume `current[0]` is correct. Show no-class/conflict states and only enable the matching class seat grid.

- [ ] **Step 2: Document required materials**

Document teacher roster, class/student roster, room/device mapping, period definitions, fixed schedule with period, seats, and temporary adjustment workflow. Explicitly state that normal teaching is zero-operation and teacher identity is timetable-based.

- [ ] **Step 3: Run source checks**

Run: `for f in server.js lib/*.js public/*.js desktop/*.js; do node --check "$f"; done`
Expected: exit code 0。

### Task 5: Full verification

**Files:**
- Modify: `tests/integration.test.js`

- [ ] **Step 1: Run complete tests**

Run: `npm test`
Expected: all tests pass with no failures。

- [ ] **Step 2: Verify database migration against existing data**

Start the server with the existing `data/` directory, call `/api/health`, and call `/api/device/state` with an existing valid token or a temporary isolated device fixture. Confirm the process starts and legacy schedule rows remain readable.

- [ ] **Step 3: Record known limits**

Confirm Electron visual/microphone behavior and real provider behavior remain environment-dependent; report these as not-tested if unavailable in this workspace.
