#!/usr/bin/env node
const http = require('http');

function request(method, path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 4000,
      path: path,
      method: method,
      headers: { 'Content-Type': 'application/json' },
      timeout: 8000
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout'));
    });

    req.end();
  });
}

(async () => {
  console.log('🔍 Testing ACC v2 Server Health...\n');
  
  try {
    console.log('1️⃣  Testing API /api/health...');
    const health = await request('GET', '/api/health');
    console.log(`   Status: ${health.status}`);
    console.log(`   Response: ${JSON.stringify(health.data)}\n`);

    console.log('2️⃣  Testing Outreach CRM /api/taskbus/workflow/outreach-crm/health...');
    const crm = await request('POST', '/api/taskbus/workflow/outreach-crm/health');
    console.log(`   Status: ${crm.status}`);
    console.log(`   Response: ${JSON.stringify(crm.data)}\n`);

    console.log('✅ SERVER IS ALIVE AND RESPONSIVE!\n');
    console.log('Summary:');
    console.log('  ✅ API Health Check:', health.status === 200 ? 'PASS' : 'FAIL');
    console.log('  ✅ Outreach CRM Module:', crm.status === 200 ? 'PASS' : 'FAIL');
  } catch (e) {
    console.log(`❌ Error: ${e.message}`);
    process.exit(1);
  }

  process.exit(0);
})();
