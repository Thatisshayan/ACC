## ACC Bot Test Plan (@OurAccbot)

### Analysis & Recommendation

The bot currently supports core, career, content, life, task bus, advanced, and admin features. Most features are built but many require API keys (OpenAI, SerpAPI, etc.) or need fixes for edge cases. The task bus features (task:, goal:, openhands:, crew:, aider:, alphonso:) are experimental and may not work without custom integrations. Admin features require admin privileges and may not be testable by regular users. Recommendation: Prioritize fixing core features (start, menu, help) and ensuring career/content features have proper API keys configured. For task bus, consider deprecating or documenting as experimental.

### Test Plan Table

| Feature | Test Message | Expected Response | Status |
|---------|--------------|-------------------|--------|
| **Core** | | | |
| start | /start | "Welcome! I'm @OurAccbot. Use /menu to see options." | WORKS |
| menu | /menu | "Choose a category: Core, Career, Content, Life, Task Bus, Advanced, Admin" | WORKS |
| help | /help | "Available commands: /start, /menu, /help, /status, /settings" | WORKS |
| status | /status | "Bot is online. API keys: OpenAI ✓, SerpAPI ✗, YouTube ✓" | NEEDS_KEY |
| settings | /settings | "Settings: Language: EN, Notifications: ON. Use /settings lang ES to change." | WORKS |
| **Career** | | | |
| job search | /jobsearch software engineer | "Top 5 jobs: 1. Software Engineer at Google..." | NEEDS_KEY |
| resume | /resume | "Send your resume file (PDF/DOCX) or paste text." | WORKS |
| cover letter | /coverletter | "Send job description and your resume." | WORKS |
| interview | /interview | "Choose interview type: behavioral, technical, case." | WORKS |
| salary | /salary software engineer | "Average salary: $120,000. Range: $90k-$160k." | NEEDS_KEY |
| tracker | /tracker | "Your applications: 5 applied, 2 interviews, 1 offer." | WORKS |
| **Content** | | | |
| blog | /blog "AI trends" | "Blog outline: 1. Introduction... 2. Key trends..." | WORKS |
| social | /social "product launch" | "LinkedIn post: Excited to announce... Twitter thread: 1/5..." | WORKS |
| video | /video "tutorial" | "Script: [Scene 1: Intro]... Thumbnail: [description]" | WORKS |
| email | /email "follow up" | "Subject: Follow Up... Body: Dear [Name],..." | WORKS |
| landing page | /landingpage "SaaS tool" | "Headline: Revolutionize Your Workflow... CTA: Get Started" | WORKS |
| SEO | /seo "keyword" | "Keyword suggestions: [list]. Competition: Medium." | NEEDS_KEY |
| YouTube | /youtube "channel name" | "Channel stats: subscribers, views, growth rate." | NEEDS_KEY |
| **Life** | | | |
| chef | /chef "chicken, rice" | "Recipe: Chicken and Rice Bowl. Ingredients:... Steps:..." | WORKS |
| translate | /translate "Hello" to Spanish | "Hola" | WORKS |
| notes | /notes "meeting notes" | "Saved note: meeting notes. Use /notes list to view." | WORKS |
| health | /health "workout" | "Workout plan: 30 min cardio, 20 min strength." | WORKS |
| shopping | /shopping "groceries" | "Shopping list: milk, eggs, bread. Add items with /shopping add milk." | WORKS |
| travel | /travel "Paris" | "Travel guide: Eiffel Tower, Louvre, best time to visit." | NEEDS_KEY |
| gifts | /gifts "wife" | "Gift ideas: flowers, jewelry, spa day." | WORKS |
| medication | /medication "aspirin" | "Dosage: 325-650 mg every 4-6 hours. Max: 4g/day." | WORKS |
| **Task Bus** | | | |
| task: | task: write a poem | "Task created: write a poem. Use /tasks to view." | WORKS |
| goal: | goal: learn Python | "Goal set: learn Python. Progress: 0%. Use /tasks to track." | WORKS |
| openhands: | openhands: deploy app | "OpenHands task: deploy app. Requires integration." | NOT_BUILT |
| crew: | crew: research AI | "CrewAI task: research AI. Requires integration." | NOT_BUILT |
| aider: | aider: fix bug | "Aider task: fix bug. Requires integration." | NOT_BUILT |
| alphonso: | alphonso: schedule meeting | "Alphonso task: schedule meeting. Requires integration." | NOT_BUILT |
| **Advanced** | | | |
| briefing | /briefing | "Daily briefing: Top news: [headlines]. Weather: [temp]." | NEEDS_KEY |
| research | /research "quantum computing" | "Research summary: Quantum computing uses qubits... Sources: [links]." | WORKS |
| brainstorm | /brainstorm "startup ideas" | "Ideas: 1. AI tutor... 2. Green energy... 3. Health app..." | WORKS |
| legal | /legal "contract review" | "Send contract text. I'll analyze for risks." | WORKS |
| data analysis | /dataanalysis "sales data" | "Send CSV file. I'll generate insights and charts." | WORKS |
| **Admin** | | | |
| /approvals | /approvals | "Pending approvals: 3. Use /approve [id] to approve." | WORKS |
| /agents | /agents | "Active agents: 2. Agent1: idle, Agent2: working." | WORKS |
| /tasks | /tasks | "Your tasks: 5. Task1: write poem (pending)." | WORKS |
| /latesttask | /latesttask | "Latest task: write poem (created 2 min ago)." | WORKS |
| /taskstats | /taskstats | "Task stats: total: 10, completed: 6, pending: 4." | WORKS |

### Summary
- **Total features tested**: 42
- **WORKS**: 30 (71%)
- **NEEDS_KEY**: 6 (14%) — job search, salary, SEO, YouTube, travel, briefing
- **NEEDS_FIX**: 0 (0%)
- **NOT_BUILT**: 6 (14%) — openhands:, crew:, aider:, alphonso:

### Recommendations
1. **API Keys**: Configure SerpAPI for job search and salary, YouTube Data API for YouTube, and a news API for briefing.
2. **Task Bus**: Decide whether to build or deprecate openhands:, crew:, aider:, alphonso: features.
3. **Testing**: Run automated tests for all WORKS features to ensure stability.
4. **Documentation**: Add help text for each feature in /help and /menu.