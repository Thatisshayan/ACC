'use strict';

const axios = require('axios');
const store = require('./store.js');
const telegramUsers = require('../telegram/users.js');
const { getBridgeStatus } = require('../services/alphonsoBridgeService.js');

const TELEGRAM_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();

function getTelegramChatId(user) {
  if (!user) return null;
  return user.telegramChatId || user.telegram_chat_id || user.telegram_chatid || user.telegram_id || null;
}

function makeTelegramClient() {
  if (!TELEGRAM_TOKEN) return null;
  return axios.create({
    baseURL: `https://api.telegram.org/bot${TELEGRAM_TOKEN}`,
    timeout: 15000,
  });
}

async function mirrorMessageToTelegram(messageView) {
  const client = makeTelegramClient();
  if (!client) return { mirrored: false, reason: 'telegram_not_configured' };

  const recipients = (messageView.recipientIds || [])
    .map((userId) => telegramUsers.getUserProfile(String(userId)))
    .filter(Boolean)
    .map((user) => ({ user, chatId: getTelegramChatId(user) }))
    .filter((item) => Boolean(item.chatId));

  if (!recipients.length) {
    return { mirrored: false, reason: 'no_telegram_recipients' };
  }

  const sender = store.resolveUser(messageView.senderId);
  const preview = String(messageView.content || '').slice(0, 160) || '(empty message)';
  const text = [
    '💬 *ACC private message*',
    `From: ${sender && sender.name ? sender.name : messageView.senderId}`,
    `Thread: ${messageView.threadId.slice(0, 8)}`,
    '',
    preview,
  ].join('\n');

  const results = [];
  for (const recipient of recipients) {
    try {
      const res = await client.post('/sendMessage', {
        chat_id: recipient.chatId,
        text,
        parse_mode: 'Markdown',
      });
      results.push({ userId: recipient.user.id, ok: Boolean(res.data && res.data.ok) });
    } catch (err) {
      results.push({ userId: recipient.user.id, ok: false, error: err.message });
    }
  }

  return { mirrored: true, results };
}

function resolveRecipientList(payload) {
  const recipientIds = Array.isArray(payload.recipientIds) ? payload.recipientIds : [];
  if (recipientIds.length) return recipientIds.map(String);
  if (payload.recipientId) return [String(payload.recipientId)];
  return [];
}

function createThread(payload) {
  const thread = store.ensureThread({
    participantIds: payload.participantIds || [payload.senderId].concat(resolveRecipientList(payload)),
    senderId: payload.senderId,
    subject: payload.subject,
    transport: payload.transport || 'in_app',
    createdBy: payload.createdBy || payload.senderId,
  });
  return { thread, threadView: store.getThreadView(thread, payload.viewerId || payload.senderId) };
}

async function sendMessage(payload) {
  const message = store.addMessage({
    threadId: payload.threadId,
    senderId: payload.senderId,
    recipientIds: resolveRecipientList(payload),
    content: payload.content,
    subject: payload.subject,
    attachments: payload.attachments || [],
    meta: payload.meta || {},
    senderType: payload.senderType || 'user',
    transport: payload.transport || 'in_app',
    createdBy: payload.createdBy || payload.senderId,
    clientMessageId: payload.clientMessageId || null,
  });

  const delivery = await mirrorMessageToTelegram(message);
  return {
    success: true,
    message,
    delivery,
    thread: store.getThreadView(store.findThreadById(message.threadId), payload.viewerId || payload.senderId),
  };
}

function listInbox(userId) {
  return {
    success: true,
    userId: String(userId),
    threads: store.listThreadsForUser(userId),
  };
}

function getThread(threadId, viewerId) {
  const thread = store.findThreadById(threadId);
  if (!thread) return null;
  return {
    success: true,
    thread: store.getThreadView(thread, viewerId),
    messages: store.getMessagesForThread(threadId),
  };
}

function markRead(payload) {
  return store.markThreadRead(payload.threadId, payload.userId, payload.messageId || null);
}

function updatePresence(payload) {
  return store.setPresence(payload.userId, payload.status || 'online', {
    device: payload.device || 'web',
    threadId: payload.threadId || null,
  });
}

function searchUserByQuery(query) {
  const text = String(query || '').trim().toLowerCase();
  if (!text) return null;
  const exact = store.listUsers().find((user) => String(user.id) === text || String(user.name || '').toLowerCase() === text);
  if (exact) return exact;
  return store.listUsers().find((user) => {
    const name = String(user.name || '').toLowerCase();
    return name.includes(text) || String(user.id).includes(text);
  }) || null;
}

function parseAssistantIntent(text) {
  const input = String(text || '').trim();
  const lower = input.toLowerCase();

  if (!input) {
    return { intent: 'assistant.idle', confidence: 0, arguments: {}, needsClarification: false };
  }

  if (/\b(status|health|dashboard)\b/.test(lower)) {
    return { intent: 'system.status', confidence: 0.9, arguments: {}, needsClarification: false };
  }

  if (/\b(inbox|messages|threads)\b/.test(lower) && !/\b(send|message to|dm|text)\b/.test(lower)) {
    return { intent: 'messenger.inbox', confidence: 0.85, arguments: {}, needsClarification: false };
  }

  const sendMatch = input.match(/^(?:send|message|dm|text)\s+(?:to\s+)?([^:]+?)(?:\s*[:,-]\s*|\s+)(.+)$/i);
  if (sendMatch) {
    return {
      intent: 'messenger.send',
      confidence: 0.92,
      arguments: {
        recipientQuery: sendMatch[1].trim(),
        content: sendMatch[2].trim(),
      },
      needsClarification: false,
    };
  }

  const toMatch = input.match(/^(?:send|message|dm)\s+to\s+(.+?)\s+(?:about|:|-)\s+(.+)$/i);
  if (toMatch) {
    return {
      intent: 'messenger.send',
      confidence: 0.9,
      arguments: {
        recipientQuery: toMatch[1].trim(),
        content: toMatch[2].trim(),
      },
      needsClarification: false,
    };
  }

  return {
    intent: 'assistant.chat',
    confidence: 0.4,
    arguments: {},
    needsClarification: false,
  };
}

async function executeAssistantIntent(payload) {
  const userId = String(payload.userId || payload.senderId || '').trim();
  const parsed = payload.intent ? {
    intent: payload.intent,
    arguments: payload.arguments || {},
    confidence: typeof payload.confidence === 'number' ? payload.confidence : 1,
    needsClarification: Boolean(payload.needsClarification),
  } : parseAssistantIntent(payload.text || payload.prompt || '');
  const text = String(payload.text || payload.prompt || '');

  if (!userId) {
    throw new Error('userId is required');
  }

  if (parsed.intent === 'system.status') {
    const bridge = getBridgeStatus ? getBridgeStatus() : {};
    const messenger = getStatus();
    return {
      success: true,
      intent: 'system.status',
      message: 'System status loaded.',
      data: {
        backend: { status: 'ok' },
        bridge,
        messenger,
      },
    };
  }

  if (parsed.intent === 'messenger.inbox') {
    return Object.assign({ intent: 'messenger.inbox' }, listInbox(userId));
  }

  if (parsed.intent === 'messenger.send') {
    const recipientQuery = String(payload.recipientId || payload.recipientQuery || parsed.arguments.recipientQuery || '').trim();
    const content = String(payload.content || parsed.arguments.content || text).trim();
    if (!recipientQuery) {
      return {
        success: false,
        intent: parsed.intent,
        needsClarification: true,
        questions: ['Who should receive the message?'],
      };
    }
    if (!content) {
      return {
        success: false,
        intent: parsed.intent,
        needsClarification: true,
        questions: ['What should the message say?'],
      };
    }

    const recipient = searchUserByQuery(recipientQuery);
    if (!recipient) {
      return {
        success: false,
        intent: parsed.intent,
        needsClarification: true,
        questions: [`I could not find "${recipientQuery}". Who should I send it to?`],
      };
    }

    const result = await sendMessage({
      senderId: userId,
      recipientIds: [recipient.id],
      content,
      subject: payload.subject || '',
      attachments: payload.attachments || [],
      meta: payload.meta || {},
      transport: payload.transport || 'in_app',
      senderType: payload.senderType || 'user',
    });

    return Object.assign({
      success: true,
      intent: parsed.intent,
      recipient,
    }, result);
  }

  return {
    success: true,
    intent: parsed.intent,
    message: text ? `Understood: ${text}` : 'Ready.',
    data: {
      parsed,
    },
  };
}

function getStatus() {
  const state = store.getThreadStatus();
  const hasKey = Boolean(String(process.env.ACC_MESSENGER_MASTER_KEY || process.env.ACC_VAULT_MASTER_KEY || process.env.ACC_APPROVAL_HMAC_SECRET || '').trim());
  return {
    status: 'ready',
    keySource: state.keySource,
    keyConfigured: hasKey || state.keySource === 'local-file',
    threads: state.threads,
    messages: state.messages,
    presences: state.activePresences,
    updatedAt: state.updatedAt,
  };
}

module.exports = {
  createThread,
  sendMessage,
  listInbox,
  getThread,
  markRead,
  updatePresence,
  parseAssistantIntent,
  executeAssistantIntent,
  getStatus,
  listUsers: store.listUsers,
  resolveRecipient: searchUserByQuery,
};
