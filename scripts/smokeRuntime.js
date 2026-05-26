'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env'), override: false });

const http = require('http');
const https = require('https');

const BASE_URL = process.env.ACC_BASE_URL || 'http://127.0.0.1:4000';
const BRIDGE_TOKEN = String(process.env.ALPHONSO_BRIDGE_TOKEN || process.env.ACC_ALPHONSO_BRIDGE_TOKEN || '').trim();
const SOCIALCLAW_API_KEY = String(process.env.SOCIALCLAW_API_KEY || '').trim();

function parseUrl(raw) {
  return new URL(raw);
}

function request(method, pathname, body, extraHeaders) {
  const url = parseUrl(BASE_URL);
  const isHttps = url.protocol === 'https:';
  const transport = isHttps ? https : http;
  const payload = body ? JSON.stringify(body) : '';
  const headers = Object.assign({
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  }, extraHeaders || {});

  const options = {
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: pathname,
    method,
    headers,
  };

  return new Promise((resolve, reject) => {
    const req = transport.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = data ? JSON.parse(data) : null;
        } catch (err) {
          json = null;
        }
        resolve({ statusCode: res.statusCode, body: data, json });
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error(`timeout ${method} ${pathname}`)));
    if (payload) req.write(payload);
    req.end();
  });
}

function ok(label, details) {
  console.log(`[smoke] ${label}: OK${details ? ` - ${details}` : ''}`);
}

function fail(label, details) {
  throw new Error(`[smoke] ${label}: ${details}`);
}

async function main() {
  console.log(`[smoke] Base URL: ${BASE_URL}`);

  const health = await request('GET', '/api/health');
  if (!health.json || health.json.ok !== true) fail('backend health', `unexpected response ${health.body.slice(0, 160)}`);
  ok('backend health', health.json.service || 'ok');

  const summary = await request('GET', '/api/status/summary');
  if (!summary.json || summary.json.success !== true) fail('status summary', `unexpected response ${summary.body.slice(0, 160)}`);
  ok('status summary', `overall=${summary.json.overall || 'unknown'}`);

  const dashboard = await request('GET', '/api/ui/dashboard');
  if (!dashboard.json || dashboard.json.success !== true) fail('ui dashboard', `unexpected response ${dashboard.body.slice(0, 160)}`);
  ok('ui dashboard', `snapshots=${dashboard.json.totalSnapshots || 0}`);

  const approvals = await request('GET', '/api/ui/approvals');
  if (!approvals.json || approvals.json.success !== true) fail('ui approvals', `unexpected response ${approvals.body.slice(0, 160)}`);
  ok('ui approvals', `pending=${(approvals.json.approvals || []).length}`);

  const workflows = await request('GET', '/api/taskbus/workflows');
  if (!workflows.json || workflows.json.success !== true) fail('taskbus workflows', `unexpected response ${workflows.body.slice(0, 160)}`);
  ok('taskbus workflows', `count=${workflows.json.total || (workflows.json.workflows || []).length || 0}`);
  const hasSocialPublishPipeline = Array.isArray(workflows.json.workflows) && workflows.json.workflows.some((workflow) => workflow && workflow.key === 'acc:social_publish_pipeline');
  if (!hasSocialPublishPipeline) fail('taskbus workflows', 'acc:social_publish_pipeline missing from catalog');
  ok('taskbus workflows', 'social publish pipeline present');

  const providers = await request('GET', '/api/taskbus/providers/status');
  if (!providers.json || providers.json.success !== true) fail('taskbus providers', `unexpected response ${providers.body.slice(0, 160)}`);
  ok('taskbus providers', `order=${(providers.json.provider_order || []).join(',')}`);

  const socialclawStatus = await request('GET', '/api/taskbus/socialclaw/status');
  if (!socialclawStatus.json || socialclawStatus.json.success !== true) fail('socialclaw status', `unexpected response ${socialclawStatus.body.slice(0, 160)}`);
  ok('socialclaw status', `state=${socialclawStatus.json.socialclaw && socialclawStatus.json.socialclaw.status || 'unknown'}`);

  const integrations = await request('GET', '/api/taskbus/integrations/status');
  if (!integrations.json || integrations.json.success !== true) fail('integrations status', `unexpected response ${integrations.body.slice(0, 160)}`);
  const socialclawIntegration = integrations.json.integrations && integrations.json.integrations.socialclaw;
  if (!socialclawIntegration) fail('integrations status', 'socialclaw missing from integrations payload');
  ok('integrations status', `socialclaw=${socialclawIntegration.status || 'unknown'}`);

  if (!SOCIALCLAW_API_KEY) {
    console.log('[smoke] socialclaw preview: SKIPPED (no SOCIALCLAW_API_KEY in env)');
  } else {
    const preview = await request('POST', '/api/taskbus/socialclaw/preview', {
      source: 'smoke-runtime',
      title: 'ACC SocialClaw smoke',
      content: 'Smoke test preview from ACC runtime verification.',
      caption: 'Smoke test preview from ACC runtime verification.',
      platform: 'social',
      lane: 'publish',
    });
    if (!preview.json || preview.json.success !== true) {
      fail('socialclaw preview', `unexpected response ${preview.body.slice(0, 220)}`);
    }
    ok('socialclaw preview', `status=${preview.json.status || preview.json.result?.status || 'unknown'}`);
  }

  const bridgeStatus = await request('GET', '/api/alphonso-bridge/status');
  if (!bridgeStatus.json || bridgeStatus.json.success !== true) fail('bridge status', `unexpected response ${bridgeStatus.body.slice(0, 160)}`);
  ok('bridge status', `state=${bridgeStatus.json.bridge && bridgeStatus.json.bridge.status || 'unknown'}`);

  const messengerStatus = await request('GET', '/api/messages/status');
  if (!messengerStatus.json || messengerStatus.json.success !== true) fail('messenger status', `unexpected response ${messengerStatus.body.slice(0, 160)}`);
  ok('messenger status', `state=${messengerStatus.json.messenger && messengerStatus.json.messenger.status || 'unknown'}`);

  const senderId = `smoke_user_${Date.now()}_a`;
  const recipientId = `smoke_user_${Date.now()}_b`;
  const senderUser = await request('POST', '/api/messages/users', { userId: senderId, name: 'Smoke Sender', role: 'member' });
  if (!senderUser.json || senderUser.json.success !== true) fail('messenger ensure sender', `unexpected response ${senderUser.body.slice(0, 160)}`);
  ok('messenger ensure sender', senderUser.json.user && senderUser.json.user.id || senderId);

  const recipientUser = await request('POST', '/api/messages/users', { userId: recipientId, name: 'Smoke Recipient', role: 'member' });
  if (!recipientUser.json || recipientUser.json.success !== true) fail('messenger ensure recipient', `unexpected response ${recipientUser.body.slice(0, 160)}`);
  ok('messenger ensure recipient', recipientUser.json.user && recipientUser.json.user.id || recipientId);

  const threadCreate = await request('POST', '/api/messages/threads', {
    senderId,
    recipientId,
    subject: 'Smoke test private thread',
    createdBy: senderId,
    viewerId: senderId,
  });
  if (!threadCreate.json || threadCreate.json.success !== true) fail('messenger thread', `unexpected response ${threadCreate.body.slice(0, 220)}`);
  ok('messenger thread', threadCreate.json.threadId || 'created');

  const threadId = threadCreate.json.threadId || (threadCreate.json.thread && threadCreate.json.thread.id);
  if (!threadId) fail('messenger thread', 'threadId missing from response');

  const sentMessage = await request('POST', '/api/messages/send', {
    senderId,
    recipientId,
    threadId,
    subject: 'Smoke test private thread',
    content: 'Hello from the ACC smoke test.',
    createdBy: senderId,
    viewerId: senderId,
  });
  if (!sentMessage.json || sentMessage.json.success !== true) fail('messenger send', `unexpected response ${sentMessage.body.slice(0, 220)}`);
  ok('messenger send', sentMessage.json.message && sentMessage.json.message.id || 'sent');

  const recipientInbox = await request('GET', '/api/messages/inbox?userId=' + encodeURIComponent(recipientId));
  if (!recipientInbox.json || recipientInbox.json.success !== true) fail('messenger inbox', `unexpected response ${recipientInbox.body.slice(0, 220)}`);
  const inboxThread = Array.isArray(recipientInbox.json.threads) ? recipientInbox.json.threads.find((thread) => thread.id === threadId) : null;
  if (!inboxThread) fail('messenger inbox', 'created thread not present in recipient inbox');
  ok('messenger inbox', `threads=${(recipientInbox.json.threads || []).length}`);

  const threadView = await request('GET', '/api/messages/threads/' + encodeURIComponent(threadId) + '?userId=' + encodeURIComponent(recipientId));
  if (!threadView.json || threadView.json.success !== true) fail('messenger thread view', `unexpected response ${threadView.body.slice(0, 220)}`);
  if (!Array.isArray(threadView.json.messages) || threadView.json.messages.length === 0) fail('messenger thread view', 'thread has no messages');
  ok('messenger thread view', `messages=${threadView.json.messages.length}`);

  const readMark = await request('POST', '/api/messages/read', {
    threadId,
    userId: recipientId,
  });
  if (!readMark.json || readMark.json.success !== true) fail('messenger read', `unexpected response ${readMark.body.slice(0, 220)}`);
  ok('messenger read', `readCount=${readMark.json.readCount || 0}`);

  const assistantParse = await request('POST', '/api/assistant/parse', {
    text: 'show my inbox',
    userId: recipientId,
  });
  if (!assistantParse.json || assistantParse.json.success !== true) fail('assistant parse', `unexpected response ${assistantParse.body.slice(0, 220)}`);
  ok('assistant parse', `intent=${assistantParse.json.parsed && assistantParse.json.parsed.intent || 'unknown'}`);

  const assistantExecute = await request('POST', '/api/assistant/execute', {
    text: 'show my inbox',
    userId: recipientId,
  });
  if (!assistantExecute.json || assistantExecute.json.success !== true) fail('assistant execute', `unexpected response ${assistantExecute.body.slice(0, 220)}`);
  ok('assistant execute', `intent=${assistantExecute.json.intent || 'unknown'}`);

  if (!BRIDGE_TOKEN) {
    console.log('[smoke] bridge post: SKIPPED (no bridge token in env)');
  } else {
    const payload = {
      kind: 'content_job',
      source: 'smoke-runtime',
      request_id: `smoke-${Date.now()}`,
      job_id: `smoke-job-${Date.now()}`,
      payload: {
        job: {
          id: `smoke-job-${Date.now()}`,
          status: 'ready_for_review',
          request: {
            request_id: `smoke-${Date.now()}`,
            idea: 'Smoke test content job',
            business_context: 'ACC runtime verification',
            platform: 'instagram',
            format: 'reel',
            tone: 'confident',
            needs: { publish: false },
          },
          preview: { summary: 'Smoke test preview' },
          draft: { hook: 'Smoke test hook' },
        },
      },
    };
    const bridgePost = await request('POST', '/api/alphonso-bridge', payload, {
      Authorization: `Bearer ${BRIDGE_TOKEN}`,
    });
    if (!bridgePost.json || bridgePost.json.success !== true) {
      fail('bridge post', `unexpected response ${bridgePost.body.slice(0, 220)}`);
    }
    ok('bridge post', `status=${bridgePost.json.status || 'unknown'}`);
  }

  console.log('[smoke] all runtime checks passed');
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
