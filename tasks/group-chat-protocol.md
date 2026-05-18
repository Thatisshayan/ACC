# ACC Group Chat Protocol
# Task Bus multi-agent collaboration | feature_ref: `group-chat`

## Roles

| Tag | Agent ID | Default role |
|-----|----------|--------------|
| `[CLAUDE]` | `claude` | Architect, review, merge decisions |
| `[CURSOR]` | `cursor` | Implement, patch, repo changes |
| `[CHATGPT]` | `chatgpt` | Orchestrate, spec, delegate |
| `[DEEPSEEK]` | `deepseek` | Draft, research, cheap execution |

Every message **starts** with one role tag. Body follows on same line or below.

---

## Task = thread

One group-chat thread = one Task Bus task.

```json
{
  "title": "[GROUP] <topic ≤60 chars>",
  "instruction": "<see Message format>",
  "assigned_agent": "<next pickup agent id>",
  "feature_ref": "group-chat",
  "automation_mode": "manual",
  "approval_required": false,
  "created_by": "<sender agent id or shayan>",
  "priority": "normal"
}
```

- `automation_mode: manual` — no auto-route until an agent posts a result or handoff.
- Filter inbox: `GET /api/taskbus/tasks?assigned_agent=<me>&status=pending`
- Full thread: `GET /api/taskbus/task/:id` → `task`, `messages`, `results`

---

## Message format

Store in `instruction` (new thread) or append via message API.

```
[ROLE] <type>: <one-line subject>

ctx: <optional, ≤200 chars>
ask: <what you need, one sentence>
next: <agent id | done | shayan>
```

**Types:** `post` | `reply` | `handoff` | `done` | `block`

**Rules**
- One tag per message; no nested tags.
- Keep `ctx` short; link task IDs, not full dumps.
- `next` is required on `handoff` and `done`.

**Example (new thread body = instruction)**

```
[CHATGPT] post: Wire group-chat protocol doc

ctx: ACC Task Bus already has messages + results APIs
ask: Cursor create tasks/group-chat-protocol.md per spec
next: cursor
```

---

## Pickup

1. Poll: `GET /api/taskbus/tasks?assigned_agent=<my_id>&status=pending`
2. Filter client-side: `feature_ref === 'group-chat'`
3. Claim:
   - `PATCH /api/taskbus/task/:id` → `{ "status": "in_progress" }`
4. Read: `GET /api/taskbus/task/:id`
5. Parse latest `instruction` + `messages[]` for `[TAG]` blocks

**Do not** pick tasks where `assigned_agent` ≠ your id unless explicitly `@all` in `next` (broadcast — any agent may reply once).

---

## Respond

Post result (primary artifact):

```
POST /api/taskbus/task/:id/result
{
  "agent": "<my_id>",
  "summary": "<≤120 chars>",
  "output": "<deliverable or decision>",
  "next_request": "<optional follow-up for next agent>"
}
```

Optional inline chat:

```
POST /api/taskbus/task/:id/message
{
  "from_agent": "<my_id>",
  "to_agent": "<peer_id or shayan>",
  "content": "[ROLE] reply: <text>"
}
```

Then either **hand off** or **close** (below).

---

## Hand off

When your turn ends, assign the next agent and append handoff to instruction (or message).

1. `PATCH /api/taskbus/task/:id`

```json
{
  "status": "pending",
  "assigned_agent": "<next_agent_id>",
  "instruction": "<prior instruction>\n\n---\n[CURSOR] handoff: Doc created\n\nctx: tasks/group-chat-protocol.md\nask: Claude review for Task Bus alignment\nnext: claude"
}
```

2. Or `POST .../message` with same `[TAG] handoff:` block + PATCH `assigned_agent` only.

**Chain defaults**

| From | Typical next |
|------|----------------|
| CHATGPT | CURSOR or DEEPSEEK |
| DEEPSEEK | CURSOR or CLAUDE |
| CURSOR | CLAUDE |
| CLAUDE | CHATGPT or `done` |

Skip agents not needed (e.g. research-only → DEEPSEEK → CHATGPT → done).

---

## Close thread

```
[CLAUDE] done: <verdict>

summary: <one line>
next: shayan
```

- `PATCH` → `{ "status": "done", "assigned_agent": "shayan" }`
- Final `POST .../result` with `summary` + `output`

---

## Blocked / escalate

```
[ANY] block: <reason ≤100 chars>

next: shayan
```

`PATCH` → `{ "status": "waiting_approval", "assigned_agent": "shayan" }`

---

## API quick ref

| Action | Method |
|--------|--------|
| Create thread | `POST /api/taskbus/task` |
| Inbox | `GET /api/taskbus/tasks?assigned_agent=&status=pending` |
| Thread | `GET /api/taskbus/task/:id` |
| Claim | `PATCH /api/taskbus/task/:id` |
| Chat line | `POST /api/taskbus/task/:id/message` |
| Deliverable | `POST /api/taskbus/task/:id/result` |
| Handoff | `PATCH` + update `assigned_agent` + append instruction |

Base: `/api/taskbus` · Backend: `localhost:4000`

---

## Minimal example flow

1. **CHATGPT** creates task, `assigned_agent: cursor`, instruction with `[CHATGPT] post:...`
2. **CURSOR** picks up → in_progress → implements → result → handoff `assigned_agent: claude`
3. **CLAUDE** reviews → result → `done`, `assigned_agent: shayan`

---

## Token discipline

- No full file contents in `instruction`; use paths + line ranges.
- One ask per message.
- Reuse task `id` in titles: `[GROUP:<id8>] topic`
- Prefer `summary` over long `output`; attach artifacts in repo, not bus.

---
Status: READY | Owner: Shayan | ACC Task Bus v2
