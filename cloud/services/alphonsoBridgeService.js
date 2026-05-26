'use strict';

const fs = require('fs');
const path = require('path');
const store = require('../taskbus/store.js');
const { log } = require('../utils/logger.js');

const DEFAULT_PATH_PREFIX = '/api/alphonso-bridge';

function getDataDir() {
  return path.resolve(process.env.ALPHONSO_BRIDGE_DATA_DIR || path.join(__dirname, '../../data/alphonso-bridge'));
}

function getPacketFile() {
  return path.join(getDataDir(), 'packets.json');
}

function nowIso() {
  return new Date().toISOString();
}

function nowMs() {
  return Date.now();
}

function ensureDataDir() {
  const dataDir = getDataDir();
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function readPackets() {
  try {
    const packetFile = getPacketFile();
    if (!fs.existsSync(packetFile)) return [];
    const raw = fs.readFileSync(packetFile, 'utf8');
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePackets(rows) {
  ensureDataDir();
  fs.writeFileSync(getPacketFile(), JSON.stringify(rows.slice(0, 250), null, 2), 'utf8');
}

function recordPacket(packet) {
  const row = {
    id: packet.id || `alphonso_bridge_${nowMs()}_${Math.random().toString(16).slice(2, 8)}`,
    kind: String(packet.kind || 'unknown').trim() || 'unknown',
    source: String(packet.source || 'alphonso-content-catalyst').trim(),
    status: packet.status || 'received',
    requestId: packet.requestId || packet.request_id || null,
    jobId: packet.jobId || packet.job_id || null,
    taskId: packet.taskId || packet.task_id || null,
    payload: packet.payload || null,
    summary: packet.summary || null,
    error: packet.error || null,
    createdAt: packet.createdAt || nowIso(),
    createdAtMs: packet.createdAtMs || nowMs(),
    updatedAt: nowIso(),
    updatedAtMs: nowMs()
  };

  const rows = readPackets();
  const nextRows = [row, ...rows.filter((item) => item.id !== row.id)];
  writePackets(nextRows);
  return row;
}

function getBridgeToken() {
  return String(process.env.ALPHONSO_BRIDGE_TOKEN || process.env.ACC_ALPHONSO_BRIDGE_TOKEN || '').trim();
}

function getBridgePathPrefix() {
  const raw = String(process.env.ALPHONSO_BRIDGE_PATH_PREFIX || DEFAULT_PATH_PREFIX).trim();
  return raw.startsWith('/') ? raw : `/${raw}`;
}

function getBridgeStatus() {
  const packets = readPackets();
  const token = getBridgeToken();
  const lastPacket = packets[0] || null;

  return {
    configured: Boolean(token),
    enabled: Boolean(token),
    status: token ? 'configured' : 'setup_required',
    tokenConfigured: Boolean(token),
    pathPrefix: getBridgePathPrefix(),
    packetCount: packets.length,
    lastPacketAtMs: lastPacket?.updatedAtMs || lastPacket?.createdAtMs || null,
    lastPacketKind: lastPacket?.kind || null,
    lastError: lastPacket?.error || null
  };
}

function authorizeBridgeRequest(headers = {}) {
  const token = getBridgeToken();
  if (!token) {
    return {
      ok: false,
      statusCode: 503,
      code: 'setup_required',
      error: 'ALPHONSO_BRIDGE_TOKEN is not configured.',
      retryAfterMs: 60000
    };
  }

  const authHeader = String(headers.authorization || headers.Authorization || '').trim();
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!bearer || bearer !== token) {
    return {
      ok: false,
      statusCode: 401,
      code: 'unauthorized',
      error: 'Invalid bridge token.',
      retryAfterMs: 120000
    };
  }

  return { ok: true };
}

function validatePacketShape(packet = {}) {
  const kind = String(packet.kind || '').trim();
  if (!kind) {
    return {
      ok: false,
      statusCode: 400,
      code: 'validation_failed',
      error: 'Packet kind is required.',
      retryAfterMs: 30000,
      details: { field: 'kind' }
    };
  }

  if (kind === 'content_job') {
    const payload = packet.payload || {};
    const job = payload.job || payload.jobSnapshot || payload.job_snapshot || payload;
    const request = job && job.request ? job.request : {};
    const hasContent = Boolean(job && (job.id || job.status || job.preview || job.draft));
    const hasRequest = Boolean(request && (request.idea || request.request_id || request.role));
    if (!hasContent && !hasRequest) {
      return {
        ok: false,
        statusCode: 400,
        code: 'validation_failed',
        error: 'content_job packet missing job/request payload.',
        retryAfterMs: 30000,
        details: {
          expected: ['payload.job', 'payload.request'],
          receivedKeys: Object.keys(payload || {})
        }
      };
    }
  }

  return { ok: true };
}

function listPackets(limit = 20) {
  const rows = readPackets();
  return rows.slice(0, Math.max(0, Number(limit) || 20));
}

function findTaskByBridgeRefs(requestId, jobId) {
  return store.getTasks().find((task) => {
    if (requestId && task.request_id === requestId) return true;
    if (jobId && task.meta && task.meta.alphonso_job_id === jobId) return true;
    if (jobId && task.meta && task.meta.bridge_job_id === jobId) return true;
    return false;
  }) || null;
}

function mapContentTaskStatus(jobStatus, publishRequested) {
  const status = String(jobStatus || '').trim().toLowerCase();
  if (status === 'failed') return 'failed';
  if (status === 'published') return 'done';
  if (status === 'approved_for_publish') return 'approved_pending_route';
  if (status === 'ready_for_review') return publishRequested ? 'waiting_approval' : 'done';
  return 'in_progress';
}

function createOrUpdateApproval(taskId, requestId, jobId) {
  const pending = store.getPendingApprovals().find((approval) => approval.task_id === taskId && approval.action === 'publish');
  if (pending) return pending;
  return store.createApproval(taskId, 'publish', {
    request_id: requestId,
    meta: {
      alphonso_job_id: jobId,
      bridge_source: 'alphonso-content-catalyst'
    }
  });
}

function upsertContentTask(packet) {
  const job = packet.payload?.job || packet.payload?.jobSnapshot || packet.payload?.job_snapshot || packet.payload || {};
  const request = job.request || {};
  const requestId = String(packet.requestId || packet.request_id || request.request_id || job.request_id || '').trim() || null;
  const jobId = String(packet.jobId || packet.job_id || job.id || '').trim() || null;
  const publishRequested = Boolean(request.needs?.publish);
  const status = mapContentTaskStatus(job.status, publishRequested);
  const title = `Content Catalyst: ${request.idea || job.draft?.hook || jobId || 'incoming job'}`;
  const existing = findTaskByBridgeRefs(requestId, jobId);
  const payload = {
    title,
    instruction: job.preview?.summary || job.draft?.preview_summary || request.business_context || 'Review Alphonso content catalyst job.',
    assigned_agent: 'human',
    status,
    priority: job.status === 'failed' ? 'high' : 'normal',
    required_output: 'Review Alphonso content status and track publish approval.',
    approval_required: publishRequested,
    automation_mode: 'manual',
    feature_ref: 'Alphonso Content Catalyst Bridge',
    created_by: 'alphonso',
    request_id: requestId,
    meta: {
      bridge_source: packet.source || 'alphonso-content-catalyst',
      bridge_kind: packet.kind || 'content_job',
      bridge_packet_id: packet.id || null,
      alphonso_job_id: jobId,
      eventType: packet.payload?.eventType || 'update'
    }
  };

  const task = existing
    ? store.updateTask(existing.id, payload)
    : store.createTask(payload);

  if (job.status === 'ready_for_review' && publishRequested) {
    createOrUpdateApproval(task.id, requestId, jobId);
  }

  if (job.status === 'published' || job.status === 'failed') {
    store.addResult({
      task_id: task.id,
      agent: 'alphonso',
      provider_used: 'alphonso_bridge',
      cost_tier: 'manual',
      is_real_ai_result: false,
      summary: job.status === 'published'
        ? 'Alphonso content job completed and published.'
        : 'Alphonso content job failed.',
      output: JSON.stringify({
        jobId,
        requestId,
        status: job.status,
        preview: job.preview || null,
        publish: job.publish || null,
        error: job.error || null
      }),
      request_id: requestId,
      provider_chain_attempted: ['alphonso_bridge'],
      fallback_reason: 'Bridge synchronization packet',
      execution_mode: 'bridge_sync',
      auto_update_task: true,
      failure_class: job.status === 'failed' ? 'bridge_failed' : null
    });
  }

  return {
    task,
    requestId,
    jobId,
    status,
    publishRequested
  };
}

function summarizePacket(packet) {
  return {
    id: packet.id || null,
    kind: packet.kind || 'unknown',
    source: packet.source || 'alphonso-content-catalyst',
    requestId: packet.requestId || packet.request_id || null,
    jobId: packet.jobId || packet.job_id || null,
    taskId: packet.taskId || packet.task_id || null,
    status: packet.status || 'received'
  };
}

async function handleAlphonsoBridgePacket(packet = {}, context = {}) {
  const auth = authorizeBridgeRequest(context.headers || {});
  if (!auth.ok) {
    return {
      success: false,
      status: auth.code,
      httpStatus: auth.statusCode,
      error: auth.error,
      retryAfterMs: auth.retryAfterMs || null,
      bridge: getBridgeStatus()
    };
  }

  const validation = validatePacketShape(packet);
  if (!validation.ok) {
    return {
      success: false,
      status: validation.code,
      httpStatus: validation.statusCode,
      error: validation.error,
      retryAfterMs: validation.retryAfterMs || null,
      details: validation.details || null,
      bridge: getBridgeStatus()
    };
  }

  const normalized = {
    id: packet.id || `alphonso_bridge_${nowMs()}_${Math.random().toString(16).slice(2, 8)}`,
    kind: String(packet.kind || '').trim() || 'unknown',
    source: String(packet.source || 'alphonso-content-catalyst').trim(),
    status: String(packet.status || 'received').trim(),
    requestId: packet.requestId || packet.request_id || null,
    jobId: packet.jobId || packet.job_id || null,
    taskId: packet.taskId || packet.task_id || null,
    payload: packet.payload || null,
    summary: packet.summary || null,
    error: packet.error || null,
    createdAt: packet.createdAt || nowIso(),
    createdAtMs: packet.createdAtMs || nowMs()
  };

  const recorded = recordPacket(normalized);
  log('[alphonsoBridge] Received packet:', recorded.kind, recorded.requestId || recorded.jobId || recorded.id);

  if (recorded.kind === 'content_job') {
    const bridgeResult = upsertContentTask(recorded);
    const task = bridgeResult.task;
    return {
      success: true,
      status: 'recorded',
      httpStatus: 200,
      kind: recorded.kind,
      packet: summarizePacket(recorded),
      task_id: task.id,
      task_status: task.status,
      request_id: bridgeResult.requestId,
      job_id: bridgeResult.jobId,
      bridge: getBridgeStatus(),
      ack: {
        message: 'Content catalyst job synchronized.',
        next_step: bridgeResult.publishRequested ? 'approval' : 'monitor'
      }
    };
  }

  if (recorded.kind === 'task') {
    const task = store.createTask({
      title: recorded.payload?.title || 'Alphonso bridge task',
      instruction: recorded.payload?.instruction || recorded.payload?.summary || 'Review bridge packet.',
      assigned_agent: recorded.payload?.assigned_agent || 'human',
      status: recorded.payload?.status || 'pending',
      priority: recorded.payload?.priority || 'normal',
      required_output: recorded.payload?.required_output || 'Review bridge packet.',
      approval_required: recorded.payload?.approval_required !== false,
      automation_mode: recorded.payload?.automation_mode || 'manual',
      feature_ref: recorded.payload?.feature_ref || 'Alphonso Bridge',
      created_by: recorded.payload?.created_by || 'alphonso',
      request_id: recorded.requestId || null,
      meta: {
        bridge_packet_id: recorded.id,
        bridge_kind: recorded.kind,
        bridge_source: recorded.source
      }
    });
    return {
      success: true,
      status: 'recorded',
      httpStatus: 200,
      kind: recorded.kind,
      packet: summarizePacket(recorded),
      task_id: task.id,
      task_status: task.status,
      bridge: getBridgeStatus(),
      ack: { message: 'Task recorded from Alphonso.' }
    };
  }

  if (recorded.kind === 'result') {
    const taskId = recorded.taskId || recorded.payload?.taskId || recorded.payload?.task_id || null;
    let result = null;
    if (taskId && store.getTask(taskId)) {
      result = store.addResult({
        task_id: taskId,
        agent: recorded.payload?.agent || 'alphonso',
        provider_used: recorded.payload?.provider_used || 'alphonso_bridge',
        cost_tier: recorded.payload?.cost_tier || 'manual',
        is_real_ai_result: Boolean(recorded.payload?.is_real_ai_result),
        summary: recorded.payload?.summary || 'Bridge result received.',
        output: recorded.payload?.output || JSON.stringify(recorded.payload || {}, null, 2),
        files_changed: recorded.payload?.files_changed || [],
        risks: recorded.payload?.risks || [],
        next_request: recorded.payload?.next_request || '',
        request_id: recorded.requestId || null,
        provider_chain_attempted: recorded.payload?.provider_chain_attempted || ['alphonso_bridge'],
        fallback_reason: recorded.payload?.fallback_reason || null,
        execution_mode: recorded.payload?.execution_mode || 'bridge_sync',
        auto_update_task: true,
        failure_class: recorded.payload?.failure_class || null
      });
    }
    return {
      success: true,
      status: 'recorded',
      httpStatus: 200,
      kind: recorded.kind,
      packet: summarizePacket(recorded),
      result_id: result?.id || null,
      bridge: getBridgeStatus(),
      ack: { message: 'Result recorded from Alphonso.' }
    };
  }

  if (recorded.kind === 'approval') {
    const taskId = recorded.taskId || recorded.payload?.taskId || recorded.payload?.task_id || null;
    if (taskId && recorded.payload?.decision) {
      const approval = store.resolveApproval(
        recorded.payload.approvalId || recorded.payload.approval_id || recorded.payload.id || recorded.id,
        recorded.payload.decision,
        recorded.payload.approver || 'Shayan',
        recorded.payload.notes || ''
      );
      return {
        success: true,
        status: 'recorded',
        httpStatus: 200,
        kind: recorded.kind,
        packet: summarizePacket(recorded),
        approval: approval || null,
        bridge: getBridgeStatus(),
        ack: { message: 'Approval state synchronized.' }
      };
    }

    if (taskId && recorded.payload?.required) {
      const approval = createOrUpdateApproval(taskId, recorded.requestId, recorded.jobId);
      return {
        success: true,
        status: 'recorded',
        httpStatus: 200,
        kind: recorded.kind,
        packet: summarizePacket(recorded),
        approval: approval || null,
        bridge: getBridgeStatus(),
        ack: { message: 'Approval request recorded.' }
      };
    }
  }

  if (recorded.kind === 'memory') {
    return {
      success: true,
      status: 'recorded',
      httpStatus: 200,
      kind: recorded.kind,
      packet: summarizePacket(recorded),
      bridge: getBridgeStatus(),
      ack: { message: 'Project memory packet recorded.' }
    };
  }

  return {
    success: true,
    status: 'recorded',
    httpStatus: 200,
    kind: recorded.kind,
    packet: summarizePacket(recorded),
    bridge: getBridgeStatus(),
    ack: { message: 'Bridge packet recorded.' }
  };
}

module.exports = {
  authorizeBridgeRequest,
  getBridgePathPrefix,
  getBridgeStatus,
  getDataDir,
  handleAlphonsoBridgePacket,
  listPackets,
  readPackets,
  recordPacket,
  summarizePacket
};
