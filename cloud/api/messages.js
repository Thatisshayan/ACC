'use strict';

const express = require('express');
const messages = require('../messages/service.js');
const telegramUsers = require('../telegram/users.js');

const router = express.Router();

function resolveUserId(req) {
  return String(req.body?.userId || req.query?.userId || req.headers['x-acc-user-id'] || '').trim();
}

router.get('/status', function(req, res) {
  try {
    res.json({
      success: true,
      messenger: messages.getStatus(),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/users', function(req, res) {
  try {
    res.json({
      success: true,
      users: messages.listUsers(),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/users', async function(req, res) {
  try {
    const userId = String(req.body?.userId || '').trim();
    if (!userId) return res.status(400).json({ success: false, error: 'userId is required' });
    const existing = await telegramUsers.ensureUserProfile(userId);
    const updated = telegramUsers.updateUser(userId, {
      name: req.body?.name !== undefined ? req.body.name : existing?.name || null,
      role: req.body?.role !== undefined ? req.body.role : existing?.role || 'member',
      language: req.body?.language !== undefined ? req.body.language : existing?.language || 'en',
      telegramChatId: req.body?.telegramChatId !== undefined ? req.body.telegramChatId : existing?.telegramChatId || null,
    });
    res.json({
      success: true,
      user: {
        id: String(updated.id),
        name: updated.name || null,
        role: updated.role || 'member',
        state: updated.state || 'ready',
        language: updated.language || 'en',
        telegramChatId: Boolean(updated.telegramChatId),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/inbox', function(req, res) {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(400).json({ success: false, error: 'userId is required' });
    res.json(Object.assign({ timestamp: new Date().toISOString() }, messages.listInbox(userId)));
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/threads', function(req, res) {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(400).json({ success: false, error: 'userId is required' });
    res.json(Object.assign({ success: true, timestamp: new Date().toISOString() }, messages.listInbox(userId)));
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/threads', function(req, res) {
  try {
    const senderId = String(req.body?.senderId || '').trim();
    const recipientId = String(req.body?.recipientId || '').trim();
    if (!senderId) return res.status(400).json({ success: false, error: 'senderId is required' });
    if (!recipientId && !Array.isArray(req.body?.participantIds)) {
      return res.status(400).json({ success: false, error: 'recipientId or participantIds is required' });
    }
    const created = messages.createThread({
      senderId,
      recipientId,
      participantIds: req.body?.participantIds,
      subject: req.body?.subject || '',
      transport: req.body?.transport || 'in_app',
      createdBy: req.body?.createdBy || senderId,
      viewerId: req.body?.viewerId || senderId,
    });
    res.json({ success: true, timestamp: new Date().toISOString(), thread: created.threadView, threadId: created.thread.id });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/threads/:id', function(req, res) {
  try {
    const viewerId = resolveUserId(req);
    const thread = messages.getThread(req.params.id, viewerId);
    if (!thread) return res.status(404).json({ success: false, error: 'Thread not found' });
    res.json(Object.assign({ timestamp: new Date().toISOString() }, thread));
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/send', async function(req, res) {
  try {
    const senderId = String(req.body?.senderId || '').trim();
    if (!senderId) return res.status(400).json({ success: false, error: 'senderId is required' });
    const result = await messages.sendMessage({
      threadId: req.body?.threadId,
      senderId,
      recipientId: req.body?.recipientId,
      recipientIds: req.body?.recipientIds,
      content: req.body?.content,
      subject: req.body?.subject || '',
      attachments: req.body?.attachments || [],
      meta: req.body?.meta || {},
      senderType: req.body?.senderType || 'user',
      transport: req.body?.transport || 'in_app',
      viewerId: req.body?.viewerId || senderId,
      createdBy: req.body?.createdBy || senderId,
      clientMessageId: req.body?.clientMessageId || null,
    });
    res.json(Object.assign({ timestamp: new Date().toISOString() }, result));
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/read', function(req, res) {
  try {
    const userId = String(req.body?.userId || '').trim();
    const threadId = String(req.body?.threadId || '').trim();
    if (!userId) return res.status(400).json({ success: false, error: 'userId is required' });
    if (!threadId) return res.status(400).json({ success: false, error: 'threadId is required' });
    const result = messages.markRead({ userId, threadId, messageId: req.body?.messageId || null });
    res.json(Object.assign({ success: true, timestamp: new Date().toISOString() }, result));
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/presence', function(req, res) {
  try {
    const userId = String(req.body?.userId || '').trim();
    if (!userId) return res.status(400).json({ success: false, error: 'userId is required' });
    const result = messages.updatePresence({
      userId,
      status: req.body?.status || 'online',
      device: req.body?.device || 'web',
      threadId: req.body?.threadId || null,
    });
    res.json({ success: true, presence: result, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
