'use strict';
// cloud/utils/safeRequire.js
//
// Extracted from cloud/server.js so the missing-dependency guard can be unit
// tested in isolation. Tracks load success/failure of optional modules and
// pushes failures to Sentry so a silently-disabled feature actually alerts
// (previously failures only landed in `moduleLoadStatus` + console.error and
// were visible only if someone manually polled GET /admin/modules).
//
// Relative specifiers must resolve against the CALLER's directory (the module
// that required safeRequire — e.g. cloud/server.js), not against this file's
// own directory, to preserve the exact behavior of the original in-file
// functions. `module.createRequire` is built for this.

const path = require('path');
const { createRequire } = require('module');

const { captureException } = require('./sentry.js');

const moduleLoadStatus = {};

function callerRequire() {
  const parent = module.parent; // the module that required this one
  const baseDir = parent && parent.filename ? path.dirname(parent.filename) : __dirname;
  return createRequire(path.join(baseDir, 'safeRequire-noop.js'));
}

function safeRequireWithName(mod, name) {
  const req = callerRequire();
  try {
    const loaded = req(mod);
    moduleLoadStatus[name] = { loaded: true, error: null };
    return loaded;
  } catch (e) {
    moduleLoadStatus[name] = { loaded: false, error: e.message };
    console.error(`[server] LOAD FAIL ${mod}: ${e.message}`);
    captureException(e, { tags: { handler: 'safeRequire', module: name, mod } });
    return null;
  }
}

function safeRequire(mod) {
  return safeRequireWithName(mod, mod);
}

module.exports = { moduleLoadStatus, safeRequire, safeRequireWithName };
