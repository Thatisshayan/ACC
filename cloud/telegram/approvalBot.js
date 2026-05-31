// cloud/telegram/approvalBot.js
// Sends approval requests to Shayan via Telegram.
// Handles /approve_<id> and /reject_<id> commands.

const fetch      = require("node-fetch");
const { getSnapshot, approveSnapshot, deleteSnapshot } = require("../security/ephemeralSnapshots.js");
const { log }    = require("../utils/logger.js");
const { readSecret } = require("../security/vaultStub.js");

// Vault-aware: vault first, then env fallback
const TELEGRAM_TOKEN = readSecret("TELEGRAM_BOT_TOKEN")    || process.env.TELEGRAM_BOT_TOKEN    || null;
const SHAYAN_CHAT_ID = readSecret("ACC_OWNER_TELEGRAM_CHAT_ID") || process.env.ACC_OWNER_TELEGRAM_CHAT_ID
                    || readSecret("SHAYAN_TELEGRAM_CHAT_ID")   || process.env.SHAYAN_TELEGRAM_CHAT_ID
                    || readSecret("SAYAN_TELEGRAM_CHAT_ID")    || process.env.SAYAN_TELEGRAM_CHAT_ID || null;

function tgApi(method, body) {
  if (!TELEGRAM_TOKEN) return Promise.reject(new Error("[approvalBot] Missing TELEGRAM_BOT_TOKEN"));
  return fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/${method}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  }).then(r => r.json());
}

/**
 * notifyApprovalRequest
 * Sends Shayan a Telegram message with approve/reject commands.
 */
async function notifyApprovalRequest({ snapshotId, summary }) {
  if (!SHAYAN_CHAT_ID) {
    log("[approvalBot] SHAYAN_TELEGRAM_CHAT_ID not set — cannot send approval request.");
    return null;
  }

  const text = [
    `⚠️ *Approval required*`,
    `Snapshot: \`${snapshotId}\``,
    `Summary: ${summary}`,
    ``,
    `✅ Approve: /approve\\_${snapshotId}`,
    `❌ Reject:  /reject\\_${snapshotId}`,
  ].join("\n");

  try {
    const res = await tgApi("sendMessage", {
      chat_id:    SHAYAN_CHAT_ID,
      text,
      parse_mode: "Markdown",
    });
    return res;
  } catch (e) {
    log("[approvalBot] Telegram notify failed:", e.message);
    return null;
  }
}

/**
 * handleTelegramUpdate
 * Processes incoming Telegram updates for approval/rejection commands.
 * Call this from your bot's message handler or webhook.
 */
async function handleTelegramUpdate(update) {
  try {
    // Route inline button callbacks (card approvals, etc.)
    if (update.callback_query) {
      const { handleCardCallback } = require('./cardApprovalBot.js');
      const handled = await handleCardCallback(update.callback_query);
      if (handled) return;
    }

    const message = update.message || update.edited_message;
    if (!message?.text) return;

    const text   = message.text.trim();
    const chatId = message.chat.id;

    if (!text.startsWith("/approve_") && !text.startsWith("/reject_")) return;

    // Parse: /approve_snap_123456_abc or /reject_snap_123456_abc
    const isApprove  = text.startsWith("/approve_");
    const snapshotId = text.replace(/^\/(approve|reject)_/, "");

    if (!snapshotId) {
      await tgApi("sendMessage", { chat_id: chatId, text: "Invalid command format." });
      return;
    }

    const snap = getSnapshot(snapshotId);
    if (!snap) {
      await tgApi("sendMessage", { chat_id: chatId, text: `Snapshot \`${snapshotId}\` not found or already processed.` });
      return;
    }

    if (isApprove) {
      approveSnapshot(snapshotId);
      await tgApi("sendMessage", { chat_id: chatId, text: `✅ Snapshot \`${snapshotId}\` approved.` });
      log("[approvalBot] Snapshot approved via Telegram:", snapshotId, "by", message.from?.username || chatId);
    } else {
      deleteSnapshot(snapshotId);
      await tgApi("sendMessage", { chat_id: chatId, text: `❌ Snapshot \`${snapshotId}\` rejected and deleted.` });
      log("[approvalBot] Snapshot rejected via Telegram:", snapshotId, "by", message.from?.username || chatId);
    }
  } catch (e) {
    log("[approvalBot] handleTelegramUpdate error:", e.message);
  }
}

module.exports = { notifyApprovalRequest, handleTelegramUpdate };
