'use strict';

const express = require('express');
const {
  getBridgeStatus,
  getBridgePathPrefix,
  handleAlphonsoBridgePacket,
  listPackets
} = require('../services/alphonsoBridgeService.js');

const router = express.Router();

router.get('/status', function(req, res) {
  res.json({
    success: true,
    bridge: getBridgeStatus(),
    pathPrefix: getBridgePathPrefix()
  });
});

router.get('/packets', function(req, res) {
  const limit = Math.min(parseInt(req.query.limit || '20', 10) || 20, 100);
  res.json({
    success: true,
    packets: listPackets(limit),
    limit
  });
});

router.post('/', async function(req, res) {
  try {
    const result = await handleAlphonsoBridgePacket(req.body || {}, {
      headers: req.headers,
      ip: req.ip,
      path: req.path
    });
    return res.status(result.httpStatus || (result.success ? 200 : 400)).json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      status: 'failed',
      error: error.message,
      bridge: getBridgeStatus()
    });
  }
});

module.exports = router;
