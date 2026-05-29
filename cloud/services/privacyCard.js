'use strict';
// cloud/services/privacyCard.js — Privacy.com API wrapper
// Docs: https://developer.privacy.com/docs

const fetch = require('node-fetch');

const BASE = 'https://api.privacy.com/v1';

function headers() {
  const key = process.env.PRIVACY_API_KEY;
  if (!key) throw new Error('PRIVACY_API_KEY not set');
  return { 'Authorization': `api-key ${key}`, 'Content-Type': 'application/json' };
}

/**
 * createCard
 * @param {object} opts
 * @param {string} opts.memo       - Card label (agent name + purpose)
 * @param {'SINGLE_USE'|'MERCHANT_LOCKED'|'UNLOCKED'} opts.type
 * @param {number} opts.spendLimit - Spend limit in cents
 * @param {'TRANSACTION'|'MONTHLY'|'ANNUALLY'|'FOREVER'} opts.spendLimitDuration
 */
async function createCard({ memo, type = 'SINGLE_USE', spendLimit, spendLimitDuration = 'TRANSACTION' }) {
  const body = { memo, type, spend_limit: spendLimit, spend_limit_duration: spendLimitDuration };
  const res = await fetch(`${BASE}/card`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `Privacy.com error ${res.status}`);
  return data;
}

async function listCards() {
  const res = await fetch(`${BASE}/card`, { headers: headers() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `Privacy.com error ${res.status}`);
  return data.data || [];
}

async function pauseCard(token) {
  const res = await fetch(`${BASE}/card`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({ card_token: token, state: 'PAUSED' }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `Privacy.com error ${res.status}`);
  return data;
}

async function closeCard(token) {
  const res = await fetch(`${BASE}/card`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({ card_token: token, state: 'CLOSED' }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `Privacy.com error ${res.status}`);
  return data;
}

module.exports = { createCard, listCards, pauseCard, closeCard };
