'use strict';

const fs = require('fs');
const path = require('path');

const REQUIRED_TABLES = [
  'acc_users',
  'acc_roles',
  'acc_sessions',
  'acc_tasks',
  'acc_results',
  'acc_approvals',
  'acc_audit_log',
  'acc_connected_accounts',
  'acc_agent_memory',
  'acc_subscriptions',
  'acc_waitlist',
  'acc_outreach_leads',
  'acc_rate_limits',
  'acc_feature_usage',
  'acc_media_assets',
  'acc_job_applications',
  'acc_suppression_list',
];

function run() {
  const dir = path.join(process.cwd(), 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const contents = files.map((f) => fs.readFileSync(path.join(dir, f), 'utf8'));
  const missing = REQUIRED_TABLES.filter((table) => {
    const pattern = new RegExp(`CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+${table}\\b`, 'i');
    return !contents.some((sql) => pattern.test(sql));
  });

  const report = {
    ts: new Date().toISOString(),
    migrationFiles: files.length,
    requiredTables: REQUIRED_TABLES.length,
    missing,
    verdict: missing.length === 0 ? 'pass' : 'fail',
  };
  console.log(JSON.stringify(report, null, 2));
  if (missing.length) process.exit(1);
}

run();
