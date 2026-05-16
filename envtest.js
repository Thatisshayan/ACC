// Print what token node actually sees
console.log('TOKEN from env:', process.env.TELEGRAM_BOT_TOKEN ? process.env.TELEGRAM_BOT_TOKEN.slice(0,20) : 'NOT SET');
var https = require('https');
var T = process.env.TELEGRAM_BOT_TOKEN;
var url = 'https://api.telegram.org/bot' + T + '/getUpdates?offset=0&timeout=3';
console.log('URL prefix:', url.slice(0,60));
https.get(url, function(res) {
  var d=''; res.on('data',function(c){d+=c}); res.on('end',function(){
    console.log('STATUS:', res.statusCode);
    console.log('BODY:', d.slice(0,100));
    process.exit(0);
  });
}).on('error', function(e){ console.log('ERR:', e.message); process.exit(1); });
