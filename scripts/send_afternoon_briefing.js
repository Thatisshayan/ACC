'use strict';
// One-shot: send afternoon briefing to all ready users — node scripts/send_afternoon_briefing.js
require('dotenv').config({ path: require('path').join(__dirname, '../.env'), override: false });

var axios = require('axios');
var scheduler = require('../cloud/telegram/features/scheduler.js');
var TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!TOKEN) {
  console.error('TELEGRAM_BOT_TOKEN missing');
  process.exit(1);
}

function send(chatId, text) {
  return axios.post('https://api.telegram.org/bot' + TOKEN + '/sendMessage', {
    chat_id: chatId,
    text: String(text),
    parse_mode: 'Markdown',
  }).catch(function() {
    return axios.post('https://api.telegram.org/bot' + TOKEN + '/sendMessage', {
      chat_id: chatId,
      text: String(text),
    });
  });
}

scheduler.init(send);
scheduler.triggerBriefing('afternoon', true).then(function() {
  console.log('[send_afternoon_briefing] Done');
  process.exit(0);
}).catch(function(e) {
  console.error('[send_afternoon_briefing] FAIL:', e.message);
  process.exit(1);
});
