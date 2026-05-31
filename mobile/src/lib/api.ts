import { getApiBaseUrl } from './config';

type Json = Record<string, any>;

async function request(path: string, init: RequestInit = {}) {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
    ...init,
  });

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const message = typeof data === 'string' ? data : data?.error || `Request failed (${res.status})`;
    throw new Error(message);
  }

  return data;
}

export function apiBaseUrl() {
  return getApiBaseUrl();
}

export function getStatusSummary() {
  return request('/api/status/summary');
}

export function getAssistantStatus() {
  return request('/api/assistant/status');
}

export function parseAssistantPrompt(payload: Json) {
  return request('/api/assistant/parse', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function executeAssistantPrompt(payload: Json) {
  return request('/api/assistant/execute', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function voiceTranscribe(formData: FormData) {
  return fetch(`${getApiBaseUrl()}/api/assistant/transcribe`, {
    method: 'POST',
    body: formData,
  }).then(async (res) => {
    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!res.ok) {
      throw new Error(typeof data === 'string' ? data : data?.error || 'Voice request failed');
    }
    return data;
  });
}

export function listMessengerUsers() {
  return request('/api/messages/users');
}

export function getMessengerInbox(userId: string) {
  const q = encodeURIComponent(userId);
  return request(`/api/messages/inbox?userId=${q}`);
}

export function getMessengerThread(threadId: string, userId: string) {
  const q = encodeURIComponent(userId);
  return request(`/api/messages/threads/${encodeURIComponent(threadId)}?userId=${q}`);
}

export function sendMessengerMessage(payload: Json) {
  return request('/api/messages/send', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function createMessengerThread(payload: Json) {
  return request('/api/messages/threads', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getTaskbusTasks() {
  return request('/api/taskbus/tasks');
}

export function getTaskbusApprovals() {
  return request('/api/taskbus/approvals');
}

export function getTaskbusResults(limit = 8) {
  return request(`/api/taskbus/results?limit=${encodeURIComponent(String(limit))}`);
}

export function getTaskbusWorkflows() {
  return request('/api/taskbus/workflows');
}

export function runWorkflow(payload: Json) {
  return request('/api/taskbus/workflow/run', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getAlphonsoBridgeStatus() {
  return request('/api/alphonso-bridge/status');
}

export function getAlphonsoBridgePackets(limit = 8) {
  return request(`/api/alphonso-bridge/packets?limit=${encodeURIComponent(String(limit))}`);
}

export function getSocialclawStatus() {
  return request('/api/taskbus/socialclaw/status');
}

export function getSocialclawAccounts() {
  return request('/api/taskbus/socialclaw/accounts');
}

export function getSocialclawUsage() {
  return request('/api/taskbus/socialclaw/usage');
}

export function previewSocialclawCampaign(payload: Json) {
  return request('/api/taskbus/socialclaw/preview', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function validateSocialclawCampaign(payload: Json) {
  return request('/api/taskbus/socialclaw/validate', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function publishSocialclawCampaign(payload: Json) {
  return request('/api/taskbus/socialclaw/publish', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function deleteSocialclawPost(payload: Json) {
  return request('/api/taskbus/socialclaw/delete', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function registerWithHub(payload: Json) {
  return request('/api/hub/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function approveAdminApproval(id: string) {
  return request(`/api/admin/approvals/${encodeURIComponent(id)}/approve`, {
    method: 'POST',
    body: JSON.stringify({ resolvedBy: 'owner' }),
  });
}

export function rejectAdminApproval(id: string) {
  return request(`/api/admin/approvals/${encodeURIComponent(id)}/reject`, {
    method: 'POST',
    body: JSON.stringify({ resolvedBy: 'owner' }),
  });
}
