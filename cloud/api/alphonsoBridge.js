'use strict';

const express = require('express');
const {
  authorizeBridgeRequest,
  getBridgeStatus,
  getBridgePathPrefix,
  handleAlphonsoBridgePacket,
  listPackets
} = require('../services/alphonsoBridgeService.js');

const router = express.Router();

// Guard for read endpoints. POST / carries its own auth (handleAlphonsoBridgePacket),
// so the shared Bearer token check only needs to be applied here.
function requireBridgeToken(req, res, next) {
  const auth = authorizeBridgeRequest(req.headers);
  if (!auth.ok) {
    return res.status(auth.statusCode).json({
      success: false,
      status: auth.code,
      httpStatus: auth.statusCode,
      error: auth.error,
      retryAfterMs: auth.retryAfterMs || null,
      bridge: getBridgeStatus()
    });
  }
  return next();
}

router.get('/status', requireBridgeToken, function(req, res) {
  res.json({
    success: true,
    bridge: getBridgeStatus(),
    pathPrefix: getBridgePathPrefix()
  });
});

router.get('/packets', requireBridgeToken, function(req, res) {
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
