import { useState, useEffect } from 'react';
import { taskbusApi } from '../lib/api';

const DEFAULTS = {
  deepseek:   { name: 'DeepSeek',   status: 'loading', cost_tier: 'low_cost',    is_real_ai: true,  role: 'primary'         },
  ollama:     { name: 'Ollama',     status: 'offline', cost_tier: 'local_free',  is_real_ai: true,  role: 'local_fallback'  },
  claude:     { name: 'Claude',     status: 'loading', cost_tier: 'premium',     is_real_ai: true,  role: 'premium_fallback'},
  smart_stub: { name: 'Smart Stub', status: 'ready',   cost_tier: 'zero_cost',   is_real_ai: false, role: 'final_fallback'  },
};

export function useProviders() {
  const [providers, set] = useState(DEFAULTS);
  const [updated,   setUpdated] = useState(null);

  async function fetch() {
    try {
      const { data } = await taskbusApi.getProviders();
      const ps = data.providers || {};
      const merged = { ...DEFAULTS };
      Object.keys(ps).forEach(k => {
        if (merged[k]) merged[k] = { ...merged[k], ...ps[k], name: merged[k].name };
      });
      set(merged);
      setUpdated(new Date());
    } catch { /* keep defaults */ }
  }

  useEffect(() => { fetch(); const iv = setInterval(fetch, 30000); return () => clearInterval(iv); }, []);
  return { providers: Object.values(providers), updated, refetch: fetch };
}
