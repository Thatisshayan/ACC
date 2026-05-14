import { useState, useEffect } from 'react';

export function useSocket() {
  const [lastMsg,  setLast]  = useState(null);
  const [connected, setConn] = useState(false);

  useEffect(() => {
    let ws, retry;
    function connect() {
      try {
        ws = new WebSocket('ws://localhost:4000/ws');
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
