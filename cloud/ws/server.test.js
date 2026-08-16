'use strict';
// cloud/ws/server.test.js
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const WebSocket = require('ws');
const { startWSServer, broadcast } = require('./server.js');

describe('WebSocket server authentication', () => {
  let server;
  let port;

  beforeEach(() => {
    // Start an HTTP server to attach the WS server to
    server = http.createServer((req, res) => {
      res.writeHead(200);
      res.end('ok');
    });
    // Dynamically assign port
    server.listen(0);
    port = server.address().port;

    // Configure test environment keys
    process.env.ACC_OPERATOR_API_KEY = 'test_ws_token_123';
    process.env.NODE_ENV = 'production'; // enforce strict auth
  });

  afterEach(() => {
    // Reset keys and stop server
    delete process.env.ACC_OPERATOR_API_KEY;
    process.env.NODE_ENV = 'test';
    server.close();
    // Clean up singleton WS instance
    const wsModule = require('./server.js');
    if (wsModule.wss) {
      wsModule.wss.close();
    }
    wsModule.resetWSServer();
  });

  test('rejects connection with 4401 when token is missing or invalid', (t, done) => {
    startWSServer(server);

    const client = new WebSocket(`ws://127.0.0.1:${port}/ws?token=bad_token`);
    client.on('error', () => {
      // client error is expected when closed early by server
    });
    client.on('close', (code, reason) => {
      assert.equal(code, 4401, 'closed with 4401 Unauthorized');
      done();
    });
  });

  test('authorizes connection when a valid token is provided', (t, done) => {
    startWSServer(server);

    const client = new WebSocket(`ws://127.0.0.1:${port}/ws?token=test_ws_token_123`);
    client.on('open', () => {
      client.send(JSON.stringify({ type: 'ping' }));
    });
    client.on('message', (raw) => {
      const data = JSON.parse(raw.toString());
      if (data.type === 'connected') return; // ignore initial ack
      assert.equal(data.type, 'pong', 'receives pong response');
      client.close();
      done();
    });
  });
});
