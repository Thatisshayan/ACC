import { useState, useEffect } from 'react';
import { getRuntimeWsUrl } from '../lib/api';

export function useSocket() {
  const [lastMsg,   setLast] = useState(null);
  const [connected, setConn] = useState(false);

  useEffect(() => {
    let ws, retry;
    function connect() {
      try {
        // Always use absolute WS URL (works in browser and Electron file://)
        ws = new WebSocket(getRuntimeWsUrl());
        ws.onopen    = () => setConn(true);
        ws.onclose   = () => { setConn(false); retry = setTimeout(connect, 5000); };
        ws.onerror   = () => setConn(false);
        ws.onmessage = (e) => { try { setLast(JSON.parse(e.data)); } catch {} };
      } catch { setConn(false); retry = setTimeout(connect, 5000); }
    }
    connect();
    return () => { clearTimeout(retry); if (ws) ws.close(); };
  }, []);

  return { lastMsg, connected };
}
