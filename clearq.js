var fetch = require('node-fetch');
var T = '8374160734:AAGLR6FV5n21bPJAZgdHE91q6wOO7PprYAA';
// First get current updates to find highest update_id
fetch('https://api.telegram.org/bot' + T + '/getUpdates?offset=0&timeout=0')
  .then(function(r) { return r.json(); })
  .then(function(p) {
    console.log('Current updates:', p.result ? p.result.length : 0);
    if (p.result && p.result.length > 0) {
      var maxId = Math.max.apply(null, p.result.map(function(u) { return u.update_id; }));
      var nextOffset = maxId + 1;
      console.log('Max update_id:', maxId, '-> setting offset to', nextOffset);
      // Confirm all updates by calling with offset = maxId + 1
      return fetch('https://api.telegram.org/bot' + T + '/getUpdates?offset=' + nextOffset + '&timeout=0')
        .then(function(r2) { return r2.json(); })
        .then(function(p2) {
          console.log('After confirm, pending:', p2.result ? p2.result.length : 0);
          console.log('Queue cleared. Bot can now poll cleanly.');
          process.exit(0);
        });
    } else {
      console.log('No pending updates. Queue is clean.');
      process.exit(0);
    }
  });
