# ACC v2 Fix Note for Claude

Date: 2026-05-21

## What changed

- Desktop packaging now loads the UI from packaged resources when bundled, instead of assuming the repo checkout exists.
- Desktop backend startup now uses `process.execPath` with `ELECTRON_RUN_AS_NODE=1`, so the app can launch the local backend without depending on a system `node` binary.
- `desktop/package.json` now bundles the backend source folders and root `node_modules` as packaged resources.
- Tavily now returns a structured object (`success`, `output`, `summary`, `provider`) instead of a plain string, so the router can store results consistently.
- Resend now has a real approval flow:
  - it returns a preview + approval request first
  - approved tasks are rerouted and actually sent
  - the approval endpoints now reroute approved tasks automatically
- Alibaba/Qwen is now part of the provider fallback chain instead of being dead code.
- Telegram approval handling now reroutes approved tasks and reports the outcome.

## Verification

- Syntax checks passed on the touched JS files with `node --check`.

## Notes for next pass

- A full portable build verification is still worth doing after this change set because the backend resources bundle is larger now.
- If the build is slow or bulky, the next optimization target is narrowing the packaged backend resources instead of changing runtime behavior.
