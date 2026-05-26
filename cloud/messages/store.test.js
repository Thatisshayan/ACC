'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// The messages store keeps an in-memory cache backed by a JSON file.
// We call the real functions — they write to data/messages/messenger.json
// but use unique participant IDs so tests don't collide with real data.
const store = require('./store.js');

const SUFFIX = 'test-' + Date.now();

function userId(label) {
  return `${label}_${SUFFIX}`;
}

// ── ensureThread ──────────────────────────────────────────────────────────────

describe('ensureThread', () => {
  test('creates a thread between two participants', () => {
    const p1 = userId('alice');
    const p2 = userId('bob');
    const thread = store.ensureThread({ participantIds: [p1, p2], senderId: p1 });

    assert.ok(thread.id, 'thread has id');
    assert.match(thread.id, /^thread_/);
    assert.equal(thread.type, 'direct');
    assert.ok(thread.participantIds.includes(p1));
    assert.ok(thread.participantIds.includes(p2));
  });

  test('deduplicates: same participants return the same thread', () => {
    const p1 = userId('carol');
    const p2 = userId('dave');
    const first  = store.ensureThread({ participantIds: [p1, p2], senderId: p1 });
    const second = store.ensureThread({ participantIds: [p2, p1], senderId: p2 });
    assert.equal(first.id, second.id);
  });

  test('throws when fewer than 2 participants are given', () => {
    assert.throws(
      () => store.ensureThread({ participantIds: [userId('solo')], senderId: userId('solo') }),
      /at least two/i
    );
  });
});

// ── findThreadById ────────────────────────────────────────────────────────────

describe('findThreadById', () => {
  test('retrieves a thread by id', () => {
    const p1 = userId('eve');
    const p2 = userId('frank');
    const created = store.ensureThread({ participantIds: [p1, p2], senderId: p1 });
    const found = store.findThreadById(created.id);
    assert.ok(found, 'thread found');
    assert.equal(found.id, created.id);
  });

  test('returns null for unknown id', () => {
    const result = store.findThreadById('no-such-thread-' + Date.now());
    assert.equal(result, null);
  });
});

// ── addMessage + getMessagesForThread ─────────────────────────────────────────

describe('addMessage + getMessagesForThread', () => {
  test('adds a message and retrieves it from the thread', () => {
    const p1 = userId('grace');
    const p2 = userId('hank');
    const thread = store.ensureThread({ participantIds: [p1, p2], senderId: p1 });

    const msg = store.addMessage({
      threadId:    thread.id,
      senderId:    p1,
      recipientIds: [p2],
      content:     'hello from test',
    });

    assert.ok(msg.id, 'message has id');
    assert.match(msg.id, /^msg_/);
    assert.equal(msg.threadId, thread.id);
    assert.equal(msg.senderId, p1);
    assert.equal(msg.content, 'hello from test');

    const messages = store.getMessagesForThread(thread.id);
    assert.ok(messages.length >= 1);
    const found = messages.find((m) => m.id === msg.id);
    assert.ok(found, 'message found in thread');
    assert.equal(found.content, 'hello from test');
  });

  test('creates thread automatically when no threadId given', () => {
    const p1 = userId('ivan');
    const p2 = userId('judy');

    const msg = store.addMessage({
      senderId:    p1,
      recipientIds: [p2],
      content:     'auto-thread message',
    });

    assert.ok(msg.id);
    assert.ok(msg.threadId, 'thread was auto-created');
  });

  test('throws when senderId is missing', () => {
    assert.throws(
      () => store.addMessage({ recipientIds: [userId('x')], content: 'no sender' }),
      /senderId/i
    );
  });
});

// ── listThreadsForUser ────────────────────────────────────────────────────────

describe('listThreadsForUser', () => {
  test('returns threads the user participates in', () => {
    const p1 = userId('ken');
    const p2 = userId('lea');
    store.ensureThread({ participantIds: [p1, p2], senderId: p1 });

    const threads = store.listThreadsForUser(p1);
    assert.ok(threads.length >= 1);
    const found = threads.find((t) => t.participantIds && t.participantIds.includes(p1));
    assert.ok(found, 'user thread present in inbox');
  });

  test('returns empty array for user with no threads', () => {
    const nobody = userId('nobody');
    const threads = store.listThreadsForUser(nobody);
    assert.deepEqual(threads, []);
  });
});

// ── markThreadRead ────────────────────────────────────────────────────────────

describe('markThreadRead', () => {
  test('marks unread messages as read and returns readCount', () => {
    const sender    = userId('mia');
    const recipient = userId('nate');
    const thread = store.ensureThread({ participantIds: [sender, recipient], senderId: sender });

    store.addMessage({ threadId: thread.id, senderId: sender, recipientIds: [recipient], content: 'msg 1' });
    store.addMessage({ threadId: thread.id, senderId: sender, recipientIds: [recipient], content: 'msg 2' });

    const result = store.markThreadRead(thread.id, recipient, null);
    assert.equal(result.success, true);
    assert.ok(result.readCount >= 2, `expected >= 2 messages marked read, got ${result.readCount}`);
  });

  test('calling markRead twice does not double-count', () => {
    const sender    = userId('oscar');
    const recipient = userId('paula');
    const thread = store.ensureThread({ participantIds: [sender, recipient], senderId: sender });
    store.addMessage({ threadId: thread.id, senderId: sender, recipientIds: [recipient], content: 'hi' });

    store.markThreadRead(thread.id, recipient, null);
    const second = store.markThreadRead(thread.id, recipient, null);
    assert.equal(second.readCount, 0, 'already-read messages should not be counted again');
  });
});

// ── setPresence / getPresence ─────────────────────────────────────────────────

describe('setPresence + getPresence', () => {
  test('stores and retrieves presence', () => {
    const uid = userId('quinn');
    store.setPresence(uid, 'online', { device: 'desktop' });
    const presence = store.getPresence(uid);
    assert.ok(presence, 'presence found');
    assert.equal(presence.status, 'online');
    assert.equal(presence.meta.device, 'desktop');
  });

  test('returns null for unknown user', () => {
    const result = store.getPresence('no-such-user-' + Date.now());
    assert.equal(result, null);
  });
});
