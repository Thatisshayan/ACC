# Archive Router Note

- Date: 2026-05-31
- Scope: `cloud/router.js` legacy orchestrator mapper

## Change
- The `/orchestrate` route in `cloud/server.js` no longer imports `cloud/router.js`.
- Routing is now handled by a local `routeOrchestratorTask` function in `cloud/server.js`.

## Why
- `cloud/router.js` was a thin legacy mapper with no shared ownership outside this call site.
- Keeping the mapping local removes dead indirection and makes route behavior explicit at the boundary.

## Safety
- Mapping behavior is preserved:
  - `architect -> copilot`
  - `writer -> claude`
  - `engineer -> copilot`
  - default `-> copilot`

## Rollback
- Reintroduce `const cloudRouter = require("./router.js");` in `cloud/server.js`.
- Replace `routeOrchestratorTask(task)` with `cloudRouter.routeTask(task)`.
