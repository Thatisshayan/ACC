'use strict';
// cloud/api/cardRoutes.js — Agent Credit Card endpoints
// Mount: app.use('/api/card', require('./api/cardRoutes'))
//
// Flow:
//   1. Agent POSTs /api/card/request  → pending request stored, Telegram msg sent to Shayan
//   2. Shayan taps ✅ Approve in Telegram → Privacy.com card created, details stored
//   3. Agent GETs /api/card/:id to retrieve card details after approval

const express  = require('express');
const router   = express.Router();
const { v4: uuidv4 } = require('uuid');
const { createCard, listCards } = require('../services/privacyCard.js');
const { sendCardApprovalRequest } = require('../telegram/cardApprovalBot.js');
const { log } = require('../utils/logger.js');
const { saveCardRequest, loadCardRequests } = require('../storage/supabaseMemory.js');

// In-memory store (survives restarts via Supabase in T8; fine for now)
const pendingRequests = new Map(); // id → request object
const completedCards  = new Map(); // id → card result

// POST /api/card/request
// Body: { agent, purpose, amount, currency?, merchant? }
router.post('/request', async (req, res) => {
  const { agent, purpose, amount, merchant } = req.body || {};
  if (!agent || !purpose || !amount) {
    return res.status(400).json({ success: false, error: 'agent, purpose, and amount (in dollars) are required.' });
  }
  if (typeof amount !== 'number' || amount <= 0 || amount > 10000) {
    return res.status(400).json({ success: false, error: 'amount must be a positive number up to $10,000.' });
  }

  const id = uuidv4();
  const request = {
    id,
    agent,
    purpose,
    amount,
    amountCents: Math.round(amount * 100),
    merchant: merchant || null,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  pendingRequests.set(id, request);
  saveCardRequest(request).catch(() => {});
  log(`[card] New request ${id} — ${agent}: $${amount} for "${purpose}"`);

  // Notify Shayan on Telegram
  try {
    await sendCardApprovalRequest(request);
  } catch (e) {
    log('[card] Telegram notify failed:', e.message);
    // Don't fail the request — it's still pending
  }

  return res.json({ success: true, requestId: id, status: 'pending', message: 'Approval request sent to Shayan via Telegram.' });
});

// GET /api/card/pending — list all pending requests
router.get('/pending', (req, res) => {
  const list = Array.from(pendingRequests.values());
  return res.json({ success: true, count: list.length, requests: list });
});

// GET /api/card/approved — list all approved cards
router.get('/approved', (req, res) => {
  const list = Array.from(completedCards.values());
  return res.json({ success: true, count: list.length, cards: list });
});

// GET /api/card/:id — get status of a specific request
router.get('/:id', (req, res) => {
  const id = req.params.id;
  if (completedCards.has(id)) {
    return res.json({ success: true, status: 'approved', card: completedCards.get(id) });
  }
  if (pendingRequests.has(id)) {
    return res.json({ success: true, status: 'pending', request: pendingRequests.get(id) });
  }
  return res.status(404).json({ success: false, error: 'Request not found.' });
});

// GET /api/card — list all Privacy.com cards (direct from API)
router.get('/', async (req, res) => {
  try {
    const cards = await listCards();
    return res.json({ success: true, count: cards.length, cards });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// Internal: called by cardApprovalBot when Shayan approves
async function approveCardRequest(id) {
  const request = pendingRequests.get(id);
  if (!request) throw new Error(`Card request ${id} not found.`);

  const card = await createCard({
    memo:                `ACC | ${request.agent} | ${request.purpose}`,
    type:                'SINGLE_USE',
    spendLimit:          request.amountCents,
    spendLimitDuration:  'TRANSACTION',
  });

  pendingRequests.delete(id);
  const result = { ...request, status: 'approved', card, approvedAt: new Date().toISOString() };
  completedCards.set(id, result);
  saveCardRequest(result).catch(() => {});
  log(`[card] Approved ${id} — card token: ${card.token}`);
  return result;
}

// Internal: called by cardApprovalBot when Shayan rejects
function rejectCardRequest(id, reason) {
  const request = pendingRequests.get(id);
  if (!request) throw new Error(`Card request ${id} not found.`);
  pendingRequests.delete(id);
  const result = { ...request, status: 'rejected', reason: reason || 'Rejected by Shayan', rejectedAt: new Date().toISOString() };
  completedCards.set(id, result);
  log(`[card] Rejected ${id}`);
  return result;
}

module.exports = router;
module.exports.approveCardRequest = approveCardRequest;
module.exports.rejectCardRequest  = rejectCardRequest;
