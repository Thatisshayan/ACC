## How CrewAI Works in ACC v2 (For Shayan)

### 1. What CrewAI Does (Plain English)
CrewAI is like having **3 AI assistants working together** on a single task:
- **Researcher**: Finds information and gathers facts.
- **Writer**: Turns those facts into a clear, structured response.
- **Reviewer**: Checks the response for mistakes, clarity, and completeness.

They work in sequence: Researcher → Writer → Reviewer. Each one improves the output.

### 2. How to Trigger It from Telegram
Just start your message with `crew:` or `crewai:` prefix. For example:
- `crew: research best job boards for product managers`
- `crewai: compare top 3 project management tools`

### 3. Step-by-Step When You Send "crew: research best job boards for product managers"
1. **ACC v2 receives your message** and sees the `crew:` prefix.
2. **CrewAI is activated** (because `CREWAI_ENABLED=true`).
3. **Researcher agent** searches the web or internal knowledge for best job boards.
4. **Writer agent** organizes the findings into a clear list with descriptions.
5. **Reviewer agent** checks for errors, missing info, or unclear parts.
6. **Final result** is sent back to you on Telegram.

### 4. What CrewAI Is BEST For vs. DeepSeek Alone
| CrewAI (3 agents) | DeepSeek Alone |
|------------------|----------------|
| Complex research tasks | Simple Q&A |
| Multi-step analysis | Quick definitions |
| Fact-checking required | Casual conversation |
| Structured reports | Short replies |
| Comparing options | Single answer |

**Use CrewAI when you need thorough, verified, well-structured answers.**

### 5. How to Install It
Run these commands in your terminal:
bash
pip install crewai crewai-tools python-dotenv

That's it. ACC v2 will automatically use it when `CREWAI_ENABLED=true`.

### 6. Example Workflow (3 Agents Working Together)
**User**: `crew: what are the best free tools for remote teams?`

1. **Researcher** finds: Slack, Trello, Zoom, Google Drive, Notion.
2. **Writer** creates a response:
   - Slack for communication
   - Trello for task management
   - Zoom for meetings
   - Google Drive for file sharing
   - Notion for documentation
3. **Reviewer** checks: Are all tools free? Are they relevant to remote teams? Is the list complete? Adds a note about limitations.

**Final output**: A well-organized list with pros/cons.

### 7. How Results Come Back to Telegram
ACC v2 sends the final reviewed response directly to your Telegram chat, just like any other message. You don't need to do anything extra.

---

**Recommendation**: Use CrewAI for any question that needs research, structure, or fact-checking. For quick answers, just ask normally.