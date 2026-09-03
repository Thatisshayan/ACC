'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { evaluate, extractExpression } = require('./safeExpr.js');

describe('safeExpr.evaluate', () => {
  test('evaluates basic arithmetic with correct precedence', () => {
    assert.equal(evaluate('12*(3+4)'), 84);
    assert.equal(evaluate('2+3*4'), 14);
    assert.equal(evaluate('10-2-3'), 5);
    assert.equal(evaluate('2^3^2'), 512); // right-associative power: 2^(3^2)
  });

  test('supports whitelisted functions and constants', () => {
    assert.equal(evaluate('sqrt(16)'), 4);
    assert.equal(evaluate('max(1,5,3)'), 5);
    assert.equal(evaluate('round(pi)'), 3);
  });

  test('supports unary minus', () => {
    assert.equal(evaluate('-5+3'), -2);
    assert.equal(evaluate('4*-2'), -8);
  });

  test('rejects the documented node:vm sandbox-escape payload', () => {
    assert.throws(() => evaluate("this.constructor.constructor('return process')()"));
  });

  test('rejects arbitrary identifiers and property access', () => {
    assert.throws(() => evaluate('process.exit()'));
    assert.throws(() => evaluate('require("fs")'));
    assert.throws(() => evaluate('globalThis'));
  });

  test('rejects Object.prototype member names as function/constant lookups', () => {
    // A plain {}-literal used as a name->function map would resolve these via the
    // inherited prototype chain (FUNCTIONS['constructor'] -> Object) instead of
    // undefined, silently bypassing the whitelist check. Using Map for FUNCTIONS/
    // CONSTANTS closes this off entirely — assert it stays closed.
    assert.throws(() => evaluate('constructor(1)'), /unknown function/);
    assert.throws(() => evaluate('constructor'), /unknown identifier/);
    assert.throws(() => evaluate('toString()'), /unknown function/);
    assert.throws(() => evaluate('hasOwnProperty(1)'), /unknown function/);
    assert.throws(() => evaluate('__proto__'), /unknown identifier/);
  });

  test('rejects empty input', () => {
    assert.throws(() => evaluate(''));
    assert.throws(() => evaluate('   '));
  });
});

describe('safeExpr.extractExpression', () => {
  test('strips known trigger phrases and keeps the math', () => {
    assert.equal(extractExpression('calculate 12 * (3 + 4) please'), '12 * (3 + 4)');
    assert.equal(extractExpression('run code: 1+1'), '1+1');
  });
});
