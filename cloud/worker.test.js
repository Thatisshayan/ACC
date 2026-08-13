'use strict';
// cloud/worker.test.js — worker dispatch core.
//
// worker.js runs an infinite loop (workerLoop) and registers a heartbeat
// setInterval at module load, so it cannot be imported directly into the test
// runner process without hanging it. Instead, each scenario runs the REAL
// workerLoop + queue wiring in a throwaway child process, with only
// cloud/executor.js mocked via require.cache (so the ~7s connector/AWS SDK
// chain is never loaded and no network is possible). The child polls the real
// task statuses, asserts, and exits 0/1.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

const CHILD = `
'use strict';
const path = require('path');
const root = process.cwd();
const mode = process.env.WORKER_TEST_MODE;
const queue = require(path.join(root, 'cloud/queue.js'));

const exPath = path.resolve(root, 'cloud/executor.js');
require.cache[exPath] = {
  id: exPath,
  filename: exPath,
  loaded: true,
  exports: {
    executeTask: async ({ id, agentType, payload }) => {
      if (payload && payload.boom) throw new Error('boom-' + payload.label);
      return { success: true, provider: 'fake', output: 'ok-' + (payload && payload.label ? payload.label : '') };
    },
  },
};

const worker = require(path.join(root, 'cloud/worker.js'));

if (mode === 'dispatch') {
  queue.enqueueTask({ agentType: 'writer', payload: { label: 'A' }, meta: { role: 'admin' } });
  queue.enqueueTask({ agentType: 'architect', payload: { label: 'B' }, meta: { role: 'admin' } });
} else if (mode === 'throw') {
  queue.enqueueTask({ agentType: 'writer', payload: { label: 'boom1', boom: true }, meta: { role: 'admin' } });
  queue.enqueueTask({ agentType: 'writer', payload: { label: 'survivor' }, meta: { role: 'admin' } });
} else {
  console.error('UNKNOWN_MODE ' + mode);
  process.exit(2);
}

worker.startWorker();

const deadline = Date.now() + 10000;
(function poll() {
  const all = queue.getAllTasks();
  const done = all.every((t) => t.status === 'completed' || t.status === 'failed');
  if (!done) {
    if (Date.now() > deadline) {
      console.error('TIMEOUT ' + JSON.stringify(all.map((t) => t.status)));
      process.exit(3);
    }
    return setTimeout(poll, 50);
  }
  const lines = all.map((t) => (t.status + ':' + (t.result ? t.result.output : '') + (t.error || '')).trim()).join(';');
  if (mode === 'dispatch') {
    const ok = all.length === 2
      && all.every((t) => t.status === 'completed')
      && all.some((t) => t.result && t.result.output === 'ok-A')
      && all.some((t) => t.result && t.result.output === 'ok-B');
    console.log(ok ? 'DISPATCH_OK ' + lines : 'DISPATCH_BAD ' + lines);
    process.exit(ok ? 0 : 1);
  }
  if (mode === 'throw') {
    const boom = all[0];
    const survivor = all[1];
    const ok = boom.status === 'failed' && /boom-boom1/.test(boom.error) && survivor.status === 'completed';
    console.log(ok ? 'THROW_OK ' + lines : 'THROW_BAD ' + lines);
    process.exit(ok ? 0 : 1);
  }
})();
`;

function runChild(mode) {
  return new Promise((resolve) => {
    const env = { WORKER_TEST_MODE: mode };
    for (const k of ['PATH', 'SystemRoot', 'TEMP', 'TMP', 'USERPROFILE', 'HOME', 'COMSPEC', 'NUMBER_OF_PROCESSORS']) {
      if (process.env[k]) env[k] = process.env[k];
    }
    const child = spawn(process.execPath, ['-e', CHILD], {
      cwd: repoRoot,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('exit', (code) => resolve({ code, out }));
  });
}

test('worker dispatches queued tasks to the executor and marks them completed', async () => {
  const { code, out } = await runChild('dispatch');
  assert.equal(code, 0, 'child should exit 0\n' + out);
  assert.match(out, /DISPATCH_OK/, out);
});

test('a handler that throws marks the task failed without crashing the worker loop', async () => {
  const { code, out } = await runChild('throw');
  assert.equal(code, 0, 'child should exit 0\n' + out);
  assert.match(out, /THROW_OK/, out);
});
