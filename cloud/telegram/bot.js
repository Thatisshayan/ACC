// cloud/telegram/bot.js — ACC v2 Full Bot
// Features 1-12 integrated: voice, image, notes, jobs, interview, email, scheduler, salary coach
'use strict';

require('dotenv').config(); // load .env before anything else

var axios    = require('axios');
var http     = require('http');
var fs       = require('fs');
var path     = require('path');
var botLock  = require('./botLock.js');
var log      = require('../utils/logger.js').log;
var users    = require('./users.js');

// Feature modules
var voice      = require('./features/voice.js');
var vision     = require('./features/vision.js');
var notes      = require('./features/notes.js');
var jobTracker = require('./features/jobTracker.js');
var scheduler  = require('./features/scheduler.js');
var interview  = require('./features/interview.js');
var emailMon   = require('./features/emailMonitor.js');
var lifeTools  = require('./features/lifeTools.js');
var taskbus    = require('../taskbus/telegramCommands.js');
var workflowRegistry = require('../workflows/registry.js');
var replicateVideo = require('../integrations/replicate.js');

var TOKEN    = process.env.TELEGRAM_BOT_TOKEN;
var CHAT_ID  = process.env.ACC_OWNER_TELEGRAM_CHAT_ID || process.env.SHAYAN_TELEGRAM_CHAT_ID || 'REDACTED';
var ACC_PORT = process.env.PORT || '4000';
var BASE     = 'https://api.telegram.org/bot' + TOKEN;
function resolveMiniWebappUrl() {
  var explicit = process.env.ACC_WEBAPP_URL || process.env.ACC_PUBLIC_URL;
  if (explicit) {
    try {
      return new URL(explicit).origin.replace(/\/+$/, '');
    } catch (_) {
      return String(explicit).replace(/\/+$/, '').replace(/\/mini$/, '');
    }
  }

  if (process.env.ACC_API_BASE_URL) {
    try {
      return new URL(process.env.ACC_API_BASE_URL).origin.replace(/\/+$/, '');
    } catch (_) {}
  }

  return 'https://acc-production-a26c.up.railway.app';
}
var MINI_WEBAPP_URL = resolveMiniWebappUrl();

if (!TOKEN) { console.error('[bot] TELEGRAM_BOT_TOKEN not set'); process.exit(1); }
log('[bot] Token: ' + TOKEN.slice(0,15) + '... | ChatID: ' + CHAT_ID);

var BOT_NAME = 'cloud';
if (!botLock.claimBot(BOT_NAME)) { log('[bot] Another instance active'); process.exit(0); }
setInterval(function() { botLock.heartbeat(BOT_NAME); }, 5000);

// Init feature modules
voice.init(TOKEN);
scheduler.init(sendMsg);
emailMon.init(sendMsg);

// ── Telegram API ──────────────────────────────────────────────────────────────

var tg = axios.create({ baseURL: BASE, timeout: 35000 });

function tgGet(method, params) {
  return tg.get('/' + method, { params: params })
    .then(function(r) { if (r.data.ok) return r.data.result; throw new Error(r.data.description); });
}
function tgPost(method, data) {
  return tg.post(BASE + '/' + method, data)
    .then(function(r) { if (r.data.ok) return r.data.result; throw new Error(r.data.description); });
}
function sendMsg(chatId, text, extra) {
  // Primary: try with Markdown parse_mode
  var payload = Object.assign({ chat_id: chatId, text: String(text), parse_mode: 'Markdown' }, extra || {});
  return tgPost('sendMessage', payload).catch(function(err) {
    // Fallback: Telegram rejected Markdown (400) — retry as plain text
    if (err.message && (err.message.includes('400') || err.message.toLowerCase().includes('parse'))) {
      var plain = Object.assign({ chat_id: chatId, text: String(text) }, extra || {});
      delete plain.parse_mode;
      return tgPost('sendMessage', plain);
    }
    throw err;
  });
}
function sendButtons(chatId, text, buttons) {
  return tgPost('sendMessage', { chat_id: chatId, text: String(text), parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } });
}
function answerCB(id, text) { return tgPost('answerCallbackQuery', { callback_query_id: id, text: text || '' }).catch(function(){}); }

function sendDocument(chatId, filePath, caption) {
  var FormData = require('form-data');
  var form = new FormData();
  form.append('chat_id', String(chatId));
  form.append('document', fs.createReadStream(filePath));
  if (caption) form.append('caption', caption);
  return axios.post(BASE + '/sendDocument', form, { headers: form.getHeaders(), timeout: 60000 })
    .then(function(r) { if (r.data.ok) return r.data.result; throw new Error(r.data.description); });
}

function sendVideo(chatId, videoUrl, caption, extra) {
  var payload = Object.assign({ chat_id: chatId, video: String(videoUrl), caption: caption || '' }, extra || {});
  return tgPost('sendVideo', payload);
}

function dashboardMenu() {
  return [
    [
      { text: '🌐 Mini Web App', web_app: { url: MINI_WEBAPP_URL } },
    ],
    [
      { text: '📋 Live Task Lanes', callback_data: 'dash_lanes' },
      { text: '✅ Approvals Inbox', callback_data: 'task_approvals' }
    ],
    [
      { text: '🧭 Workflow Launcher', callback_data: 'workflow_menu' },
      { text: '📣 Content Studio', callback_data: 'menu_content' }
    ],
    [
      { text: '💼 Job-Apply Assistant', callback_data: 'job_apply_guided' },
      { text: '🛠️ Tools', callback_data: 'menu_more' }
    ],
    [
      { text: '🔄 Refresh Dashboard', callback_data: 'menu_dashboard' },
      { text: '🟦 System Status', callback_data: 'menu_status' }
    ],
  ];
}

function statusMenu() {
  return dashboardMenu();
}

function laneTitle(status) {
  var map = {
    pending: '⏳ Pending Tasks',
    in_progress: '🔄 In Progress',
    waiting_approval: '👁️ Waiting Approval',
    done: '✅ Completed',
    failed: '❌ Failed',
    cancelled: '🚫 Cancelled',
  };
  return map[status] || ('📌 ' + status);
}

function taskLaneButtons(status, tasks) {
  var rows = (Array.isArray(tasks) ? tasks : []).slice(0, 5).map(function(task) {
    return [{ text: (task.approval_required ? '🛡️ ' : '') + trimWorkflowLabel(task.title, 34), callback_data: 'task_open:' + task.id.slice(0, 8) }];
  });
  rows.push([
    { text: '📋 Other Lanes', callback_data: 'dash_lanes' },
    { text: '✅ Approvals', callback_data: 'task_approvals' }
  ]);
  rows.push([
    { text: '🔄 Refresh', callback_data: 'dash_lane:' + status },
    { text: '🟦 Dashboard', callback_data: 'menu_dashboard' }
  ]);
  return rows;
}

async function showTaskLane(chatId, status, userId) {
  var result = await getACC('/api/taskbus/tasks?status=' + encodeURIComponent(status)).catch(function() { return {}; });
  var tasks = result && result.tasks ? result.tasks : [];
  var msg = [
    laneTitle(status),
    '',
    tasks.length ? ('Showing ' + tasks.length + ' task' + (tasks.length === 1 ? '' : 's') + ' in this lane.') : 'No tasks in this lane right now.',
    '',
    tasks.slice(0, 5).map(function(task) {
      return (task.approval_required ? '🛡️ ' : '') + task.title.slice(0, 60) + '\nID: ' + task.id.slice(0, 8) + ' | ' + task.assigned_agent + ' | ' + task.priority;
    }).join('\n\n') || 'Try a different lane or launch a new workflow.',
  ].join('\n');
  await sendButtons(chatId, msg, taskLaneButtons(status, tasks));
}

function downloadFile(fileId) {
  return tgGet('getFile', { file_id: fileId }).then(function(f) {
    return axios.get('https://api.telegram.org/file/bot' + TOKEN + '/' + f.file_path, { responseType: 'arraybuffer', timeout: 60000 })
      .then(function(r) { return { buffer: Buffer.from(r.data), filePath: f.file_path }; });
  });
}

// ── i18n ─────────────────────────────────────────────────────────────────────

var T = {
  en: {
    welcome_new:   '👋 *Welcome to ACC v2!*\n\nI\'m your personal AI assistant — I can find jobs, write your resume, create content, run errands, and much more.\n\nFirst, what\'s your *first name*?',
    ask_language:  '🌐 Choose your language / زبان خود را انتخاب کنید:',
    ready:         '✅ *All set, {name}!*\n\nYour personal workspace is ready. I speak both English and Persian.\n\nTap the menu below to begin 👇',
    main_menu:     '🏠 *ACC — Hello {name}*\n\nWhat can I do for you?',
    processing:    '⏳ *Working on it...*\n\n_{task}_',
    no_resume:     '⚠️ Upload your resume first!\n\n📤 Go to *Resume* → *Upload Resume*',
    upload_prompt: '📎 *Send your resume file*\n\nAccepted: PDF, DOC, DOCX\n\n_Your file is stored privately — only you can access it._',
    resume_saved:  '✅ *Resume saved!*\n\nFile: `{file}`\n\nAll job tasks will use this automatically.',
    full:          '⚠️ System at capacity (10 users). Contact admin.',
  },
  fa: {
    welcome_new:   '👋 *به ACC v2 خوش آمدید!*\n\nمن دستیار هوش مصنوعی شخصی شما هستم — می‌توانم شغل پیدا کنم، رزومه بنویسم، محتوا تولید کنم و خیلی کارهای دیگر.\n\nاول، *اسم* شما چیست؟',
    ask_language:  '🌐 Choose your language / زبان خود را انتخاب کنید:',
    ready:         '✅ *آماده است، {name}!*\n\nفضای کاری شخصی شما آماده شد.\n\nاز منوی زیر شروع کنید 👇',
    main_menu:     '🏠 *ACC — سلام {name}*\n\nچطور می‌توانم کمک کنم؟',
    processing:    '⏳ *در حال پردازش...*\n\n_{task}_',
    no_resume:     '⚠️ اول رزومه‌ات را آپلود کن!\n\n📤 برو به *رزومه* ← *آپلود رزومه*',
    upload_prompt: '📎 *فایل رزومه‌ات را بفرست*\n\nفرمت‌های قابل قبول: PDF، DOC، DOCX\n\n_فایل شما به صورت خصوصی ذخیره می‌شود._',
    resume_saved:  '✅ *رزومه ذخیره شد!*\n\nفایل: `{file}`\n\nتمام وظایف شغلی از این استفاده می‌کنند.',
    full:          '⚠️ سیستم پر است (۱۰ کاربر). با ادمین تماس بگیرید.',
  }
};

function t(userId, key, vars) {
  var user = users.getUserProfile(userId);
  var lang = (user && user.language) || 'en';
  var str  = (T[lang] && T[lang][key]) || T.en[key] || key;
  if (vars) Object.keys(vars).forEach(function(k) { str = str.replace(new RegExp('{'+k+'}','g'), vars[k]); });
  return str;
}
function detectFarsi(text) { return /[\u0600-\u06FF]/.test(text); }

// ── State machine ─────────────────────────────────────────────────────────────
var awaitingState = {};
function setState(userId, action, data) { awaitingState[userId] = { action: action, data: data || {} }; }
function getState(userId)               { return awaitingState[userId] || null; }
function clearState(userId)             { delete awaitingState[userId]; }

// ── ACC server call ───────────────────────────────────────────────────────────
function callACC(p, body) {
  return new Promise(function(resolve) {
    var data = JSON.stringify(body || {});
    var req  = http.request({ hostname: 'localhost', port: parseInt(ACC_PORT), path: p, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, function(res) {
      var d = ''; res.on('data', function(c){d+=c;}); res.on('end', function(){ try { resolve(JSON.parse(d)); } catch(e){ resolve({success:false}); } });
    });
    req.on('error', function(){ resolve({success:false}); });
    req.write(data); req.end();
  });
}

function getACC(p) {
  return new Promise(function(resolve) {
    var req = http.request({ hostname: 'localhost', port: parseInt(ACC_PORT), path: p, method: 'GET' }, function(res) {
      var d = ''; res.on('data', function(c){d+=c;}); res.on('end', function(){ try { resolve(JSON.parse(d)); } catch(e){ resolve({}); } });
    });
    req.on('error', function(){ resolve({}); });
    req.end();
  });
}

function formatMessengerThread(thread, currentUserId) {
  var last = thread.lastMessage || {};
  var sender = String(last.senderId || '') === String(currentUserId) ? 'You' : (last.senderId || 'unknown');
  return [
    (thread.subject || 'Private thread'),
    'Thread: ' + String(thread.id || '').slice(0, 8),
    'Participants: ' + (thread.participants && thread.participants.length ? thread.participants.map(function(user) {
      return user.name || user.id;
    }).join(' • ') : (thread.participantIds || []).join(' • ')),
    'Unread: ' + String(thread.unreadCount || 0),
    last.content ? ('Last from ' + sender + ': ' + String(last.content).slice(0, 120)) : 'No messages yet.',
  ].join('\n');
}

async function showMessengerInbox(chatId, userId) {
  var inbox = await getACC('/api/messages/inbox?userId=' + encodeURIComponent(userId));
  var threads = inbox && Array.isArray(inbox.threads) ? inbox.threads : [];
  if (!threads.length) {
    await sendMsg(chatId, '💬 *Private inbox*\n\nNo threads yet. Start one from the ACC app or with `/msg <recipientId> <message>`.');
    return;
  }
  var rows = threads.slice(0, 5).map(function(thread) {
    return [{ text: trimWorkflowLabel(thread.subject || (thread.participants && thread.participants[0] && thread.participants[0].name) || thread.id, 28), callback_data: 'messenger_thread:' + String(thread.id) }];
  });
  rows.push([{ text: '🔄 Refresh inbox', callback_data: 'messenger_inbox' }, { text: '💬 New message', callback_data: 'menu_more' }]);
  await sendButtons(chatId, '💬 *Private inbox*\n\n' + threads.slice(0, 5).map(function(thread) {
    return formatMessengerThread(thread, userId);
  }).join('\n\n---\n\n'), rows);
}

async function showMessengerThread(chatId, userId, threadId) {
  var thread = await getACC('/api/messages/threads/' + encodeURIComponent(threadId) + '?userId=' + encodeURIComponent(userId));
  if (!thread || thread.success === false || !thread.thread) {
    await sendMsg(chatId, '❌ Thread not found.');
    return;
  }
  var messages = Array.isArray(thread.messages) ? thread.messages : [];
  var text = [
    '💬 *' + (thread.thread.subject || 'Private thread') + '*',
    'Thread: `' + String(thread.thread.id || '').slice(0, 8) + '`',
    '',
    messages.length ? messages.slice(-5).map(function(message) {
      var sender = String(message.senderId || '') === String(userId) ? 'You' : (message.senderId || 'unknown');
      return '*' + sender + '*: ' + String(message.content || '').slice(0, 400);
    }).join('\n\n') : 'No messages yet.',
  ].join('\n');
  await sendButtons(chatId, text, [
    [{ text: '💬 Inbox', callback_data: 'messenger_inbox' }, { text: '🔄 Refresh', callback_data: 'messenger_thread:' + String(threadId) }],
    [{ text: '📊 Dashboard', callback_data: 'menu_dashboard' }],
  ]);
}

async function sendMessengerFromTelegram(chatId, userId, text) {
  var match = String(text || '').match(/^\/(?:msg|dm)\s+(\S+)(?:\s+|:\s*)([\s\S]+)$/i);
  if (!match) {
    await sendMsg(chatId, 'Usage: `/msg <recipientId> <message>`');
    return;
  }
  var recipientQuery = match[1].trim();
  var content = match[2].trim();
  var result = await callACC('/api/messages/send', {
    senderId: userId,
    recipientId: recipientQuery,
    recipientQuery: recipientQuery,
    content: content,
    createdBy: userId,
    transport: 'telegram',
    senderType: 'user',
  });

  if (result && result.success) {
    await sendMsg(chatId, '✅ Message sent into ACC inbox.' + (result.delivery && result.delivery.mirrored ? '\n\nTelegram mirror attempted.' : ''));
    return;
  }

  if (result && result.needsClarification && Array.isArray(result.questions) && result.questions.length) {
    await sendMsg(chatId, '⚠️ ' + result.questions[0]);
    return;
  }

  await sendMsg(chatId, '❌ Could not send message.');
}

// ── executeAndReply: Task Bus ONLY — polls for real result ──────────────────
async function executeAndReply(chatId, agentType, prompt, language) {
  var SHORT_CONTEXT = 'Keep answer SHORT (max 150 words). Bullet points. Practical. No fluff.';
  try {
    var tbRes = await callACC('/api/taskbus/task', {
      title: prompt.slice(0, 80),
      instruction: prompt + '\n\nSYSTEM: ' + SHORT_CONTEXT,
      assigned_agent: 'claude',
      automation_mode: 'semi_auto',
      approval_required: false,
      created_by: 'bot',
    });
    var routing = tbRes.routing || {};
    var out = routing.output || routing.summary;
    if (out && String(out).trim().length > 10) {
      await sendMsg(chatId, String(out).slice(0, 3500));
      return;
    }
    var taskId = tbRes.task && tbRes.task.id;
    if (!taskId) { await sendMsg(chatId, '✅ Done! Send /latesttask to see result.'); return; }
    var start = Date.now();
    while (Date.now() - start < 25000) {
      await new Promise(function(r){ setTimeout(r, 2000); });
      var tr = await getACC('/api/taskbus/task/' + taskId);
      var task = tr.task || {};
      var results = tr.results || [];
      if (task.status === 'done' || task.status === 'completed') {
        var latest = results[results.length - 1] || {};
        var answer = latest.output || latest.summary;
        if (answer && String(answer).trim().length > 5) {
          await sendMsg(chatId, String(answer).slice(0, 3500));
        } else {
          await sendMsg(chatId, '✅ Done! Send /latesttask for result.');
        }
        return;
      }
      if (task.status === 'failed') { await sendMsg(chatId, '❌ ' + (task.error || 'Task failed')); return; }
      if (task.status === 'rate_limited') { await sendMsg(chatId, '⏳ Rate limit. Try again in a few minutes.'); return; }
    }
    await sendMsg(chatId, '⏳ Still processing. Send /latesttask to check.');
  } catch(e) { await sendMsg(chatId, '❌ ' + e.message); }
}

async function handleMessage(msg) {
  if (!msg) return;
  var chatId = msg.chat.id;
  var userId = String(msg.from ? msg.from.id : 'unknown');
  var text   = msg.text ? msg.text.trim() : null;

  // Voice message — Feature 1
  if (msg.voice || msg.audio) {
    await handleVoice(chatId, userId, msg.voice || msg.audio);
    return;
  }
// File/document upload
  if (msg.document || msg.photo) {
    await handleFileUpload(chatId, userId, msg);
    return;
  }

  if (!text) return;

  var user = await users.ensureUserProfile(userId);

  // Onboarding
  if (user.state === 'new' || text === '/start') {
    if (users.isAtCapacity() && !users.getUserProfile(userId)) {
      await sendMsg(chatId, t(userId, 'full')); return;
    }
    if (user.state === 'new') {
      await sendMsg(chatId, '👋 *Welcome to ACC v2!*\n\nI\'m your personal AI assistant. I can:\n💼 Find jobs & tailor your resume\n✍️ Write content & translate\n📝 Save encrypted notes\n🍳 Suggest recipes\n🎯 Run mock interviews\n\nFirst, what\'s your *first name*?');
      users.updateUser(userId, { state: 'onboarding_name' }); return;
    }
    await sendButtons(chatId, t(userId, 'main_menu', { name: user.name || 'friend' }), mainMenu(userId));
    return;
  }
  if (user.state === 'onboarding_name') {
    var name = text.split(' ')[0].replace(/[^a-zA-Z\u0600-\u06FF\u0041-\u005A]/g,'');
    if (name.length < 1) { await sendMsg(chatId, '❌ Please enter your name.'); return; }
    users.updateUser(userId, { name: name, state: 'onboarding_lang' });
    await sendButtons(chatId, t(userId, 'ask_language'), langMenu());
    return;
  }

  // Auto-detect Farsi
  if (detectFarsi(text) && (users.getUserProfile(userId)||{}).language !== 'fa') {
    users.updateUser(userId, { language: 'fa' });
    user = users.getUserProfile(userId);
  }

  // System commands
  if (text === '/menu')        { await sendButtons(chatId, t(userId,'main_menu',{name:(user.name||'friend')}), mainMenu(userId)); return; }
  if (text === '/dashboard' || text === '/status') { await handleStatus(chatId, userId); return; }
  if (text === '/help')        { await handleHelp(chatId, userId); return; }
  if (text === '/briefing' || text === '/briefing afternoon' || text === '/briefing morning') {
    var bType = /morning/i.test(text) ? 'morning' : 'afternoon';
    await sendMsg(chatId, '📬 _Generating your ' + bType + ' briefing..._');
    try {
      await scheduler.sendBriefingForUser(userId, bType);
    } catch (e) {
      await sendMsg(chatId, '❌ Briefing failed: ' + e.message);
    }
    return;
  }
  if (text === '/settings')    { await handleSettings(chatId, userId); return; }
  if (text === '/hub' || text === '/apps')   { await handleHubStatus(chatId, userId); return; }
  if (text === '/loops' || text === '/auto') { await handleLoops(chatId, userId); return; }
  if (text === '/memory')      { await handleMemory(chatId, userId); return; }
  if (/^\/loop_run\s+\S+/.test(text)) {
    var loopId = text.split(/\s+/)[1];
    await handleLoopRun(chatId, userId, loopId); return;
  }
  if (/^\/loop_off\s+\S+/.test(text)) {
    var loopOffId = text.split(/\s+/)[1];
    await handleLoopToggle(chatId, userId, loopOffId, false); return;
  }
  if (/^\/loop_on\s+\S+/.test(text)) {
    var loopOnId = text.split(/\s+/)[1];
    await handleLoopToggle(chatId, userId, loopOnId, true); return;
  }
  if (text === '/notes')       { await sendButtons(chatId, '📝 *Notes Vault*', notesMenu(userId)); return; }
  if (text === '/tracker')     { await sendMsg(chatId, jobTracker.formatTracker(userId, user.language)); return; }
  if (text === '/jobs')        { await sendButtons(chatId, t(userId,'main_menu',{name:user.name||'friend'}), jobsMenu(userId)); return; }
  if (text === '/inbox' || text === '/messages') { await showMessengerInbox(chatId, userId); return; }
  if (/^\/(?:msg|dm)\b/i.test(text)) { await sendMessengerFromTelegram(chatId, userId, text); return; }
  if (/^(job[\s_-]?apply[\s_-]?guided|\/jobapply|\/job-apply)$/i.test(text)) {
    await handleCallback({
      id: 'text_job_apply_guided_' + Date.now(),
      data: 'job_apply_guided',
      message: { chat: { id: chatId } },
      from: { id: userId }
    });
    return;
  }

  // ── Task Bus commands — strict prefix routing ─────────────────────────────
  var taskbusPrefixes = ['/tasks','/taskstats','/taskhelp','/workflows','/task_','/taskdetails_','/taskbus_','/agents','/approvals','/latesttask','/latestresult','/result_','/notebook'];
  var isMaybeTaskbus = taskbusPrefixes.some(function(p) { return text === p || text.startsWith(p); });
  if (isMaybeTaskbus) {
    var tbHandled = await taskbus.handleTaskBusCommand(chatId, userId, text, sendMsg, user, sendButtons);
    if (tbHandled) return;
    await sendMsg(chatId, '❓ Unknown command: `' + text + '`\n\nSend /help for valid commands.');
    return;
  }

  // ── Legacy snapshot approve/reject ────────────────────────────────────────
  if (text.startsWith('/approve_') || text.startsWith('/reject_')) {
    var isApprove = text.startsWith('/approve_');
    var snapId    = text.replace(/^\/(approve|reject)_/,'');
    await callACC('/api/snapshot/'+snapId+(isApprove?'/approve':'/reject'), { approver: 'Shayan' });
    await sendMsg(chatId, (isApprove ? '✅ Approved' : '❌ Rejected') + ': `' + snapId + '`');
    return;
  }

  // ── Unknown slash commands — NEVER create tasks ────────────────────────────
  if (text.startsWith('/')) {
    await sendMsg(chatId, '❓ *Unknown command:* `' + text + '`\n\nSend /help to see all valid commands.\nOr tap /menu to browse features.');
    return;
  }

  // Synapse waiting for input?
  if (user.state === 'synapse_waiting') {
    await handleSynapseMessage(chatId, userId, text);
    return;
  }

  // Interview simulator active?
  var iSess = interview.getSession(userId);
  if (iSess && user.state === 'in_interview') {
    await handleInterviewAnswer(chatId, userId, text, iSess);
    return;
  }

  // State machine
  var state = getState(userId);
  if (state) { await handleStateInput(chatId, userId, text, state, sendButtons); return; }

  // ── task: / tell claude: prefix — route to Task Bus BEFORE generic handler ──
  if (/^(task|create task|new task|tell claude|tell gemini|tell chatgpt|tell notebooklm|video:|generate video:)/i.test(text)) {
    var tbCreated = await taskbus.createTaskFromMessage(userId, text, 'claude', sendMsg, chatId, sendButtons);
    if (tbCreated) return;
  }

  // Free text → Task Bus (DeepSeek only, no Claude)
  await executeAndReply(chatId, 'writer', text, (users.getUserProfile(userId)||{}).language||'en');
}

// ── Voice handler ─────────────────────────────────────────────────────────────
async function handleVoice(chatId, userId, voiceMsg) {
  var user = users.getUserProfile(userId) || {};
  await sendMsg(chatId, '🎤 _Voice message received. Transcribing..._');
  try {
    var dl = await downloadFile(voiceMsg.file_id);
    var ext = path.extname(dl.filePath) || '.ogg';
    var text = await voice.transcribe(dl.buffer, ext, user.language);
    if (!text) {
      await sendMsg(chatId, '⚠️ _Voice transcription requires_ `OPENAI_API_KEY`_. Add it to .env_');
      return;
    }
    await sendMsg(chatId, '🎤 *You said:*\n"' + text + '"\n\n_Processing..._');
    // Reprocess as text
    await callACC('/api/execute', { agentType: 'architect', payload: { prompt: text, mode: 'plan', language: user.language||'en', userId: userId }, meta: { role: 'member', userId: userId, sandbox: true } });
    await sendMsg(chatId, '✅ *Task queued from voice!*');
  } catch(e) {
    log('[bot] voice err:', e.message);
    await sendMsg(chatId, '❌ Could not process voice message: ' + e.message);
  }
}

// ── File upload handler ───────────────────────────────────────────────────────
async function handleFileUpload(chatId, userId, msg) {
  var user = users.getUserProfile(userId) || {};

  // Photo — Feature 2: Image Analysis
  if (msg.photo) {
    var photoArr = msg.photo;
    var bestPhoto = photoArr[photoArr.length - 1]; // highest resolution
    await sendMsg(chatId, '🔍 _Analyzing image..._');
    try {
      var dl  = await downloadFile(bestPhoto.file_id);
      var res = await vision.analyzeImageBuffer(dl.buffer, 'image/jpeg', msg.caption || null, user.language);
      if (res.success) {
        await sendMsg(chatId, '🖼️ *Image Analysis:*\n\n' + res.analysis);
      } else {
        await sendMsg(chatId, '⚠️ Image analysis requires OPENAI_API_KEY. Error: ' + res.error);
      }
    } catch(e) {
      await sendMsg(chatId, '❌ Could not analyze image: ' + e.message);
    }
    return;
  }

  var doc  = msg.document;
  if (!doc) return;
  var mime = doc.mime_type || '';
  var name = doc.file_name || ('file_' + Date.now());

  // Image document — also analyze
  if (mime.startsWith('image/')) {
    await sendMsg(chatId, '🔍 _Analyzing image document..._');
    try {
      var dl2  = await downloadFile(doc.file_id);
      var res2 = await vision.analyzeImageBuffer(dl2.buffer, mime, null, user.language);
      await sendMsg(chatId, res2.success ? '🖼️ *Analysis:*\n\n' + res2.analysis : '⚠️ Analysis failed: ' + res2.error);
    } catch(e) { await sendMsg(chatId, '❌ Error: ' + e.message); }
    return;
  }

  var allowed = ['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
  if (!allowed.includes(mime) && !name.match(/\.(pdf|doc|docx)$/i)) {
    await sendMsg(chatId, '❌ Please send a *PDF or Word document*.');
    return;
  }
  await sendMsg(chatId, '⏳ _Saving your file..._');
  try {
    var dl3   = await downloadFile(doc.file_id);
    var ext  = path.extname(name) || '.pdf';
    var fname = 'resume' + ext;
    users.saveUserFile(userId, fname, Buffer.from(dl3.buffer));
    users.updateUser(userId, { resumeFile: fname });
    await sendMsg(chatId, t(userId, 'resume_saved', { file: fname }));
    await sendButtons(chatId, '📋 _What next?_', resumeMenu(userId));
  } catch(e) {
    await sendMsg(chatId, '❌ Failed to save file: ' + e.message);
  }
}

// ── Interview answer handler ──────────────────────────────────────────────────
async function handleInterviewAnswer(chatId, userId, text, session) {
  var updated = interview.submitAnswer(userId, text);
  var fb      = interview.formatFeedback(session.questions[session.currentQ - 1], text, session.language);
  updated.scores.push(fb.score);
  await sendMsg(chatId, fb.feedback);
  var next = interview.getCurrentQuestion(updated);
  if (next) {
    var qNum = updated.currentQ + 1;
    var total = interview.getTotalQuestions(updated);
    await sendMsg(chatId, '❓ *Question ' + qNum + '/' + total + ':*\n\n' + next);
  } else {
    var summary = interview.formatSummary(updated);
    await sendMsg(chatId, summary);
    interview.clearSession(userId);
    users.updateUser(userId, { state: 'ready' });
    await sendButtons(chatId, '🏠 Back to main menu:', mainMenu(userId));
  }
}

// ── State input handler ───────────────────────────────────────────────────────
async function handleStateInput(chatId, userId, text, state, sendButtons) {
  var user = users.getUserProfile(userId) || {};
  clearState(userId);

  switch (state.action) {
    case 'awaiting_job_apply_role':
      users.updateUser(userId, { jobPrefs: Object.assign({}, user.jobPrefs, { role: text }) });
      await sendButtons(
        chatId,
        '📍 *Optional location*\n\nType a city, country, or remote preference. If you want, you can skip this step and go straight to workflow mode.',
        jobApplyLocationMenu()
      );
      setState(userId, 'awaiting_job_apply_location', { role: text });
      break;

    case 'awaiting_job_apply_location':
      users.updateUser(userId, { jobPrefs: Object.assign({}, user.jobPrefs, { location: text }) });
      await sendButtons(chatId, 'Choose how you want ACC to handle this role:', jobWorkflowModeMenu());
      setState(userId, 'awaiting_job_apply_mode', {
        role: state.data.role,
        location: text
      });
      break;

    case 'awaiting_job_apply_mode':
      // Mode is chosen via buttons. Keep the menu visible if the user types text.
      await sendButtons(chatId, 'Pick a workflow mode from the buttons below:', jobWorkflowModeMenu());
      setState(userId, 'awaiting_job_apply_mode', state.data || {});
      break;

    case 'awaiting_job_apply_confirm':
      await sendButtons(chatId, 'Review the launch details below, then tap Launch.', jobApplyReviewMenu());
      setState(userId, 'awaiting_job_apply_confirm', state.data || {});
      break;

    case 'awaiting_job_role':
      users.updateUser(userId, { jobPrefs: Object.assign({}, user.jobPrefs, { role: text }) });
      await sendMsg(chatId, '📍 ' + (user.language==='fa' ? 'شهر یا کشور؟' : 'Which city or country?'));
      setState(userId, 'awaiting_job_location', { role: text }); break;

    case 'awaiting_job_location':
      users.updateUser(userId, { jobPrefs: Object.assign({}, user.jobPrefs, { location: text }) });
      await sendButtons(chatId, user.language==='fa' ? '⏰ نوع شغل:' : '⏰ Job type:', jobTypeMenu(userId));
      setState(userId, 'awaiting_job_type', { role: state.data.role, location: text }); break;

    case 'awaiting_tailor_role':
      await sendMsg(chatId, '✏️ _Tailoring your resume for_ *' + text.slice(0,60) + '*_..._');
      await executeAndReply(chatId, 'writer',
        'You are a professional resume writer. Tailor this resume for the following role/job description. ' +
        'Highlight relevant skills, reorder bullet points, optimize keywords for ATS. ' +
        'Role/JD: ' + text + '\n\nProvide the tailored resume content with specific changes highlighted.',
        user.language);
      break;

    case 'awaiting_cover_role':
      if (!user.resumeFile) { await sendMsg(chatId, t(userId,'no_resume')); break; }
      await sendMsg(chatId, '✍️ _Writing your cover letter for_ *' + text + '*_..._');
      await executeAndReply(chatId, 'writer', 'Write a professional cover letter for role: ' + text + '. 3 paragraphs, compelling and specific.', user.language);
      break;

    case 'awaiting_interview_role':
      await sendMsg(chatId, '🎯 _Starting mock interview for_ *' + text + '*_..._\n\nAnswer each question naturally. I\'ll grade you and give feedback.');
      var sess = await interview.startInterview(userId, text, user.language);
      users.updateUser(userId, { state: 'in_interview' });
      var q1 = interview.getCurrentQuestion(sess);
      await sendMsg(chatId, '❓ *Question 1/' + interview.getTotalQuestions(sess) + ':*\n\n' + q1);
      break;

    case 'awaiting_salary_input':
      await sendMsg(chatId, '💰 _Analyzing the offer and preparing negotiation strategy..._');
      await executeAndReply(chatId, 'writer', 'Salary negotiation coach: analyze this offer and give exact counter-offer scripts and numbers: ' + text, user.language);
      break;

    case 'awaiting_resume':
      await sendMsg(chatId, user.language === 'fa'
        ? '📎 لطفاً فایل رزومه‌ات را بفرست (PDF یا Word).\n\nروی 📎 بزن و فایل را انتخاب کن.'
        : '📎 Please send your resume file (PDF or Word).\n\nTap the 📎 attachment icon and select your file.');
      setState(userId, 'awaiting_resume');
      break;

    case 'awaiting_note_title':
      setState(userId, 'awaiting_note_content', { title: text });
      await sendMsg(chatId, '📝 ' + (user.language==='fa'?'محتوای یادداشت:':'Note content:')); break;

    case 'awaiting_note_content':
      var note = notes.addNote(userId, state.data.title, text);
      await sendMsg(chatId, '✅ *Note saved!*\n\nTitle: *' + note.title + '*\nID: `' + note.id + '`\n\n_Encrypted and stored privately._');
      break;

    case 'awaiting_note_search':
      var found = notes.searchNotes(userId, text);
      await sendMsg(chatId, '🔍 *Search results:*\n\n' + notes.formatList(found, user.language)); break;

    case 'awaiting_note_delete':
      var del = notes.deleteNote(userId, text);
      await sendMsg(chatId, del ? '✅ Note deleted.' : '❌ Note ID not found.'); break;

    case 'awaiting_linkedin_email':
      if (!text.includes('@')) { await sendMsg(chatId, '❌ Invalid email.'); setState(userId,'awaiting_linkedin_email'); break; }
      users.updateUser(userId, { linkedinEmail: text });
      await sendMsg(chatId, '✅ *LinkedIn connected!*\nEmail: `' + text + '`'); break;

    case 'awaiting_email_address': {
      var emAddr = text.trim().toLowerCase();
      if (!emAddr.includes('@') || !emAddr.includes('.')) {
        await sendMsg(chatId, user.language==='fa'?'❌ آدرس ایمیل معتبر نیست. دوباره وارد کنید:':'❌ Invalid email address. Please enter again:');
        setState(userId,'awaiting_email_address');
        break;
      }
      var detected = emailMon.detectImapHost(emAddr);
      setState(userId, 'awaiting_email_password', { email: emAddr, imapHost: detected.host, imapPort: detected.port });
      var pwMsg = user.language==='fa'
        ? '🔑 *رمز عبور اپلیکیشن*\n\nسرور: `' + detected.host + ':' + detected.port + '`\n\nرمز App Password (نه رمز اصلی) را وارد کنید:\n_برای Gmail: myaccount.google.com ← Security ← App passwords_'
        : '🔑 *App Password*\n\nDetected IMAP server: `' + detected.host + ':' + detected.port + '`\n\nEnter your App Password (not your regular password):\n_Gmail: myaccount.google.com → Security → 2-Step Verification → App passwords_';
      await sendMsg(chatId, pwMsg);
      break;
    }

    case 'awaiting_email_password': {
      var emData   = state.data || {};
      var emEmail  = emData.email;
      var emHost   = emData.imapHost;
      var emPort   = emData.imapPort || 993;
      await sendMsg(chatId, user.language==='fa'?'⏳ _در حال بررسی اتصال..._':'⏳ _Testing connection..._');
      var emResult = await emailMon.enableMonitor(userId, emEmail, text.trim(), emHost, emPort);
      if (emResult.success) {
        emailMon.startPolling(5);
        var okMsg = user.language==='fa'
          ? '✅ *مانیتورینگ ایمیل فعال شد!*\n\nحساب: `' + emEmail + '`\nهر ۵ دقیقه یک‌بار صندوق ورودی شما بررسی می‌شود و ایمیل‌های مرتبط با شغل ارسال می‌شوند.'
          : '✅ *Email monitoring enabled!*\n\nAccount: `' + emEmail + '`\nYour inbox will be checked every 5 minutes and job-related emails will be forwarded here.';
        await sendMsg(chatId, okMsg);
      } else {
        var errMsg = user.language==='fa'
          ? '❌ *اتصال ناموفق*\n\n' + (emResult.error||'خطای ناشناخته') + '\n\nدوباره با /email_monitor تلاش کنید.'
          : '❌ *Connection failed*\n\n' + (emResult.error||'Unknown error') + '\n\nTry again with /email_monitor.';
        await sendMsg(chatId, errMsg);
      }
      break;
    }

    case 'awaiting_content_topic':
      var ctype = state.data && state.data.type;
      var cprompt = {
        video:    'Write a complete YouTube video script about: ' + text + '. Include hook (0-30s), intro, 3-5 main sections with talking points, B-roll suggestions, and strong CTA. Format with timestamps.',
        social:   'Write 5 social media posts about: ' + text + '. Include one for LinkedIn (professional), Instagram (visual/casual), Twitter/X (punchy), Facebook (community), and TikTok (trending hook). Add relevant hashtags.',
        seo:      'Write SEO-optimized content about: ' + text + '. Include title, meta description, H1/H2 structure, and 500 words of content with natural keyword integration.',
        blog:     'Write a complete blog post about: ' + text + '. Include engaging title, intro, 3-5 sections with subheadings, examples, and conclusion with CTA. ~800 words.',
        email:    'Write a 5-email marketing sequence about: ' + text + '. Include subject lines, preview text, and body for: welcome, value, social proof, offer, and follow-up emails.',
        legal:    'You are a helpful legal assistant (not a lawyer). Explain in plain language: ' + text + '. Note: this is general info, not legal advice.',
        shopping: 'Create an organized shopping list for: ' + text + '. Group by category (produce, dairy, pantry, etc). Estimate quantities.',
        travel:   'Create a detailed travel plan for: ' + text + '. Include itinerary, accommodation suggestions, must-see spots, food recommendations, and budget estimate.',
        gift:     'Suggest 10 creative gift ideas for: ' + text + '. Include price range, where to buy, and why it\'s a good choice.',
        health:   'Provide helpful general health information about: ' + text + '. Note: always consult a doctor for medical decisions.',
        schedule: 'Create a detailed schedule/plan for: ' + text + '. Include time blocks, priorities, and actionable steps.',
        kijiji:   'Write a compelling marketplace listing for: ' + text + '. Include attention-grabbing title, detailed description, condition, and suggested price.',
        data:     'Analyze this data and provide insights: ' + text + '. Identify trends, anomalies, and actionable recommendations.',
        youtube:  'Create a complete YouTube content package for: ' + text + '. Include: video title (SEO), description, tags, thumbnail concept, full script, and a concise promo-video concept.',
        replicate_video: 'Create a short, cinematic promo-video concept for: ' + text + '. Focus on one scene, clear motion, and strong visual direction.',
      }[ctype] || text;
      await sendMsg(chatId, t(userId,'processing',{task:text.slice(0,60)}));
      await executeAndReply(chatId, 'writer', cprompt, user.language);
      if (ctype === 'youtube' || ctype === 'replicate_video') {
        try {
          if (!replicateVideo.enabled()) {
            await sendMsg(chatId, 'ℹ️ Replicate video is not configured yet. Add REPLICATE_API_TOKEN or REPLICATE_API_KEY to enable clip generation.');
            break;
          }
          await sendMsg(chatId, '🎬 _Generating a short video preview with Replicate..._');
          var videoPrompt = ctype === 'youtube'
            ? 'Cinematic YouTube promo clip about: ' + text
            : 'Short cinematic promo video for: ' + text;
          var rv = await replicateVideo.generateVideo(videoPrompt, {
            duration: 5,
            resolution: '720p',
            aspect_ratio: '16:9',
            fps: 24,
            camera_fixed: false,
          });
          if (rv && rv.success && rv.video_url) {
            try {
              await sendVideo(chatId, rv.video_url, '🎬 Replicate video preview');
            } catch(sendErr) {
              await sendMsg(chatId, '🎬 Video preview ready: ' + rv.video_url);
            }
          } else if (rv && rv.web_url) {
            await sendMsg(chatId, '🎬 Replicate is still processing. Track the preview here:\n' + rv.web_url);
          } else {
            await sendMsg(chatId, '⚠️ Replicate video generation failed: ' + ((rv && rv.error) || 'unknown error'));
          }
        } catch(e) {
          await sendMsg(chatId, '⚠️ Replicate video generation failed: ' + e.message);
        }
      }
      break;

    case 'awaiting_landing_desc':
      await sendMsg(chatId, t(userId,'processing',{task:'Landing page: '+text.slice(0,50)}));
      await executeAndReply(chatId, 'writer', 'Create compelling landing page copy for: ' + text + '. Include headline, 3 benefits, CTA.', user.language);
      break;

    case 'awaiting_chef_request':
      await sendMsg(chatId, '🍳 _Finding recipes for you..._');
      await executeAndReply(chatId, 'writer', 'You are a personal chef AI. User asks: ' + text + '. Give 3 meal options with full recipes, ingredients and cooking time.', user.language);
      break;

    case 'awaiting_translate':
      var targetLang = user.language==='fa' ? 'English' : 'Persian/Farsi';
      await sendMsg(chatId, '🌐 _Translating to ' + targetLang + '..._');
      await executeAndReply(chatId, 'writer', 'Translate to ' + targetLang + ', output translation only: ' + text, user.language);
      break;

    case 'awaiting_research':
      await sendMsg(chatId, t(userId,'processing',{task:'Research: '+text.slice(0,50)}));
      await executeAndReply(chatId, 'writer', 'Research and summarize with key facts and insights: ' + text, user.language);
      break;

    case 'awaiting_brainstorm':
      await sendMsg(chatId, t(userId,'processing',{task:'Brainstorm: '+text.slice(0,50)}));
      await executeAndReply(chatId, 'writer', 'Generate 10 creative ideas for: ' + text + '. Include pros/cons for top 3.', user.language);
      break;

    case 'awaiting_workflow_input':
      var commandPrefix = String(state.data && state.data.commandPrefix || '').trim();
      if (!commandPrefix) {
        await sendMsg(chatId, '⚠️ Workflow command missing. Open /workflows and try again.');
        break;
      }
      await sendMsg(chatId, '🔁 Launching workflow...\n\n' + commandPrefix + text);
      await taskbus.createTaskFromMessage(userId, commandPrefix + text, 'claude', sendMsg, chatId, sendButtons);
      break;

    default:
      await sendButtons(chatId, t(userId,'main_menu',{name:user.name||'friend'}), mainMenu(userId));
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function handleStatus(chatId, userId) {
  var h     = await callACC('/api/health', {});
  var stats = await getACC('/api/taskbus/stats').catch(function() { return {}; });
  var workflows = await getACC('/api/taskbus/workflows').catch(function() { return {}; });
  var bridge = await getACC('/alphonso-bridge/status').catch(function() { return {}; });
  var rep   = replicateVideo && typeof replicateVideo.checkHealth === 'function' ? await replicateVideo.checkHealth().catch(function() { return null; }) : null;
  var count = users.getUserCount();
  var files = users.listUserFiles(userId).length;
  var user  = users.getUserProfile(userId) || {};
  var taskStats = stats && stats.stats ? stats.stats : {};
  var totalTasks = taskStats.total_tasks || 0;
  var pendingApprovals = taskStats.pending_approvals || 0;
  var byStatus = taskStats.by_status || {};
  var totalWorkflows = workflows && workflows.total ? workflows.total : (workflows && workflows.workflows ? workflows.workflows.length : 0);
  var msg   = '📊 *ACC v2 Status*\n\n' +
    '🟢 Server: ' + (h.ok ? 'Online' : 'Offline') + '\n' +
    '🎥 Replicate video: ' + (rep && rep.status === 'available' ? 'Ready' : 'Not configured') + '\n' +
    '🔗 Alphonso bridge: ' + (bridge && bridge.bridge && bridge.bridge.status ? bridge.bridge.status : 'setup_required') + '\n' +
    '🧭 Workflows: ' + totalWorkflows + '\n' +
    '📋 Tasks: ' + totalTasks + '\n' +
    '🛡️ Pending approvals: ' + pendingApprovals + '\n' +
    '📦 Lanes: pending ' + (byStatus.pending || 0) + ' · progress ' + (byStatus.in_progress || 0) + ' · waiting ' + (byStatus.waiting_approval || 0) + ' · done ' + (byStatus.done || 0) + ' · failed ' + (byStatus.failed || 0) + '\n' +
    '🤖 Bot: Running\n' +
    '👥 Users: ' + count + '/10\n' +
    '📁 Your files: ' + files + '\n' +
    '📝 Your notes: ' + notes.getNotes(userId).length + '\n' +
    '💼 Jobs tracked: ' + jobTracker.getJobs(userId).length + '\n' +
    '🕐 Last seen: ' + new Date().toLocaleTimeString();
  await sendButtons(chatId, msg, statusMenu());
}

async function handleSettings(chatId, userId) {
  var u = users.getUserProfile(userId) || {};
  var msg = '⚙️ *Your Profile*\n\n' +
    '👤 Name: *' + (u.name||'—') + '*\n' +
    '🌐 Language: *' + (u.language==='fa'?'فارسی':'English') + '*\n' +
    '📄 Resume: *' + (u.resumeFile||'—') + '*\n' +
    '🔗 LinkedIn: *' + (u.linkedinEmail||'—') + '*\n';
  await sendButtons(chatId, msg, [
    [{text:'🌐 Change Language',callback_data:'lang_menu'},{text:'📤 Upload Resume',callback_data:'upload_resume'}],
    [{text:'🔗 Connect LinkedIn',callback_data:'connect_linkedin'}],
    [{text:'◀️ Back',callback_data:'back_main'}],
  ]);
}

async function handleHelp(chatId, userId) {
  var fa = (users.getUserProfile(userId)||{}).language === 'fa';
  var msg = fa
    ? '❓ *دستورات ACC v2*\n\n'
    : '❓ *ACC v2 Commands*\n\n';

  msg += '*Bot & Features:*\n';
  msg += '`/start`    — Main menu\n';
  msg += '`/menu`     — Feature categories\n';
  msg += '`/dashboard`— Premium dashboard\n';
  msg += '`/status`   — System health\n';
  msg += '`/jobs`     — Job search\n';
  msg += '`/notes`    — Encrypted notes\n';
  msg += '`/tracker`  — Job tracker\n';
  msg += '`/settings` — Your profile\n';
  msg += '`/language` — Change language\n\n';

  msg += '*Task Bus:*\n';
  msg += '`/tasks`          — Recent tasks\n';
  msg += '`/taskstats`      — Task counts by status\n';
  msg += '`/agents`         — Agent + provider status\n';
  msg += '`/approvals`      — Pending approvals\n';
  msg += '`/latesttask`     — Newest task\n';
  msg += '`/latestresult`   — Newest AI result\n';
  msg += '`/task_<id>`      — Task detail by ID\n';
  msg += '`/result_<id>`    — Result detail by ID\n';
  msg += '`/taskbus_approve_<id>` — Approve task\n';
  msg += '`/taskbus_reject_<id>`  — Reject task\n\n';

  msg += '*Workflows:*\n';
  msg += '`/workflows`               â€” List all registered workflows\n';
  msg += '`task: run workflow: <id>`  â€” Launch a workflow by name\n';
  msg += '`crew: use-workflow <id>`   â€” Launch a CrewAI workflow explicitly\n';
  msg += '`workflow: parallel <a, b>` â€” Run workflows side by side\n';
  msg += '`video: <prompt>`           â€” Generate a Replicate clip\n\n';
  msg += '*Job Apply:*\n';
  msg += '`apply for jobs for this role for me: <role>` â€” Guided job workflow\n';
  msg += '`job apply guided` â€” Open the interactive assistant\n\n';

  msg += '*Create tasks (free text):*\n';
  msg += '`task: <instruction>`         — Claude task\n';
  msg += '`tell claude: <instruction>`  — Claude task\n';
  msg += '`tell gemini: <instruction>`  — Gemini task\n\n';

  msg += '_Or just type anything naturally — the bot understands!_ 🎤';
  await sendMsg(chatId, msg);
}

// ── Callback handler ──────────────────────────────────────────────────────────
async function handleCallback(cb) {
  var chatId = cb.message.chat.id;
  var userId = String(cb.from.id);
  var data   = cb.data || '';
  var user   = users.getUserProfile(userId) || {};
  await answerCB(cb.id);
  clearState(userId);

  // ── Approval inline button callbacks ────────────────────────────────────────
  if (data.startsWith('taskbus_approve_') || data.startsWith('taskbus_reject_')) {
    var slashCmd = '/' + data;
    var tbCmd = require('./taskbus/telegramCommands.js');
    var handled = await tbCmd.handleTaskBusCommand(chatId, userId, slashCmd, sendMsg, user, sendButtons);
    if (!handled) await sendMsg(chatId, handled === false ? 'Approval processed.' : 'Could not process. Try /approvals');
    return;
  }

  if (data === 'workflow_list') {
    var tbCmd2 = require('./taskbus/telegramCommands.js');
    await tbCmd2.handleTaskBusCommand(chatId, userId, '/workflows', sendMsg, user, sendButtons);
    return;
  }

  if (data === 'task_tasks' || data === 'task_approvals' || data === 'task_stats' || data === 'task_agents') {
    var tbCmd3 = require('./taskbus/telegramCommands.js');
    var cmdMap = { task_tasks: '/tasks', task_approvals: '/approvals', task_stats: '/taskstats', task_agents: '/agents' };
    await tbCmd3.handleTaskBusCommand(chatId, userId, cmdMap[data], sendMsg, user, sendButtons);
    return;
  }

  if (data && data.indexOf('task_open:') === 0) {
    var taskId = data.split(':')[1];
    var tbCmd4 = require('./taskbus/telegramCommands.js');
    await tbCmd4.handleTaskBusCommand(chatId, userId, '/task_' + taskId, sendMsg, user, sendButtons);
    return;
  }

  if (data && data.indexOf('approval_open:') === 0) {
    var approvalId = data.split(':')[1];
    var tbCmd5 = require('./taskbus/telegramCommands.js');
    await tbCmd5.handleTaskBusCommand(chatId, userId, '/task_' + approvalId, sendMsg, user, sendButtons);
    await sendButtons(chatId,
      '🛡️ *Approval required* for task `' + approvalId + '`\n\nTap to approve or reject:',
      [
        [{ text: '✅ Approve', callback_data: 'taskbus_approve_' + approvalId },
         { text: '❌ Reject',  callback_data: 'taskbus_reject_'  + approvalId }],
        [{ text: '📋 All Approvals', callback_data: 'task_approvals' }],
      ]
    );
    return;
  }

  if (data === 'workflow_menu') {
    await sendButtons(chatId, '🧭 *Workflow Launcher*\n\nPick a workflow to run.', workflowMenu(userId));
    return;
  }

  if (data === 'messenger_inbox') {
    await showMessengerInbox(chatId, userId);
    return;
  }

  if (data && data.indexOf('messenger_thread:') === 0) {
    await showMessengerThread(chatId, userId, data.split(':')[1]);
    return;
  }

  if (data === 'menu_dashboard' || data === 'dashboard_menu') {
    await handleStatus(chatId, userId);
    return;
  }

  if (data === 'dash_lanes') {
    var statsForLanes = await getACC('/api/taskbus/stats').catch(function() { return {}; });
    var byStatus = (statsForLanes && statsForLanes.stats && statsForLanes.stats.by_status) ? statsForLanes.stats.by_status : {};
    var rows = [
      [{ text: '⏳ Pending (' + (byStatus.pending || 0) + ')', callback_data: 'dash_lane:pending' }, { text: '🔄 In Progress (' + (byStatus.in_progress || 0) + ')', callback_data: 'dash_lane:in_progress' }],
      [{ text: '👁️ Approval (' + (byStatus.waiting_approval || 0) + ')', callback_data: 'dash_lane:waiting_approval' }, { text: '✅ Done (' + (byStatus.done || 0) + ')', callback_data: 'dash_lane:done' }],
      [{ text: '❌ Failed (' + (byStatus.failed || 0) + ')', callback_data: 'dash_lane:failed' }, { text: '🟦 Dashboard', callback_data: 'menu_dashboard' }],
    ];
    await sendButtons(chatId, '📋 *Live Task Lanes*\n\nPick a lane to inspect real tasks, not summaries.', rows);
    return;
  }

  if (data && data.indexOf('dash_lane:') === 0) {
    await showTaskLane(chatId, data.split(':')[1], userId);
    return;
  }

  if (data === 'career_workflows' || data === 'workflow_career') {
    await sendButtons(chatId, '💼 *Career Workflows*\n\nChoose the job flow you want.', careerWorkflowMenu(userId));
    return;
  }

  if (data === 'job_apply_guided') {
    var savedRole = (user.jobPrefs && user.jobPrefs.role) ? String(user.jobPrefs.role).trim() : '';
    if (savedRole) {
      await sendButtons(chatId, '🪄 *Guided Job Apply*\n\nUse your saved role, or type a new one.', [
        [{ text: 'Use saved role: ' + trimWorkflowLabel(savedRole, 24), callback_data: 'job_apply_saved_role' }],
        [{ text: 'Type a new role', callback_data: 'job_apply_type_role' }],
        [{ text: '🔙 Back', callback_data: 'menu_jobs' }],
      ]);
    } else {
      await sendMsg(chatId, '🪄 *Guided Job Apply*\n\nType the role you want to apply for. I’ll then ask which workflow mode to use.');
      setState(userId, 'awaiting_job_apply_role', {});
    }
    return;
  }

  if (data === 'job_apply_saved_role') {
    var roleFromProfile = (user.jobPrefs && user.jobPrefs.role) ? String(user.jobPrefs.role).trim() : '';
    if (!roleFromProfile) {
      await sendMsg(chatId, '⚠️ No saved role found. Type the role you want to apply for.');
      setState(userId, 'awaiting_job_apply_role', {});
      return;
    }
    await sendMsg(chatId, '📍 Optional: add a location for *' + roleFromProfile + '* or tap Skip to continue.');
    await sendButtons(chatId, 'Choose how you want ACC to handle: *' + roleFromProfile + '*', jobApplyLocationMenu());
    setState(userId, 'awaiting_job_apply_location', { role: roleFromProfile });
    return;
  }

  if (data === 'job_apply_type_role') {
    await sendMsg(chatId, 'Type the role you want to apply for. I’ll guide the next step after that.');
    setState(userId, 'awaiting_job_apply_role', {});
    return;
  }

  if (data === 'job_apply_edit_location') {
    var roleForLocation = String((user.jobPrefs && user.jobPrefs.role) || (getState(userId) && getState(userId).data && getState(userId).data.role) || '').trim();
    if (!roleForLocation) {
      await sendMsg(chatId, '⚠️ I need a role first. Tap Guided Job Apply and type the role.');
      setState(userId, 'awaiting_job_apply_role', {});
      return;
    }
    await sendMsg(chatId, '📍 Type the location, country, or remote preference for *' + roleForLocation + '*.');
    setState(userId, 'awaiting_job_apply_location', { role: roleForLocation });
    return;
  }

  if (data === 'job_apply_skip_location') {
    var skipRole = String((user.jobPrefs && user.jobPrefs.role) || '').trim();
    if (!skipRole) {
      await sendMsg(chatId, '⚠️ I need a role first. Tap Guided Job Apply and type the role.');
      setState(userId, 'awaiting_job_apply_role', {});
      return;
    }
    await sendButtons(chatId, 'Choose how you want ACC to handle: *' + skipRole + '*', jobWorkflowModeMenu());
    setState(userId, 'awaiting_job_apply_mode', { role: skipRole, location: String((user.jobPrefs && user.jobPrefs.location) || '').trim() });
    return;
  }

  if (data && data.indexOf('job_apply_mode:') === 0) {
    var workflowMode = data.split(':')[1];
    var modeRole = String((user.jobPrefs && user.jobPrefs.role) || '').trim();
    var modeLocation = String((user.jobPrefs && user.jobPrefs.location) || '').trim();
    if (!modeRole) {
      await sendMsg(chatId, '⚠️ I need a role first. Tap Guided Job Apply and type the role.');
      setState(userId, 'awaiting_job_apply_role', {});
      return;
    }
    var roleInput = modeRole + (modeLocation ? ' in ' + modeLocation : '');
    users.updateUser(userId, { jobPrefs: Object.assign({}, user.jobPrefs, { role: modeRole, location: modeLocation, jobMode: workflowMode }) });
    await sendButtons(
      chatId,
      '✅ *Review before launch*\n\n' + jobApplySummaryText(modeRole, modeLocation, workflowMode),
      jobApplyReviewMenu()
    );
    setState(userId, 'awaiting_job_apply_confirm', { role: modeRole, location: modeLocation, mode: workflowMode });
    return;
  }

  if (data === 'job_apply_launch') {
    var launchState = getState(userId);
    var launchData = (launchState && launchState.data) || {};
    var launchRole = String(launchData.role || (user.jobPrefs && user.jobPrefs.role) || '').trim();
    var launchLocation = String(launchData.location || (user.jobPrefs && user.jobPrefs.location) || '').trim();
    var launchMode = String(launchData.mode || (user.jobPrefs && user.jobPrefs.jobMode) || 'legacy').trim();
    if (!launchRole) {
      await sendMsg(chatId, '⚠️ I need a role first. Tap Guided Job Apply and type the role.');
      setState(userId, 'awaiting_job_apply_role', {});
      return;
    }
    var launchRoleInput = launchRole + (launchLocation ? ' in ' + launchLocation : '');
    var launchCommand;
    if (launchMode === 'crewai') {
      launchCommand = 'crew: use-workflow autonomous_resume_driven_job_search_with_clickup_integration for ' + launchRoleInput;
    } else if (launchMode === 'parallel') {
      launchCommand = 'workflow: parallel intelligent_job_application_automation, autonomous_resume_driven_job_search_with_clickup_integration for ' + launchRoleInput;
    } else {
      launchCommand = 'apply for jobs for this role for me: ' + launchRoleInput;
    }
    clearState(userId);
    await sendMsg(chatId, '🚀 *Launching guided job workflow*\n\n' + jobApplySummaryText(launchRole, launchLocation, launchMode));
    var tbGuided = require('./taskbus/telegramCommands.js');
    var createdGuided = await tbGuided.createTaskFromMessage(userId, launchCommand, 'claude', sendMsg, chatId, sendButtons);
    if (!createdGuided) {
      await sendMsg(chatId, '⚠️ Could not launch the job workflow. Try /workflows and choose one manually.');
      await sendButtons(chatId, 'Would you like to try again?', careerWorkflowMenu(userId));
    }
    return;
  }

  if (data === 'wf_job_legacy') {
    await sendMsg(chatId, '💼 Type the role you want to apply for with the legacy job flow:');
    setState(userId, 'awaiting_workflow_input', {
      commandPrefix: 'apply for jobs for this role for me: '
    });
    return;
  }

  if (data === 'wf_job_crewai') {
    await sendMsg(chatId, '🧵 Type the role you want to search/apply for with the CrewAI job flow:');
    setState(userId, 'awaiting_workflow_input', {
      commandPrefix: 'crew: use-workflow autonomous_resume_driven_job_search_with_clickup_integration for '
    });
    return;
  }

  if (data === 'wf_job_parallel') {
    await sendMsg(chatId, '🔁 Type the role or query to run both job workflows in parallel:');
    setState(userId, 'awaiting_workflow_input', {
      commandPrefix: 'workflow: parallel intelligent_job_application_automation, autonomous_resume_driven_job_search_with_clickup_integration for '
    });
    return;
  }

  if (data && data.indexOf('wf_pick:') === 0) {
    var wfIndex = parseInt(data.split(':')[1], 10);
    var workflowList = getSortedWorkflows();
    var workflow = workflowList[wfIndex];
    if (!workflow) {
      await sendMsg(chatId, '⚠️ Workflow not found. Try /workflows again.');
      return;
    }
    var prefix = workflow.kind === 'crewai_project'
      ? 'crew: use-workflow ' + workflow.id + ' for '
      : 'task: run workflow: ' + workflow.id + ' for ';
    await sendMsg(chatId, '✍️ Type the role/query for: ' + workflow.name);
    setState(userId, 'awaiting_workflow_input', {
      commandPrefix: prefix
    });
    return;
  }

  // Language
  if (data==='lang_en'||data==='lang_fa') {
    var lang = data==='lang_fa' ? 'fa' : 'en';
    users.updateUser(userId, { language: lang });
    if (user.state==='onboarding_lang') {
      users.updateUser(userId, { state: 'ready' });
      await sendButtons(chatId, t(userId,'ready',{name:user.name||'friend'}), mainMenu(userId));
    } else {
      await sendButtons(chatId, '✅ Language updated!', mainMenu(userId));
    }
    return;
  }

  // Synapse
  if (data === 'synapse_quick') { await handleSynapseQuick(chatId, userId); return; }

  // Menus
  if (data==='menu_more') {
    var fa = user.language==='fa';
    await sendButtons(chatId, fa?'⚙️ *ابزارهای بیشتر*':'⚙️ *More Tools*', fa ? [
      [{text:'📝 یادداشت',callback_data:'menu_notes'},{text:'🎯 مصاحبه',callback_data:'menu_interview'}],
      [{text:'💰 مذاکره حقوق',callback_data:'salary_coach'},{text:'📊 دنبال‌کن شغل',callback_data:'job_tracker'}],
      [{text:'🛒 بازار',callback_data:'menu_marketplace'},{text:'📧 ایمیل',callback_data:'email_monitor'}],
      [{text:'💡 ایده‌پردازی',callback_data:'brainstorm'},{text:'⚖️ حقوقی',callback_data:'legal_assistant'}],
      [{text:'📅 برنامه‌ریز',callback_data:'scheduler_tool'},{text:'✈️ سفر',callback_data:'travel_planner'}],
      [{text:'📊 وضعیت',callback_data:'menu_status'},{text:'⚙️ تنظیمات',callback_data:'menu_settings'}],
      [{text:'◀️ برگشت',callback_data:'back_main'}],
    ] : [
      [{text:'📝 Notes',callback_data:'menu_notes'},{text:'🎯 Interview Prep',callback_data:'menu_interview'}],
      [{text:'💰 Salary Coach',callback_data:'salary_coach'},{text:'📊 Job Tracker',callback_data:'job_tracker'}],
      [{text:'🛒 Marketplace',callback_data:'menu_marketplace'},{text:'📧 Email Monitor',callback_data:'email_monitor'}],
      [{text:'💡 Brainstorm',callback_data:'brainstorm'},{text:'⚖️ Legal Help',callback_data:'legal_assistant'}],
      [{text:'📅 Planner',callback_data:'scheduler_tool'},{text:'✈️ Travel Plan',callback_data:'travel_planner'}],
      [{text:'📊 Status',callback_data:'menu_status'},{text:'⚙️ Settings',callback_data:'menu_settings'}],
      [{text:'🧠 Synapse — 4 AIs',callback_data:'synapse_quick'}],
      [{text:'◀️ Back',callback_data:'back_main'}],
    ]);
    return;
  }
  if (data==='menu_jobs')        { await sendButtons(chatId, '💼 *Career & Jobs*', jobsMenu(userId)); return; }
  if (data==='menu_resume')      { await sendButtons(chatId, '📄 *Resume Tools*', resumeMenu(userId)); return; }
  if (data==='menu_content')     { await sendButtons(chatId, '📱 *Content Creation*', contentMenu(userId)); return; }
  if (data==='menu_notes')       { await sendButtons(chatId, '📝 *Notes Vault*', notesMenu(userId)); return; }
  if (data==='menu_tools')       { await sendButtons(chatId, '🛠️ *More Tools*', toolsMenu(userId)); return; }
  if (data==='menu_marketplace') { await sendButtons(chatId, '🛒 *Marketplace*', [[{text:'🛒 Kijiji',callback_data:'kijiji_post'},{text:'💰 Negotiate',callback_data:'price_negotiation'}],[{text:'📊 Research',callback_data:'market_research'},{text:'◀️ Back',callback_data:'back_main'}]]); return; }
  if (data==='menu_settings')    { await handleSettings(chatId, userId); return; }
  if (data==='menu_status')      { await handleStatus(chatId, userId); return; }
  if (data==='menu_help')        { await handleHelp(chatId, userId); return; }
  if (data==='lang_menu')        { await sendButtons(chatId, t(userId,'ask_language'), langMenu()); return; }

  // ── Back to main menu ────────────────────────────────────────────────────────
  if (data === 'back_main') {
    await sendButtons(chatId, t(userId, 'main_menu', { name: user.name || 'friend' }), mainMenu(userId));
    return;
  }

  // Chef AI
  if (data==='menu_chef') {
    var fa = user.language==='fa';
    await sendMsg(chatId, fa ? '🍳 *آشپز AI*\n\nچه چیزی می‌خواهی بپزی یا بخوری؟\n\n_مثال: مرغ دارم و ۳۰ دقیقه وقت_' : '🍳 *Chef AI*\n\nWhat do you want to cook or eat?\n\n_Example: I have chicken and 30 minutes_');
    setState(userId, 'awaiting_chef_request'); return;
  }

  // Translate
  if (data==='menu_translate') {
    var fa = user.language==='fa';
    await sendMsg(chatId, fa ? '🌐 *ترجمه*\n\nمتن را بفرست:' : '🌐 *Translate*\n\nSend the text to translate:');
    setState(userId, 'awaiting_translate'); return;
  }

  // Jobs
  if (data==='job_search')      { await sendMsg(chatId, '💼 ' + (user.language==='fa'?'دنبال چه موقعیتی هستی؟':'What role are you looking for?')); setState(userId,'awaiting_job_role'); return; }
  if (data==='cover_letter')    { await sendMsg(chatId, '✉️ ' + (user.language==='fa'?'این نامه برای کدام موقعیت؟':'This cover letter is for what role?')); setState(userId,'awaiting_cover_role'); return; }
  if (data==='interview_prep')  { await sendButtons(chatId, user.language==='fa'?'🎯 مصاحبه برای چه موقعیتی؟':'🎯 Interview Prep — choose or type:', [[{text:'💻 Software Engineer',callback_data:'iprep_swe'},{text:'📊 Product Manager',callback_data:'iprep_pm'}],[{text:'💰 Sales',callback_data:'iprep_sales'},{text:'🎨 Designer',callback_data:'iprep_design'}],[{text:'✏️ Type custom role',callback_data:'iprep_custom'},{text:'◀️ Back',callback_data:'menu_jobs'}]]); return; }
  if (data==='menu_interview')  { await sendButtons(chatId, '🎯 *Interview Prep*', [[{text:'💻 Software Engineer',callback_data:'iprep_swe'},{text:'📊 Product Manager',callback_data:'iprep_pm'}],[{text:'💰 Sales',callback_data:'iprep_sales'},{text:'🎨 Designer',callback_data:'iprep_design'}],[{text:'✏️ Type custom role',callback_data:'iprep_custom'},{text:'◀️ Back',callback_data:'back_main'}]]); return; }
  if (data.startsWith('iprep_')) {
    var role = {iprep_swe:'Software Engineer',iprep_pm:'Product Manager',iprep_sales:'Sales Representative',iprep_design:'UX/UI Designer'}[data];
    if (role) {
      await sendMsg(chatId, '🎯 _Starting mock interview for_ *' + role + '*_..._');
      var sess = await interview.startInterview(userId, role, user.language);
      users.updateUser(userId, { state: 'in_interview' });
      await sendMsg(chatId, '❓ *Question 1/' + interview.getTotalQuestions(sess) + ':*\n\n' + interview.getCurrentQuestion(sess));
    } else {
      await sendMsg(chatId, '🎯 What role are you interviewing for?');
      setState(userId, 'awaiting_interview_role');
    }
    return;
  }
  if (data==='iprep_custom') { await sendMsg(chatId, '🎯 Type the role:'); setState(userId,'awaiting_interview_role'); return; }
  if (data==='salary_coach') { await sendMsg(chatId, '💰 *Salary Negotiation Coach*\n\nPaste the job offer details (title, company, offered salary):'); setState(userId,'awaiting_salary_input'); return; }
  if (data==='job_tracker')  { await sendMsg(chatId, jobTracker.formatTracker(userId, user.language)); return; }
  if (data==='connect_linkedin') { await sendMsg(chatId, '🔗 Your LinkedIn email address:'); setState(userId,'awaiting_linkedin_email'); return; }
  if (data==='email_monitor') {
    var monState = emailMon.getMonitorState(userId);
    var fa2 = user.language==='fa';
    if (monState.enabled) {
      var activeMsg = fa2
        ? '📧 *مانیتورینگ ایمیل فعال است*\n\nحساب: `' + monState.email + '`'
        : '📧 *Email monitoring is active*\n\nAccount: `' + monState.email + '`';
      await sendButtons(chatId, activeMsg, [
        [{text: fa2?'✅ بررسی الان':'✅ Check now', callback_data:'email_check_now'}, {text: fa2?'🔴 غیرفعال':'🔴 Disable', callback_data:'email_disable'}],
        [{text:'◀️ Back', callback_data:'menu_jobs'}]
      ]);
    } else {
      var setupMsg = fa2
        ? '📧 *مانیتورینگ ایمیل*\n\nیک آدرس ایمیل را برای نظارت وارد کنید.\nپشتیبانی از: Gmail، Outlook، Yahoo، iCloud و هر سرویس IMAP.\n\n_برای Gmail یک App Password در myaccount.google.com بسازید._\n\nآدرس ایمیل خود را وارد کنید:'
        : '📧 *Email Monitor Setup*\n\nMonitors your inbox for job-related emails and notifies you instantly.\nSupports Gmail, Outlook, Yahoo, iCloud and any IMAP provider.\n\n_For Gmail, create an App Password at myaccount.google.com → Security → 2-Step Verification → App passwords._\n\nEnter your email address:';
      await sendMsg(chatId, setupMsg);
      setState(userId, 'awaiting_email_address');
    }
    return;
  }
  if (data==='email_check_now') {
    await sendMsg(chatId, '📧 _Checking your Gmail..._');
    var emails = await emailMon.checkEmails(userId);
    await sendMsg(chatId, emails.length ? '📧 Found ' + emails.length + ' new email(s).' : '📧 No new job-related emails.');
    return;
  }
  if (data==='email_disable') { emailMon.disableMonitor(userId); await sendMsg(chatId, '✅ Email monitoring disabled.'); return; }

  // Job type
  if (data.startsWith('jobtype_')) {
    var state3 = getState(userId);
    var jtype  = data.replace('jobtype_','');
    var jrole  = (state3&&state3.data&&state3.data.role)||user.jobPrefs.role||'professional';
    var jloc   = (state3&&state3.data&&state3.data.location)||user.jobPrefs.location||'anywhere';
    clearState(userId);
    users.updateUser(userId, { jobPrefs: Object.assign({}, user.jobPrefs, { type: jtype }) });
    await sendMsg(chatId, '🔍 *Searching ' + jtype + ' ' + jrole + ' jobs in ' + jloc + '...*\n\n_Checking LinkedIn, Indeed, and the web. Results coming shortly._');
    var jobSearch = require('../connectors/jobSearch.js');
    var jobResults = await jobSearch.searchJobs(jrole, jloc, jtype, 10);
    await sendMsg(chatId, jobSearch.formatForTelegram(jobResults, jrole, jloc));
    return;
  }

  // Resume
  if (data==='upload_resume')   { await sendMsg(chatId, t(userId,'upload_prompt')); setState(userId,'awaiting_resume'); return; }
  if (data==='tailor_resume') {
    if (!user.resumeFile) { await sendMsg(chatId, t(userId,'no_resume')); return; }
    await sendMsg(chatId, '✏️ *Resume Tailoring*\n\nWhat job role or paste the job description to tailor for?');
    setState(userId,'awaiting_tailor_role'); return;
  }
  if (data==='ats_check')       { if (!user.resumeFile) { await sendMsg(chatId,t(userId,'no_resume')); return; } await sendMsg(chatId,'📋 _Running ATS check..._'); await executeAndReply(chatId, 'writer', 'Run ATS check and score this resume 1-100. List specific improvements to increase score.', user.language); return; }
  if (data==='view_resume')     { if (!user.resumeFile) { await sendMsg(chatId,t(userId,'no_resume')); return; } try { await sendDocument(chatId, path.join(users.getUserStorageDir(userId), user.resumeFile), '📄 Your resume'); } catch(e) { await sendMsg(chatId,'❌ Could not retrieve file.'); } return; }
  if (data==='resume_versions') { var files=users.listUserFiles(userId).filter(function(f){return f.match(/resume/i);}); await sendMsg(chatId,'🗂️ *Resume versions:*\n\n'+(files.length?files.map(function(f,i){return (i+1)+'. '+f;}).join('\n'):'No resume files found.\n\nUpload one first!')); return; }

  // Content
  if (data==='landing_page')   { await sendMsg(chatId,'🌐 Describe your product/service:'); setState(userId,'awaiting_landing_desc'); return; }
  if (data==='seo_content')    { await sendMsg(chatId,'📹 SEO content about what topic?'); setState(userId,'awaiting_content_topic',{type:'seo'}); return; }
  if (data==='blog_post')      { await sendMsg(chatId,'📝 Blog post topic?'); setState(userId,'awaiting_content_topic',{type:'blog'}); return; }
  if (data==='video_script')   { await sendMsg(chatId,'🎬 Video about what?'); setState(userId,'awaiting_content_topic',{type:'video'}); return; }
  if (data==='video_generator'){ await sendMsg(chatId,'🎥 What video concept do you want generated?'); setState(userId,'awaiting_content_topic',{type:'replicate_video'}); return; }
  if (data==='social_post')    { await sendMsg(chatId,'📱 Social post about what?'); setState(userId,'awaiting_content_topic',{type:'social'}); return; }
  if (data==='email_sequence') { await sendMsg(chatId,'📧 Email campaign about what?'); setState(userId,'awaiting_content_topic',{type:'email'}); return; }
  if (data==='youtube_upload') { await sendMsg(chatId,'▶️ *YouTube Auto-Publisher*\n\nDescribe the video content and your channel focus. I\'ll create the script, build the upload package, and try to generate a short Replicate promo clip.'); setState(userId,'awaiting_content_topic',{type:'youtube'}); return; }

  // Notes
  if (data==='note_add')    { await sendMsg(chatId,'📝 Note title:'); setState(userId,'awaiting_note_title'); return; }
  if (data==='note_list')   { await sendMsg(chatId,'📋 *Your Notes:*\n\n'+notes.formatList(notes.getNotes(userId), user.language)); return; }
  if (data==='note_search') { await sendMsg(chatId,'🔍 Search term:'); setState(userId,'awaiting_note_search'); return; }
  if (data==='note_delete') { await sendMsg(chatId,'🗑️ Note ID to delete:'); setState(userId,'awaiting_note_delete'); return; }

  // Tools
  if (data==='legal_assistant')     { await sendMsg(chatId,'⚖️ Your legal question:'); setState(userId,'awaiting_content_topic',{type:'legal'}); return; }
  if (data==='data_analysis')       { await sendMsg(chatId,'📊 What data to analyze?'); setState(userId,'awaiting_content_topic',{type:'data'}); return; }
  if (data==='competitor_research') { await sendMsg(chatId,'🔍 Company or market to research:'); setState(userId,'awaiting_research'); return; }
  if (data==='brainstorm')          { await sendMsg(chatId,'💡 What do you need ideas for?'); setState(userId,'awaiting_brainstorm'); return; }
  if (data==='shopping_list')       { await sendMsg(chatId,'🛒 What items to add to your shopping list?'); setState(userId,'awaiting_content_topic',{type:'shopping'}); return; }
  if (data==='travel_planner')      { await sendMsg(chatId,'✈️ Where to? Budget? Dates?'); setState(userId,'awaiting_content_topic',{type:'travel'}); return; }
  if (data==='gift_ideas')          { await sendMsg(chatId,'🎁 Who is the gift for and what\'s the budget?'); setState(userId,'awaiting_content_topic',{type:'gift'}); return; }
  if (data==='medication')          { await sendMsg(chatId,'💊 Medication name or health question:'); setState(userId,'awaiting_content_topic',{type:'health'}); return; }
  if (data==='scheduler_tool')      { await sendMsg(chatId,'📅 What do you need scheduled or planned?'); setState(userId,'awaiting_content_topic',{type:'schedule'}); return; }

  // Marketplace
  if (data==='kijiji_post')       { await sendMsg(chatId,'🛒 Describe the item (title, condition, price):'); setState(userId,'awaiting_content_topic',{type:'kijiji'}); return; }
  if (data==='price_negotiation') { await sendMsg(chatId,'💰 Describe the item and the offer received:'); setState(userId,'awaiting_salary_input'); return; }
  if (data==='market_research')   { await sendMsg(chatId,'📊 Product or market to research:'); setState(userId,'awaiting_research'); return; }
}

// ── Start everything ──────────────────────────────────────────────────────────
log('[bot] ACC v2 Multi-User Bot — ' + users.getUserCount() + '/10 users');
log('[bot] Features: Voice, Notes, JobTracker, Interview, EmailMonitor, Scheduler');


// ── Menu builders ─────────────────────────────────────────────────────────────
function mainMenu(userId) {
  var fa = (users.getUserProfile(userId)||{}).language === 'fa';
  return fa ? [
    [{text:'💼 شغل و رزومه',callback_data:'menu_jobs'},{text:'📝 یادداشت‌ها',callback_data:'menu_notes'}],
    [{text:'📱 محتوا',callback_data:'menu_content'},{text:'🍳 آشپز AI',callback_data:'menu_chef'}],
    [{text:'💎 داشبورد',callback_data:'menu_dashboard'},{text:'⚙️ ابزار بیشتر',callback_data:'menu_more'}],
    [{text:'🌐 ترجمه',callback_data:'menu_translate'},{text:'📊 وضعیت',callback_data:'menu_status'}],
  ] : [
    [{text:'💼 Jobs & Resume',callback_data:'menu_jobs'},{text:'📝 Notes',callback_data:'menu_notes'}],
    [{text:'📱 Content',callback_data:'menu_content'},{text:'🍳 Chef AI',callback_data:'menu_chef'}],
    [{text:'💎 Dashboard',callback_data:'menu_dashboard'},{text:'⚙️ More Tools',callback_data:'menu_more'}],
    [{text:'🌐 Translate',callback_data:'menu_translate'},{text:'📊 Status',callback_data:'menu_status'}],
  ];
}
function langMenu() { return [[{text:'🇺🇸 English',callback_data:'lang_en'},{text:'🇮🇷 فارسی',callback_data:'lang_fa'}]]; }
function jobsMenu(userId) {
  return [
    [{text:'🔍 Job Search',callback_data:'job_search'},{text:'📄 Resume Tools',callback_data:'menu_resume'}],
    [{text:'✉️ Cover Letter',callback_data:'cover_letter'},{text:'🎯 Interview Prep',callback_data:'interview_prep'}],
    [{text:'💰 Salary Coach',callback_data:'salary_coach'},{text:'📊 Job Tracker',callback_data:'job_tracker'}],
    [{text:'🪄 Guided Job Apply',callback_data:'job_apply_guided'},{text:'🧭 Workflow Launcher',callback_data:'workflow_menu'}],
    [{text:'💼 Career Workflows',callback_data:'career_workflows'}],
    [{text:'◀️ Back',callback_data:'back_main'}],
  ];
}
function resumeMenu(userId) {
  return [
    [{text:'📤 Upload Resume',callback_data:'upload_resume'},{text:'✏️ Tailor Resume',callback_data:'tailor_resume'}],
    [{text:'📋 ATS Check',callback_data:'ats_check'},{text:'👁 View',callback_data:'view_resume'}],
    [{text:'◀️ Back',callback_data:'menu_jobs'}],
  ];
}
function contentMenu(userId) {
  return [
    [{text:'📝 Blog Post',callback_data:'blog_post'},{text:'📱 Social Post',callback_data:'social_post'}],
    [{text:'🎬 Video Script',callback_data:'video_script'},{text:'🎥 Video Generator',callback_data:'video_generator'}],
    [{text:'📧 Email Sequence',callback_data:'email_sequence'},{text:'🌐 Landing Page',callback_data:'landing_page'}],
    [{text:'🔍 SEO Content',callback_data:'seo_content'}],
    [{text:'◀️ Back',callback_data:'back_main'}],
  ];
}
function notesMenu(userId) {
  return [
    [{text:'➕ New Note',callback_data:'note_add'},{text:'📋 List Notes',callback_data:'note_list'}],
    [{text:'🔍 Search',callback_data:'note_search'},{text:'🗑 Delete',callback_data:'note_delete'}],
    [{text:'◀️ Back',callback_data:'back_main'}],
  ];
}
function toolsMenu(userId) {
  return [
    [{text:'⚖️ Legal Help',callback_data:'legal_assistant'},{text:'💡 Brainstorm',callback_data:'brainstorm'}],
    [{text:'📊 Data Analysis',callback_data:'data_analysis'},{text:'🔍 Research',callback_data:'competitor_research'}],
    [{text:'✈️ Travel Plan',callback_data:'travel_planner'},{text:'🎁 Gift Ideas',callback_data:'gift_ideas'}],
    [{text:'◀️ Back',callback_data:'back_main'}],
  ];
}
function jobTypeMenu(userId) {
  return [
    [{text:'⏱ Full-time',callback_data:'jobtype_full-time'},{text:'⏰ Part-time',callback_data:'jobtype_part-time'}],
    [{text:'🏠 Remote',callback_data:'jobtype_remote'},{text:'🔀 Hybrid',callback_data:'jobtype_hybrid'}],
    [{text:'📋 Contract',callback_data:'jobtype_contract'}],
  ];
}

function getSortedWorkflows() {
  return workflowRegistry.listWorkflows().slice().sort(function(a, b) {
    return String(a.category || '').localeCompare(String(b.category || '')) ||
      String(a.name || '').localeCompare(String(b.name || '')) ||
      String(a.key || '').localeCompare(String(b.key || ''));
  });
}

function trimWorkflowLabel(label, maxLen) {
  var text = String(label || '').trim();
  if (text.length <= maxLen) return text;
  return text.slice(0, Math.max(0, maxLen - 1)).trim() + '…';
}

function workflowMenu(userId) {
  var workflows = getSortedWorkflows();
  var rows = [];
  rows.push([{ text: '🌐 Open ACC Mini Web App', web_app: { url: MINI_WEBAPP_URL } }]);
  workflows.forEach(function(workflow, index) {
    rows.push([{
      text: trimWorkflowLabel((workflow.category ? workflow.category + ': ' : '') + workflow.name, 34),
      callback_data: 'wf_pick:' + index
    }]);
  });
  rows.push([{ text: '📋 List All Commands', callback_data: 'workflow_list' }]);
  rows.push([{ text: '💼 Career Workflows', callback_data: 'career_workflows' }]);
  rows.push([{ text: '🔙 Back', callback_data: 'back_main' }]);
  return rows;
}

function careerWorkflowMenu(userId) {
  return [
    [{ text: '🪄 Guided Job Apply', callback_data: 'job_apply_guided' }],
    [{ text: '💼 Legacy Job Apply', callback_data: 'wf_job_legacy' }],
    [{ text: '🧵 CrewAI Job Search', callback_data: 'wf_job_crewai' }],
    [{ text: '🔁 Parallel Job Flows', callback_data: 'wf_job_parallel' }],
    [{ text: '📋 All Workflows', callback_data: 'workflow_list' }],
    [{ text: '🔙 Back', callback_data: 'menu_jobs' }],
  ];
}

function jobWorkflowModeMenu() {
  return [
    [{ text: '💼 Legacy Job Apply', callback_data: 'job_apply_mode:legacy' }],
    [{ text: '🧵 CrewAI Job Search', callback_data: 'job_apply_mode:crewai' }],
    [{ text: '🔁 Parallel Job Flows', callback_data: 'job_apply_mode:parallel' }],
    [{ text: '🔙 Back', callback_data: 'menu_jobs' }],
  ];
}

function jobApplyLocationMenu() {
  return [
    [{ text: '⏭ Skip location', callback_data: 'job_apply_skip_location' }],
    [{ text: '🔙 Back', callback_data: 'menu_jobs' }],
  ];
}

function jobApplyReviewMenu() {
  return [
    [{ text: '🚀 Launch now', callback_data: 'job_apply_launch' }],
    [{ text: '✏️ Change role', callback_data: 'job_apply_type_role' }, { text: '📍 Change location', callback_data: 'job_apply_edit_location' }],
    [{ text: '🔙 Back', callback_data: 'career_workflows' }],
  ];
}

function jobApplyModeLabel(mode) {
  if (mode === 'crewai') return 'CrewAI Job Search';
  if (mode === 'parallel') return 'Parallel Job Flows';
  return 'Legacy Job Apply';
}

function jobApplySummaryText(role, location, mode) {
  return [
    '*Role:* ' + (role || 'not set'),
    '*Location:* ' + (location || 'anywhere'),
    '*Mode:* ' + jobApplyModeLabel(mode),
    '',
    '_Launch will create a live Task Bus job and route it through the selected workflow._'
  ].join('\n');
}

// ── Polling loop ──────────────────────────────────────────────────────────────
var running = true;
var lastOffset = 0;
var lastPollErrorKey = null;
var lastPollErrorAt = 0;
var heartbeatPath = require('path').join(__dirname, '../../data/run/bot-heartbeat.json');

function writeHeartbeat() {
  try {
    require('fs').writeFileSync(
      heartbeatPath,
      JSON.stringify({ pid: process.pid, lastPoll: Date.now(), online: true })
    );
  } catch (e) {}
}

setInterval(writeHeartbeat, 30000);

async function poll() {
  while (running) {
    try {
      var updates = await tgGet('getUpdates', {
        offset: lastOffset,
        timeout: 20,
        allowed_updates: ['message', 'callback_query']
      });
      lastPollErrorKey = null;
      lastPollErrorAt = 0;
      if (updates && updates.length) {
        for (var i = 0; i < updates.length; i++) {
          var u = updates[i];
          lastOffset = u.update_id + 1;
          try {
            if (u.message) await handleMessage(u.message);
            if (u.callback_query) await handleCallback(u.callback_query);
          } catch (e) {
            log('[bot] handler err:', e.message);
          }
        }
      }
      writeHeartbeat();
    } catch (e) {
      if (running) {
        var detail = e && (e.response && e.response.data && e.response.data.description
          ? e.response.data.description
          : e.code || e.message || String(e));
        var errorKey = String(detail || 'unknown');
        var now = Date.now();
        if (errorKey !== lastPollErrorKey || (now - lastPollErrorAt) > 60000) {
          log('[bot] poll err:', detail);
          lastPollErrorKey = errorKey;
          lastPollErrorAt = now;
        }
        var waitMs = 3000;
        if (/EACCES/i.test(errorKey)) waitMs = 60000;
        else if (/Conflict/i.test(errorKey)) waitMs = 15000;
        await new Promise(function(r) { setTimeout(r, waitMs); });
      }
    }
  }
}

// ── Synapse Telegram handlers ─────────────────────────────────────────────────

async function handleSynapseQuick(chatId, userId) {
  await sendMsg(chatId, '🧠 *Synapse — Multi-Agent Room*\n\nSend me any question or task and I\'ll broadcast it to *Claude + GPT-4o + Gemini + DeepSeek* simultaneously.\n\nThey\'ll respond in parallel and I\'ll synthesize the best answer.\n\n_Just type your message now:_');
  users.updateUser(userId, { state: 'synapse_waiting' });
}

async function handleSynapseMessage(chatId, userId, message) {
  await sendMsg(chatId, '🔄 _Broadcasting to 4 AI agents… this takes ~15 seconds_');
  try {
    var synapse = require('../integrations/synapse.js');
    var result = await synapse.broadcast({
      message: message,
      preset: 'brainstorm',
      roomName: 'Telegram Room',
      synthesize: true,
    });
    var successful = result.results.filter(function(r) { return r.status === 'success'; });
    // Send each agent response
    for (var i = 0; i < successful.length; i++) {
      var r = successful[i];
      var header = '🤖 *' + r.name + '* (' + r.provider + '):\n\n';
      await sendMsg(chatId, header + r.content.slice(0, 1000) + (r.content.length > 1000 ? '…' : ''));
    }
    // Send synthesis
    if (result.synthesis) {
      await sendMsg(chatId, '📋 *Synthesis Memo:*\n\n' + result.synthesis.slice(0, 3000));
    }
    var summary = '\n✅ *' + result.successful + '/' + result.agents.length + ' agents responded*';
    if (result.failed > 0) summary += ' (' + result.failed + ' failed)';
    await sendButtons(chatId, summary, [[{text:'🧠 Ask Synapse again', callback_data:'synapse_quick'},{text:'◀️ Menu',callback_data:'back_main'}]]);
  } catch(e) {
    await sendMsg(chatId, '❌ Synapse error: ' + e.message);
  }
  users.updateUser(userId, { state: 'active' });
}

// ── Hub / Memory / Autonomy Telegram handlers ─────────────────────────────────

async function handleHubStatus(chatId) {
  try {
    var hubRoutes = require('../hub/registry.js');
    var memStore  = require('../memory/store.js');
    var apps = hubRoutes.getAllApps();
    var online = apps.filter(function(a) { return a.status === 'online'; });
    var memStats = memStore.stats();
    var msg = '🌐 *ACC App Hub*\n\n' +
      '📱 Registered apps: ' + apps.length + '\n' +
      '🟢 Online: ' + online.length + '\n' +
      '🧠 Memories stored: ' + memStats.total_memories + '\n' +
      '📝 Events logged: ' + memStats.total_events + '\n\n';
    if (apps.length) {
      msg += apps.map(function(a) {
        return (a.status === 'online' ? '🟢' : '🔴') + ' *' + a.name + '* (' + a.type + ')\n' +
          '_' + (a.capabilities || []).join(', ') + '_';
      }).join('\n\n');
    } else {
      msg += '_No apps registered yet._\n\nTo register an app, POST to `/api/hub/register`';
    }
    await sendMsg(chatId, msg);
  } catch(e) { await sendMsg(chatId, '❌ Hub error: ' + e.message); }
}

async function handleLoops(chatId) {
  try {
    var loopEngine = require('../autonomy/loop.js');
    var loops = loopEngine.getAllLoops();
    var s = loopEngine.stats();
    var msg = '🔄 *Autonomous Loops*\n\n' +
      'Active: ' + s.enabled + '/' + s.total + '\n\n';
    if (!loops.length) {
      msg += '_No loops running yet._\n\nCreate one via `/api/autonomy/loops` or ask me to set one up.';
    } else {
      msg += loops.map(function(l) {
        var icon = l.enabled ? '🟢' : '🔴';
        var next = l.nextRunAt ? new Date(l.nextRunAt).toLocaleTimeString() : '—';
        var last = l.lastStatus ? (l.lastStatus === 'success' ? '✅' : '❌') : '—';
        return icon + ' *' + l.name + '*\n' +
          'Last: ' + last + ' | Next: ' + next + '\n' +
          '`/loop_run ' + l.id.slice(0,8) + '` · `/loop_off ' + l.id.slice(0,8) + '`';
      }).join('\n\n');
    }
    await sendMsg(chatId, msg);
  } catch(e) { await sendMsg(chatId, '❌ Loops error: ' + e.message); }
}

async function handleMemory(chatId) {
  try {
    var memStore = require('../memory/store.js');
    var mems = memStore.recallAll('global', { limit: 10, minImportance: 5 });
    var s = memStore.stats();
    var msg = '🧠 *ACC Memory*\n\n' +
      'Total: ' + s.total_memories + ' memories across ' + s.scopes.length + ' scopes\n' +
      'Events: ' + s.total_events + '\n\n';
    if (mems.length) {
      msg += '*Recent global memories:*\n' + mems.map(function(m) {
        var val = typeof m.value === 'string' ? m.value.slice(0,60) : JSON.stringify(m.value).slice(0,60);
        return '• `' + m.key + '`: ' + val;
      }).join('\n');
    } else {
      msg += '_No global memories yet. ACC will remember important context as it works._';
    }
    await sendMsg(chatId, msg);
  } catch(e) { await sendMsg(chatId, '❌ Memory error: ' + e.message); }
}

function resolveLoop(loops, ref) {
  if (!ref) return null;
  var exact = loops.find(function(l) { return l.id === ref; });
  if (exact) return { loop: exact };
  var matches = loops.filter(function(l) { return l.id.startsWith(ref); });
  if (matches.length === 1) return { loop: matches[0] };
  if (matches.length > 1) return { ambiguous: true, matches: matches };
  return null;
}

async function handleLoopRun(chatId, userId, loopId) {
  try {
    var loopEngine = require('../autonomy/loop.js');
    var resolved = resolveLoop(loopEngine.getAllLoops(), loopId);
    if (!resolved) { await sendMsg(chatId, '❌ Loop not found: `' + loopId + '`'); return; }
    if (resolved.ambiguous) {
      await sendMsg(chatId, '⚠️ Ambiguous — ' + resolved.matches.length + ' loops match. Use more characters:\n' +
        resolved.matches.map(function(l) { return '• `' + l.id.slice(0,12) + '` ' + l.name; }).join('\n'));
      return;
    }
    await sendMsg(chatId, '▶️ Running loop now: *' + resolved.loop.name + '*');
    loopEngine.runNow(resolved.loop.id);
  } catch(e) { await sendMsg(chatId, '❌ ' + e.message); }
}

async function handleLoopToggle(chatId, userId, loopId, enable) {
  try {
    var loopEngine = require('../autonomy/loop.js');
    var resolved = resolveLoop(loopEngine.getAllLoops(), loopId);
    if (!resolved) { await sendMsg(chatId, '❌ Loop not found: `' + loopId + '`'); return; }
    if (resolved.ambiguous) {
      await sendMsg(chatId, '⚠️ Ambiguous — use more characters:\n' +
        resolved.matches.map(function(l) { return '• `' + l.id.slice(0,12) + '` ' + l.name; }).join('\n'));
      return;
    }
    var updated = enable ? loopEngine.enableLoop(resolved.loop.id) : loopEngine.disableLoop(resolved.loop.id);
    await sendMsg(chatId, (enable ? '✅ Loop enabled' : '⏸ Loop paused') + ': *' + updated.name + '*');
  } catch(e) { await sendMsg(chatId, '❌ ' + e.message); }
}

scheduler.start();
emailMon.startPolling(5); // check email every 5 minutes

// Skip polling if webhook is active (hosted cloud deployment or WEBHOOK_URL set in .env)
var isWebhookMode = process.env.TELEGRAM_BOT_MODE === 'webhook'
  || !!process.env.WEBHOOK_URL
  || !!process.env.TELEGRAM_WEBHOOK_URL
  || !!process.env.ACC_PUBLIC_URL
  || !!process.env.ACC_WEBAPP_URL
  || !!process.env.ACC_API_BASE_URL
  || !!process.env.PUBLIC_URL
  || !!process.env.RAILWAY_ENVIRONMENT
  || !!process.env.RAILWAY_SERVICE_NAME
  || !!process.env.RAILWAY_PUBLIC_DOMAIN;
if (isWebhookMode) {
  log('[bot] Webhook mode — polling disabled. Updates arrive via HTTP.');
} else {
  poll();
}

function shutdownBot(code) {
  running = false;
  try { scheduler.stop(); } catch (e) {}
  try { emailMon.stopPolling(); } catch (e) {}
  try { botLock.releaseBot(BOT_NAME); } catch (e) {}
  if (typeof code === 'number') {
    process.exit(code);
  }
}

process.on('SIGINT',  function() { shutdownBot(0); });
process.on('SIGTERM', function() { shutdownBot(0); });
process.on('exit', function() {
  try { botLock.releaseBot(BOT_NAME); } catch (e) {}
});

module.exports = { send: sendMsg, handleMessage: handleMessage, handleCallback: handleCallback };
