// cloud/telegram/features/scheduler.js
// Features 4 & 8: AI Daily Briefings (8am + 12pm) + Weekly Report
'use strict';

var users      = require('../users.js');
var jobTracker = require('./jobTracker.js');
var notes      = require('./notes.js');
var store      = require('../../taskbus/store.js');
var router     = require('../../taskbus/router.js');

var _sendFn = null;

function init(sendFunction) { _sendFn = sendFunction; }

function send(chatId, text) {
  if (!_sendFn) return Promise.resolve();
  return _sendFn(String(chatId), text).catch(function(e) {
    console.log('[scheduler] send err:', e.message);
  });
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function userLocation(user) {
  var prefs = user.jobPrefs || {};
  return prefs.location || prefs.city || process.env.BRIEFING_CITY || 'Toronto, Canada';
}

function buildUserContext(user) {
  var jobs = jobTracker.getJobs(user.id);
  var pending = jobs.filter(function(j) {
    return j.status === 'found' || j.status === 'applied' || j.status === 'interview';
  });
  var stale = jobTracker.getStaleApplications(user.id, 5);
  return {
    name: user.name || 'friend',
    language: user.language || 'en',
    location: userLocation(user),
    date: new Date().toLocaleDateString(user.language === 'fa' ? 'fa-IR' : 'en-CA', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    }),
    pendingJobs: pending.slice(0, 12),
    staleJobs: stale.slice(0, 5),
    notesCount: notes.getNotes(user.id).length,
    totalJobs: jobs.length,
  };
}

function buildBriefingInstruction(user, type, ctx) {
  var isMorning = type === 'morning';
  var lang = ctx.language === 'fa' ? 'Persian (Farsi)' : 'English';
  var jobLines = ctx.pendingJobs.length
    ? ctx.pendingJobs.map(function(j) {
      return '- ' + j.title + (j.company ? ' @ ' + j.company : '') + ' [' + j.status + ']';
    }).join('\n')
    : '(none)';

  return [
    'Write a ' + (isMorning ? 'MORNING' : 'AFTERNOON') + ' personal briefing for Telegram.',
    'Language: ' + lang + '. User: ' + ctx.name + '. Location: ' + ctx.location + '.',
    '',
    'USER DATA (use exactly — do not invent job titles):',
    'Today\'s date: ' + ctx.date,
    'Notes saved: ' + ctx.notesCount,
    'Total jobs tracked: ' + ctx.totalJobs,
    'Pending / active jobs:',
    jobLines,
    ctx.staleJobs.length ? ('Stale applications (5+ days): ' + ctx.staleJobs.map(function(j) { return j.title; }).join(', ')) : '',
    '',
    'REQUIRED SECTIONS (emoji headers, concise bullets):',
    '1. Greeting + today\'s date',
    '2. Pending jobs summary (from USER DATA)',
    '3. Notes vault (' + ctx.notesCount + ' saved)',
    '4. Motivational tip (1-2 sentences)',
    '5. Canada news headlines summary (3 bullets, general/public — no fabricated breaking events)',
    '6. Global news headlines summary (3 bullets)',
    '7. Gold price today (USD approximate, note if estimate)',
    '8. Weather today for ' + ctx.location + ' (high/low, conditions)',
    isMorning ? '9. One priority focus for this morning' : '9. One priority focus for this afternoon',
    '',
    'Put the FULL formatted briefing in the JSON "output" field. Keep under 3200 characters.',
  ].filter(Boolean).join('\n');
}

async function generateBriefingViaTaskBus(user, type) {
  var ctx = buildUserContext(user);
  var task = store.createTask({
    title: (type === 'morning' ? 'Morning' : 'Afternoon') + ' briefing — ' + ctx.name,
    instruction: buildBriefingInstruction(user, type, ctx),
    assigned_agent: 'claude',
    automation_mode: 'semi_auto',
    approval_required: false,
    created_by: 'scheduler',
    feature_ref: 'daily-briefing',
    priority: 'normal',
  });

  var routeResult = await router.routeTask(task.id);
  var text = routeResult && (routeResult.output || routeResult.summary);
  if (!text || String(text).length < 20) {
    var latest = store.getLatestResult(task.id);
    if (latest) text = latest.output || latest.summary;
  }
  return text && String(text).trim().length > 20 ? String(text).trim() : null;
}

function buildFallbackBriefing(user, type) {
  var ctx = buildUserContext(user);
  var isMorning = type === 'morning';
  var greeting = isMorning ? '☀️ Good morning' : '🌤️ Good afternoon';
  if (ctx.language === 'fa') greeting = isMorning ? '☀️ صبح بخیر' : '🌤️ ظهر بخیر';

  var lines = [
    greeting + ', *' + ctx.name + '*!',
    '📅 ' + ctx.date,
    '',
    '💼 *Pending jobs:* ' + ctx.pendingJobs.length,
  ];
  ctx.pendingJobs.slice(0, 5).forEach(function(j) {
    lines.push('  • ' + j.title + (j.company ? ' @ ' + j.company : '') + ' (' + j.status + ')');
  });
  lines.push('');
  lines.push('📝 *Notes saved:* ' + ctx.notesCount);
  lines.push('');
  lines.push('💡 _Tip: Review one pending application and send a follow-up today._');
  lines.push('');
  lines.push('_(AI briefing unavailable — add DEEPSEEK_API_KEY for full news, gold, and weather.)_');
  return lines.join('\n');
}

function briefingHeader(type, lang) {
  if (type === 'morning') return lang === 'fa' ? '🌅 *خلاصه صبحگاهی ACC*' : '🌅 *ACC Morning Briefing*';
  return lang === 'fa' ? '🌤️ *خلاصه ظهر ACC*' : '🌤️ *ACC Afternoon Briefing*';
}

async function sendBriefingToUser(user, type) {
  var chatId = user.id;
  var lang = user.language || 'en';
  console.log('[scheduler] Generating', type, 'briefing for', chatId);
  var body = await generateBriefingViaTaskBus(user, type);
  if (!body) body = buildFallbackBriefing(user, type);
  var message = briefingHeader(type, lang) + '\n\n' + body;
  if (message.length > 3900) message = message.slice(0, 3900) + '\n…';
  await send(chatId, message);
}

async function runBriefingSlot(type) {
  var allUsers = users.getAllUsers().filter(function(u) {
    return u.state === 'ready' && u.name && u.id;
  });
  console.log('[scheduler]', type, 'briefing —', allUsers.length, 'users');
  for (var i = 0; i < allUsers.length; i++) {
    try {
      await sendBriefingToUser(allUsers[i], type);
    } catch (e) {
      console.log('[scheduler] briefing failed for', allUsers[i].id, ':', e.message);
      await send(allUsers[i].id, buildFallbackBriefing(allUsers[i], type));
    }
    if (i < allUsers.length - 1) {
      await new Promise(function(r) { setTimeout(r, 1500); });
    }
  }
}

// Legacy static builder (fallback / tests)
function buildDailyBriefing(user) {
  return buildFallbackBriefing(user, 'morning');
}

function buildWeeklyReport(user) {
  var lang = user.language || 'en';
  var name = user.name || 'friend';
  var jobs = jobTracker.getJobs(user.id);
  var week = Date.now() - 7 * 24 * 60 * 60 * 1000;

  var thisWeek   = jobs.filter(function(j) { return new Date(j.createdAt).getTime() > week; });
  var applied    = jobs.filter(function(j) { return j.status === 'applied' && new Date(j.updatedAt).getTime() > week; });
  var interviews = jobs.filter(function(j) { return j.status === 'interview' && new Date(j.updatedAt).getTime() > week; });
  var offers     = jobs.filter(function(j) { return j.status === 'offer'; });

  if (lang === 'fa') {
    return '📈 *گزارش هفتگی — ' + name + '*\n\n' +
      '🔍 شغل پیدا شده: ' + thisWeek.length + '\n' +
      '📤 درخواست ارسال شده: ' + applied.length + '\n' +
      '🎯 مصاحبه: ' + interviews.length + '\n' +
      '🎉 پیشنهاد: ' + offers.length + '\n\n' +
      (offers.length ? '🏆 _این هفته ' + offers.length + ' پیشنهاد دریافت کردی!_\n\n' : '') +
      '📅 *اهداف هفته آینده:*\n• ۵ شغل جدید • ۳ درخواست • ۱ مصاحبه';
  }
  return '📈 *Weekly Report — ' + name + '*\n\n' +
    '🔍 Jobs found: ' + thisWeek.length + '\n' +
    '📤 Applications sent: ' + applied.length + '\n' +
    '🎯 Interviews: ' + interviews.length + '\n' +
    '🎉 Offers received: ' + offers.length + '\n\n' +
    (offers.length ? '🏆 _You got ' + offers.length + ' offer(s) this week!_\n\n' : '') +
    '📅 *Next week goals:*\n• Find 5 new jobs\n• Send 3 applications\n• Schedule 1 interview';
}

var intervals = [];
var lastRuns = { morning: null, afternoon: null, weekly: null, stale: null };

function start() {
  var iv = setInterval(function() {
    var now = new Date();
    var h   = now.getHours();
    var m   = now.getMinutes();
    var day = now.getDay();
    var dk  = todayKey();

    // 8:00am morning briefing (2-minute window)
    if (h === 8 && m < 2 && lastRuns.morning !== dk) {
      lastRuns.morning = dk;
      runBriefingSlot('morning').catch(function(e) {
        console.log('[scheduler] morning run err:', e.message);
      });
    }

    // 12:00pm afternoon briefing
    if (h === 12 && m < 2 && lastRuns.afternoon !== dk) {
      lastRuns.afternoon = dk;
      runBriefingSlot('afternoon').catch(function(e) {
        console.log('[scheduler] afternoon run err:', e.message);
      });
    }

    // Sunday 9:00am weekly report
    if (day === 0 && h === 9 && m < 2 && lastRuns.weekly !== dk) {
      lastRuns.weekly = dk;
      users.getAllUsers().filter(function(u) { return u.state === 'ready' && u.name; }).forEach(function(user) {
        send(user.id, buildWeeklyReport(user));
      });
    }

    // Monday 10am stale application reminders
    if (day === 1 && h === 10 && m < 2 && lastRuns.stale !== dk) {
      lastRuns.stale = dk;
      users.getAllUsers().filter(function(u) { return u.state === 'ready' && u.name; }).forEach(function(user) {
        var stale = jobTracker.getStaleApplications(user.id, 7);
        if (!stale.length) return;
        var msg = '⏰ *Follow-up Reminder*\n\nNo response after 7+ days:\n\n';
        stale.forEach(function(j) { msg += '• *' + j.title + '*' + (j.company ? ' @ ' + j.company : '') + '\n'; });
        msg += '\nTap /jobs → My Applications';
        send(user.id, msg);
      });
    }
  }, 60000);

  intervals.push(iv);
  console.log('[scheduler] Started — AI briefings 8:00 + 12:00, weekly Sun 9am, stale Mon 10am');
}

function stop() { intervals.forEach(clearInterval); intervals = []; }

module.exports = {
  init, start, stop,
  buildDailyBriefing, buildWeeklyReport,
  generateBriefingViaTaskBus, runBriefingSlot,
};
