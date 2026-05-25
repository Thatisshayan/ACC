## Guide: Where to Put ChatGPT and n8n Workflow JSON Files in ACC v2

### 1. n8n Workflow JSON Files
- **Location**: `cloud/workflows/n8n/`
- **Import Method**: ACC sends a POST request to your n8n webhook URL (set in `.env` as `N8N_WEBHOOK_URL`).
- **Trigger from Telegram**: Send message: `task: run workflow: [workflow-name]`
- **Parallel mode**: `workflow: parallel [workflow-a], [workflow-b]`
- **Example**: If file is `my_workflow.json`, trigger with `task: run workflow: my_workflow`

### 2. ChatGPT JSON Workflows (Custom GPT Actions/Schemas)
- **These are OpenAPI spec files** (not actual workflows, but API definitions).
- **Location**: `cloud/workflows/chatgpt/`
- **Registration**: Add the file path to `cloud/integrations/chatgpt_workflows.js` (array of file names).
- **Trigger**: Manually via ChatGPT interface, or automatically via Composio (if configured).

### 3. CrewAI Crew Definition JSON
- **Location**: `cloud/workflows/crewai/`
- **Format**: `{"name": "crew-name", "agents": [{"role": "...", "goal": "...", "backstory": "..."}], "tasks": [{"description": "...", "agent": "..."}]}`
- **How ACC reads them**: `crewai_agent.py` loads the JSON, creates agents/tasks, and executes the crew.
- **Trigger from Telegram**: Send message: `crew: use-workflow [workflow-name]`
- **Job application shortcut**: `apply for jobs for this role for me: [role]`

### 4. Step-by-Step: What Shayan Should Do RIGHT NOW

1. **Create folders** (if not exist):
   - `cloud/workflows/n8n/`
   - `cloud/workflows/chatgpt/`
   - `cloud/workflows/crewai/`

2. **Copy files**:
   - n8n JSON files → `cloud/workflows/n8n/`
   - ChatGPT OpenAPI JSON files → `cloud/workflows/chatgpt/`
   - CrewAI JSON files → `cloud/workflows/crewai/`

3. **For n8n workflows**:
   - Ensure `N8N_WEBHOOK_URL` is set in `.env` (e.g., `https://your-n8n-instance.com/webhook/acc`)
   - Test: Send `task: run workflow: [filename without .json]` in Telegram

4. **For ChatGPT workflows**:
   - Edit `cloud/integrations/chatgpt_workflows.js` and add the filename(s) to the array
   - Example: `module.exports = ['my_gpt_action.json'];`

5. **For CrewAI workflows**:
   - Verify JSON format matches the spec above
   - Test: Send `crew: use-workflow [filename without .json]` or `apply for jobs for this role for me: [role]` in Telegram

6. **Restart ACC** (or run `node index.js` if in dev mode) to load new workflows.

**Recommendation**: Start with n8n workflows first (most reliable), then CrewAI, then ChatGPT. If any file fails, check JSON syntax with a validator (e.g., jsonlint.com).
