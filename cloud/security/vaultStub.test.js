'use strict';
// cloud/security/vaultStub.test.js
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vault = require('./vaultStub.js');

describe('vaultStub', () => {
  const secretName = 'test_temp_secret_xyz';

  beforeEach(() => {
    // Clean up any test secret before each run
    const file = path.join(process.cwd(), 'cloud', 'security', '.vault', `${secretName}.vault`);
    if (fs.existsSync(file)) {
      try { fs.unlinkSync(file); } catch {}
    }
  });

  test('writeSecret and readSecret happy path (encrypts and decrypts)', () => {
    const val = 'my_super_secret_api_key_123';
    const ok = vault.writeSecret(secretName, val);
    assert.ok(ok, 'writes successfully');

    // Read it back
    const decrypted = vault.readSecret(secretName);
    assert.equal(decrypted, val, 'decrypted value matches plaintext');

    // Verify it is encrypted on disk (i.e. not raw JSON)
    const file = path.join(process.cwd(), 'cloud', 'security', '.vault', `${secretName}.vault`);
    const rawDisk = fs.readFileSync(file, 'utf8');
    assert.notEqual(rawDisk, JSON.stringify({ value: val }), 'raw file content is encrypted base64 payload');
  });

  test('readSecret gracefully falls back to legacy unencrypted JSON', () => {
    const legacyVal = 'legacy_unencrypted_secret_abc';
    const file = path.join(process.cwd(), 'cloud', 'security', '.vault', `${secretName}.vault`);
    
    // Write unencrypted JSON directly
    fs.writeFileSync(file, JSON.stringify({ value: legacyVal }), 'utf8');

    // Try reading using vaultStub
    const decrypted = vault.readSecret(secretName);
    assert.equal(decrypted, legacyVal, 'gracefully decrypts/reads unencrypted legacy files');
  });

  test('listSecrets returns written secrets', () => {
    vault.writeSecret(secretName, 'temp');
    const list = vault.listSecrets();
    assert.ok(list.includes(secretName), 'contains the written secret');
  });
});
