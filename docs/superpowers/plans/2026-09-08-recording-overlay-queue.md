# Recording Overlay And Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make recording controls always reachable and make pending uploads observable and independently retryable.

**Architecture:** Add pure queue helpers used by Electron main process, expose queue status over the existing IPC bridge, and render recording/queue dialogs in the existing panel. Preserve the current local JSON queue format while adding optional diagnostic fields.

**Tech Stack:** Electron 34, CommonJS, HTML/CSS/JavaScript, Node test runner, electron-builder.

## Global Constraints

- No new dependencies.
- Preserve existing recordings until the server confirms upload.
- Keep the 520x680 always-on-top panel usable without scrolling to finish a recording.

---

### Task 1: Queue Retry Isolation

**Files:**
- Create: `desktop/queue.js`
- Create: `tests/desktop-queue.test.js`
- Modify: `desktop/main.cjs`

- [ ] Write failing tests for legacy localhost migration and independent retries.
- [ ] Implement address normalization and retry result updates.
- [ ] Wire helpers into the Electron main process and expose queue inspection/retry IPC actions.
- [ ] Run the focused and complete test suites.

### Task 2: Recording Overlay And Queue Dialog

**Files:**
- Modify: `desktop/panel.html`
- Modify: `desktop/panel.css`
- Modify: `desktop/panel.js`

- [ ] Make recording controls a fixed bottom overlay with an always-visible finish action.
- [ ] Make the pending count clickable and render queue details with failure messages.
- [ ] Add saving states and explicit upload outcome copy.
- [ ] Run syntax checks and inspect the packaged application.

### Task 3: Release Packages

**Files:**
- Modify: `desktop/package.json`
- Modify: `desktop/package-lock.json`
- Output: `desktop/dist/课堂随记-0.2.2-win-x64.exe`
- Output: `desktop/dist/课堂随记-0.2.2-windows-免安装便携版.exe`

- [ ] Bump the desktop version to 0.2.2.
- [ ] Build macOS for local verification and Windows x64 packages for delivery.
- [ ] Verify package versions, file hashes, server reachability, and queue state.
