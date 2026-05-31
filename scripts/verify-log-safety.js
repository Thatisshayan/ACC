'use strict';

const fs = require('fs');
const path = require('path');

const TARGET_FILES = [
  'cloud/api/cardRoutes.js',
  'cloud/api/phoneRoutes.js',
  'cloud/api/billingRoutes.js',
  'cloud/server.js',
  'cloud/telegram/bot.js',
];

const FORBIDDEN_PATTERNS = [
  /card token:/i,
  /Token:\s*['"`+]/i,
  /access_token[^a-z0-9]/i,
  /refresh_token[^a-z0-9]/i,
  /Authorization:\s*Bearer/i,
];

function run() {
  const violations = [];
  for (const rel of TARGET_FILES) {
    const full = path.join(process.cwd(), rel);
    if (!fs.existsSync(full)) continue;
    const content = fs.readFileSync(full, 'utf8');
    for (const p of FORBIDDEN_PATTERNS) {
      if (p.test(content)) {
        violations.push({ file: rel, pattern: String(p) });
      }
    }
  }

  const report = {
    ts: new Date().toISOString(),
    filesChecked: TARGET_FILES.length,
    violations,
    verdict: violations.length === 0 ? 'pass' : 'fail',
  };
  console.log(JSON.stringify(report, null, 2));
  if (violations.length > 0) process.exit(1);
}

run();
