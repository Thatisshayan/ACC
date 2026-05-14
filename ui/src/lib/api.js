import axios from 'axios';

const api = axios.create({ baseURL: '/api/taskbus', timeout: 15000 });

export const taskbusApi = {
  getStats:     ()        => api.get('/stats'),
  getAgents:    ()        => api.get('/agents'),
  getProviders: ()        => api.get('/providers/status'),
  getTasks:     (params)  => api.get('/tasks', { params }),
  getTask:      (id)      => api.get('/task/' + id),
  createTask:   (data)    => api.post('/task', data),
  getApprovals: ()        => api.get('/approvals'),
  approve:      (id, notes) => api.post('/approval/' + id,
    { decision: 'approved', notes: notes || '' },
    { headers: { 'x-approver': 'Shayan' } }),
  reject:       (id, notes) => api.post('/approval/' + id,
    { decision: 'rejected', notes: notes || '' },
    { headers: { 'x-approver': 'Shayan' } }),
  submitResult: (id, data) => api.post('/task/' + id + '/result', data),
  routeTask:    (id)      => api.post('/task/' + id + '/route'),
};

export const serverApi = {
  health: () => axios.get('/api/health', { timeout: 5000 }),
};
