// cloud/api/telegramWebhook.js
// Receives Telegram webhook updates and routes to approvalBot handler.
// Validates X-Telegram-Bot-Api-Secret-Token when TELEGRAM_WEBHOOK_SECRET is set.

const express       = require("express");
const { handleTelegramUpdate }  = require("../telegram/approvalBot.js");
const { requireTelegramSecret } = require("../security/webhookHmac.js");

const router = express.Router();

router.post("/telegram/webhook", requireTelegramSecret(), async (req, res) => {
  try {
    await handleTelegramUpdate(req.body);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
