// cloud/telegram/features/scheduler.js
// Features 4 & 8: Daily Morning Briefing + Weekly Performance Report
'use strict';

const users      = require('../users.js');
const jobTracker = require('./jobTracker.js');

var _sendFn = null; // injected from bot.js

function init(sendFunction) { _sendFn = sendFunction; }

function send(chatId, text) {
  if (_sendFn) return _sendFn(chatId, text).catch(function(e) { console.log('[scheduler] send err:', e.message); });
}

// ── Daily briefing — runs at 8am for each user ────────────────────────────────
function buildDailyBriefing(user) {
  var lang  = user.language || 'en';
  var name  = user.name || 'friend';
  var jobs  = jobTracker.getJobs(user.id);
  var stale = jobTracker.getStaleApplications(user.id, 5);

  var hour   = new Date().getHours();
  var greeting = hour < 12 ? '☀️ Good morning' : hour < 17 ? '👋 Good afternoon' : '🌙 Good evening';
  if (lang === 'fa') greeting = hour < 12 ? '☀️ صبح بخیر' : hour < 17 ? '👋 ظهر بخیر' : '🌙 شب بخیر';

  var lines = [greeting + ', *' + name + '*!\n'];

  if (lang === 'fa') {
    lines.push('📊 *خلاصه امروز*');
    lines.push('• شغل ردیابی‌شده: ' + jobs.length);
    lines.push('• در انتظار پاسخ: ' + jobTracker.getJobsByStatus(user.id,'applied').length);
    if (stale.length) lines.push('\n⏰ *پیگیری‌های معوق:*\n' + stale.map(function(j) { return '  • ' + j.title + (j.company?' @ '+j.company:''); }).join('\n'));
    lines.push('\n💡 _یک پیشنهاد برای امروز: رزومه‌ات را با یک شغل جدید تطبیق بده!_');
    lines.push('\nبرای شروع از منو استفاده کن 👇');
  } else {
    lines.push('📊 *Today\'s Summary*');
    lines.push('• Jobs tracked: ' + jobs.length);
    lines.push('• Awaiting response: ' + jobTracker.getJobsByStatus(user.id,'applied').length);
    if (stale.length) {
      lines.push('\n⏰ *Follow-up needed:*');
      stale.forEach(function(j) { lines.push('  • ' + j.title + (j.company?' @ '+j.company:'') + ' (5+ days no reply)'); });
    }
    lines.push('\n💡 _Tip: Tailor your resume for one new job today!_');
    lines.push('\nUse /menu to get started 👇');
  }
  return lines.join('\n');
}

function buildWeeklyReport(user) {
  var lang = user.language || 'en';
  var name = user.name || 'friend';
  var jobs = jobTracker.getJobs(user.id);
  var week = Date.now() - 7*24*60*60*1000;

  var thisWeek   = jobs.filter(function(j) { return new Date(j.createdAt).getTime() > week; });
  var applied    = jobs.filter(function(j) { return j.status==='applied'   && new Date(j.updatedAt).getTime()>week; });
  var interviews = jobs.filter(function(j) { return j.status==='interview' && new Date(j.updatedAt).getTime()>week; });
  var offers     = jobs.filter(function(j) { return j.status==='offer'; });

  if (lang === 'fa') {
    return '📈 *گزارش هفتگی — ' + name + '*\n\n' +
      '🔍 شغل پیدا شده: ' + thisWeek.length + '\n' +
      '📤 درخواست ارسال شده: ' + applied.length + '\n' +
      '🎯 مصاحبه: ' + interviews.length + '\n' +
      '🎉 پیشنهاد: ' + offers.length + '\n\n' +
      (offers.length ? '🏆 _این هفته ' + offers.length + ' پیشنهاد دریافت کردی! عالی!_\n\n' : '') +
      '📅 *اهداف هفته آینده:*\n' +
      '• ۵ شغل جدید پیدا کن\n• ۳ درخواست ارسال کن\n• ۱ مصاحبه انجام بده';
  }
  return '📈 *Weekly Report — ' + name + '*\n\n' +
    '🔍 Jobs found: ' + thisWeek.length + '\n' +
    '📤 Applications sent: ' + applied.length + '\n' +
    '🎯 Interviews: ' + interviews.length + '\n' +
    '🎉 Offers received: ' + offers.length + '\n\n' +
    (offers.length ? '🏆 _You got ' + offers.length + ' offer(s) this week! Amazing!_\n\n' : '') +
    '📅 *Next week goals:*\n' +
    '• Find 5 new jobs\n• Send 3 applications\n• Schedule 1 interview';
}

// ── Cron-like scheduler ───────────────────────────────────────────────────────
var intervals = [];

function start() {
  // Check every minute
  var iv = setInterval(function() {
    var now = new Date();
    var h   = now.getHours();
    var m   = now.getMinutes();
    var day = now.getDay(); // 0=Sun

    var allUsers = users.getAllUsers().filter(function(u) { return u.state === 'ready' && u.name; });

    // 8:00am daily briefing
    if (h === 8 && m === 0) {
      allUsers.forEach(function(user) {
        send(user.id, buildDailyBriefing(user));
      });
    }

    // Sunday 9:00am weekly report
    if (day === 0 && h === 9 && m === 0) {
      allUsers.forEach(function(user) {
        send(user.id, buildWeeklyReport(user));
      });
    }

    // Stale application reminders — Monday 10am
    if (day === 1 && h === 10 && m === 0) {
      allUsers.forEach(function(user) {
        var stale = jobTracker.getStaleApplications(user.id, 7);
        if (stale.length) {
          var msg = '⏰ *Follow-up Reminder*\n\nThese applications have no response after 7+ days:\n\n';
          stale.forEach(function(j) { msg += '• *' + j.title + '*' + (j.company?' @ '+j.company:'') + '\n'; });
          msg += '\nWant me to draft follow-up emails? Tap /jobs → My Applications';
          send(user.id, msg);
        }
      });
    }

  }, 60000); // every 60s

  intervals.push(iv);
  console.log('[scheduler] Started — daily briefing 8am, weekly report Sunday 9am');
}

function stop() { intervals.forEach(clearInterval); intervals = []; }

module.exports = { init, start, stop, buildDailyBriefing, buildWeeklyReport };
