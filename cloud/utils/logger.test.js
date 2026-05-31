'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

function loadLoggerWithEnv(env) {
  const loggerPath = path.join(__dirname, 'logger.js');
  delete require.cache[require.resolve(loggerPath)];
  const old = { ...process.env };
  Object.assign(process.env, env);
  const logger = require(loggerPath);
  process.env = old;
  return logger;
}

describe('logger debug suppression', () => {
  test('debug suppressed in production', () => {
    const loggerPath = path.join(__dirname, 'logger.js');
    const oldEnv = { ...process.env };
    process.env.NODE_ENV = 'production';
    delete require.cache[require.resolve(loggerPath)];
    const logger = require(loggerPath);

    let called = false;
    const oldLog = console.log;
    console.log = function() { called = true; };
    logger.debug('should-not-print');
    console.log = oldLog;
    process.env = oldEnv;
    assert.equal(called, false);
  });

  test('info prints in production', () => {
    const loggerPath = path.join(__dirname, 'logger.js');
    const oldEnv = { ...process.env };
    process.env.NODE_ENV = 'production';
    delete require.cache[require.resolve(loggerPath)];
    const logger = require(loggerPath);

    let called = false;
    const oldLog = console.log;
    console.log = function() { called = true; };
    logger.info('should-print');
    console.log = oldLog;
    process.env = oldEnv;
    assert.equal(called, true);
  });
});
