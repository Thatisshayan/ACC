var bot = require('./cloud/telegram/bot.js');
bot.sendMessage(REDACTED, 'ACC v2 is LIVE! Bot is running and receiving your messages. Send /start to begin.')
  .then(function(r) { console.log('SENT OK:', r.message_id); process.exit(0); })
  .catch(function(e) { console.log('SEND ERR:', e.message); process.exit(1); });
