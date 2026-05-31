import { useState, useEffect } from 'react';
import { getRuntimeWsUrl } from '../lib/api';

export function useSocket() {
  const [lastMsg,   setLast] = useState(null);
  const [connected, setConn] = useState(false);

  useEffect(() => {
    let ws, retry;
    let attempts = 0;
    function nextDelay() {
      // Exponential backoff with cap to avoid tight reconnect loops.
      const base = Math.min(5000 * Math.pow(2, attempts), 30000);
      const jitter = Math.floor(Math.random() * 750);
      return base + jitter;
    }
    function connect() {
      try {
        // Always use absolute WS URL (works in browser and Electron file://)
        ws = new WebSocket(getRuntimeWsUrl());
        ws.onopen = () => {
          attempts = 0;
          setConn(true);
        };
        ws.onclose = () => {
          setConn(false);
          attempts += 1;
          retry = setTimeout(connect, nextDelay());
        };
        ws.onerror = () => setConn(false);
        ws.onmessage = (e) => { try { setLast(JSON.parse(e.data)); } catch {} };
      } catch {
        setConn(false);
        attempts += 1;
        retry = setTimeout(connect, nextDelay());
      }
    }
    connect();
    return () => { clearTimeout(retry); if (ws) ws.close(); };
  }, []);

  return { lastMsg, connected };
}
