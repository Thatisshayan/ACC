# ACC v2 — Agent Command Center

## Structure

```
cloud/
├── connectors/        ← notion, clickup, browser, deepseek, claude, linkedin, indeed + registry
├── orchestrator/      ← intentClassifier, connectorRouter, agentRouter, mergeEngine, graphExpander, graphRunner
├── graphs/            ← graphBuilderV2, graphBuilder_jobs, graphBuilder_resume, graphBuilder_apply
├── memory/            ← memoryEngine (STM+LTM), notionStorage
├── admin/             ← API surface, dashboardSpec, graphView
├── telegram/          ← bot (re-uses graphs/), botLock, users
├── utils/             ← logger, helpers
├── limits/            ← roleLimits
├── logs/              ← logger
├── system/            ← health monitor
├── storage/           ← R2, Supabase
├── executor.js        ← routes agentType → connector/merge/media
├── graphRunner.js     ← Snapshot class + sequential runner with STM/LTM
├── server.js          ← HTTP API (:4000)
└── worker.js          ← priority-aware task worker
```

## Placeholders to replace

| Env Var | Purpose |
|---|---|
| `NOTION_API_KEY` | Notion read/write |
| `CLICKUP_API_KEY` | ClickUp tasks |
| `DEEPSEEK_API_KEY` | DeepSeek reasoning/merge |
| `CLAUDE_API_KEY` | Claude text generation |
| `NOTION_MEMORY_PAGE_ID` | LTM storage page |
| `RESUME_PAGE_ID` | Base resume page |
| `TAILORED_RESUMES_DB` | Tailored resumes database |
| `CLICKUP_JOB_LIST_ID` | Job applications list |
| `DEFAULT_DB_ID` | Default Notion database |

## Run

```bash
npm install
# Set env vars above
npm run cloud:api       # HTTP API on :4000
npm run cloud:worker    # Priority queue worker
npm run cloud:telegram  # Telegram bot
npm run telegram        # Root bot (legacy)
```

## Global rule

If a file, function, class, connector, router entry, graph node, or memory key already exists — **skip it**. Do not duplicate or overwrite unless the file contains an explicit `// UPDATE HERE` marker. Merge intelligently when updating existing files.
