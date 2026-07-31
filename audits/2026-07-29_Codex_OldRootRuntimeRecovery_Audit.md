# Old Root Runtime Recovery Audit — 2026-07-29

Agent: Codex
Scope: Inspect untracked/runtime content under the previous (pre-migration) repo root, preserve old-only material into the current repo, and assess what remains worth keeping before deleting the old root.
Status: completed

## Sources reviewed
- Prior audits:
  - `audits/2026-07-23_Hermes_GovernanceBootstrap_Audit.md`
  - `audits/2026-07-29_Codex_RepoRootParity_Audit.md`
- Filesystem state of:
  - the previous (pre-migration) repo root
  - `D:\AgentDevWork\repos\ACC`
- Git status of both roots

## Findings

### 1. Most old-root untracked content is not unique source code
The following areas under the old root are generated or install artifacts:

- `node_modules/` (`~90.49 MB`)
- `ui/dist/` (`~0.35 MB`)
- `mobile/dist/` (`~6.31 MB`)
- `desktop/dist/` (`~465.37 MB`)

Assessment:
- These are rebuildable artifacts, not unique source.
- `desktop/dist/` is the largest space consumer, but it is packaged Electron output rather than development source.

### 2. The high-value area is `data/`
The old root contains meaningful runtime/user state under `data/`: local databases (memory, taskbus), a messaging store (including its key material), stored user documents, per-user account records, and prompt/result artifacts. None of these are named individually here since they are credential- or user-data-bearing.

Assessment:
- Most of this state already exists in the current root at `D:\AgentDevWork\repos\ACC\data`.
- The old root should not be deleted until old-only data is either preserved or intentionally discarded.

### 3. Old-only runtime content
Compared with the current root, the old root had these runtime items that were not present under `D:\AgentDevWork\repos\ACC\data`:

- `data/alphonso-bridge/packets.json`
- `data/logs/` with 31 log files, total `49,748,562` bytes
- `data/bot-heartbeat.json`
- `data/startup.log`
- `data/watchdog.log`

Two initially suspicious directories turned out to be empty:

- `data/notebook-exports/`
- `data/uploads/`

### 4. Preservation completed
I copied the old-only runtime content into:

- `audits/private/2026-07-29_old-root-runtime-recovery`

Preserved items:

- `alphonso-bridge/packets.json`
- full `logs/` directory from the old root
- `bot-heartbeat.json`
- `startup.log`
- `watchdog.log`

This keeps the material local, recoverable, and out of Git because `audits/private/` is ignored.

## Conclusion
- The old repo root still contains recoverable runtime history, but the truly unique portion was narrow.
- The most important preserved material was the old-only bridge payload and operational logs.
- After this preservation step, the old root no longer appears to contain unique project content that is both obvious and easy to miss.

## Verification
- Inspected old and current `data/` trees with PowerShell `Get-ChildItem`
- Compared old-vs-current `data/` entry presence
- Measured old logs total size with:
  - `Get-ChildItem '<previous-repo-root>\data\logs' -File | Measure-Object Length -Sum`
- Copied preserved material into:
  - `D:\AgentDevWork\repos\ACC\audits\private\2026-07-29_old-root-runtime-recovery`

## Residual risk
- I did not perform content-level diffs for files that exist in both old and current `data/` trees.
- Large runtime databases already present in the current repo were not copied again, on purpose, to avoid duplicating sensitive state and wasting space.
