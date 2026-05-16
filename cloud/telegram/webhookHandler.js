// cloud/telegram/webhookHandler.js
const express = require('express');
const router = express.Router();

// Webhook handler for Telegram updates
router.post('/webhook/telegram', async (req, res) => {
  try {
    // Return 200 immediately (don't wait for processing)
    res.status(200).json({ ok: true });

    // Process update asynchronously in background
    const update = req.body;
    
    if (!update) {
      console.log('[webhook] No update body');
      return;
    }

    console.log('[webhook] Received update:', update.update_id);

    // Handle message
    if (update.message) {
      const message = update.message;
      console.log('[webhook] Message from', message.from?.id, ':', message.text);
      // Route to command handler
      // (existing command logic can go here)
    }

    // Handle callback query (buttons)
    if (update.callback_query) {
      const query = update.callback_query;
      console.log('[webhook] Callback from', query.from?.id, ':', query.data);
      // Route to approval/button handler
    }

  } catch (error) {
    console.error('[webhook] Error:', error);
    res.status(200).json({ ok: true }); // Still return 200 to Telegram
  }
});

module.exports = router;