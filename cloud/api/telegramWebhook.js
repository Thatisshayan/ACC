// cloud/api/telegramWebhook.js
// Receives Telegram webhook updates and routes to approvalBot handler.

const express       = require("express");
const { handleTelegramUpdate } = require("../telegram/approvalBot.js");

const router = express.Router();

router.post("/telegram/webhook", async (req, res) => {
  try {
    await handleTelegramUpdate(req.body);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
