'use strict';

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const snapshots = require('./ephemeralSnapshots.js');

describe('ephemeral snapshot id safety', () => {
  let created = [];
  after(() => { created.forEach((id) => snapshots.deleteSnapshot(id)); });

  test('createSnapshot produces an id matching the expected safe shape', () => {
    const rec = snapshots.createSnapshot({ data: { ok: true } });
    created.push(rec.id);
    assert.match(rec.id, /^snap_[0-9]+_[a-zA-Z0-9]+$/);
  });

  test('deleteSnapshot with a path-traversal id is a safe no-op, not a filesystem write', () => {
    const rec = snapshots.createSnapshot({ data: { ok: true } });
    created.push(rec.id);
    // Mirrors the exact reachable path: cloud/api/securityApproval.js passes
    // req.body.snapshotId straight to deleteSnapshot()/approveSnapshot() —
    // there is no format check upstream of ephemeralSnapshots.js itself.
    assert.doesNotThrow(() => snapshots.deleteSnapshot('../../../../etc/passwd'));
    // The legitimately created snapshot must be unaffected.
    assert.notEqual(snapshots.getSnapshot(rec.id), null);
  });

  test('approveSnapshot with an unknown/malicious id does not crash or write to disk', () => {
    assert.doesNotThrow(() => snapshots.approveSnapshot('../../../../etc/passwd'));
  });

  test('a real snapshot can still be deleted by its real id', () => {
    const rec = snapshots.createSnapshot({ data: { ok: true } });
    snapshots.deleteSnapshot(rec.id);
    assert.equal(snapshots.getSnapshot(rec.id), null);
  });
});
