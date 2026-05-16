require('dotenv').config();
var ok = true;
function chk(label, fn) {
  try { fn(); console.log('  OK  ', label); }
  catch(e) { console.log(' FAIL ', label, '--', e.message.slice(0,80)); ok = false; }
}
chk('bot.js loads',            function(){ require('./cloud/telegram/bot.js'); });
chk('browser.js (Playwright)', function(){ var b=require('./cloud/connectors/browser.js'); if(!b.searchJobs||!b.checkHealth)throw new Error('missing exports'); });
chk('Electron main.js syntax', function(){ require('./desktop/main.js'); });
console.log(ok ? '\nALL OK' : '\nFAILURES');
setTimeout(function(){ process.exit(ok?0:1); }, 500);
