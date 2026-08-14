// cloud/ws/server.js
// WebSocket server for live graph/approval updates pushed to the UI.
const WebSocket      = require("ws");
const { WebSocketServer } = require("ws");
const { log }        = require("../utils/logger.js");
const { validateToken } = require("../middleware/auth.js");

let wss = null;

/**
 * startWSServer
 * Attach WebSocket server to an existing HTTP server.
 * @param {http.Server} httpServer
 */
function startWSServer(httpServer) {
  if (wss) return { wss, broadcast };
  wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws, req) => {
    // Parse query string to extract 'token' parameter
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch (e) {
      ws.close(4400, "Invalid handshake URL");
      return;
    }

    // Prefer the Sec-WebSocket-Protocol header (set via the `protocols`
    // argument of the WebSocket constructor) over the query string — query
    // params get written into access logs and browser history, headers do
    // not. The query param is kept as a fallback for existing callers.
    const protocolToken = (req.headers["sec-websocket-protocol"] || "").split(",")[0].trim();
    const token = protocolToken || url.searchParams.get("token");
    const principal = validateToken(token, ['operator', 'admin', 'service']);

    const isProd = process.env.NODE_ENV === "production";
    const hasKeys = [
      process.env.ACC_OPERATOR_API_KEY,
      process.env.ACC_ADMIN_API_KEY,
      process.env.TASKBUS_API_KEY,
    ].some((raw) => String(raw || '').trim().length > 0);

    if (!principal) {
      if (isProd || hasKeys) {
        log("[ws] Connection rejected: unauthorized (missing or invalid token)");
        ws.close(4401, "Unauthorized");
        return;
      }
      log("[ws] Warning: Client connected from", req.socket.remoteAddress, "without token (dev fallback)");
    } else {
      log("[ws] Client connected from", req.socket.remoteAddress, "authorized as:", principal.role, "subject:", principal.subject);
    }

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

function resetWSServer() {
  wss = null;
}

module.exports = { startWSServer, broadcast, resetWSServer };
