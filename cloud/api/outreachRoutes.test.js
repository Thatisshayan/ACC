'use strict';
// cloud/api/outreachRoutes.test.js — regression coverage for the 2026-09-03 fix:
// GET /unsubscribe interpolated req.query.email straight into an HTML response
// (reflected XSS), and reflected the raw exception message on failure (which
// could carry the same unescaped input back out — xss-through-exception).

const { test, describe, mock } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const outreachRoutes = require('./outreachRoutes.js');
const pipeline = require('../workflows/outreachPipeline.js');

function mount() {
  const app = express();
  app.use(express.json());
  app.use('/api/outreach', outreachRoutes);
  return app;
}

describe('GET /api/outreach/unsubscribe', () => {
  test('reflects the email HTML-escaped, not raw', async () => {
    mock.method(pipeline, 'markUnsubscribed', async () => true);
    try {
      const payload = '<script>alert(1)</script>@example.com';
      const res = await request(mount()).get('/api/outreach/unsubscribe').query({ email: payload });
      assert.equal(res.status, 200);
      assert.doesNotMatch(res.text, /<script>alert\(1\)<\/script>/);
      assert.match(res.text, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    } finally {
      mock.restoreAll();
    }
  });

  test('a failure returns a fixed generic message, not the raw exception text', async () => {
    mock.method(pipeline, 'markUnsubscribed', async () => {
      throw new Error('boom <script>alert(1)</script>');
    });
    try {
      const res = await request(mount()).get('/api/outreach/unsubscribe').query({ email: 'a@b.com' });
      assert.equal(res.status, 500);
      assert.doesNotMatch(res.text, /<script>/);
      assert.doesNotMatch(res.text, /boom/);
    } finally {
      mock.restoreAll();
    }
  });

  test('missing email is a plain 400, no reflection at all', async () => {
    const res = await request(mount()).get('/api/outreach/unsubscribe');
    assert.equal(res.status, 400);
  });
});
