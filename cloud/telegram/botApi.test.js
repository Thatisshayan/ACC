'use strict';
// cloud/telegram/botApi.test.js — minimal node-telegram-bot-api 1.2.0 smoke test.
//
// The library is currently an unused direct dependency (cloud/telegram/bot.js
// is a raw-HTTP Telegram client), but it must at least instantiate and issue
// a Bot API call. Transport is mocked by stubbing globalThis.fetch so no real
// Telegram traffic is ever produced.

const { test, describe, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');

describe('node-telegram-bot-api 1.2.0 (Phase 4)', () => {
  afterEach(() => { mock.restoreAll(); });

  test('instantiates a bot and getMe works over a mocked transport', async () => {
    const { TelegramBot } = require('node-telegram-bot-api');
    const bot = new TelegramBot('fake:token', { polling: false });

    const calls = [];
    mock.method(globalThis, 'fetch', async (url, opts) => {
      calls.push({ url: String(url), opts });
      return new Response(JSON.stringify({
        ok: true,
        result: { id: 987654321, is_bot: true, first_name: 'Test', username: 'acc_test_bot' },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });

    const me = await bot.getMe();
    assert.equal(me.id, 987654321);
    assert.equal(me.username, 'acc_test_bot');
    assert.ok(calls.length > 0);
    assert.ok(calls[0].url.includes('/getMe'));
  });

  test('maps a Telegram error envelope to a rejection without network', async () => {
    const { TelegramBot } = require('node-telegram-bot-api');
    const bot = new TelegramBot('fake:token', { polling: false });

    mock.method(globalThis, 'fetch', async () =>
      new Response(JSON.stringify({ ok: false, error_code: 401, description: 'Unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }));

    await assert.rejects(() => bot.getMe());
  });
});
