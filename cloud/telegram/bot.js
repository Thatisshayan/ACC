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

var TOKEN    = process.env.TELEGRAM_BOT_TOKEN;
var CHAT_ID  = process.env.SHAYAN_TELEGRAM_CHAT_ID || 'REDACTED';
var ACC_PORT = process.env.PORT || '4000';
var BASE     = 'https://api.telegram.org/bot' + TOKEN;

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

// ── Inline keyboards ──────────────────────────────────────────────────────────
function mainMenu(userId) {
  var fa = (users.getUserProfile(userId)||{}).language === 'fa';
  return fa ? [
    [{text:'💼 شغل',callback_data:'menu_jobs'},{text:'📄 رزومه',callback_data:'menu_resume'}],
    [{text:'📱 محتوا',callback_data:'menu_content'},{text:'🛒 بازار',callback_data:'menu_marketplace'}],
    [{text:'📝 یادداشت',callback_data:'menu_notes'},{text:'🎯 مصاحبه',callback_data:'menu_interview'}],
    [{text:'🍳 آشپز AI',callback_data:'menu_chef'},{text:'🌐 ترجمه',callback_data:'menu_translate'}],
    [{text:'🛠️ ابزار بیشتر',callback_data:'menu_tools'},{text:'⚙️ تنظیمات',callback_data:'menu_settings'}],
    [{text:'📊 وضعیت',callback_data:'menu_status'},{text:'❓ راهنما',callback_data:'menu_help'}],
  ] : [
    [{text:'💼 Jobs',callback_data:'menu_jobs'},{text:'📄 Resume',callback_data:'menu_resume'}],
    [{text:'📱 Content',callback_data:'menu_content'},{text:'🛒 Marketplace',callback_data:'menu_marketplace'}],
    [{text:'📝 Notes',callback_data:'menu_notes'},{text:'🎯 Interview Prep',callback_data:'menu_interview'}],
    [{text:'🍳 Chef AI',callback_data:'menu_chef'},{text:'🌐 Translate',callback_data:'menu_translate'}],
    [{text:'🛠️ More Tools',callback_data:'menu_tools'},{text:'⚙️ Settings',callback_data:'menu_settings'}],
    [{text:'📊 Status',callback_data:'menu_status'},{text:'❓ Help',callback_data:'menu_help'}],
  ];
}
function jobsMenu(userId) {
  var fa = (users.getUserProfile(userId)||{}).language === 'fa';
  return fa ? [
    [{text:'🔍 جستجوی شغل',callback_data:'job_search'}],
    [{text:'✉️ نامه پوششی',callback_data:'cover_letter'},{text:'🎯 آماده مصاحبه',callback_data:'interview_prep'}],
    [{text:'💰 مذاکره حقوق',callback_data:'salary_coach'},{text:'📊 دنبال‌کن شغل',callback_data:'job_tracker'}],
    [{text:'🔗 LinkedIn',callback_data:'connect_linkedin'},{text:'📧 ایمیل‌ها',callback_data:'email_monitor'}],
    [{text:'◀️ برگشت',callback_data:'back_main'}],
  ] : [
    [{text:'🔍 Find Jobs',callback_data:'job_search'}],
    [{text:'✉️ Cover Letter',callback_data:'cover_letter'},{text:'🎯 Interview Prep',callback_data:'interview_prep'}],
    [{text:'💰 Salary Coach',callback_data:'salary_coach'},{text:'📊 Job Tracker',callback_data:'job_tracker'}],
    [{text:'🔗 LinkedIn',callback_data:'connect_linkedin'},{text:'📧 Email Monitor',callback_data:'email_monitor'}],
    [{text:'◀️ Back',callback_data:'back_main'}],
  ];
}
function resumeMenu(userId) {
  var fa = (users.getUserProfile(userId)||{}).language === 'fa';
  return fa ? [
    [{text:'📤 آپلود رزومه',callback_data:'upload_resume'}],
    [{text:'✏️ تنظیم رزومه',callback_data:'tailor_resume'},{text:'📋 بررسی ATS',callback_data:'ats_check'}],
    [{text:'📄 مشاهده رزومه',callback_data:'view_resume'},{text:'🗂️ نسخه‌ها',callback_data:'resume_versions'}],
    [{text:'◀️ برگشت',callback_data:'back_main'}],
  ] : [
    [{text:'📤 Upload Resume',callback_data:'upload_resume'}],
    [{text:'✏️ Tailor Resume',callback_data:'tailor_resume'},{text:'📋 ATS Check',callback_data:'ats_check'}],
    [{text:'📄 View Resume',callback_data:'view_resume'},{text:'🗂️ Versions',callback_data:'resume_versions'}],
    [{text:'◀️ Back',callback_data:'back_main'}],
  ];
}
function contentMenu(userId) {
  var fa = (users.getUserProfile(userId)||{}).language === 'fa';
  return fa ? [
    [{text:'🌐 صفحه فرود',callback_data:'landing_page'},{text:'📹 محتوای SEO',callback_data:'seo_content'}],
    [{text:'📝 پست وبلاگ',callback_data:'blog_post'},{text:'🎬 اسکریپت',callback_data:'video_script'}],
    [{text:'📱 رسانه اجتماعی',callback_data:'social_post'},{text:'📧 توالی ایمیل',callback_data:'email_sequence'}],
    [{text:'▶️ یوتیوب',callback_data:'youtube_upload'},{text:'◀️ برگشت',callback_data:'back_main'}],
  ] : [
    [{text:'🌐 Landing Page',callback_data:'landing_page'},{text:'📹 SEO Content',callback_data:'seo_content'}],
    [{text:'📝 Blog Post',callback_data:'blog_post'},{text:'🎬 Video Script',callback_data:'video_script'}],
    [{text:'📱 Social Post',callback_data:'social_post'},{text:'📧 Email Sequence',callback_data:'email_sequence'}],
    [{text:'▶️ YouTube Upload',callback_data:'youtube_upload'},{text:'◀️ Back',callback_data:'back_main'}],
  ];
}
function notesMenu(userId) {
  var fa = (users.getUserProfile(userId)||{}).language === 'fa';
  return fa ? [
    [{text:'➕ یادداشت جدید',callback_data:'note_add'},{text:'📋 یادداشت‌هایم',callback_data:'note_list'}],
    [{text:'🔍 جستجو',callback_data:'note_search'},{text:'🗑️ حذف',callback_data:'note_delete'}],
    [{text:'◀️ برگشت',callback_data:'back_main'}],
  ] : [
    [{text:'➕ New Note',callback_data:'note_add'},{text:'📋 My Notes',callback_data:'note_list'}],
    [{text:'🔍 Search Notes',callback_data:'note_search'},{text:'🗑️ Delete Note',callback_data:'note_delete'}],
    [{text:'◀️ Back',callback_data:'back_main'}],
  ];
}
function toolsMenu(userId) {
  var fa = (users.getUserProfile(userId)||{}).language === 'fa';
  return fa ? [
    [{text:'⚖️ حقوقی',callback_data:'legal_assistant'},{text:'📊 آمار',callback_data:'data_analysis'}],
    [{text:'🔍 رقبا',callback_data:'competitor_research'},{text:'💡 ایده‌پردازی',callback_data:'brainstorm'}],
    [{text:'📅 برنامه‌ریز',callback_data:'scheduler_tool'},{text:'📦 سبد خرید',callback_data:'shopping_list'}],
    [{text:'💊 دارو',callback_data:'medication'},{text:'✈️ سفر',callback_data:'travel_planner'}],
    [{text:'🎁 هدیه',callback_data:'gift_ideas'},{text:'◀️ برگشت',callback_data:'back_main'}],
  ] : [
    [{text:'⚖️ Legal Help',callback_data:'legal_assistant'},{text:'📊 Data Analysis',callback_data:'data_analysis'}],
    [{text:'🔍 Research',callback_data:'competitor_research'},{text:'💡 Brainstorm',callback_data:'brainstorm'}],
    [{text:'📅 Planner',callback_data:'scheduler_tool'},{text:'🛒 Shopping List',callback_data:'shopping_list'}],
    [{text:'💊 Medication',callback_data:'medication'},{text:'✈️ Travel Plan',callback_data:'travel_planner'}],
    [{text:'🎁 Gift Ideas',callback_data:'gift_ideas'},{text:'◀️ Back',callback_data:'back_main'}],
  ];
}
function jobTypeMenu(userId) {
  var fa = (users.getUserProfile(userId)||{}).language === 'fa';
  return fa ? [
    [{text:'⏰ تمام‌وقت',callback_data:'jobtype_fulltime'},{text:'💻 ریموت',callback_data:'jobtype_remote'}],
    [{text:'🕐 پاره‌وقت',callback_data:'jobtype_parttime'},{text:'📋 قراردادی',callback_data:'jobtype_contract'}],
    [{text:'🏢 حضوری',callback_data:'jobtype_onsite'},{text:'🚀 استارتاپ',callback_data:'jobtype_startup'}],
  ] : [
    [{text:'⏰ Full-time',callback_data:'jobtype_fulltime'},{text:'💻 Remote',callback_data:'jobtype_remote'}],
    [{text:'🕐 Part-time',callback_data:'jobtype_parttime'},{text:'📋 Contract',callback_data:'jobtype_contract'}],
    [{text:'🏢 On-site',callback_data:'jobtype_onsite'},{text:'🚀 Startup',callback_data:'jobtype_startup'}],
  ];
}
function langMenu() { return [[{text:'🇬🇧 English',callback_data:'lang_en'},{text:'🇮🇷 فارسی',callback_data:'lang_fa'}]]; }

// ── Polling ───────────────────────────────────────────────────────────────────
var offset = 0, running = true;

function poll() {
  if (!running) return;
  tgGet('getUpdates', { offset: offset, timeout: 10 })
    .then(function(updates) {
      for (var i = 0; i < updates.length; i++) {
        var u = updates[i];
        offset = u.update_id + 1;
        if (u.callback_query)       handleCallback(u.callback_query).catch(function(e){ log('[bot] cb err:', e.message); });
        else if (u.message)         handleMessage(u.message).catch(function(e){ log('[bot] msg err:', e.message); });
      }
      if (running) setTimeout(poll, 100);
    })
    .catch(function(err) { log('[bot] poll err:', err.message); if (running) setTimeout(poll, 3000); });
}

// ── Message handler ───────────────────────────────────────────────────────────
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
      await sendMsg(chatId, t(userId, 'welcome_new'));
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
  if (text === '/status')      { await handleStatus(chatId, userId); return; }
  if (text === '/help')        { await handleHelp(chatId, userId); return; }
  if (text === '/settings')    { await handleSettings(chatId, userId); return; }
  if (text === '/notes')       { await sendButtons(chatId, '📝 *Notes Vault*', notesMenu(userId)); return; }
  if (text === '/tracker')     { await sendMsg(chatId, jobTracker.formatTracker(userId, user.language)); return; }
  if (text === '/jobs')        { await sendButtons(chatId, t(userId,'main_menu',{name:user.name||'friend'}), jobsMenu(userId)); return; }

  // ── Task Bus commands — strict prefix routing ─────────────────────────────
  var taskbusPrefixes = ['/tasks','/taskstats','/taskhelp','/task_','/taskdetails_','/taskbus_','/agents','/approvals','/latesttask','/latestresult','/result_'];
  var isMaybeTaskbus = taskbusPrefixes.some(function(p) { return text === p || text.startsWith(p); });
  if (isMaybeTaskbus) {
    var tbHandled = await taskbus.handleTaskBusCommand(chatId, userId, text, sendMsg, user);
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

  // Interview simulator active?
  var iSess = interview.getSession(userId);
  if (iSess && user.state === 'in_interview') {
    await handleInterviewAnswer(chatId, userId, text, iSess);
    return;
  }

  // State machine
  var state = getState(userId);
  if (state) { await handleStateInput(chatId, userId, text, state); return; }

  // ── task: / tell claude: prefix — route to Task Bus BEFORE generic handler ──
  if (/^(task|create task|new task|tell claude|tell gemini|tell chatgpt|tell notebooklm)\b/i.test(text)) {
    var tbCreated = await taskbus.createTaskFromMessage(userId, text, 'claude', sendMsg, chatId);
    if (tbCreated) return;
  }

  // Free text → generic AI task via ACC server
  await sendMsg(chatId, t(userId, 'processing', { task: text.slice(0,80) }));
  try {
    var u2 = users.getUserProfile(userId) || {};
    var res = await callACC('/api/execute', {
      agentType: 'architect',
      payload:   { prompt: text, mode: 'plan', language: u2.language||'en', userId: userId, userName: u2.name, resumeFile: u2.resumeFile, jobPrefs: u2.jobPrefs },
      meta:      { role: u2.role||'member', userId: userId, sandbox: true }
    });
    await sendMsg(chatId, '✅ *Task queued!*\nID: `' + (res.taskId||res.id||'submitted') + '`\n_I\'ll notify you when done._');
  } catch(e) {
    await sendMsg(chatId, '⚠️ _Server not reachable. Run_ `npm start` _in the project folder._');
  }
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
async function handleStateInput(chatId, userId, text, state) {
  var user = users.getUserProfile(userId) || {};
  clearState(userId);

  switch (state.action) {
    case 'awaiting_job_role':
      users.updateUser(userId, { jobPrefs: Object.assign({}, user.jobPrefs, { role: text }) });
      await sendMsg(chatId, '📍 ' + (user.language==='fa' ? 'شهر یا کشور؟' : 'Which city or country?'));
      setState(userId, 'awaiting_job_location', { role: text }); break;

    case 'awaiting_job_location':
      users.updateUser(userId, { jobPrefs: Object.assign({}, user.jobPrefs, { location: text }) });
      await sendButtons(chatId, user.language==='fa' ? '⏰ نوع شغل:' : '⏰ Job type:', jobTypeMenu(userId));
      setState(userId, 'awaiting_job_type', { role: state.data.role, location: text }); break;

    case 'awaiting_cover_role':
      if (!user.resumeFile) { await sendMsg(chatId, t(userId,'no_resume')); break; }
      await sendMsg(chatId, '✍️ _Writing your cover letter for_ *' + text + '*_..._');
      await callACC('/api/execute', { agentType: 'writer', payload: { prompt: 'Write a professional cover letter for: ' + text + '. Use the candidate resume on file.', mode: 'write', userId: userId, resumeFile: user.resumeFile }, meta: { role: 'member', userId: userId, sandbox: true } });
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
      await callACC('/api/execute', { agentType: 'writer', payload: { prompt: 'Act as a salary negotiation coach. Analyze this job offer and give specific counter-offer scripts and negotiation strategy: ' + text, mode: 'write', language: user.language||'en' }, meta: { role: 'member', userId: userId, sandbox: true } });
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

    case 'awaiting_content_topic':
      await sendMsg(chatId, t(userId,'processing',{task:text.slice(0,60)}));
      await callACC('/api/execute', { agentType: 'writer', payload: { prompt: text, mode: 'write', contentType: state.data.type||'content', language: user.language }, meta: { role: 'member', userId: userId, sandbox: true } });
      break;

    case 'awaiting_landing_desc':
      await sendMsg(chatId, t(userId,'processing',{task:'Landing page: '+text.slice(0,50)}));
      await callACC('/api/execute', { agentType: 'engineer', payload: { prompt: 'Create a landing page for: ' + text, mode: 'build' }, meta: { role: 'member', userId: userId, sandbox: true } });
      break;

    case 'awaiting_chef_request':
      await sendMsg(chatId, '🍳 _Finding recipes for you..._');
      await callACC('/api/execute', { agentType: 'writer', payload: { prompt: 'You are a personal chef AI. The user asks: ' + text + '. Give 3 meal options with full recipes, ingredients list, and cooking time. Make it practical and delicious.', mode: 'write', language: user.language||'en' }, meta: { role: 'member', userId: userId, sandbox: true } });
      break;

    case 'awaiting_translate':
      var targetLang = user.language==='fa' ? 'English' : 'Persian/Farsi';
      await sendMsg(chatId, '🌐 _Translating to ' + targetLang + '..._');
      await callACC('/api/execute', { agentType: 'writer', payload: { prompt: 'Translate this to ' + targetLang + ': ' + text, mode: 'write' }, meta: { role: 'member', userId: userId, sandbox: true } });
      break;

    case 'awaiting_research':
      await sendMsg(chatId, t(userId,'processing',{task:'Research: '+text.slice(0,50)}));
      await callACC('/api/execute', { agentType: 'browser', payload: { mode: 'search', query: text }, meta: { role: 'member', userId: userId, sandbox: true } });
      break;

    case 'awaiting_brainstorm':
      await sendMsg(chatId, t(userId,'processing',{task:'Brainstorm: '+text.slice(0,50)}));
      await callACC('/api/execute', { agentType: 'architect', payload: { prompt: 'Generate 10 creative ideas for: ' + text + '. Include pros/cons for top 3.', mode: 'plan', language: user.language||'en' }, meta: { role: 'member', userId: userId, sandbox: true } });
      break;

    default:
      await sendButtons(chatId, t(userId,'main_menu',{name:user.name||'friend'}), mainMenu(userId));
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function handleStatus(chatId, userId) {
  var h     = await callACC('/api/health', {});
  var count = users.getUserCount();
  var files = users.listUserFiles(userId).length;
  var user  = users.getUserProfile(userId) || {};
  var msg   = '📊 *ACC v2 Status*\n\n' +
    '🟢 Server: ' + (h.ok ? 'Online' : 'Offline') + '\n' +
    '🤖 Bot: Running\n' +
    '👥 Users: ' + count + '/10\n' +
    '📁 Your files: ' + files + '\n' +
    '📝 Your notes: ' + notes.getNotes(userId).length + '\n' +
    '💼 Jobs tracked: ' + jobTracker.getJobs(userId).length + '\n' +
    '🕐 Last seen: ' + new Date().toLocaleTimeString();
  await sendMsg(chatId, msg);
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
  var data   = cb.data;
  var user   = users.getUserProfile(userId) || {};
  await answerCB(cb.id);
  clearState(userId);

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

  // Menus
  if (data==='back_main'||data==='menu_home') { await sendButtons(chatId, t(userId,'main_menu',{name:user.name||'friend'}), mainMenu(userId)); return; }
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
    var state2 = emailMon.getMonitorState(userId);
    var fa2 = user.language==='fa';
    if (state2.enabled) {
      await sendButtons(chatId, fa2?'📧 مانیتورینگ ایمیل فعال است.':'📧 Email monitoring is active.', [[{text:fa2?'✅ بررسی ایمیل':'✅ Check now',callback_data:'email_check_now'},{text:fa2?'🔴 غیرفعال':'🔴 Disable',callback_data:'email_disable'}],[{text:'◀️ Back',callback_data:'menu_jobs'}]]);
    } else {
      var fa2 = user.language==='fa';
      await sendMsg(chatId, fa2?'📧 *مانیتورینگ ایمیل*\n\nبرای اتصال Gmail به صفحه این آدرس بروید:\n\n_در حال حاضر در حال توسعه است — به زودی فعال می‌شود._':'📧 *Email Monitoring*\n\nConnect your Gmail to get notified of job replies.\n\n_Gmail OAuth setup required. Add GOOGLE_CLIENT_ID to .env to enable._');
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
    await callACC('/api/execute', { agentType: 'browser', payload: { mode: 'search', query: jrole+' '+jtype+' jobs in '+jloc, userId: userId, resumeFile: user.resumeFile }, meta: { role: 'member', userId: userId, sandbox: true } });
    return;
  }

  // Resume
  if (data==='upload_resume')   { await sendMsg(chatId, t(userId,'upload_prompt')); setState(userId,'awaiting_resume'); return; }
  if (data==='tailor_resume')   { if (!user.resumeFile) { await sendMsg(chatId,t(userId,'no_resume')); return; } await sendMsg(chatId,'✏️ What role to tailor for?'); setState(userId,'awaiting_cover_role'); return; }
  if (data==='ats_check')       { if (!user.resumeFile) { await sendMsg(chatId,t(userId,'no_resume')); return; } await sendMsg(chatId,'📋 _Running ATS check..._'); await callACC('/api/execute',{agentType:'writer',payload:{prompt:'Run ATS check on this resume. Score 1-100 and list specific improvements.',mode:'validate',userId:userId,resumeFile:user.resumeFile},meta:{role:'member',userId:userId,sandbox:true}}); return; }
  if (data==='view_resume')     { if (!user.resumeFile) { await sendMsg(chatId,t(userId,'no_resume')); return; } try { await sendDocument(chatId, path.join(users.getUserStorageDir(userId), user.resumeFile), '📄 Your resume'); } catch(e) { await sendMsg(chatId,'❌ Could not retrieve file.'); } return; }
  if (data==='resume_versions') { var files=users.listUserFiles(userId).filter(function(f){return f.match(/resume/i);}); await sendMsg(chatId,'🗂️ *Resume versions:*\n\n'+(files.length?files.map(function(f,i){return (i+1)+'. '+f;}).join('\n'):'No resume files found.\n\nUpload one first!')); return; }

  // Content
  if (data==='landing_page')   { await sendMsg(chatId,'🌐 Describe your product/service:'); setState(userId,'awaiting_landing_desc'); return; }
  if (data==='seo_content')    { await sendMsg(chatId,'📹 SEO content about what topic?'); setState(userId,'awaiting_content_topic',{type:'seo'}); return; }
  if (data==='blog_post')      { await sendMsg(chatId,'📝 Blog post topic?'); setState(userId,'awaiting_content_topic',{type:'blog'}); return; }
  if (data==='video_script')   { await sendMsg(chatId,'🎬 Video about what?'); setState(userId,'awaiting_content_topic',{type:'video'}); return; }
  if (data==='social_post')    { await sendMsg(chatId,'📱 Social post about what?'); setState(userId,'awaiting_content_topic',{type:'social'}); return; }
  if (data==='email_sequence') { await sendMsg(chatId,'📧 Email campaign about what?'); setState(userId,'awaiting_content_topic',{type:'email'}); return; }
  if (data==='youtube_upload') { await sendMsg(chatId,'▶️ *YouTube Auto-Publisher*\n\nDescribe the video content and your channel focus. I\'ll create the script, generate audio, and prepare upload files.'); setState(userId,'awaiting_content_topic',{type:'youtube'}); return; }

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

scheduler.start();
emailMon.startPolling(5); // check email every 5 minutes

poll();
process.on('SIGINT',  function() { running = false; scheduler.stop(); emailMon.stopPolling(); process.exit(0); });
process.on('SIGTERM', function() { running = false; process.exit(0); });

module.exports = { send: sendMsg };
