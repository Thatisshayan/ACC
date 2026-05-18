'use strict';
// Parallel Workflow Engine for ACC v2
// Implements the user diagram: Goal → parallel agents → merge → audit → result

var axios  = require('axios');
var store  = require('../taskbus/store.js');
var router = require('../taskbus/router.js');

// ── Agent registry ────────────────────────────────────────────────────────────
// Maps agent names to their capabilities and cost
var AGENTS = {
  deepseek:   { type: 'text',   cost: 'low',    capabilities: ['write','research','code','plan','translate'] },
  gemini:     { type: 'design', cost: 'low',    capabilities: ['design','visual','ui','image_prompt'] },
  cursor:     { type: 'code',   cost: 'free',   capabilities: ['implement','refactor','fix','build'] },
  elevenlabs: { type: 'audio',  cost: 'medium', capabilities: ['tts','voice','narrate'] },
  runway:     { type: 'video',  cost: 'high',   capabilities: ['video','animate','generate_video'] },
  playwright: { type: 'browser',cost: 'free',   capabilities: ['browse','fill_form','screenshot','apply'] },
  youtube:    { type: 'publish',cost: 'free',   capabilities: ['upload_video','post','publish'] },
  railway:    { type: 'deploy', cost: 'free',   capabilities: ['deploy','host','release'] },
  claude:     { type: 'review', cost: 'medium', capabilities: ['audit','review','merge','approve'] },
};

// ── Goal decomposer ───────────────────────────────────────────────────────────
// Uses DeepSeek to break any goal into parallel workstreams
async function decomposeGoal(goal, userId) {
  var DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
  if (!DEEPSEEK_KEY) throw new Error('DEEPSEEK_API_KEY required for goal decomposition');

  var systemPrompt = `You are a workflow orchestrator for ACC v2 AI operating system.
Available agents: ${JSON.stringify(Object.keys(AGENTS))}.
Agent capabilities: ${JSON.stringify(AGENTS)}.

Given a user goal, return a JSON execution plan with this exact structure:
{
  "goal_summary": "short description",
  "estimated_time": "X minutes",
  "requires_approval": true/false,
  "parallel_branches": [
    {
      "branch_id": "branch_1",
      "agent": "deepseek",
      "task": "specific task description",
      "output_type": "text/code/audio/video/url",
      "depends_on": [],
      "instruction": "exact prompt/instruction for this agent"
    }
  ],
  "merge_strategy": "how to combine branch outputs",
  "delivery_agent": "which agent delivers the final result",
  "delivery_action": "what the delivery agent does"
}

Rules:
- Use cheapest capable agent for each task
- Branches with empty depends_on run in parallel
- Never use Claude for tasks DeepSeek can do
- Always include an audit branch using claude
- High-risk actions (publish, deploy, apply) require approval`;

  var res = await axios.post('https://api.deepseek.com/v1/chat/completions', {
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: 'Goal: ' + goal }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
  }, {
    headers: { Authorization: 'Bearer ' + DEEPSEEK_KEY },
    timeout: 30000,
  });

  var content = res.data.choices[0].message.content;
  return JSON.parse(content);
}

// ── Execute single branch ─────────────────────────────────────────────────────
async function executeBranch(branch, goalContext) {
  var task = store.createTask({
    title: '[' + branch.agent + '] ' + branch.task.slice(0, 60),
    instruction: branch.instruction,
    assigned_agent: branch.agent === 'deepseek' ? 'claude' : branch.agent,
    automation_mode: 'semi_auto',
    approval_required: false,
    created_by: 'parallel_workflow',
    meta: { branch_id: branch.branch_id, goal: goalContext, output_type: branch.output_type }
  });

  var result = await router.routeTask(task.id);
  return {
    branch_id: branch.branch_id,
    agent: branch.agent,
    output_type: branch.output_type,
    task_id: task.id,
    result: result,
    output: result.output || result.summary || '',
    status: result.status,
  };
}

// ── Run parallel branches ─────────────────────────────────────────────────────
async function runParallelBranches(branches, goalContext) {
  // Separate independent branches from dependent ones
  var independent = branches.filter(b => !b.depends_on || b.depends_on.length === 0);
  var dependent   = branches.filter(b => b.depends_on && b.depends_on.length > 0);

  var results = {};

  // Run independent branches in parallel
  var parallelResults = await Promise.allSettled(
    independent.map(b => executeBranch(b, goalContext))
  );
  parallelResults.forEach((r, i) => {
    if (r.status === 'fulfilled') results[independent[i].branch_id] = r.value;
    else results[independent[i].branch_id] = { error: r.reason.message, branch_id: independent[i].branch_id };
  });

  // Run dependent branches sequentially after their deps complete
  for (var dep of dependent) {
    var depsReady = dep.depends_on.every(d => results[d]);
    if (depsReady) {
      // Add dep outputs to instruction context
      var depContext = dep.depends_on.map(d => results[d] && results[d].output).join('\n\n');
      dep.instruction = dep.instruction + '\n\nContext from previous steps:\n' + depContext;
      results[dep.branch_id] = await executeBranch(dep, goalContext);
    }
  }

  return results;
}

// ── Merge outputs ─────────────────────────────────────────────────────────────
async function mergeOutputs(branchResults, plan, goal) {
  var DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
  var parts = Object.values(branchResults).map(r =>
    '=== ' + r.branch_id + ' (' + (r.agent||'') + ') ===\n' + (r.output || r.error || 'no output')
  ).join('\n\n');

  var res = await axios.post('https://api.deepseek.com/v1/chat/completions', {
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: 'You are merging outputs from parallel AI agents into one coherent result. Merge strategy: ' + plan.merge_strategy },
      { role: 'user', content: 'Goal: ' + goal + '\n\nBranch outputs:\n' + parts + '\n\nProduce the final merged result.' }
    ],
    temperature: 0.2,
  }, { headers: { Authorization: 'Bearer ' + DEEPSEEK_KEY }, timeout: 30000 });

  return res.data.choices[0].message.content;
}

// ── Main entry point ──────────────────────────────────────────────────────────
async function executeGoal(goal, userId, sendUpdate) {
  try {
    // 1. Decompose goal into plan
    if (sendUpdate) sendUpdate('🧠 Analyzing goal and building execution plan...');
    var plan = await decomposeGoal(goal, userId);
    if (sendUpdate) sendUpdate('📋 Plan ready: ' + plan.parallel_branches.length + ' parallel workstreams\n' +
      plan.parallel_branches.map(b => '  • ' + b.agent + ': ' + b.task.slice(0,50)).join('\n'));

    // 2. Run parallel branches
    if (sendUpdate) sendUpdate('⚡ Running all agents in parallel...');
    var branchResults = await runParallelBranches(plan.parallel_branches, goal);

    // 3. Merge outputs
    if (sendUpdate) sendUpdate('🔀 Merging outputs from all agents...');
    var merged = await mergeOutputs(branchResults, plan, goal);

    // 4. Approval gate for risky actions
    var needsApproval = plan.requires_approval;
    if (needsApproval && sendUpdate) {
      sendUpdate('⚠️ Result ready. Requires your approval before delivery.\n\n' + merged.slice(0, 1000));
    }

    return {
      success: true,
      plan: plan,
      branch_results: branchResults,
      merged_output: merged,
      requires_approval: needsApproval,
      summary: plan.goal_summary,
    };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

module.exports = { executeGoal, decomposeGoal, runParallelBranches };
