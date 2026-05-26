'use strict';

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { encryptObject, decryptObject, summarizeEnvelope, getKeyMaterial } = require('./encryption.js');
const users = require('../telegram/users.js');

const DATA_DIR = path.join(__dirname, '../../data/messages');
const STATE_FILE = path.join(DATA_DIR, 'messenger.json');

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function defaultState() {
  return {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    threads: [],
    messages: [],
    presence: {},
  };
}

function atomicWrite(filePath, data) {
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, data, 'utf8');
  fs.renameSync(tmp, filePath);
}

function readState() {
  ensureDataDir();
  if (!fs.existsSync(STATE_FILE)) {
    return defaultState();
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return Object.assign(defaultState(), parsed);
  } catch (err) {
    return defaultState();
  }
}

let cache = readState();

function persistState() {
  cache.updatedAt = new Date().toISOString();
  atomicWrite(STATE_FILE, JSON.stringify(cache, null, 2));
}

function refreshState() {
  cache = readState();
  return cache;
}

function normalizeIds(list) {
  return Array.from(new Set((Array.isArray(list) ? list : []).map((item) => String(item || '').trim()).filter(Boolean))).sort();
}

function isSameArray(a, b) {
  if (a.length !== b.length) return false;
  return a.every((item, index) => item === b[index]);
}

function threadKey(participantIds, type) {
  return `${type || 'direct'}:${normalizeIds(participantIds).join('|')}`;
}

function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: String(user.id),
    name: user.name || null,
    role: user.role || 'member',
    state: user.state || 'ready',
    language: user.language || 'en',
    lastSeen: user.lastSeen || null,
    createdAt: user.createdAt || null,
    hasTelegram: Boolean(user.telegramChatId || user.telegram_chat_id || user.telegram_chatid || user.telegram_id),
  };
}

function resolveUser(userId) {
  if (!userId) return null;
  const user = users.getUserProfile(String(userId));
  return sanitizeUser(user);
}

function listUsers() {
  return users.getAllUsers().map(sanitizeUser).filter(Boolean);
}

function findThreadById(threadId) {
  const state = refreshState();
  return state.threads.find((thread) => thread.id === threadId) || null;
}

function findDirectThread(participantIds) {
  const state = refreshState();
  const target = normalizeIds(participantIds);
  return state.threads.find((thread) => thread.type === 'direct' && isSameArray(normalizeIds(thread.participantIds), target)) || null;
}

function ensureThread(input) {
  const participantIds = normalizeIds(input.participantIds || [input.senderId, input.recipientId].filter(Boolean));
  if (participantIds.length < 2) {
    throw new Error('A private thread needs at least two participants.');
  }

  const subject = String(input.subject || '').trim();
  const transport = String(input.transport || 'in_app');
  const createdBy = String(input.createdBy || input.senderId || participantIds[0]);
  const existing = findDirectThread(participantIds);
  if (existing) {
    if (subject && !existing.subject) {
      existing.subject = subject;
      existing.updatedAt = new Date().toISOString();
      persistState();
    }
    return existing;
  }

  const now = new Date().toISOString();
  const thread = {
    id: `thread_${uuidv4()}`,
    key: threadKey(participantIds, 'direct'),
    type: 'direct',
    participantIds,
    createdBy,
    subject,
    transport,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: null,
    lastMessageId: null,
  };

  cache.threads.unshift(thread);
  persistState();
  return thread;
}

function decryptMessage(message) {
  if (!message) return null;
  const payload = decryptObject(message.envelope);
  return {
    id: message.id,
    threadId: message.threadId,
    senderId: message.senderId,
    senderType: message.senderType || 'user',
    recipientIds: message.recipientIds || [],
    transport: message.transport || 'in_app',
    subject: message.subject || '',
    content: payload ? payload.content || '' : '',
    attachments: payload ? payload.attachments || [] : [],
    meta: payload ? payload.meta || {} : {},
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
    encrypted: summarizeEnvelope(message.envelope),
    readBy: Array.isArray(message.readBy) ? message.readBy : [],
    deliveredTo: Array.isArray(message.deliveredTo) ? message.deliveredTo : [],
  };
}

function getMessagesForThread(threadId) {
  const state = refreshState();
  return state.messages
    .filter((message) => message.threadId === threadId)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
    .map(decryptMessage);
}

function getThreadView(thread, viewerId) {
  if (!thread) return null;
  const messages = getMessagesForThread(thread.id);
  const participants = thread.participantIds.map((id) => resolveUser(id)).filter(Boolean);
  const lastMessage = messages[messages.length - 1] || null;
  const unreadCount = messages.filter((message) => {
    if (String(message.senderId) === String(viewerId)) return false;
    return !message.readBy.some((item) => String(item.userId) === String(viewerId));
  }).length;

  return {
    id: thread.id,
    key: thread.key,
    type: thread.type,
    subject: thread.subject || '',
    transport: thread.transport || 'in_app',
    createdBy: thread.createdBy,
    participantIds: thread.participantIds,
    participants,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    lastMessageAt: thread.lastMessageAt,
    lastMessageId: thread.lastMessageId,
    unreadCount,
    lastMessage,
  };
}

function listThreadsForUser(userId) {
  const state = refreshState();
  return state.threads
    .filter((thread) => thread.participantIds.some((id) => String(id) === String(userId)))
    .sort((a, b) => String(b.lastMessageAt || b.updatedAt).localeCompare(String(a.lastMessageAt || a.updatedAt)))
    .map((thread) => getThreadView(thread, userId));
}

function markThreadRead(threadId, userId, messageId) {
  const state = refreshState();
  const now = new Date().toISOString();
  let touched = 0;

  state.messages.forEach((message) => {
    if (message.threadId !== threadId) return;
    if (messageId && String(message.id) > String(messageId)) return;
    if (String(message.senderId) === String(userId)) return;
    if (!Array.isArray(message.readBy)) message.readBy = [];
    const alreadyRead = message.readBy.some((entry) => String(entry.userId) === String(userId));
    if (!alreadyRead) {
      message.readBy.push({ userId: String(userId), readAt: now });
      message.updatedAt = now;
      touched += 1;
    }
  });

  if (touched > 0) {
    const thread = state.threads.find((item) => item.id === threadId);
    if (thread) thread.updatedAt = now;
    persistState();
  }

  return {
    success: true,
    threadId,
    userId: String(userId),
    readCount: touched,
  };
}

function setPresence(userId, status, meta) {
  const state = refreshState();
  const now = new Date().toISOString();
  state.presence[String(userId)] = {
    userId: String(userId),
    status: status || 'online',
    meta: meta || {},
    updatedAt: now,
  };
  persistState();
  return state.presence[String(userId)];
}

function getPresence(userId) {
  const state = refreshState();
  return state.presence[String(userId)] || null;
}

function addMessage(input) {
  const senderId = String(input.senderId || '').trim();
  const recipientIds = normalizeIds(input.recipientIds || [input.recipientId].filter(Boolean));
  if (!senderId) throw new Error('senderId is required');
  if (!recipientIds.length && !input.threadId) throw new Error('recipientIds or threadId is required');

  const thread = input.threadId
    ? findThreadById(String(input.threadId))
    : ensureThread({
        participantIds: [senderId].concat(recipientIds),
        senderId,
        subject: input.subject || '',
        transport: input.transport || 'in_app',
        createdBy: input.createdBy || senderId,
      });

  if (!thread) throw new Error('Thread not found');

  const participantIds = normalizeIds(thread.participantIds);
  const effectiveRecipients = recipientIds.length ? recipientIds : participantIds.filter((id) => id !== senderId);
  const now = new Date().toISOString();
  const contentPayload = {
    content: String(input.content || ''),
    subject: String(input.subject || thread.subject || ''),
    attachments: Array.isArray(input.attachments) ? input.attachments : [],
    meta: input.meta || {},
    senderId,
    recipientIds: effectiveRecipients,
    senderType: input.senderType || 'user',
    transport: input.transport || 'in_app',
    clientMessageId: input.clientMessageId || null,
  };
  const envelope = encryptObject(contentPayload, input.kid || 'messenger');

  const message = {
    id: `msg_${uuidv4()}`,
    threadId: thread.id,
    senderId,
    senderType: contentPayload.senderType,
    recipientIds: effectiveRecipients,
    transport: contentPayload.transport,
    subject: contentPayload.subject,
    createdAt: now,
    updatedAt: now,
    envelope,
    readBy: [{ userId: senderId, readAt: now }],
    deliveredTo: effectiveRecipients.map((id) => ({ userId: id, status: 'pending', deliveredAt: null })),
  };

  cache.messages.push(message);
  thread.lastMessageAt = now;
  thread.lastMessageId = message.id;
  thread.updatedAt = now;
  persistState();

  return decryptMessage(message);
}

function updateDelivery(threadId, messageId, userId, status) {
  const state = refreshState();
  const message = state.messages.find((item) => item.id === messageId && item.threadId === threadId);
  if (!message) return null;
  const now = new Date().toISOString();
  if (!Array.isArray(message.deliveredTo)) message.deliveredTo = [];
  const entry = message.deliveredTo.find((item) => String(item.userId) === String(userId));
  if (entry) {
    entry.status = status;
    entry.deliveredAt = now;
  } else {
    message.deliveredTo.push({ userId: String(userId), status, deliveredAt: now });
  }
  message.updatedAt = now;
  persistState();
  return decryptMessage(message);
}

function getThreadStatus() {
  const state = refreshState();
  return {
    keySource: getKeyMaterial().source,
    threads: state.threads.length,
    messages: state.messages.length,
    activePresences: Object.keys(state.presence).length,
    updatedAt: state.updatedAt,
  };
}

module.exports = {
  listUsers,
  resolveUser,
  ensureThread,
  findThreadById,
  listThreadsForUser,
  getThreadView,
  getMessagesForThread,
  addMessage,
  markThreadRead,
  setPresence,
  getPresence,
  getThreadStatus,
  updateDelivery,
};
