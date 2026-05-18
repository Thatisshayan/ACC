// cloud/telegram/features/notes.js — Feature 5: Encrypted Notes Vault
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const users = require('../users.js');
const ALGO = 'aes-256-gcm';

function getKey(userId) {
  const master = process.env.ACC_VAULT_MASTER_KEY || 'acc_notes_2026';
  return crypto.createHash('sha256').update(userId + ':' + master).digest();
}
function encrypt(userId, text) {
  const key = getKey(userId), iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}
function decrypt(userId, data) {
  try {
    const buf = Buffer.from(data, 'base64');
    const dec = crypto.createDecipheriv(ALGO, getKey(userId), buf.slice(0,16));
    dec.setAuthTag(buf.slice(16,32));
    return Buffer.concat([dec.update(buf.slice(32)), dec.final()]).toString('utf8');
  } catch(_) { return null; }
}
function getNotesFile(userId) { return path.join(users.getUserStorageDir(userId), '.notes.enc'); }
function getNotes(userId) {
  const fp = getNotesFile(userId);
  if (!fs.existsSync(fp)) return [];
  try {
    const dec = decrypt(userId, fs.readFileSync(fp, 'utf8'));
    if (!dec) return [];
    return JSON.parse(dec);
  } catch (_) { return []; }
}
function saveNotes(userId, notes) {
  const file = getNotesFile(userId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, encrypt(userId, JSON.stringify(notes)), 'utf8');
}
function addNote(userId, title, content) {
  const file = getNotesFile(userId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const notes = getNotes(userId);
  const note  = { id: Date.now(), title, content, createdAt: new Date().toISOString() };
  notes.unshift(note);
  if (notes.length > 100) notes.pop();
  saveNotes(userId, notes);
  return note;
}
function deleteNote(userId, noteId) {
  const notes = getNotes(userId);
  const upd   = notes.filter(function(n) { return n.id !== parseInt(noteId); });
  saveNotes(userId, upd);
  return notes.length - upd.length;
}
function searchNotes(userId, q) {
  const ql = q.toLowerCase();
  return getNotes(userId).filter(function(n) { return (n.title+n.content).toLowerCase().includes(ql); });
}
function formatList(notes, lang) {
  if (!notes.length) return lang === 'fa' ? '📝 یادداشتی یافت نشد.' : '📝 No notes found.';
  return notes.slice(0,10).map(function(n,i) {
    return (i+1) + '. *' + n.title + '* (ID: ' + n.id + ')\n   ' + n.content.slice(0,80) + (n.content.length>80?'…':'');
  }).join('\n\n');
}
module.exports = { addNote, deleteNote, getNotes, searchNotes, formatList };
