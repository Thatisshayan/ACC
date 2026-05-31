'use strict';

const APPROVAL_WINDOW_MS = 5 * 60 * 1000;
const approvalNonceStore = new Map();

function parseBearerToken(req) {
  const auth = String(req.headers.authorization || '').trim();
  if (!auth.startsWith('Bearer ')) return '';
  return auth.slice(7).trim();
}

function readConfiguredPrincipals() {
  const principals = [];
  const operatorKeys = String(process.env.ACC_OPERATOR_API_KEY || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  const adminKeys = String(process.env.ACC_ADMIN_API_KEY || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  const serviceKeys = String(process.env.TASKBUS_API_KEY || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

  operatorKeys.forEach((key, idx) => principals.push({ key, role: 'operator', subject: `operator-${idx + 1}` }));
  adminKeys.forEach((key, idx) => principals.push({ key, role: 'admin', subject: `admin-${idx + 1}` }));
  serviceKeys.forEach((key, idx) => principals.push({ key, role: 'service', subject: `service-${idx + 1}` }));

  return principals;
}

function buildAuthMetadata() {
  const principals = readConfiguredPrincipals();
  return {
    principals,
    hasConfiguredKeys: principals.length > 0,
    isProduction: process.env.NODE_ENV === 'production',
  };
}

function requireAuth(options) {
  const allowRoles = Array.isArray(options?.allowRoles) && options.allowRoles.length
    ? new Set(options.allowRoles)
    : null;

  return function authMiddleware(req, res, next) {
    const meta = buildAuthMetadata();
    if (meta.isProduction && !meta.hasConfiguredKeys) {
      return res.status(503).json({ success: false, error: 'Protected route locked: auth key not configured.' });
    }
    if (!meta.hasConfiguredKeys) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const token = parseBearerToken(req);
    if (!token) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const principal = meta.principals.find((p) => p.key === token);
    if (!principal) return res.status(401).json({ success: false, error: 'Unauthorized' });
    if (allowRoles && !allowRoles.has(principal.role)) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    req.auth = {
      subject: principal.subject,
      role: principal.role,
      tokenType: principal.role,
    };
    return next();
  };
}

const requireOperatorOrAdmin = requireAuth({ allowRoles: ['operator', 'admin'] });
const requireServiceOperatorOrAdmin = requireAuth({ allowRoles: ['service', 'operator', 'admin'] });

function requireApprovalFreshness(req, res, next) {
  const tsRaw = req.headers['x-approval-timestamp'] || req.body?.timestamp;
  const nonce = String(req.headers['x-approval-nonce'] || req.body?.nonce || '').trim();
  const ts = Number(tsRaw);

  if (!Number.isFinite(ts) || !nonce) {
    return res.status(400).json({ success: false, error: 'Missing approval freshness fields (timestamp, nonce).' });
  }

  const now = Date.now();
  if (Math.abs(now - ts) > APPROVAL_WINDOW_MS) {
    return res.status(400).json({ success: false, error: 'Approval request expired.' });
  }

  const key = `${nonce}:${ts}`;
  if (approvalNonceStore.has(key)) {
    return res.status(409).json({ success: false, error: 'Approval request replay detected.' });
  }
  approvalNonceStore.set(key, now);

  // Best-effort cleanup
  for (const [k, createdAt] of approvalNonceStore.entries()) {
    if (now - createdAt > APPROVAL_WINDOW_MS) {
      approvalNonceStore.delete(k);
    }
  }

  return next();
}

module.exports = {
  requireAuth,
  requireOperatorOrAdmin,
  requireServiceOperatorOrAdmin,
  requireApprovalFreshness,
};
