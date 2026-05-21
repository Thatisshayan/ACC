# Claude Backend Startup Note

## ACC v2 desktop startup behavior

- The Electron desktop app now checks `http://localhost:4000` on launch.
- If the backend is already up, the UI shows `Online`.
- If the backend is down, Electron starts the existing local backend entrypoint from the repo root with `scripts/start.js`.
- The UI now shows real backend states: `Online`, `Starting`, `Offline`, and `Failed`.
- If startup fails, the UI shows a clear recovery path instead of faking an online state.

- Previous packaging issue: `fix-electron.js` used the wrong Electron path and Electron Builder could hit Windows `winCodeSign` privilege errors.
- Verified artifact: `C:\Users\Shaya\agent-command-center\desktop\dist-verify\ACC v2 2.0.0.exe`
- The canonical `C:\Users\Shaya\agent-command-center\desktop\dist\ACC v2 2.0.0.exe` still exists but is stale and locked by an older ACC process.
- Launch proof: the packaged exe returned `200` from `http://localhost:4000/api/health`.
- Next manual step: if `desktop\dist\ACC v2 2.0.0.exe` is locked, close stale ACC processes, then rerun `npm run build:portable`.
- Backend auto-start now lives in `desktop/main.js`, with the renderer showing `Online`, `Starting`, `Offline`, and `Failed`.
- Telegram still starts separately with `npm run cloud:telegram`.
- Claude should next confirm the canonical `desktop\dist` exe refreshes cleanly, the backend does not duplicate when already online, and the desktop log is created without secrets.

## What the backend startup flow actually does

- `scripts/start.js` starts the cloud API and the worker.
- Telegram is still started separately with `npm run cloud:telegram`.
- The desktop launcher does not hide that separation.

## Relevant prior session context

- The desktop packaging flow was fixed so portable build generation works in the local repo.
- `fix-electron.js` was repaired to resolve Electron from `desktop/node_modules` first and fail cleanly if it is missing.
- The portable build still needs Windows symlink privileges or Developer Mode if Electron Builder hits `winCodeSign` cache extraction issues.
