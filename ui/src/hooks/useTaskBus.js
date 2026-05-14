import { useState, useEffect, useCallback } from 'react';
import { taskbusApi } from '../lib/api';

export function useTaskBus() {
  const [tasks,     setTasks]   = useState([]);
  const [stats,     setStats]   = useState({});
  const [loading,   setLoading] = useState(true);
  const [error,     setError]   = useState(null);

  const fetch = useCallback(async () => {
    try {
      const [tRes, sRes] = await Promise.all([taskbusApi.getTasks(), taskbusApi.getStats()]);
      setTasks(tRes.data.tasks || []);
      setStats(sRes.data.stats || {});
      setError(null);
    } catch(e) {
      setError('Cannot reach Task Bus. Is the server running?');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch(); const iv = setInterval(fetch, 10000); return () => clearInterval(iv); }, [fetch]);

  const createTask  = useCallback(async (d) => { const r = await taskbusApi.createTask(d);  await fetch(); return r.data; }, [fetch]);
  const approveTask = useCallback(async (id) => { await taskbusApi.approve(id);  await fetch(); }, [fetch]);
  const rejectTask  = useCallback(async (id) => { await taskbusApi.reject(id);   await fetch(); }, [fetch]);

  return {
    tasks, stats, loading, error,
    pending:   tasks.filter(t => t.status === 'waiting_approval'),
    active:    tasks.filter(t => ['in_progress','running'].includes(t.status)),
    completed: tasks.filter(t => ['done','completed'].includes(t.status)),
    createTask, approveTask, rejectTask, refetch: fetch,
  };
}
