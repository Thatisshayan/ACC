'use strict';
// cloud/telegram/cardApprovalBot.js
// Sends card approval requests to Shayan via Telegram inline buttons.
// Handles callback_query for approve/reject.

const fetch = require('node-fetch');
const { log } = require('../utils/logger.js');
const { readSecret } = require('../security/vaultStub.js');

const TELEGRAM_TOKEN = readSecret('TELEGRAM_BOT_TOKEN')     || process.env.TELEGRAM_BOT_TOKEN     || null;
const SHAYAN_CHAT_ID = readSecret('SHAYAN_TELEGRAM_CHAT_ID') || process.env.SHAYAN_TELEGRAM_CHAT_ID
                    || readSecret('SAYAN_TELEGRAM_CHAT_ID')   || process.env.SAYAN_TELEGRAM_CHAT_ID  || null;

function tgApi(method, body) {
  if (!TELEGRAM_TOKEN) return Promise.reject(new Error('[cardApprovalBot] Missing TELEGRAM_BOT_TOKEN'));
  return fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/${method}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  }).then(r => r.json());
}

/**
 * sendCardApprovalRequest — sends an approval message with inline ✅/❌ buttons
 */
async function sendCardApprovalRequest(request) {
  if (!SHAYAN_CHAT_ID) {
    log('[cardApprovalBot] SHAYAN_TELEGRAM_CHAT_ID not set — skipping Telegram notify.');
    return null;
  }

  const text = [
    `💳 *Card Request — Approval Required*`,
    ``,
    `🤖 Agent: \`${request.agent}\``,
    `💰 Amount: *$${request.amount}*`,
    `🎯 Purpose: ${request.purpose}`,
    request.merchant ? `🏪 Merchant: ${request.merchant}` : null,
    `🆔 ID: \`${request.id}\``,
    ``,
    `Tap below to approve or reject:`,
  ].filter(Boolean).join('\n');

  return tgApi('sendMessage', {
    chat_id:    SHAYAN_CHAT_ID,
    text,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ Approve', callback_data: `card_approve_${request.id}` },
        { text: '❌ Reject',  callback_data: `card_reject_${request.id}`  },
      ]],
    },
  });
}

/**
 * handleCardCallback — called from the main bot's callback_query handler
 * Returns true if the callback was a card action, false otherwise.
 */
async function handleCardCallback(callbackQuery) {
  const data   = callbackQuery?.data || '';
  const chatId = callbackQuery?.message?.chat?.id;
  const msgId  = callbackQuery?.message?.message_id;

  if (!data.startsWith('card_approve_') && !data.startsWith('card_reject_')) return false;

  const isApprove = data.startsWith('card_approve_');
  const requestId = data.replace(/^card_(approve|reject)_/, '');

  // Lazy-require to avoid circular dependency
  const { approveCardRequest, rejectCardRequest } = require('../api/cardRoutes.js');

  try {
    if (isApprove) {
      const result = await approveCardRequest(requestId);
      const card   = result.card;
      const reply  = [
        `✅ *Card Approved!*`,
        ``,
        `💳 Card Number: \`${card.pan || 'see Privacy.com'}\``,
        `📅 Expiry: ${card.exp_month || '--'}/${card.exp_year || '--'}`,
        `🔒 CVV: ${card.cvv || 'see Privacy.com'}`,
        `💰 Limit: $${result.amount}`,
        `🤖 Agent: ${result.agent}`,
        `🎯 Purpose: ${result.purpose}`,
      ].join('\n');
      await tgApi('editMessageText', { chat_id: chatId, message_id: msgId, text: reply, parse_mode: 'Markdown' });
    } else {
      rejectCardRequest(requestId);
      await tgApi('editMessageText', {
        chat_id:    chatId,
        message_id: msgId,
        text:       `❌ Card request \`${requestId}\` rejected.`,
        parse_mode: 'Markdown',
      });
    }
  } catch (e) {
    log('[cardApprovalBot] handleCardCallback error:', e.message);
    await tgApi('answerCallbackQuery', { callback_query_id: callbackQuery.id, text: `Error: ${e.message}`, show_alert: true });
  }

  // Acknowledge the button tap
  await tgApi('answerCallbackQuery', { callback_query_id: callbackQuery.id });
  return true;
}

module.exports = { sendCardApprovalRequest, handleCardCallback };
