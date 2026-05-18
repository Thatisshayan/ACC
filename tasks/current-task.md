# Current Task for Cursor — IMPLEMENT NOW

## Task: Add /api/system/integrations/status endpoint

DeepSeek already wrote the spec. Now implement it.

## Files to modify:

### 1. cloud/taskbus/routes.js — add this route:

```javascript
// GET /api/taskbus/integrations/status
app.get('/integrations/status', async function(req, res) {
  var integrations = {};
  var files = ['langfuse','openrouter','qdrant','sentry','helicone','n8n','supabase','browserbase','flowise','neo4j','openhands','airtable','clickup'];
  for (var i = 0; i < files.length; i++) {
    var name = files[i];
    try {
      var mod = require('../integrations/' + name + '.js');
      var health = await mod.checkHealth();
      integrations[name] = Object.assign({ enabled: mod.enabled() }, health);
    } catch(e) {
      integrations[name] = { enabled: false, status: 'error', error: e.message };
    }
  }
  var statuses = Object.values(integrations).map(function(i){ return i.status; });
  var overall = statuses.every(function(s){ return s==='connected'||s==='disabled'; }) ? 'ok' : 'degraded';
  res.json({ success: true, overall: overall, integrations: integrations, timestamp: new Date().toISOString() });
});
```

Add it AFTER the existing /stats route.

### 2. Add to .env.example:
```
OPENHANDS_URL=https://your-openhands.up.railway.app
OPENHANDS_API_KEY=your-basic-auth-password
OPENHANDS_USER=shayan
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
OPENROUTER_API_KEY=
QDRANT_URL=
QDRANT_API_KEY=
SENTRY_DSN=
HELICONE_API_KEY=
N8N_WEBHOOK_URL=
SUPABASE_SERVICE_ROLE_KEY=
BROWSERBASE_API_KEY=
BROWSERBASE_PROJECT_ID=
FLOWISE_API_URL=
FLOWISE_API_KEY=
NEO4J_URI=
NEO4J_USER=
NEO4J_PASSWORD=
```

## Commands:
1. node --check cloud/taskbus/routes.js
2. git add cloud/taskbus/routes.js .env.example
3. git commit -m "feat: /api/taskbus/integrations/status endpoint"
4. git push origin master

## Do NOT change any other files.
## Verdict when done: test with curl http://localhost:4000/api/taskbus/integrations/status
