'use strict';

const { spawnSync } = require('child_process');

function runStep(name, command, args) {
  const res = spawnSync(command, args, { stdio: 'pipe', encoding: 'utf8' });
  return {
    name,
    command: [command].concat(args).join(' '),
    status: res.status === 0 ? 'pass' : 'fail',
    code: res.status,
    stdout: (res.stdout || '').trim(),
    stderr: (res.stderr || '').trim(),
  };
}

function run() {
  const steps = [
    runStep('security_lockdown', process.execPath, ['scripts/verify-security-lockdown.js']),
    runStep('agent1_ui_coverage', process.execPath, ['scripts/verify-agent1-ui-coverage.js']),
    runStep('migration_coverage', process.execPath, ['scripts/verify-migration-coverage.js']),
    runStep('db_auth_hardening', process.execPath, ['scripts/verify-db-auth-hardening.js']),
    runStep('log_safety', process.execPath, ['scripts/verify-log-safety.js']),
  ];
  const failed = steps.filter((s) => s.status !== 'pass');
  const report = {
    ts: new Date().toISOString(),
    steps: steps.map((s) => ({ name: s.name, status: s.status, code: s.code, command: s.command })),
    verdict: failed.length ? 'fail' : 'pass',
  };

  console.log(JSON.stringify(report, null, 2));
  if (failed.length) process.exit(1);
}

run();
