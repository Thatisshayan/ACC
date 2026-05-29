// scripts/setup-waitlist.js
// Run once: node scripts/setup-waitlist.js
// Creates the acc_waitlist table in Supabase using the Management API.
// Requires SUPABASE_PERSONAL_TOKEN env var (get from https://app.supabase.com/account/tokens)

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const https = require('https');

const PROJECT_REF = 'xacfnatsovuxqttnzdaw';
const TOKEN = process.env.SUPABASE_PERSONAL_TOKEN;

if (!TOKEN) {
  console.error('\n[setup-waitlist] Missing SUPABASE_PERSONAL_TOKEN');
  console.error('Get one at: https://app.supabase.com/account/tokens');
  console.error('Then run:  SUPABASE_PERSONAL_TOKEN=your_token node scripts/setup-waitlist.js\n');
  process.exit(1);
}

const SQL = `
CREATE TABLE IF NOT EXISTS acc_waitlist (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email      text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE acc_waitlist ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'acc_waitlist' AND policyname = 'service insert'
  ) THEN
    CREATE POLICY "service insert" ON acc_waitlist FOR INSERT WITH CHECK (true);
  END IF;
END $$;
`.trim();

const body = JSON.stringify({ query: SQL });

const opts = {
  hostname: 'api.supabase.com',
  path: `/v1/projects/${PROJECT_REF}/database/query`,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Authorization': `Bearer ${TOKEN}`,
  },
};

console.log('[setup-waitlist] Creating acc_waitlist table…');

const req = https.request(opts, res => {
  let data = '';
  res.on('data', c => (data += c));
  res.on('end', () => {
    if (res.statusCode === 200 || res.statusCode === 201) {
      console.log('[setup-waitlist] ✓ Table created (or already exists)');
    } else {
      console.error(`[setup-waitlist] ✗ HTTP ${res.statusCode}:`, data);
      process.exit(1);
    }
  });
});
req.on('error', e => { console.error('[setup-waitlist] ✗', e.message); process.exit(1); });
req.write(body);
req.end();
