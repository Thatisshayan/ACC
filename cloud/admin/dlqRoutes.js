// cloud/admin/dlqRoutes.js
// Admin API for Dead Letter Queue management.
'use strict';

const express = require('express');
const { listDLQ, getDLQItem, markRequeued, deleteDLQItem } = require('../dlq/handler.js');
const { startGraph } = require('../graphRunner.service.js');
const { log }        = require('../utils/logger.js');

const router = express.Router();

// GET /admin/dlq — list all DLQ items
router.get('/', (req, res) => {
  try {
    const items = listDLQ();
    res.json({ success: true, count: items.length, items });
  } catch (e) {
    log('[dlqRoutes] list error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /admin/dlq/:id — get single item (full record)
router.get('/:id', (req, res) => {
  const item = getDLQItem(req.params.id);
  if (!item) return res.status(404).json({ success: false, error: 'DLQ item not found.' });
  res.json({ success: true, item });
});

// POST /admin/dlq/:id/retry — requeue failed node as a new single-node graph
router.post('/:id/retry', async (req, res) => {
  const item = getDLQItem(req.params.id);
  if (!item) return res.status(404).json({ success: false, error: 'DLQ item not found.' });
  if (item.status === 'requeued') {
    return res.status(400).json({ success: false, error: 'Item already requeued.' });
  }

  try {
    const node = {
      id:        `${item.nodeId}_retry_${Date.now()}`,
      type:      item.nodeType,
      agentType: item.nodeType,
      deps:      [],                  // no deps — standalone retry
      payload:   item.payload,
      metadata:  item.metadata || {},
    };

    const context = {
      ...(item.context || {}),
      retryOf:   item.id,
      requeuedBy: req.body?.approver || 'Admin',
    };

    const { graphId } = await startGraph([node], context, {
      tags: ['dlq-retry', item.graphId],
    });

    markRequeued(item.id);

    log(`[dlqRoutes] Requeued DLQ item ${item.id} as graph ${graphId}`);
    res.json({ success: true, graphId, message: `Node requeued as graph ${graphId}` });
  } catch (e) {
    log('[dlqRoutes] retry error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// DELETE /admin/dlq/:id — permanently remove from DLQ
router.delete('/:id', (req, res) => {
  if (req.body?.confirm_delete !== true) {
    return res.status(400).json({
      success: false,
      error: 'Permanent DLQ deletion requires confirm_delete: true.',
      risk: 'This permanently removes a DLQ audit item from local runtime storage.',
    });
  }
  const deleted = deleteDLQItem(req.params.id);
  if (!deleted) return res.status(404).json({ success: false, error: 'DLQ item not found.' });
  log(`[dlqRoutes] Deleted DLQ item ${req.params.id}`);
  res.json({ success: true, message: 'DLQ item deleted.' });
});

module.exports = router;
