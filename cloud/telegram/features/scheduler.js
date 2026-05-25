// cloud/telegram/features/scheduler.js
// Features 4 & 8: AI Daily Briefings (8am + 12pm) + Weekly Report
'use strict';

var users      = require('../users.js');
var jobTracker = require('./jobTracker.js');
var notes      = require('./notes.js');
var store      = require('../../taskbus/store.js');
var router     = require('../../taskbus/router.js');

var _sendFn = null;

function init(sendFunction) {
  _sendFn = sendFunction;
}

function send(chatId, text) {
  if (!_sendFn) return Promise.resolve();
  return _sendFn(String(chatId), text).catch(function(e) {
    console.log('[scheduler] send err:', e.message);
  });
}

var BRIEFING_TZ = process.env.BRIEFING_TZ || 'America/Toronto';
var SLOT_WINDOW_MIN = parseInt(process.env.BRIEFING_WINDOW_MIN || '30', 10);

function localNow() {
  var parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BRIEFING_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  }).formatToParts(new Date());

  var get = function(type) {
    var part = parts.find(function(x) { return x.type === type; });
    return part ? part.value : '';
  };

  return {
    dateKey: get('year') + '-' + get('month') + '-' + get('day'),
    hour: parseInt(get('hour'), 10),
    minute: parseInt(get('minute'), 10),
    day: get('weekday'),
  };
}

function todayKey() {
  return localNow().dateKey;
}

function inSlot(hour, minute, targetHour) {
  return hour === targetHour && minute < SLOT_WINDOW_MIN;
}

function userLocation(user) {
  var prefs = user.jobPrefs || {};
  return prefs.location || prefs.city || process.env.BRIEFING_CITY || 'Toronto, Canada';
}

function formatTaskLine(task) {
  return task.title + ' [' + task.status + ']';
}

function formatResultLine(result) {
  var summary = String(result.summary || result.output || '').replace(/\s+/g, ' ').trim();
  if (summary.length > 90) summary = summary.slice(0, 87).trim() + '...';
  return (result.provider_used || 'unknown') + ': ' + (summary || 'no summary');
}

function buildUserContext(user) {
  var jobs = jobTracker.getJobs(user.id);
  var pending = jobs.filter(function(j) {
    return j.status === 'found' || j.status === 'applied' || j.status === 'interview';
  });
  var stale = jobTracker.getStaleApplications(user.id, 5);
  var recentTasks = store.getTasks().slice(0, 5);
  var pendingApprovals = store.getPendingApprovals().slice(0, 5);
  var recentResults = store.getAllResults(5);
  var stats = store.getStats();

  return {
    name: user.name || 'friend',
    language: user.language || 'en',
    location: userLocation(user),
    now: localNow(),
    date: new Date().toLocaleDateString(user.language === 'fa' ? 'fa-IR' : 'en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
    pendingJobs: pending.slice(0, 12),
    staleJobs: stale.slice(0, 5),
    notesCount: notes.getNotes(user.id).length,
    totalJobs: jobs.length,
    taskStats: stats,
    recentTasks: recentTasks,
    pendingApprovals: pendingApprovals,
    recentResults: recentResults,
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
  var taskLines = ctx.recentTasks.length ? ctx.recentTasks.map(formatTaskLine).join('\n') : '(none)';
  var approvalLines = ctx.pendingApprovals.length ? ctx.pendingApprovals.map(function(a) {
    return '- ' + a.action + ' / ' + a.id.slice(0, 8);
  }).join('\n') : '(none)';
  var resultLines = ctx.recentResults.length ? ctx.recentResults.map(formatResultLine).join('\n') : '(none)';

  return [
    'Write a ' + (isMorning ? 'MORNING' : 'AFTERNOON') + ' operational briefing for Telegram.',
    'Language: ' + lang + '. User: ' + ctx.name + '. Location: ' + ctx.location + '.',
    '',
    'LIVE ACC SNAPSHOT (use only these facts; do not invent external news):',
    'Current time: ' + ctx.now.day + ' ' + ctx.now.hour + ':' + String(ctx.now.minute).padStart(2, '0') + ' (' + BRIEFING_TZ + ')',
    'Today\'s date: ' + ctx.date,
    'Total tasks: ' + ctx.taskStats.total_tasks,
    'Pending approvals: ' + ctx.taskStats.pending_approvals,
    'Recent tasks:',
    taskLines,
    'Pending approval IDs:',
    approvalLines,
    'Recent results:',
    resultLines,
    'Notes saved: ' + ctx.notesCount,
    'Total jobs tracked: ' + ctx.totalJobs,
    'Pending / active jobs:',
    jobLines,
    ctx.staleJobs.length ? ('Stale applications (5+ days): ' + ctx.staleJobs.map(function(j) { return j.title; }).join(', ')) : 'Stale applications: none',
    '',
    'REQUIRED SECTIONS (emoji headers, concise bullets):',
    '1. Greeting + current date/time',
    '2. Today\'s ACC queue: task counts, pending approvals, and what changed most recently',
    '3. Pending jobs summary (from LIVE ACC SNAPSHOT)',
    '4. Notes vault (' + ctx.notesCount + ' saved)',
    '5. Latest results summary (use recent results above)',
    '6. One practical priority focus for ' + (isMorning ? 'this morning' : 'this afternoon'),
    '7. One short action list for the next 24 hours',
    '',
    'Keep it fresh. If a section has nothing new, say so plainly instead of repeating generic filler.',
    'Put the FULL formatted briefing in the JSON "output" field. Keep under 3200 characters.',
  ].filter(Boolean).join('\n');
}

async function generateBriefingViaTaskBus(user, type) {
  var ctx = buildUserContext(user);
  var task = store.createTask({
    title: (type === 'morning' ? 'Morning' : 'Afternoon') + ' briefing - ' + ctx.name,
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
    '📅 ' + ctx.date + ' • ' + ctx.now.day + ' ' + ctx.now.hour + ':' + String(ctx.now.minute).padStart(2, '0'),
    '',
    '🧭 *ACC today:* ' + ctx.taskStats.total_tasks + ' tasks | ' + ctx.taskStats.pending_approvals + ' approvals pending',
    '• Recent tasks: ' + (ctx.recentTasks.length ? ctx.recentTasks.map(formatTaskLine).join(' | ') : 'none'),
    '• Recent results: ' + (ctx.recentResults.length ? ctx.recentResults.map(formatResultLine).join(' | ') : 'none'),
    '',
    '💼 *Pending jobs:* ' + ctx.pendingJobs.length,
  ];
  ctx.pendingJobs.slice(0, 5).forEach(function(j) {
    lines.push('  • ' + j.title + (j.company ? ' @ ' + j.company : '') + ' (' + j.status + ')');
  });
  lines.push('');
  lines.push('🧾 *Pending approvals:* ' + (ctx.pendingApprovals.length ? ctx.pendingApprovals.map(function(a) { return a.id.slice(0, 8); }).join(', ') : 'none'));
  lines.push('');
  lines.push('📝 *Notes saved:* ' + ctx.notesCount);
  lines.push('');
  lines.push('💡 _Tip: Clear one approval, review one recent task, and move one job forward today._');
  return lines.join('\n');
}

function briefingHeader(type, lang) {
  if (type === 'morning') return lang === 'fa' ? '☀️ *خلاصه صبحگاهی ACC*' : '☀️ *ACC Morning Briefing*';
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
  console.log('[scheduler]', type, 'briefing -', allUsers.length, 'users');
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
var slotRunning = { morning: false, afternoon: false };

function startBriefingSlot(type, dk) {
  if (slotRunning[type]) return;
  slotRunning[type] = true;
  lastRuns[type] = dk;
  console.log('[scheduler] Triggering', type, 'briefing | tz:', BRIEFING_TZ, '| date:', dk);
  runBriefingSlot(type)
    .catch(function(e) { console.log('[scheduler]', type, 'run err:', e.message); })
    .finally(function() { slotRunning[type] = false; });
}

function start() {
  var iv = setInterval(function() {
    var now = localNow();
    var h   = now.hour;
    var m   = now.minute;
    var dk  = now.dateKey;
    var day = now.day;

    if (inSlot(h, m, 8) && lastRuns.morning !== dk) {
      startBriefingSlot('morning', dk);
    }

    if (inSlot(h, m, 12) && lastRuns.afternoon !== dk) {
      startBriefingSlot('afternoon', dk);
    }

    if (day === 'Sun' && inSlot(h, m, 9) && lastRuns.weekly !== dk) {
      lastRuns.weekly = dk;
      users.getAllUsers().filter(function(u) { return u.state === 'ready' && u.name; }).forEach(function(user) {
        send(user.id, buildWeeklyReport(user));
      });
    }

    if (day === 'Mon' && inSlot(h, m, 10) && lastRuns.stale !== dk) {
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
  var n = localNow();
  console.log('[scheduler] Started - briefings 8:00 + 12:00 (' + BRIEFING_TZ + ', window ' + SLOT_WINDOW_MIN + 'm) | now:', n.hour + ':' + String(n.minute).padStart(2, '0'));
}

function stop() {
  intervals.forEach(clearInterval);
  intervals = [];
}

function triggerBriefing(type, force) {
  if (force) lastRuns[type] = null;
  return runBriefingSlot(type);
}

async function sendBriefingForUser(userId, type) {
  var user = users.getUserProfile(userId);
  if (!user || user.state !== 'ready' || !user.name) {
    throw new Error('Complete onboarding first (/start)');
  }
  await sendBriefingToUser(user, type);
}

module.exports = {
  init,
  start,
  stop,
  buildDailyBriefing,
  buildWeeklyReport,
  generateBriefingViaTaskBus,
  runBriefingSlot,
  triggerBriefing,
  sendBriefingForUser,
};
