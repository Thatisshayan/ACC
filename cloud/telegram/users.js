// cloud/telegram/users.js
// Multi-user store — disk-persistent, isolated per user, supports file storage
'use strict';

const fs   = require('fs');
const path = require('path');

const USERS_DIR   = path.join(__dirname, '../../data/users');
const STORAGE_DIR = path.join(__dirname, '../../data/storage');

// Create dirs
[USERS_DIR, STORAGE_DIR].forEach(function(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// In-memory cache
const cache = new Map();

// Allowed user IDs (max 10) — empty = anyone can join
const ALLOWED_IDS = [];

// ── Persistence ───────────────────────────────────────────────────────────────

function userFile(userId) { return path.join(USERS_DIR, userId + '.json'); }

function loadUser(userId) {
  if (cache.has(userId)) return cache.get(userId);
  const fp = userFile(userId);
  if (fs.existsSync(fp)) {
    try {
      const u = JSON.parse(fs.readFileSync(fp, 'utf8'));
      cache.set(userId, u);
      return u;
    } catch(_) {}
  }
  return null;
}

function saveUser(user) {
  cache.set(user.id, user);
  try { fs.writeFileSync(userFile(user.id), JSON.stringify(user, null, 2), 'utf8'); } catch(_) {}
}

// ── User storage directory ────────────────────────────────────────────────────

function getUserStorageDir(userId) {
  const d = path.join(STORAGE_DIR, userId);
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  return d;
}

function saveUserFile(userId, filename, buffer) {
  const dir = getUserStorageDir(userId);
  const fp  = path.join(dir, filename);
  fs.writeFileSync(fp, buffer);
  return fp;
}

function getUserFile(userId, filename) {
  const fp = path.join(getUserStorageDir(userId), filename);
  if (!fs.existsSync(fp)) return null;
  return fs.readFileSync(fp);
}

function listUserFiles(userId) {
  const dir = getUserStorageDir(userId);
  return fs.readdirSync(dir);
}

// ── User lifecycle ────────────────────────────────────────────────────────────

function getAllUsers() {
  try {
    return fs.readdirSync(USERS_DIR)
      .filter(function(f) { return f.endsWith('.json'); })
      .map(function(f) {
        try { return JSON.parse(fs.readFileSync(path.join(USERS_DIR, f), 'utf8')); } catch(_) { return null; }
      }).filter(Boolean);
  } catch(_) { return []; }
}

function getUserCount() { return getAllUsers().length; }

function isAtCapacity() {
  return getUserCount() >= 10;
}

function isAllowed(userId) {
  if (ALLOWED_IDS.length === 0) return true; // open
  return ALLOWED_IDS.includes(String(userId));
}

function getUserProfile(userId) {
  return loadUser(String(userId));
}

async function ensureUserProfile(userId) {
  userId = String(userId);
  if (!loadUser(userId)) {
    const u = {
      id:           userId,
      name:         null,        // set during onboarding
      language:     'en',        // 'en' | 'fa'
      role:         'member',    // admin | member | guest
      state:        'new',       // new | onboarding_name | onboarding_lang | ready
      linkedinEmail: null,
      indeedEmail:   null,
      resumeFile:    null,       // filename in storage
      jobPrefs:      {},         // { role, location, type, salary }
      createdAt:     new Date().toISOString(),
      lastSeen:      new Date().toISOString(),
    };
    saveUser(u);
  }
  return loadUser(userId);
}

function updateUser(userId, patch) {
  userId = String(userId);
  const u = loadUser(userId) || {};
  const updated = Object.assign({}, u, patch, { lastSeen: new Date().toISOString() });
  saveUser(updated);
  return updated;
}

module.exports = {
  getUserProfile,
  ensureUserProfile,
  updateUser,
  saveUserFile,
  getUserFile,
  listUserFiles,
  getUserStorageDir,
  getAllUsers,
  getUserCount,
  isAtCapacity,
  isAllowed,
};
