'use strict';

const fs = require('fs');
const path = require('path');

function read(file) {
  return fs.readFileSync(path.join(process.cwd(), file), 'utf8');
}

function has(pattern, text) {
  return new RegExp(pattern, 'i').test(text);
}

function run() {
  const m007 = read('migrations/007_rls_drop_open_policies.sql');
  const server = read('cloud/server.js');
  const login = read('landing/login.html');
  const authCheck = read('landing/auth-check.html');

  const checks = [];
  checks.push({ name: 'drop_open_service_all_policies', pass: has('DROP POLICY IF EXISTS\\s+"service all"\\s+ON\\s+acc_tasks', m007) });
  checks.push({ name: 'owner_policy_email_credentials', pass: has('owner reads own email credentials', m007) });
  checks.push({ name: 'owner_policy_resumes', pass: has('owner reads own resume', m007) });
  checks.push({ name: 'public_config_endpoint_exists', pass: has('app\\.get\\("/api/config/public"', server) });
  checks.push({ name: 'login_uses_config_public', pass: has("fetch\\('/api/config/public'\\)", login) });
  checks.push({ name: 'auth_check_uses_config_public', pass: has("fetch\\('/api/config/public'\\)", authCheck) });
  checks.push({ name: 'login_no_hardcoded_publishable', pass: !has('sb_publishable_', login) });
  checks.push({ name: 'auth_check_no_hardcoded_publishable', pass: !has('sb_publishable_', authCheck) });

  const failed = checks.filter((c) => !c.pass);
  const report = {
    ts: new Date().toISOString(),
    checks,
    verdict: failed.length ? 'fail' : 'pass',
  };
  console.log(JSON.stringify(report, null, 2));
  if (failed.length) process.exit(1);
}

run();
