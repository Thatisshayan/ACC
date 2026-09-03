'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data/messages');
const KEY_FILE = path.join(DATA_DIR, 'messenger.key');

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readKeyMaterialFromEnv() {
  const keys = [
    { name: 'ACC_MESSENGER_MASTER_KEY', value: process.env.ACC_MESSENGER_MASTER_KEY },
    { name: 'ACC_VAULT_MASTER_KEY', value: process.env.ACC_VAULT_MASTER_KEY },
    { name: 'ACC_APPROVAL_HMAC_SECRET', value: process.env.ACC_APPROVAL_HMAC_SECRET },
  ];
  for (const item of keys) {
    const raw = String(item.value || '').trim();
    if (raw) {
      return { source: `env:${item.name}`, material: raw };
    }
  }
  return null;
}

function readKeyMaterialFromFile() {
  ensureDataDir();
  if (fs.existsSync(KEY_FILE)) {
    const raw = String(fs.readFileSync(KEY_FILE, 'utf8') || '').trim();
    if (raw) {
      return { source: 'local-file', material: raw };
    }
  }

  const generated = crypto.randomBytes(32).toString('base64url');
  fs.writeFileSync(KEY_FILE, generated, 'utf8');
  return { source: 'local-file', material: generated };
}

function getKeyMaterial() {
  return readKeyMaterialFromEnv() || readKeyMaterialFromFile();
}

// Resolve key material for a *specific* recorded source, so decrypting an
// old envelope always uses the same key that encrypted it — even if the
// live env-var priority order has since changed (e.g. ACC_MESSENGER_MASTER_KEY
// got added after some messages were already encrypted under local-file or
// ACC_VAULT_MASTER_KEY material). Falls back to current live resolution only
// when the exact recorded source is no longer available.
function getKeyMaterialBySource(source) {
  if (!source) return getKeyMaterial();

  if (source === 'local-file') {
    if (fs.existsSync(KEY_FILE)) {
      const raw = String(fs.readFileSync(KEY_FILE, 'utf8') || '').trim();
      if (raw) return { source: 'local-file', material: raw };
    }
  } else if (source.startsWith('env:')) {
    const envName = source.slice(4);
    const raw = String(process.env[envName] || '').trim();
    if (raw) return { source, material: raw };
  }

  // Not interpolating `source` into the log line: this function is now also
  // reached from the IMAP password decrypt path (cloud/services/emailMonitor.js),
  // where `source` is a field of an envelope derived from stored credential
  // data — CodeQL flags any property of that envelope reaching a log call, even
  // one as benign as a key-source label ("local-file" / "env:NAME", never the
  // actual secret). The label isn't needed to act on this warning anyway.
  console.warn('[encryption] Could not resolve the original key source — falling back to current key material. Decryption may fail if the wrong key is used.');
  return getKeyMaterial();
}

function deriveKeyBuffer(material) {
  return crypto.createHash('sha256').update(String(material), 'utf8').digest();
}

function encryptObject(payload, kid) {
  const keyMaterial = getKeyMaterial();
  const key = deriveKeyBuffer(keyMaterial.material);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    version: 1,
    alg: 'aes-256-gcm',
    kid: kid || keyMaterial.source,
    key_source: keyMaterial.source,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

function decryptObject(envelope) {
  if (!envelope || typeof envelope !== 'object') return null;
  if (envelope.alg !== 'aes-256-gcm' || !envelope.ciphertext) return null;

  const keyMaterial = getKeyMaterialBySource(envelope.key_source);
  const key = deriveKeyBuffer(keyMaterial.material);
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(String(envelope.iv || ''), 'base64')
  );
  decipher.setAuthTag(Buffer.from(String(envelope.tag || ''), 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(String(envelope.ciphertext), 'base64')),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString('utf8'));
}

function summarizeEnvelope(envelope) {
  return {
    version: envelope.version || 1,
    alg: envelope.alg || 'aes-256-gcm',
    kid: envelope.kid || 'messenger',
    key_source: envelope.key_source || 'unknown',
  };
}

module.exports = {
  KEY_FILE,
  encryptObject,
  decryptObject,
  summarizeEnvelope,
  getKeyMaterial,
  getKeyMaterialBySource,
};
