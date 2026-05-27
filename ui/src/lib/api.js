import axios from 'axios';

function trimUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

export function getRuntimeApiBaseUrl() {
  const explicit = trimUrl(import.meta.env.VITE_ACC_API_BASE_URL);
  if (explicit) return explicit;

  if (typeof window !== 'undefined' && window.location?.protocol === 'file:') {
    return 'http://127.0.0.1:4000';
  }

  return '';
}

export function getRuntimeWsUrl() {
  const explicit = trimUrl(import.meta.env.VITE_ACC_WS_URL);
  if (explicit) return explicit;

  if (typeof window !== 'undefined') {
    if (window.location?.protocol === 'file:') {
      return 'ws://127.0.0.1:4000/ws';
    }

    if (window.location?.host) {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${proto}//${window.location.host}/ws`;
    }
  }

  return '';
}

const API_BASE = getRuntimeApiBaseUrl();
const api = axios.create({ baseURL: `${API_BASE ? API_BASE : ''}/api/taskbus`, timeout: 15000 });

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
  health: () => axios.get(`${API_BASE ? API_BASE : ''}/api/health`, { timeout: 5000 }),
};
