'use strict';

const fs = require('fs');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function has(content, pattern) {
  return pattern.test(content);
}

function run() {
  const app = read('ui/src/App.jsx');
  const api = read('ui/src/api.js');
  const sock = read('ui/src/hooks/useSocket.js');
  const onboarding = read('ui/src/pages/Onboarding.jsx');
  const login = read('landing/login.html');
  const authCheck = read('landing/auth-check.html');

  const checks = [
    ['onboarding_nav', has(app, /id:\s*'onboarding'/)],
    ['onboarding_route', has(app, /onboarding:\s*\(\)\s*=>\s*<OnboardingPage\s*\/>/)],
    ['onboarding_progress_store', has(onboarding, /acc_onboarding_progress_v1/)],
    ['admin_token_session_storage', has(login, /sessionStorage\.setItem\('acc_admin_token'/)],
    ['admin_role_session_storage', has(login, /sessionStorage\.setItem\('acc_admin_role'/)],
    ['admin_auth_bypass_guard', has(authCheck, /adminToken/) && has(authCheck, /loadApp\(\); return;/)],
    ['bearer_header_in_api', has(api, /Authorization\s*=\s*`Bearer/)],
    ['admin_role_header_in_api', has(api, /x-acc-admin-role/)],
    ['redirect_on_401', has(api, /status === 401/) && has(api, /window\.location\.href = '\/login'/)],
    ['ws_reconnect_backoff', has(sock, /Exponential backoff/) && has(sock, /Math\.pow\(2, attempts\)/)],
    ['ws_connection_indicator', has(app, /wsConnected/)],
    ['polling_fallback', has(app, /setInterval\(fetchAll,\s*8000\)/)],
  ];

  const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
  const report = {
    ts: new Date().toISOString(),
    checks: checks.map(([name, ok]) => ({ name, status: ok ? 'pass' : 'fail' })),
    passed: checks.length - failed.length,
    total: checks.length,
    verdict: failed.length ? 'fail' : 'pass',
    failed,
  };
  console.log(JSON.stringify(report, null, 2));
  if (failed.length) process.exit(1);
}

run();
