'use strict';
// cloud/orchestrator/parallelWorkflow.js
// Parallel Workflow Engine — implements the user's diagram:
// Goal → decompose → parallel agents → merge → audit → result

var axios  = require('axios');
var store  = require('../taskbus/store.js');
var router = require('../taskbus/router.js');

var AGENTS = {
  deepseek:   { type:'text',   cost:'low',    capabilities:['write','research','code','plan','translate','analyze'] },
  gemini:     { type:'design', cost:'low',    capabilities:['design','visual','ui','image_prompt','creative'] },
  cursor:     { type:'code',   cost:'free',   capabilities:['implement','refactor','fix','build','code'] },
  elevenlabs: { type:'audio',  cost:'medium', capabilities:['tts','voice','narrate','audio'] },
  runway:     { type:'video',  cost:'high',   capabilities:['video','animate','generate_video'] },
  playwright: { type:'browser',cost:'free',   capabilities:['browse','fill_form','screenshot','apply','scrape'] },
  youtube:    { type:'publish',cost:'free',   capabilities:['upload_video','post','publish'] },
  railway:    { type:'deploy', cost:'free',   capabilities:['deploy','host','release'] },
  notion:     { type:'storage',cost:'free',   capabilities:['save','document','store','note'] },
  claude:     { type:'review', cost:'medium', capabilities:['audit','review','merge','approve','orchestrate'] },
};

var DECOMPOSE_PROMPT = `You are the orchestrator for ACC v2 — an AI operating system.
Your job: take any user goal and return a JSON execution plan.

Available agents and their capabilities:
${JSON.stringify(AGENTS, null, 2)}

Return ONLY valid JSON with this structure:
{
  "goal_summary": "short one-line description",
  "estimated_time": "X minutes",  
  "requires_approval": true/false,
  "parallel_branches": [
    {
      "branch_id": "b1",
      "agent": "deepseek",
      "task": "what this agent does",
      "output_type": "text|code|audio|video|url|file",
      "depends_on": [],
      "instruction": "exact detailed instruction for this agent"
    }
  ],
  "merge_strategy": "how to combine all branch outputs into final result",
  "delivery_method": "telegram|file|url|email",
  "requires_approval": false
}

Rules:
- Use deepseek for writing, research, analysis, code generation
- Use gemini for design specs and visual direction  
- Use elevenlabs only if ELEVENLABS_API_KEY is available
- Always include a final "audit" branch using deepseek that reviews all outputs
- branches with empty depends_on run in PARALLEL
- branches with depends_on wait for those to complete first
- Keep it practical — max 5 branches for simple goals, more for complex
- requires_approval=true for: publish, deploy, send email, apply to jobs, post publicly`;

async function decomposeGoal(goal) {
  var key = process.env.DEEPSEEK_API_KEY;
  if (!key) return buildFallbackPlan(goal);
  try {
    var res = await axios.post('https://api.deepseek.com/v1/chat/completions', {
      model: 'deepseek-chat',
      messages: [{ role:'system', content: DECOMPOSE_PROMPT }, { role:'user', content:'Goal: ' + goal }],
      response_format: { type:'json_object' },
      temperature: 0.2,
    }, { headers:{ Authorization:'Bearer '+key }, timeout:25000 });
    return JSON.parse(res.data.choices[0].message.content);
  } catch(e) {
    console.warn('[parallelWorkflow] decompose failed:', e.message);
    return buildFallbackPlan(goal);
  }
}

function buildFallbackPlan(goal) {
  return {
    goal_summary: goal.slice(0,80),
    estimated_time: '1-2 minutes',
    requires_approval: false,
    parallel_branches: [{
      branch_id: 'b1', agent: 'deepseek', task: goal,
      output_type: 'text', depends_on: [],
      instruction: goal,
    }],
    merge_strategy: 'use the single branch output directly',
    delivery_method: 'telegram',
  };
}

async function executeBranch(branch) {
  try {
    var task = store.createTask({
      title: '[' + branch.agent.toUpperCase() + '] ' + branch.task.slice(0, 55),
      instruction: branch.instruction,
      assigned_agent: 'claude',
      automation_mode: 'semi_auto',
      approval_required: false,
      created_by: 'parallel_workflow',
      meta: { branch_id: branch.branch_id, output_type: branch.output_type }
    });
    var result = await router.routeTask(task.id);
    var out = (result && (result.output || result.summary)) || '';
    return { branch_id: branch.branch_id, agent: branch.agent, output: out, status: 'done', task_id: task.id };
  } catch(e) {
    return { branch_id: branch.branch_id, agent: branch.agent, output: '', error: e.message, status: 'failed' };
  }
}

async function runBranches(branches) {
  var independent = branches.filter(function(b){ return !b.depends_on || !b.depends_on.length; });
  var dependent   = branches.filter(function(b){ return b.depends_on && b.depends_on.length; });
  var results = {};

  // Run independent in parallel
  var settled = await Promise.allSettled(independent.map(executeBranch));
  settled.forEach(function(r, i){
    results[independent[i].branch_id] = r.status==='fulfilled' ? r.value : { branch_id: independent[i].branch_id, error: r.reason&&r.reason.message, status:'failed' };
  });

  // Run dependent sequentially
  for (var i=0; i<dependent.length; i++) {
    var dep = dependent[i];
    var ctx = dep.depends_on.map(function(d){ return results[d] && results[d].output || ''; }).join('\n\n');
    if (ctx) dep.instruction = dep.instruction + '\n\nContext from previous steps:\n' + ctx;
    results[dep.branch_id] = await executeBranch(dep);
  }
  return results;
}

async function mergeOutputs(branchResults, plan, goal) {
  var parts = Object.values(branchResults).map(function(r){
    return '=== ' + r.branch_id + ' [' + r.agent + '] ===\n' + (r.output || r.error || 'no output');
  }).join('\n\n');

  var key = process.env.DEEPSEEK_API_KEY;
  if (!key) return parts;

  try {
    var res = await axios.post('https://api.deepseek.com/v1/chat/completions', {
      model: 'deepseek-chat',
      messages: [
        { role:'system', content: 'Merge these parallel AI agent outputs into one coherent, well-structured result. Strategy: ' + plan.merge_strategy + '. Be concise and actionable.' },
        { role:'user',   content: 'Original goal: ' + goal + '\n\nOutputs:\n' + parts }
      ],
      temperature: 0.2,
    }, { headers:{ Authorization:'Bearer '+key }, timeout:25000 });
    return res.data.choices[0].message.content;
  } catch(e) { return parts; }
}

// ── Main entry ────────────────────────────────────────────────────────────────
async function executeGoal(goal, chatId, sendUpdate) {
  try {
    if (sendUpdate) await sendUpdate('🧠 *Analyzing goal...*\n_Building execution plan_');
    var plan = await decomposeGoal(goal);

    var branchList = plan.parallel_branches.map(function(b){ return '  • *'+b.agent+'*: '+b.task.slice(0,45); }).join('\n');
    if (sendUpdate) await sendUpdate('📋 *Plan ready* ('+plan.estimated_time+')\n'+branchList+'\n\n⚡ _Running all agents in parallel..._');

    var branchResults = await runBranches(plan.parallel_branches);
    var failed = Object.values(branchResults).filter(function(r){ return r.status==='failed'; });
    if (sendUpdate && failed.length) await sendUpdate('⚠️ '+failed.length+' branch(es) failed — continuing with available results');

    if (sendUpdate) await sendUpdate('🔀 *Merging outputs...*');
    var merged = await mergeOutputs(branchResults, plan, goal);

    return { success:true, plan:plan, merged_output:merged, requires_approval:plan.requires_approval, branch_count:plan.parallel_branches.length };
  } catch(e) {
    return { success:false, error:e.message };
  }
}

module.exports = { executeGoal, decomposeGoal, runBranches };
