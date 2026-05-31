'use strict';
// cloud/utils/logger.js

const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const MIN_LEVEL = process.env.NODE_ENV === 'production' ? LEVELS.INFO : LEVELS.DEBUG;

function _emit(level, ...args) {
  if ((LEVELS[level] ?? 1) < MIN_LEVEL) return;
  const ts = new Date().toISOString();
  const prefix = `[ACC][${level}]`;
  if (level === 'ERROR') console.error(prefix, ...args);
  else if (level === 'WARN') console.warn(prefix, ...args);
  else console.log(prefix, ...args);
}

function log(...args)   { _emit('INFO',  ...args); }
function debug(...args) { _emit('DEBUG', ...args); }
function info(...args)  { _emit('INFO',  ...args); }
function warn(...args)  { _emit('WARN',  ...args); }
function error(...args) { _emit('ERROR', ...args); }

module.exports = { log, debug, info, warn, error };
