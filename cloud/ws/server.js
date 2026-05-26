// cloud/ws/server.js
// WebSocket server for live graph/approval updates pushed to the UI.
const WebSocket      = require("ws");
const { WebSocketServer } = require("ws");
const { log }        = require("../utils/logger.js");

let wss = null;

/**
 * startWSServer
 * Attach WebSocket server to an existing HTTP server.
 * @param {http.Server} httpServer
 */
function startWSServer(httpServer) {
  if (wss) return wss;
  wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws, req) => {
    log("[ws] Client connected from", req.socket.remoteAddress);

    ws.on("message", (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        if (data.type === "ping") {
          ws.send(JSON.stringify({ type: "pong", ts: Date.now() }));
        }
      } catch (_) {}
    });

    ws.on("close", () => log("[ws] Client disconnected."));
    ws.on("error", (e) => log("[ws] Error:", e.message));

    // Send initial connection ack
    ws.send(JSON.stringify({ type: "connected", ts: Date.now() }));
  });

  log("[ws] WebSocket server started on path /ws");
  return { wss, broadcast };
}

/**
 * broadcast
 * Push an event to all connected UI clients.
 * @param {string} event
 * @param {any}    payload
 */
function broadcast(event, payload) {
  if (!wss) return;
  const msg = JSON.stringify({ event, payload, ts: Date.now() });
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

module.exports = { startWSServer, broadcast };
