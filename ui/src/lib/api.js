import axios from 'axios';

// Works in both browser (relative) and Electron (absolute)
// When loaded via file:// in Electron, relative URLs fail — use absolute
const BASE = (typeof window !== 'undefined' && window.location.protocol === 'file:')
  ? 'http://localhost:4000'
  : '';

const api = axios.create({ baseURL: BASE + '/api/taskbus', timeout: 15000 });

export const taskbusApi = {
  getStats:     ()          => api.get('/stats'),
  getAgents:    ()          => api.get('/agents'),
  getProviders: ()          => api.get('/providers/status'),
  getTasks:     (params)    => api.get('/tasks', { params }),
  getTask:      (id)        => api.get('/task/' + id),
  createTask:   (data)      => api.post('/task', data),
  getApprovals: ()          => api.get('/approvals'),
  approve:      (id, notes) => api.post('/approval/' + id,
    { decision: 'approved', notes: notes || '' },
    { headers: { 'x-approver': 'Shayan' } }),
  reject:       (id, notes) => api.post('/approval/' + id,
    { decision: 'rejected', notes: notes || '' },
    { headers: { 'x-approver': 'Shayan' } }),
  submitResult: (id, data)  => api.post('/task/' + id + '/result', data),
  routeTask:    (id)        => api.post('/task/' + id + '/route'),
};

export const serverApi = {
  health: () => axios.get(BASE + '/api/health', { timeout: 5000 }),
};
