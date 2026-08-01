'use strict';
// cloud/utils/errorMiddleware.js
//
// Express error-handling middleware (4-arg signature). Registered after all
// routes in cloud/server.js so any error that escapes a route handler is
// reported to Sentry and answered with a generic 500 instead of crashing the
// process or returning undefined behavior.

const { captureException } = require('./sentry.js');

function createErrorMiddleware() {
  return function errorMiddleware(err, req, res, next) {
    if (!err) return next();
    captureException(err, { tags: { handler: 'express-error-middleware' } });
    if (res.headersSent) return next(err);
    return res.status(500).json({ success: false, error: 'Internal server error.' });
  };
}

module.exports = { createErrorMiddleware };
