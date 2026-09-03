'use strict';
// cloud/utils/safeExpr.js — dependency-free arithmetic expression evaluator.
//
// Built to replace running raw user chat text through node:vm for the assistant's
// "calculate / compute" intent (see cloud/messages/service.js). This is NOT a
// general-purpose interpreter: it tokenizes and parses numbers, + - * / % ^, unary
// +/-, parentheses, a small whitelist of Math functions, and the constants pi/e —
// nothing else. There is no eval, no Function constructor, no vm, no property
// access, no identifiers beyond the whitelist below, so there is no code-execution
// surface to escape from.

const FUNCTIONS = {
  abs:   Math.abs,
  round: Math.round,
  floor: Math.floor,
  ceil:  Math.ceil,
  sqrt:  Math.sqrt,
  min:   (...a) => Math.min(...a),
  max:   (...a) => Math.max(...a),
  pow:   (a, b) => Math.pow(a, b),
  log:   Math.log,
  log10: Math.log10,
};

const CONSTANTS = { pi: Math.PI, e: Math.E };

const TOKEN_RE = /\s*([0-9]+\.?[0-9]*|\.[0-9]+|[A-Za-z_][A-Za-z0-9_]*|\*\*|[()+\-*/%^,])/y;

function tokenize(expr) {
  const tokens = [];
  let pos = 0;
  TOKEN_RE.lastIndex = 0;
  const str = String(expr);
  while (pos < str.length) {
    TOKEN_RE.lastIndex = pos;
    const m = TOKEN_RE.exec(str);
    if (!m || m.index !== pos) {
      const rest = str.slice(pos).trim();
      if (!rest) break;
      throw new Error(`safeExpr: unexpected character near "${rest.slice(0, 12)}"`);
    }
    tokens.push(m[1]);
    pos = TOKEN_RE.lastIndex;
  }
  return tokens;
}

// Recursive-descent parser, precedence: + - < * / % < unary < ^ (right-assoc) < call/paren
function parse(tokens) {
  let i = 0;
  const peek = () => tokens[i];
  const next = () => tokens[i++];

  function parseExpr() { return parseAddSub(); }

  function parseAddSub() {
    let left = parseMulDiv();
    while (peek() === '+' || peek() === '-') {
      const op = next();
      const right = parseMulDiv();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  function parseMulDiv() {
    let left = parseUnary();
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const op = next();
      const right = parseUnary();
      if (op === '*') left = left * right;
      else if (op === '/') left = left / right;
      else left = left % right;
    }
    return left;
  }

  function parseUnary() {
    if (peek() === '-') { next(); return -parseUnary(); }
    if (peek() === '+') { next(); return parseUnary(); }
    return parsePow();
  }

  function parsePow() {
    const base = parseAtom();
    if (peek() === '^' || peek() === '**') {
      next();
      const exp = parseUnary(); // right-associative
      return Math.pow(base, exp);
    }
    return base;
  }

  function parseAtom() {
    const tok = peek();
    if (tok === undefined) throw new Error('safeExpr: unexpected end of expression');

    if (tok === '(') {
      next();
      const val = parseExpr();
      if (next() !== ')') throw new Error('safeExpr: expected ")"');
      return val;
    }

    if (/^[0-9.]/.test(tok)) {
      next();
      const n = Number(tok);
      if (!Number.isFinite(n)) throw new Error(`safeExpr: invalid number "${tok}"`);
      return n;
    }

    if (/^[A-Za-z_]/.test(tok)) {
      next();
      const name = tok.toLowerCase();
      if (peek() === '(') {
        next();
        const args = [];
        if (peek() !== ')') {
          args.push(parseExpr());
          while (peek() === ',') { next(); args.push(parseExpr()); }
        }
        if (next() !== ')') throw new Error('safeExpr: expected ")"');
        const fn = FUNCTIONS[name];
        if (!fn) throw new Error(`safeExpr: unknown function "${name}"`);
        return fn(...args);
      }
      if (name in CONSTANTS) return CONSTANTS[name];
      throw new Error(`safeExpr: unknown identifier "${name}"`);
    }

    throw new Error(`safeExpr: unexpected token "${tok}"`);
  }

  const result = parseExpr();
  if (i !== tokens.length) throw new Error(`safeExpr: unexpected trailing token "${tokens[i]}"`);
  return result;
}

/**
 * evaluate — parse and compute a pure arithmetic expression.
 * Throws on anything outside numbers/operators/whitelisted functions.
 */
function evaluate(expr) {
  const tokens = tokenize(expr);
  if (!tokens.length) throw new Error('safeExpr: empty expression');
  return parse(tokens);
}

/**
 * extractExpression — best-effort pull of "the math part" out of a natural-language
 * prompt like "calculate 12 * (3 + 4) please", by stripping known trigger phrases and
 * keeping only characters the evaluator understands.
 */
function extractExpression(prompt) {
  const stripped = String(prompt || '')
    .replace(/\b(run code|execute code|run this|eval(?:uate)?|calculate|compute|please|what'?s|what is)\b/gi, ' ')
    .trim();
  const match = stripped.match(/[0-9a-zA-Z_.,()+\-*/%^\s]+/);
  return match ? match[0].trim() : '';
}

module.exports = { evaluate, extractExpression };
