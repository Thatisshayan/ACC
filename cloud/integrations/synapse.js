'use strict';
// cloud/integrations/synapse.js
// Synapse multi-agent engine ported directly from Synapse source (agent-replies.ts)
// Runs Claude + OpenAI + Gemini + DeepSeek in parallel with inter-agent context

const axios = require('axios');

const MODEL_REGISTRY = {
  claude:          { provider: 'anthropic', model: 'claude-3-5-sonnet-20240620', name: 'Claude 3.5 Sonnet' },
  'claude-opus':   { provider: 'anthropic', model: 'claude-3-opus-20240229',     name: 'Claude 3 Opus' },
  'claude-haiku':  { provider: 'anthropic', model: 'claude-3-haiku-20240307',    name: 'Claude 3 Haiku' },
  chatgpt:         { provider: 'openai',    model: 'gpt-4o',                     name: 'GPT-4o' },
  'gpt4o-mini':    { provider: 'openai',    model: 'gpt-4o-mini',                name: 'GPT-4o Mini' },
  o1:              { provider: 'openai',    model: 'o1',                         name: 'o1' },
  gemini:          { provider: 'google',    model: 'gemini-2.0-flash',           name: 'Gemini 2.0 Flash' },
  'gemini-pro':    { provider: 'google',    model: 'gemini-1.5-pro',             name: 'Gemini 1.5 Pro' },
  deepseek:        { provider: 'deepseek',  model: 'deepseek-chat',              name: 'DeepSeek V3' },
  'deepseek-r1':   { provider: 'deepseek',  model: 'deepseek-reasoner',          name: 'DeepSeek R1' },
};

const PRESETS = {
  brainstorm:    ['claude', 'chatgpt', 'gemini', 'deepseek'],
  'code-review': ['chatgpt', 'claude', 'deepseek'],
  research:      ['claude-opus', 'gemini-pro', 'deepseek-r1'],
  creative:      ['claude', 'chatgpt', 'gemini'],
  quick:         ['claude-haiku', 'gpt4o-mini', 'gemini'],
};

function getModePreamble(mode, round) {
  const r = round || 1;
  switch (mode) {
    case 'debate':
      if (r === 1) return 'DEBATE Round 1 — Opening Statement: Present your strongest argument. Take a clear position. Do not reference other agents yet.';
      if (r === 2) return 'DEBATE Round 2 — Cross-Examination: Critically evaluate each other agent\'s position. Challenge weak reasoning rigorously.';
      return 'DEBATE Round 3 — Final Synthesis: Synthesize the strongest arguments. Acknowledge challenges. Present a unified recommendation.';
    case 'synthesis':
      if (r === 1) return 'SYNTHESIS Round 1 — Independent Analysis: Analyze thoroughly from your perspective. Note confidence levels.';
      return 'SYNTHESIS Round 2 — Consensus Building: Find common ground. Build on other agents\' strongest insights. Weave a cohesive answer.';
    case 'red-team':
      if (r === 1) return 'RED TEAM Round 1 — Independent Assessment: Analyze strengths AND vulnerabilities. Be honest about risks.';
      if (r === 2) return 'RED TEAM Round 2 — Adversarial Challenge: Attack every assumption. Find where reasoning breaks. Stress-test hard.';
      return 'RED TEAM Round 3 — Hardened Recommendation: Battle-tested recommendation addressing strongest objections. Rate confidence.';
    case 'research':
      if (r === 1) return 'RESEARCH Round 1 — Independent Investigation: Research thoroughly. Present findings with confidence levels. Identify gaps.';
      return 'RESEARCH Round 2 — Cross-Reference: Verify against other agents\' findings. Fill gaps. Synthesize into a comprehensive brief.';
    case 'compare':
      return 'COMPARISON MODE: State your perspective with clear reasoning. Highlight what makes your approach unique. Do NOT critique others.';
    default:
      return 'Be concise and professional. Reference other agents by name when building on their work.';
  }
}

function buildPreamble(mode, round, agentName, roomContext) {
  const base = `You are in a multi-agent project room with other AI agents. You can SEE all messages from other agents.
- Reference other agents by name when building on their work
- Announce what you are covering so others know
- Stay concise — do not repeat what others already covered

`;
  const modeLine = getModePreamble(mode, round);
  return `${base}${modeLine}\n\nYou are ${agentName}. Room context: ${roomContext || 'No specific context.'}`;
}

function formatHistory(history, currentAgentKey) {
  return (history || []).map(function(h) {
    if (h.role === 'user') return { role: 'user', content: h.content };
    if (h.role === 'agent' && h.agentKey === currentAgentKey) return { role: 'assistant', content: h.content };
    var other = MODEL_REGISTRY[h.agentKey];
    var name = other ? other.name : (h.agentKey || 'Other Agent');
    return { role: 'user', content: '[' + name + ']: ' + h.content };
  });
}

async function callAnthropic(agentKey, config, message, history, roomContext, mode, round) {
  var key = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!key) return { agentKey, status: 'error', errorMessage: 'Anthropic key missing' };
  try {
    var systemPrompt = buildPreamble(mode, round, config.name, roomContext);
    var msgs = formatHistory(history, agentKey);
    msgs.push({ role: 'user', content: message });
    var r = await axios.post('https://api.anthropic.com/v1/messages', {
      model: config.model, max_tokens: 1024,
      system: systemPrompt,
      messages: msgs,
    }, { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }, timeout: 30000 });
    var text = (r.data.content || []).find(function(b) { return b.type === 'text'; });
    return { agentKey, status: 'success', content: text ? text.text : '', provider: 'Anthropic', name: config.name };
  } catch(e) { return { agentKey, status: 'error', errorMessage: e.response?.data?.error?.message || e.message, name: config.name }; }
}

async function callOpenAI(agentKey, config, message, history, roomContext, mode, round) {
  var key = process.env.SYNAPSE_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) return { agentKey, status: 'error', errorMessage: 'OpenAI key missing' };
  try {
    var systemPrompt = buildPreamble(mode, round, config.name, roomContext);
    var msgs = formatHistory(history, agentKey);
    msgs.push({ role: 'user', content: message });
    var r = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: config.model,
      messages: [{ role: 'system', content: systemPrompt }, ...msgs],
    }, { headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, timeout: 30000 });
    return { agentKey, status: 'success', content: r.data.choices[0].message.content, provider: 'OpenAI', name: config.name };
  } catch(e) { return { agentKey, status: 'error', errorMessage: e.response?.data?.error?.message || e.message, name: config.name }; }
}

async function callGemini(agentKey, config, message, history, roomContext, mode, round) {
  var key = process.env.GEMINI_API_KEY;
  if (!key) return { agentKey, status: 'error', errorMessage: 'Gemini key missing' };
  try {
    var systemPrompt = buildPreamble(mode, round, config.name, roomContext);
    var contents = formatHistory(history, agentKey).map(function(h) {
      return { role: h.role === 'user' ? 'user' : 'model', parts: [{ text: h.content }] };
    });
    contents.push({ role: 'user', parts: [{ text: systemPrompt + '\n\n' + message }] });
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + config.model + ':generateContent?key=' + key;
    var r = await axios.post(url, { contents }, { headers: { 'Content-Type': 'application/json' }, timeout: 30000 });
    return { agentKey, status: 'success', content: r.data.candidates[0].content.parts[0].text, provider: 'Google', name: config.name };
  } catch(e) { return { agentKey, status: 'error', errorMessage: e.response?.data?.error?.message || e.message, name: config.name }; }
}

async function callDeepSeek(agentKey, config, message, history, roomContext, mode, round) {
  var key = process.env.DEEPSEEK_API_KEY;
  if (!key) return { agentKey, status: 'error', errorMessage: 'DeepSeek key missing' };
  try {
    var systemPrompt = buildPreamble(mode, round, config.name, roomContext);
    var msgs = formatHistory(history, agentKey);
    msgs.push({ role: 'user', content: message });
    var r = await axios.post('https://api.deepseek.com/v1/chat/completions', {
      model: config.model,
      messages: [{ role: 'system', content: systemPrompt }, ...msgs],
    }, { headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, timeout: 30000 });
    return { agentKey, status: 'success', content: r.data.choices[0].message.content, provider: 'DeepSeek', name: config.name };
  } catch(e) { return { agentKey, status: 'error', errorMessage: e.response?.data?.error?.message || e.message, name: config.name }; }
}

async function callAgent(agentKey, message, history, roomContext, mode, round) {
  var config = MODEL_REGISTRY[agentKey];
  if (!config) return { agentKey, status: 'error', errorMessage: 'Unknown agent: ' + agentKey };
  switch (config.provider) {
    case 'anthropic': return callAnthropic(agentKey, config, message, history, roomContext, mode, round);
    case 'openai':    return callOpenAI(agentKey, config, message, history, roomContext, mode, round);
    case 'google':    return callGemini(agentKey, config, message, history, roomContext, mode, round);
    case 'deepseek':  return callDeepSeek(agentKey, config, message, history, roomContext, mode, round);
    default: return { agentKey, status: 'error', errorMessage: 'Unsupported provider: ' + config.provider };
  }
}

async function synthesize(agentResults, roomName, roomContext) {
  var key = process.env.SYNAPSE_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    var successful = agentResults.filter(function(r) { return r.status === 'success'; });
    if (successful.length < 2) return null;
    var combined = successful.map(function(r) { return '[' + r.name + ']: ' + r.content; }).join('\n\n---\n\n');
    var r = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a synthesis engine. Analyze responses from multiple AI agents and write a professional synthesis memo.\n\nRoom: ' + roomName + '\nContext: ' + (roomContext || 'None') + '\n\nStructure:\n**Mission Overview**: Brief summary of the query.\n**Key Insights**: Most important takeaways.\n**Points of Agreement**: Where agents agreed.\n**Divergent Perspectives**: Where they differed.\n**Consolidated Recommendation**: Single clear path forward.' },
        { role: 'user', content: 'Synthesize:\n\n' + combined },
      ],
      temperature: 0.7,
    }, { headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, timeout: 30000 });
    return r.data.choices[0].message.content;
  } catch(e) { return null; }
}

/**
 * Main entry point — broadcast a message to multiple agents in parallel
 * @param {object} opts
 * @param {string} opts.message        — the user's message
 * @param {string[]} opts.agents       — agent keys e.g. ['claude','chatgpt','gemini']
 * @param {string} [opts.preset]       — preset name instead of agents array
 * @param {string} [opts.roomContext]  — background context for the room
 * @param {string} [opts.roomName]     — room name (for synthesis memo)
 * @param {string} [opts.mode]         — 'debate'|'synthesis'|'red-team'|'research'|'compare'|'code-review'
 * @param {number} [opts.round]        — round number for multi-round modes
 * @param {array}  [opts.history]      — prior message history
 * @param {boolean}[opts.synthesize]   — whether to generate synthesis memo (default true)
 */
async function broadcast(opts) {
  var agents = opts.agents || PRESETS[opts.preset] || PRESETS.brainstorm;
  var history = opts.history || [];
  var mode = opts.mode || 'default';
  var round = opts.round || 1;
  var roomContext = opts.roomContext || '';
  var roomName = opts.roomName || 'ACC Room';
  var doSynthesize = opts.synthesize !== false;

  var results = await Promise.all(agents.map(function(agentKey) {
    return callAgent(agentKey, opts.message, history, roomContext, mode, round);
  }));

  var memo = null;
  if (doSynthesize) {
    memo = await synthesize(results, roomName, roomContext);
  }

  var successful = results.filter(function(r) { return r.status === 'success'; });
  var failed     = results.filter(function(r) { return r.status === 'error'; });

  return {
    success: true,
    message: opts.message,
    mode, round, roomName, roomContext,
    agents: agents,
    results,
    successful: successful.length,
    failed: failed.length,
    synthesis: memo,
  };
}

module.exports = { broadcast, MODEL_REGISTRY, PRESETS };
