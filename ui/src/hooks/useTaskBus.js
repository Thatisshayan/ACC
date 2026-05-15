import { useState, useEffect, useCallback } from 'react';
import { taskbusApi, serverApi } from '../lib/api';

// Poll the old-style /api/task/:id endpoint for results from executor
async function pollOldTask(taskId) {
  try {
    const BASE = (typeof window !== 'undefined' && window.location.protocol === 'file:')
      ? 'http://localhost:4000' : '';
    const r = await fetch(BASE + '/api/task/' + taskId);
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

export function useTaskBus() {
  const [tasks,     setTasks]   = useState([]);
  const [stats,     setStats]   = useState({});
  const [loading,   setLoading] = useState(true);
  const [error,     setError]   = useState(null);
  const [serverLive, setLive]   = useState(false);

  // Check old executor queue + Task Bus simultaneously
  const fetch = useCallback(async () => {
    try {
      const [tRes, sRes] = await Promise.all([
        taskbusApi.getTasks(),
        taskbusApi.getStats(),
      ]);
      setTasks(tRes.data.tasks || []);
      setStats(sRes.data.stats || {});
      setError(null);
    } catch(e) {
      setError('Cannot reach Task Bus. Is the server running?');
    } finally { setLoading(false); }
  }, []);

  // Check server health separately
  const checkServer = useCallback(async () => {
    try {
      await serverApi.health();
      setLive(true);
    } catch { setLive(false); }
  }, []);

  useEffect(() => {
    fetch();
    checkServer();
    const iv1 = setInterval(fetch, 8000);       // poll Task Bus every 8s
    const iv2 = setInterval(checkServer, 15000); // check health every 15s
    return () => { clearInterval(iv1); clearInterval(iv2); };
  }, [fetch, checkServer]);

  const createTask  = useCallback(async (d) => { const r = await taskbusApi.createTask(d); await fetch(); return r.data; }, [fetch]);
  const approveTask = useCallback(async (id) => { await taskbusApi.approve(id); await fetch(); }, [fetch]);
  const rejectTask  = useCallback(async (id) => { await taskbusApi.reject(id);  await fetch(); }, [fetch]);

  // Create task via old executor (for bot-style natural language tasks)
  const executePrompt = useCallback(async (prompt, agentType) => {
    const BASE = (typeof window !== 'undefined' && window.location.protocol === 'file:')
      ? 'http://localhost:4000' : '';
    const r = await fetch(BASE + '/api/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentType: agentType || 'writer',
        payload:   { prompt, mode: 'write' },
        meta:      { role: 'Agent', userId: 'dashboard', sandbox: true },
      }),
    });
    const data = await r.json();
    // Also create in Task Bus for tracking
    await taskbusApi.createTask({
      title:          prompt.slice(0, 80),
      instruction:    prompt,
      assigned_agent: 'claude',
      automation_mode:'semi_auto',
      approval_required: false,
      created_by:     'dashboard',
    });
    await fetch();
    return data;
  }, [fetch]);

  return {
    tasks, stats, loading, error, serverLive,
    pending:   tasks.filter(t => t.status === 'waiting_approval'),
    active:    tasks.filter(t => ['in_progress','running'].includes(t.status)),
    completed: tasks.filter(t => ['done','completed'].includes(t.status)),
    createTask, approveTask, rejectTask, executePrompt,
    refetch: fetch,
  };
}
