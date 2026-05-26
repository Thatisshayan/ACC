// ui/src/api.js
import axios from "axios";

const TASKBUS_KEY = import.meta.env.VITE_TASKBUS_API_KEY || '';

const api = axios.create({ baseURL: "/api" });

if (TASKBUS_KEY) {
  api.defaults.headers.common['Authorization'] = `Bearer ${TASKBUS_KEY}`;
}

// ── UI / admin ────────────────────────────────────────────────────────────────
export const getDashboard    = () => api.get("/ui/dashboard").then(r => r.data);
export const listSnapshots   = () => api.get("/ui/snapshots").then(r => r.data);
export const getSnapshot     = (id) => api.get(`/ui/snapshot/${id}`).then(r => r.data);
export const approveSnapshot = (id) => api.post(`/ui/snapshot/${id}/approve`, { approver: "Shayan" }).then(r => r.data);
export const rejectSnapshot  = (id) => api.post(`/ui/snapshot/${id}/reject`,  { approver: "Shayan" }).then(r => r.data);
export const listApprovals   = () => api.get("/ui/approvals").then(r => r.data);
export const listSecrets     = () => api.get("/ui/secrets").then(r => r.data);
export const getAdminSystem  = () => api.get("/admin/system").then(r => r.data);
export const getAuditTrail   = () => api.get("/admin/audit").then(r => r.data);

// ── Task Bus ──────────────────────────────────────────────────────────────────
export const getTaskbusStats        = () => api.get("/taskbus/stats").then(r => r.data);
export const getTaskbusTasks        = (filter = {}) => api.get("/taskbus/tasks", { params: filter }).then(r => r.data);
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
