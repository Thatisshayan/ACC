// ui/src/api.js
import axios from "axios";

const api = axios.create({ baseURL: "/api" });

export const getDashboard    = () => api.get("/ui/dashboard").then(r => r.data);
export const listSnapshots   = () => api.get("/ui/snapshots").then(r => r.data);
export const getSnapshot     = (id) => api.get(`/ui/snapshot/${id}`).then(r => r.data);
export const approveSnapshot = (id) => api.post(`/ui/snapshot/${id}/approve`, { approver: "Shayan" }).then(r => r.data);
export const rejectSnapshot  = (id) => api.post(`/ui/snapshot/${id}/reject`,  { approver: "Shayan" }).then(r => r.data);
export const listApprovals   = () => api.get("/ui/approvals").then(r => r.data);
export const listSecrets     = () => api.get("/ui/secrets").then(r => r.data);
export const getAdminSystem  = () => api.get("/admin/system").then(r => r.data);
export const getAuditTrail   = () => api.get("/admin/audit").then(r => r.data);
export const listWorkflows   = () => api.get("/taskbus/workflows").then(r => r.data);
export const runWorkflow     = (workflow, body = {}) => api.post("/taskbus/workflow/run", { workflow, ...body }).then(r => r.data);
export const runWorkflowParallel = (workflows, body = {}) => api.post("/taskbus/workflow/run/parallel", { workflows, ...body }).then(r => r.data);
export const getAlphonsoBridgeStatus = () => api.get("/alphonso-bridge/status").then(r => r.data);
export const listAlphonsoBridgePackets = (limit = 10) => api.get(`/alphonso-bridge/packets?limit=${limit}`).then(r => r.data);

export default api;
