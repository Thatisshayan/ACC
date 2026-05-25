#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const http = require('http');

const BASE = 'C:\\Users\\Shaya\\agent-command-center';
let auditLog = [];

function log(level, msg, detail = '') {
  const line = `[${level}] ${msg}${detail ? ' — ' + detail : ''}`;
  console.log(line);
  auditLog.push(line);
}

function fileExists(p, label) {
  const exists = fs.existsSync(p);
  const status = exists ? '✅' : '❌';
  log(status, label, exists ? 'EXISTS' : 'MISSING');
  return exists;
}

function readEnv() {
  try {
    const content = fs.readFileSync(path.join(BASE, '.env'), 'utf8');
    const vars = {};
    content.split('\n').forEach(line => {
      const match = line.match(/^([A-Z_]+)=(.*)$/);
      if (match) vars[match[1]] = match[2];
    });
    return vars;
  } catch (e) {
    log('❌', '.env read failed', e.message);
    return {};
  }
}

function checkEnvVar(envVars, key) {
  const val = envVars[key];
  if (!val || val.trim() === '') {
    log('❌', `ENV: ${key}`, 'NOT SET');
    return false;
  }
  log('✅', `ENV: ${key}`, 'SET');
  return true;
}

function checkConnectorFile(name, filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const hasEnabled = content.includes('function enabled') || content.includes('enabled()');
    const hasHealth = content.includes('checkHealth') || content.includes('health');
    const hasChat = content.includes('chat') || content.includes('sendTask');
    
    const status = hasEnabled && hasHealth ? '✅' : '⚠️';
    log(status, `Connector: ${name}`, hasEnabled ? 'HAS enabled()' : 'NO enabled()');
    return hasEnabled;
  } catch (e) {
    log('❌', `Connector: ${name}`, 'FILE MISSING');
    return false;
  }
}

function checkDashboardFiles() {
  const uiPath = path.join(BASE, 'ui', 'src');
  const files = [
    { name: 'App.jsx', path: path.join(uiPath, 'App.jsx') },
    { name: 'Dashboard.jsx', path: path.join(uiPath, 'Dashboard.jsx') },
    { name: 'Approvals.jsx', path: path.join(uiPath, 'Approvals.jsx') },
    { name: 'useApi.js', path: path.join(uiPath, 'hooks', 'useApi.js') }
  ];
  
  files.forEach(f => {
    fileExists(f.path, `UI: ${f.name}`);
  });
}

function checkBotFiles() {
  const botPath = path.join(BASE, 'cloud', 'telegram');
  const files = [
    { name: 'bot.js', path: path.join(botPath, 'bot.js') },
    { name: 'handlers.js', path: path.join(botPath, 'handlers.js') },
    { name: 'buttons.js', path: path.join(botPath, 'buttons.js') }
  ];
  
  files.forEach(f => {
    fileExists(f.path, `Bot: ${f.name}`);
  });
}

async function checkAPI(endpoint, method = 'GET') {
  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: 4000,
      path: endpoint,
      method: method,
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const status = res.statusCode < 400 ? '✅' : '⚠️';
        log(status, `API: ${endpoint}`, `Status ${res.statusCode}`);
        resolve(res.statusCode);
      });
    });

    req.on('error', (e) => {
      log('❌', `API: ${endpoint}`, e.message);
      resolve(0);
    });

    req.on('timeout', () => {
      req.destroy();
      log('❌', `API: ${endpoint}`, 'TIMEOUT');
      resolve(0);
    });

    req.end();
  });
}

function checkBotHandlers() {
  try {
    const handlersPath = path.join(BASE, 'cloud', 'telegram', 'handlers.js');
    const content = fs.readFileSync(handlersPath, 'utf8');
    
    const handlers = [
      { name: 'handleMessage', pattern: /handleMessage|processMessage/ },
      { name: 'handleCallback', pattern: /handleCallback|callbackQuery/ },
      { name: 'sendApprovalRequest', pattern: /sendApprovalRequest|approval/ },
      { name: 'Button handlers', pattern: /handle.*Button|button.*handler/ }
    ];

    handlers.forEach(h => {
      const found = h.pattern.test(content);
      log(found ? '✅' : '❌', `Handler: ${h.name}`, found ? 'IMPLEMENTED' : 'MISSING');
    });
  } catch (e) {
    log('❌', 'handlers.js', e.message);
  }
}

function checkDashboardHandlers() {
  try {
    const appPath = path.join(BASE, 'ui', 'src', 'App.jsx');
    if (!fs.existsSync(appPath)) {
      log('❌', 'Dashboard: App.jsx', 'FILE MISSING');
      return;
    }
    
    const content = fs.readFileSync(appPath, 'utf8');
    
    const features = [
      { name: 'onClick handlers', pattern: /onClick|handleClick/ },
      { name: 'useState', pattern: /useState/ },
      { name: 'useEffect', pattern: /useEffect/ },
      { name: 'API calls', pattern: /fetch|axios|http/ },
      { name: 'Button components', pattern: /<button|<Button/ }
    ];

    features.forEach(f => {
      const found = f.pattern.test(content);
      log(found ? '✅' : '⚠️', `Dashboard: ${f.name}`, found ? 'FOUND' : 'NOT FOUND');
    });
  } catch (e) {
    log('❌', 'Dashboard handlers check', e.message);
  }
}

function checkLogsRecent() {
  try {
    const botLog = path.join(BASE, 'data', 'logs', 'bot.log');
    const serverLog = path.join(BASE, 'data', 'logs', 'server.log');
    
    if (fs.existsSync(botLog)) {
      const botContent = fs.readFileSync(botLog, 'utf8').split('\n').slice(-5).join('\n');
      const recentBot = botContent.includes(new Date().toISOString().slice(0, 10));
      log(recentBot ? '✅' : '⚠️', 'Bot Log', recentBot ? 'RECENT (today)' : 'STALE (old)');
    }
    
    if (fs.existsSync(serverLog)) {
      const serverContent = fs.readFileSync(serverLog, 'utf8').split('\n').slice(-5).join('\n');
      const recentServer = serverContent.includes(new Date().toISOString().slice(0, 10));
      log(recentServer ? '✅' : '⚠️', 'Server Log', recentServer ? 'RECENT (today)' : 'STALE (old)');
    }
  } catch (e) {
    log('❌', 'Logs check', e.message);
  }
}

function checkConnectorStatus(envVars) {
  const connectors = [
    { name: 'Claude', key: 'CLAUDE_API_KEY' },
    { name: 'DeepSeek', key: 'DEEPSEEK_API_KEY' },
    { name: 'OpenAI', key: 'OPENAI_API_KEY' },
    { name: 'Notion', key: 'NOTION_API_KEY' },
    { name: 'ClickUp', key: 'CLICKUP_API_KEY' },
    { name: 'Tavily', key: 'Tavily_API_KEY' },
    { name: 'Hunter', key: 'HUNTER_API_KEY' },
    { name: 'Resend', key: 'RESEND_API_KEY' },
    { name: 'Alibaba', key: 'ALIBABA_API_KEY' },
    { name: 'Supabase', key: 'SUPABASE_URL' }
  ];

  connectors.forEach(c => {
    checkEnvVar(envVars, c.key);
  });
}

async function runAudit() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    ACC v2 COMPLETE SYSTEM AUDIT                              ║');
  console.log('║                           May 23, 2026 - 02:45 UTC                           ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  // ========================================================================
  log('📋', 'SECTION 1: SYSTEM STATE');
  // ========================================================================
  console.log('');

  // ========================================================================
  log('📋', 'SECTION 2: CONFIGURATION');
  // ========================================================================
  const envVars = readEnv();
  log('📄', '.env file loaded', `${Object.keys(envVars).length} variables`);
  console.log('');

  // ========================================================================
  log('📋', 'SECTION 3: API KEYS & CONNECTORS');
  // ========================================================================
  checkConnectorStatus(envVars);
  console.log('');

  // ========================================================================
  log('📋', 'SECTION 4: CORE FILES');
  // ========================================================================
  fileExists(path.join(BASE, 'pm2.config.js'), 'PM2 Config');
  fileExists(path.join(BASE, 'cloud', 'server.js'), 'API Server');
  fileExists(path.join(BASE, 'cloud', 'worker.js'), 'Worker');
  fileExists(path.join(BASE, 'cloud', 'graphRunner.service.js'), 'GraphRunner');
  fileExists(path.join(BASE, 'cloud', 'executor.js'), 'Executor');
  console.log('');

  // ========================================================================
  log('📋', 'SECTION 5: BOT FILES');
  // ========================================================================
  checkBotFiles();
  console.log('');

  // ========================================================================
  log('📋', 'SECTION 6: BOT HANDLERS');
  // ========================================================================
  checkBotHandlers();
  console.log('');

  // ========================================================================
  log('📋', 'SECTION 7: DASHBOARD FILES');
  // ========================================================================
  checkDashboardFiles();
  console.log('');

  // ========================================================================
  log('📋', 'SECTION 8: DASHBOARD HANDLERS');
  // ========================================================================
  checkDashboardHandlers();
  console.log('');

  // ========================================================================
  log('📋', 'SECTION 9: CONNECTORS');
  // ========================================================================
  checkConnectorFile('Notion', path.join(BASE, 'cloud', 'connectors', 'notion.js'));
  checkConnectorFile('Hunter', path.join(BASE, 'cloud', 'integrations', 'hunter.js'));
  checkConnectorFile('Resend', path.join(BASE, 'cloud', 'integrations', 'resend.js'));
  checkConnectorFile('Alibaba', path.join(BASE, 'cloud', 'integrations', 'alibaba.js'));
  console.log('');

  // ========================================================================
  log('📋', 'SECTION 10: API ENDPOINTS');
  // ========================================================================
  await checkAPI('/api/health');
  await checkAPI('/api/ui/dashboard');
  await checkAPI('/api/ui/approvals');
  await checkAPI('/api/ui/audit');
  await checkAPI('/admin/system');
  console.log('');

  // ========================================================================
  log('📋', 'SECTION 11: LOGS');
  // ========================================================================
  checkLogsRecent();
  console.log('');

  // ========================================================================
  log('📋', 'SECTION 12: CRITICAL ISSUES');
  // ========================================================================
  
  const issues = [];
  
  if (!envVars['CLAUDE_API_KEY']) issues.push('CLAUDE_API_KEY missing');
  if (!envVars['DEEPSEEK_API_KEY']) issues.push('DEEPSEEK_API_KEY missing');
  if (!envVars['SUPABASE_URL']) issues.push('SUPABASE_URL missing');
  if (!fs.existsSync(path.join(BASE, 'cloud', 'telegram', 'buttons.js'))) issues.push('Telegram buttons.js missing');
  if (!fs.existsSync(path.join(BASE, 'ui', 'src', 'App.jsx'))) issues.push('Dashboard App.jsx missing');

  if (issues.length === 0) {
    log('✅', 'CRITICAL ISSUES', 'NONE FOUND');
  } else {
    issues.forEach(issue => {
      log('🔴', 'CRITICAL ISSUE', issue);
    });
  }
  console.log('');

  // ========================================================================
  log('📋', 'SECTION 13: RECOMMENDATIONS');
  // ========================================================================
  log('🔧', '1. Check Telegram button wiring in handlers.js');
  log('🔧', '2. Verify dashboard onClick handlers in App.jsx');
  log('🔧', '3. Test API endpoints manually with curl');
  log('🔧', '4. Check browser console for JavaScript errors');
  log('🔧', '5. Restart services: start-production.bat');
  console.log('');

  // Write to file
  const reportPath = path.join(BASE, 'audit-report.txt');
  fs.writeFileSync(reportPath, auditLog.join('\n'));
  log('📄', 'Audit report saved', reportPath);
  console.log('\n═══════════════════════════════════════════════════════════════════════════════\n');
}

runAudit();
