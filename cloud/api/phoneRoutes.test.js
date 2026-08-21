'use strict';

const path = require('path');
const { test, describe, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

function createSupertestShim() {
  return function request(app) {
    function makeRequest(method, routePath) {
      const state = { headers: {}, body: undefined };
      const run = async function() {
        const server = await new Promise((resolve) => {
          const s = app.listen(0, () => resolve(s));
        });
        try {
          const address = server.address();
          const res = await fetch(`http://127.0.0.1:${address.port}${routePath}`, {
            method,
            headers: state.headers,
            body: state.body === undefined ? undefined : JSON.stringify(state.body),
          });
          const text = await res.text();
          let body = null;
          try { body = text ? JSON.parse(text) : null; } catch (_) { body = text; }
          return { status: res.status, body, text, headers: Object.fromEntries(res.headers.entries()) };
        } finally {
          await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
        }
      };

      return {
        set(name, value) {
          state.headers[name] = value;
          return this;
        },
        send(body) {
          state.body = body;
          if (!state.headers['Content-Type']) state.headers['Content-Type'] = 'application/json';
          return this;
        },
        then(resolve, reject) {
          return run().then(resolve, reject);
        },
        catch(reject) {
          return run().catch(reject);
        },
      };
    }

    return {
      get(routePath) { return makeRequest('GET', routePath); },
      post(routePath) { return makeRequest('POST', routePath); },
      patch(routePath) { return makeRequest('PATCH', routePath); },
    };
  };
}

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'media-typer') {
    return {
      parse(value) {
        const raw = String(value || 'application/json');
        const parts = raw.split(';')[0].trim().split('/');
        return { type: parts[0] || 'application', subtype: parts[1] || 'json', suffix: '', parameters: {} };
      },
      format(obj) {
        return `${obj.type || 'application'}/${obj.subtype || 'json'}`;
      },
      test(expected, value) {
        const parsed = this.parse(value);
        return `${parsed.type}/${parsed.subtype}` === expected;
      },
    };
  }
  if (request === 'supertest') {
    return createSupertestShim();
  }
  if (request === 'twilio') {
    return { validateRequest: () => true };
  }
  return originalLoad.apply(this, arguments);
};
const express = require('express');
const request = require('supertest');

function cacheStub(absPath, exports) {
  require.cache[absPath] = { id: absPath, filename: absPath, loaded: true, exports };
}

cacheStub(path.resolve(__dirname, '../taskbus/store.js'), {
  createTask(input) {
    return {
      id: 'task-phone-1',
      status: 'pending',
      approval_required: input.approval_required !== false,
      automation_mode: input.automation_mode || 'semi_auto',
      assigned_agent: input.assigned_agent,
      title: input.title,
      instruction: input.instruction,
      meta: input.meta || null,
      created_by: input.created_by || 'manual',
    };
  },
});

cacheStub(path.resolve(__dirname, '../taskbus/router.js'), {
  routeTask: async () => ({ status: 'waiting_approval', approvalId: 'approval-phone-1', provider_used: 'twilio' }),
});

const twilioStub = {
  getAccountInfo: async () => ({ friendly_name: 'ACC Test', status: 'active' }),
  listMessages: async () => ([]),
};
cacheStub(path.resolve(__dirname, '../connectors/twilio.js'), twilioStub);

const phoneRoutes = require('./phoneRoutes.js');

let app;

beforeEach(() => {
  process.env.ACC_OPERATOR_API_KEY = 'operator-key';
  process.env.TWILIO_ACCOUNT_SID = 'sid';
  process.env.TWILIO_AUTH_TOKEN = 'token';
  process.env.TWILIO_PHONE_NUMBER = '+10000000000';
  app = express();
  app.use(express.json());
  app.use('/api/phone', phoneRoutes);
});

afterEach(() => {
  mock.restoreAll();
  delete process.env.ACC_OPERATOR_API_KEY;
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_PHONE_NUMBER;
});

describe('phone routes', () => {
  test('POST /sms creates an approval-gated Twilio task', async () => {
    const res = await request(app)
      .post('/api/phone/sms')
      .set('Authorization', 'Bearer operator-key')
      .send({ to: '+16135551234', message: 'hello', agent: 'manual' });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.task.assigned_agent, 'twilio');
    assert.equal(res.body.task.approval_required, true);
    assert.equal(res.body.routing.status, 'waiting_approval');
    assert.equal(res.body.task.meta.twilio.action, 'send_sms');
  });

  test('POST /call creates an approval-gated Twilio call task', async () => {
    const res = await request(app)
      .post('/api/phone/call')
      .set('Authorization', 'Bearer operator-key')
      .send({ to: '+16135551234', message: 'hello', agent: 'manual' });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.task.assigned_agent, 'twilio');
    assert.equal(res.body.task.approval_required, true);
    assert.equal(res.body.routing.status, 'waiting_approval');
    assert.equal(res.body.task.meta.twilio.action, 'make_call');
    assert.match(res.body.task.meta.twilio.params.twiml, /^<Response>/);
  });
});
