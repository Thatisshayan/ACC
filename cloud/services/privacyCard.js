'use strict';
// cloud/services/privacyCard.js — Privacy.com API wrapper
// Docs: https://developer.privacy.com/docs

const fetch = require('node-fetch');
const crypto = require('crypto');

const BASE = 'https://api.privacy.com/v1';

function isSandbox() {
  const key = process.env.PRIVACY_API_KEY;
  return !key || key.includes('test_') || key.includes('deferred') || process.env.NODE_ENV !== 'production';
}

function headers() {
  const key = process.env.PRIVACY_API_KEY;
  if (!key && !isSandbox()) throw new Error('PRIVACY_API_KEY not set');
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
  if (isSandbox()) {
    console.log('[privacyCard] Sandbox virtual card created for memo:', memo);
    return {
      token: 'card_token_' + crypto.randomBytes(16).toString('hex'),
      memo,
      type,
      spend_limit: spendLimit || 0,
      spend_limit_duration: spendLimitDuration,
      state: 'OPEN',
      pan: '4111111111111111',
      cvv: '123',
      exp_month: '12',
      exp_year: String(new Date().getFullYear() + 3),
    };
  }

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
  if (isSandbox()) {
    return [
      {
        token: 'card_token_demo_1',
        memo: 'Sandbox Auto-pay card',
        type: 'SINGLE_USE',
        spend_limit: 5000,
        spend_limit_duration: 'TRANSACTION',
        state: 'OPEN',
        pan: '4111111111111111',
        cvv: '123',
        exp_month: '12',
        exp_year: '2029',
      }
    ];
  }

  const res = await fetch(`${BASE}/card`, { headers: headers() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `Privacy.com error ${res.status}`);
  return data.data || [];
}

async function pauseCard(token) {
  if (isSandbox()) {
    return { card_token: token, state: 'PAUSED' };
  }

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
  if (isSandbox()) {
    return { card_token: token, state: 'CLOSED' };
  }

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
