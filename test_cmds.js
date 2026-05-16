// Test all command routing fixes
require('dotenv').config();
var store   = require('./cloud/taskbus/store.js');
var tgcmds  = require('./cloud/taskbus/telegramCommands.js');

var PASS=0, FAIL=0;
var msgs = [];
var fakeSend = function(chatId, text) { msgs.push(text); return Promise.resolve(); };

function pass(label) { console.log('  PASS', label); PASS++; }
function fail(label, got) { console.log('  FAIL', label, got ? '| got: '+String(got).slice(0,80) : ''); FAIL++; }

(async function() {
  console.log('\n=== Command Routing Fix Tests ===\n');

  // Helper: run command and check last message
  async function cmd(text, check, label) {
    msgs = [];
    await tgcmds.handleTaskBusCommand('123', 'u1', text, fakeSend, {language:'en'});
    var last = msgs[msgs.length - 1] || '';
    if (check(last)) pass(label);
    else fail(label, last.slice(0,100));
  }

  // T1: /tasks works
  await cmd('/tasks', function(m){ return m.includes('Task') || m.includes('No tasks'); }, '/tasks returns task list');

  // T2: /taskstats works (exact match)
  await cmd('/taskstats', function(m){ return m.includes('Stats') || m.includes('Total'); }, '/taskstats works');

  // T3: /taskstat (typo) returns unknown command NOT a task creation
  await cmd('/taskstat', function(m){ return m.includes('Unknown') || m.includes('unknown'); }, '/taskstat (typo) returns unknown command');

  // T4: /task_2 returns unknown command NOT a task creation
  await cmd('/task_2', function(m){ return m.includes('not found') || m.includes('Unknown') || m.includes('Task not found') || m.includes('Task Detail'); }, '/task_2 returns task-not-found, not task creation');

  // T5: /agents works
  await cmd('/agents', function(m){ return m.includes('Agent') || m.includes('Provider'); }, '/agents returns agent list');

  // T6: /approvals works
  await cmd('/approvals', function(m){ return m.includes('Approval') || m.includes('pending') || m.includes('No pending'); }, '/approvals returns approvals');

  // T7: /latesttask — new command
  await cmd('/latesttask', function(m){ return m.includes('Task') || m.includes('No tasks'); }, '/latesttask works');

  // T8: /latestresult — new command
  await cmd('/latestresult', function(m){ return m.includes('Result') || m.includes('No results'); }, '/latestresult works');

  // T9: /task_<valid_id> — pick a real task ID
  var tasks = store.getTasks();
  if (tasks.length > 0) {
    var shortId = tasks[0].id.slice(0, 8);
    await cmd('/task_' + shortId, function(m){ return m.includes('Task Detail') || m.includes(tasks[0].title.slice(0,10)); }, '/task_<real_id> shows task detail');
    // T10: /result_<valid_id>
    await cmd('/result_' + shortId, function(m){ return m.includes('Result') || m.includes('No result'); }, '/result_<real_id> shows result or not-found');
  } else {
    pass('/task_<id> skipped — no tasks in store');
    pass('/result_<id> skipped — no tasks in store');
  }

  // T11: Unknown slash command /foobar returns error, not task creation
  await cmd('/foobar', function(m){ return m.includes('Unknown') || m.includes('unknown'); }, '/foobar returns unknown command error');

  // T12: /taskbus_approve_xyz returns not-found, not task creation
  await cmd('/taskbus_approve_xyz', function(m){ return m.includes('not found') || m.includes('Approval not found'); }, '/taskbus_approve_xyz returns not-found');

  // T13: task: prefix creates task and returns result
  msgs = [];
  var created = false;
  var result = await tgcmds.createTaskFromMessage('u1', 'task: check system status', 'claude', fakeSend, '123');
  created = result === true;
  var allMsgs = msgs.join(' ');
  created ? pass('task: prefix triggers task creation') : fail('task: prefix should trigger creation');
  allMsgs.includes('queued') || allMsgs.includes('Task') ? pass('task: result sent back to user') : fail('task: result not sent back', allMsgs.slice(0,100));

  // T14: tell claude: works same as task:
  msgs = [];
  var r2 = await tgcmds.createTaskFromMessage('u1', 'tell claude: summarize provider status', 'claude', fakeSend, '123');
  r2 ? pass('tell claude: works') : fail('tell claude: did not trigger');

  // T15: /help returns full command list including Task Bus
  await cmd('/taskhelp', function(m){ return m.includes('/tasks') && m.includes('/latesttask') && m.includes('/result_'); }, '/taskhelp lists all Task Bus commands');

  console.log('\n=== Results ===');
  console.log('PASS:', PASS, '| FAIL:', FAIL, '| TOTAL:', PASS+FAIL);
  console.log(FAIL === 0 ? '\n✅ ALL TESTS PASSED' : '\n⚠️  ' + FAIL + ' FAILED');
  process.exit(FAIL === 0 ? 0 : 1);
})();
