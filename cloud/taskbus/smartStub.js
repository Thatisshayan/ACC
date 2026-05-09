// cloud/taskbus/smartStub.js
// Smart Stub — zero-cost, always-available final fallback
// NEVER pretends to be real AI. Always honest about what it is.
'use strict';

function buildSmartStub(task) {
  var c = ((task.title || '') + ' ' + (task.instruction || '')).toLowerCase();

  // Pattern-specific next steps (useful even without AI)
  var nextStep = 'Retry by adding API credits or installing Ollama (https://ollama.ai)';
  var actionPlan = 'Task stored and ready for retry when a provider becomes available.';

  if (/status|health|verify|system|check/.test(c)) {
    actionPlan = [
      'Run: curl http://localhost:4000/api/health',
      'Run: curl http://localhost:4000/api/taskbus/providers/status',
      'Send /status to @OurAccbot for live system state',
    ].join('\n');
    nextStep = 'Check provider status at GET /api/taskbus/providers/status';
  } else if (/playwright|browser|linkedin|indeed|scrape|crawl/.test(c)) {
    actionPlan = [
      'Install browser automation:',
      '  npm install playwright',
      '  npx playwright install chromium',
      'Then re-route this task.',
    ].join('\n');
    nextStep = 'Install Playwright then POST /api/taskbus/task/' + task.id + '/route';
  } else if (/code|implement|build|fix|debug|architect|refactor/.test(c)) {
    actionPlan = [
      'Engineering task — manual implementation guide:',
      '1. Review instruction: ' + (task.instruction || '').slice(0, 100),
      '2. Target file: cloud/services/ or cloud/api/',
      '3. Pattern: function → export → route → smoke test',
      '4. Re-route when DeepSeek or Ollama is available for AI generation.',
    ].join('\n');
    nextStep = 'Implement manually or add DeepSeek credits to auto-generate code';
  } else if (/design|ui|ux|dashboard|react|component|page|layout/.test(c)) {
    actionPlan = 'This task is queued for Gemini (UI/UX Designer). Pull at: GET /api/taskbus/tasks?assigned_agent=gemini';
    nextStep = 'Gemini to pull task and submit design via POST /api/taskbus/task/' + task.id + '/result';
  } else if (/job|career|resume|apply|linkedin|indeed|salary/.test(c)) {
    actionPlan = [
      'Career task — available actions without AI:',
      '• Upload resume: send PDF to @OurAccbot',
      '• Search jobs: /jobs → Find Jobs in bot',
      '• Track: /tracker command',
      'AI-enhanced actions need DeepSeek or Claude credits.',
    ].join('\n');
    nextStep = 'Use bot menu for basic career actions; add API credits for AI-enhanced results';
  } else if (/content|blog|seo|script|copy|write|social|email/.test(c)) {
    actionPlan = 'Content generation requires an active AI provider. Add DeepSeek credits ($5 at platform.deepseek.com) or install Ollama (free).';
    nextStep = 'Add DeepSeek credits then POST /api/taskbus/task/' + task.id + '/route';
  }

  return {
    provider_used:             'smart_stub',
    provider_chain_attempted:  [],  // filled by router
    fallback_reason:           'All providers unavailable or failed',
    execution_mode:            task.automation_mode || 'semi_auto',
    cost_tier:                 'zero_cost_stub',
    is_real_ai_result:         false,
    summary:                   'Smart Stub: No live AI provider completed this task. Structured placeholder returned.',
    output:                    [
      'TASK: ' + task.title,
      '',
      'STATUS: No AI provider was available to complete this task.',
      '',
      'Manual action plan:',
      actionPlan,
      '',
      'Provider options to activate:',
      '1. DeepSeek ($5 credit): platform.deepseek.com',
      '2. Ollama (free, local): https://ollama.ai → ollama pull llama3.1',
      '3. Claude (credit): console.anthropic.com',
    ].join('\n'),
    files_changed:             [],
    risks:                     [
      'No real AI execution occurred',
      'Task requires manual completion or provider activation',
    ],
    next_request:              nextStep,
  };
}

module.exports = { buildSmartStub };
