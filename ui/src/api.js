// ui/src/api.js
import axios from "axios";

const TASKBUS_KEY = import.meta.env.VITE_TASKBUS_API_KEY || '';

function trimUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function resolveApiBase() {
  const explicit = trimUrl(import.meta.env.VITE_ACC_API_BASE_URL);
  if (explicit) return explicit;

  if (typeof window !== 'undefined' && window.location?.protocol === 'file:') {
    return 'http://127.0.0.1:4000';
  }

  return '';
}

const API_BASE = resolveApiBase();
const api = axios.create({ baseURL: API_BASE ? `${API_BASE}/api` : '/api' });

function getAdminToken() {
  if (typeof window !== 'undefined') {
    const sessionToken = String(window.sessionStorage?.getItem('acc_admin_token') || '').trim();
    if (sessionToken) return sessionToken;
    const local = String(window.localStorage?.getItem('acc_admin_token') || '').trim();
    if (local) return local;
  }
  return TASKBUS_KEY;
}

function getAdminRole() {
  if (typeof window !== 'undefined') {
    const role = String(window.sessionStorage?.getItem('acc_admin_role') || window.localStorage?.getItem('acc_admin_role') || '').trim();
    if (role) return role;
  }
  return '';
}

api.interceptors.request.use((config) => {
  const token = getAdminToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
    const role = getAdminRole();
    if (role) config.headers['x-acc-admin-role'] = role;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    if (status === 401 && typeof window !== 'undefined' && window.location?.pathname !== '/login') {
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

function buildApprovalFreshness() {
  const ts = Date.now();
  const nonce = `ui-${ts}-${Math.random().toString(16).slice(2, 10)}`;
  return {
    headers: {
      'x-approval-timestamp': String(ts),
      'x-approval-nonce': nonce,
    },
    body: {
      timestamp: ts,
      nonce,
    },
  };
}

// ── UI / admin ────────────────────────────────────────────────────────────────
export const getDashboard    = () => api.get("/ui/dashboard").then(r => r.data);
export const listSnapshots   = () => api.get("/ui/snapshots").then(r => r.data);
export const getSnapshot     = (id) => api.get(`/ui/snapshot/${id}`).then(r => r.data);
export const approveSnapshot = (id) => {
  const freshness = buildApprovalFreshness();
  return api.post(`/ui/snapshot/${id}/approve`, freshness.body, { headers: freshness.headers }).then(r => r.data);
};
export const rejectSnapshot  = (id) => {
  const freshness = buildApprovalFreshness();
  return api.post(`/ui/snapshot/${id}/reject`, freshness.body, { headers: freshness.headers }).then(r => r.data);
};
export const listApprovals   = () => api.get("/ui/approvals").then(r => r.data);
export const listSecrets     = () => api.get("/ui/secrets").then(r => r.data);
export const getAdminSystem     = () => api.get("/admin/system").then(r => r.data);
export const getAuditTrail      = () => api.get("/admin/audit").then(r => r.data);
export const getAdminUsers      = () => api.get("/admin/users").then(r => r.data);
export const getAdminLogs       = (limit = 200) => api.get("/admin/logs", { params: { limit } }).then(r => r.data);
export const getAdminConnectors = () => api.get("/admin/connectors").then(r => r.data);
export const getAdminTasks      = () => api.get("/admin/tasks").then(r => r.data);
export const getStatusSummary = () => api.get("/status/summary").then(r => r.data);

// ── Task Bus ──────────────────────────────────────────────────────────────────
export const getTaskbusStats        = () => api.get("/taskbus/stats").then(r => r.data);
export const getTaskbusTasks        = (filter = {}) => api.get("/taskbus/tasks", { params: filter }).then(r => r.data);
export const getTaskbusApprovals    = () => api.get("/taskbus/approvals").then(r => r.data);
export const getTaskbusResults      = (limit = 12) => api.get("/taskbus/results", { params: { limit } }).then(r => r.data);
export const getTaskbusIntegrations = () => api.get("/taskbus/integrations/status").then(r => r.data);
export const listAgents             = () => api.get("/taskbus/agents").then(r => r.data);
export const createTask             = (payload = {}) => api.post("/taskbus/task", payload).then(r => r.data);
export const getSocialclawStatus    = () => api.get("/taskbus/socialclaw/status").then(r => r.data);
export const getSocialclawAccounts   = () => api.get("/taskbus/socialclaw/accounts").then(r => r.data);
export const getSocialclawUsage      = () => api.get("/taskbus/socialclaw/usage").then(r => r.data);
export const previewSocialclawCampaign = (payload = {}) =>
  api.post("/taskbus/socialclaw/preview", payload).then(r => r.data);
export const validateSocialclawCampaign = (payload = {}) =>
  api.post("/taskbus/socialclaw/validate", payload).then(r => r.data);
export const publishSocialclawCampaign = (payload = {}) =>
  api.post("/taskbus/socialclaw/publish", payload).then(r => r.data);
export const deleteSocialclawPost = (payload = {}) =>
  api.post("/taskbus/socialclaw/delete", payload).then(r => r.data);

// â”€â”€ Private messenger â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const getMessengerStatus  = () => api.get("/messages/status").then(r => r.data);
export const listMessengerUsers  = () => api.get("/messages/users").then(r => r.data);
export const ensureMessengerUser = (payload = {}) => api.post("/messages/users", payload).then(r => r.data);
export const getMessengerInbox   = (userId) => api.get("/messages/inbox", { params: { userId } }).then(r => r.data);
export const listMessengerThreads = (userId) => api.get("/messages/threads", { params: { userId } }).then(r => r.data);
export const getMessengerThread  = (threadId, userId) =>
  api.get(`/messages/threads/${threadId}`, { params: { userId } }).then(r => r.data);
export const createMessengerThread = (payload = {}) => api.post("/messages/threads", payload).then(r => r.data);
export const sendMessengerMessage = (payload = {}) => api.post("/messages/send", payload).then(r => r.data);
export const markMessengerRead    = (payload = {}) => api.post("/messages/read", payload).then(r => r.data);
export const updateMessengerPresence = (payload = {}) => api.post("/messages/presence", payload).then(r => r.data);

// â”€â”€ Assistant â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const parseAssistantPrompt = (payload = {}) => api.post("/assistant/parse", payload).then(r => r.data);
export const executeAssistantPrompt = (payload = {}) => api.post("/assistant/execute", payload).then(r => r.data);
export const getAssistantStatus   = () => api.get("/assistant/status").then(r => r.data);

export const listWorkflows          = () => api.get("/taskbus/workflows").then(r => r.data);
export const runWorkflow            = (workflowKey, opts = {}) =>
  api.post("/taskbus/workflow/run", { workflow: workflowKey, ...opts }).then(r => r.data);
export const runWorkflowParallel    = (workflowKeys, opts = {}) =>
  api.post("/taskbus/workflow/run/parallel", { workflows: workflowKeys, ...opts }).then(r => r.data);

// ── Alphonso bridge ───────────────────────────────────────────────────────────
export const getAlphonsoBridgeStatus  = () => api.get("/alphonso-bridge/status").then(r => r.data);
export const listAlphonsoBridgePackets = (limit = 8) =>
  api.get("/alphonso-bridge/packets", { params: { limit } }).then(r => r.data);

export default api;
