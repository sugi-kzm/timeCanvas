# Contributing to TimeCanvas

TimeCanvas is a fully-local, privacy-first time tracking desktop app
(Tauri + React + TypeScript + SQLite). It does not make any network calls
by design, so contributions that add telemetry, analytics, or remote sync
will not be accepted.

## Getting Started

1. Fork the repository and clone your fork
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the app in development mode:
   ```bash
   npm run tauri dev
   ```

## Branching

- Create a topic branch off `main` (e.g. `fix/calendar-drag`, `feat/gantt-zoom`)
- Keep pull requests focused on a single change

## Before Submitting a Pull Request

- `npm run build` and `npm test` must pass
- Rust changes must pass, from `src-tauri/`:
  ```bash
  cargo fmt --check
  cargo clippy --all-targets -- -D warnings
  cargo test
  ```
- These are the same checks run in `.github/workflows/ci.yml`, so a green
  CI run on your PR confirms the above

## Reporting Bugs / Feature Requests

Please use GitHub Issues. Include:

- Steps to reproduce (for bugs)
- Your OS version
- Whether the issue is reproducible in a fresh database (Settings → backup/restore)

## Privacy Principle

Any change that introduces outbound network requests, analytics, or crash
reporting must be opt-in and clearly documented, in line with the project's
no-automatic-network-calls design.
