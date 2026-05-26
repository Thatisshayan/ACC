'use strict';
// cloud/connectors/stripe.js
// Real Stripe SDK connector — replaces the previous stub.
// Requires: STRIPE_API_KEY (sk_live_... or sk_test_...)
// Optional: STRIPE_WEBHOOK_SECRET for webhook signature verification

const { BaseConnector } = require('./baseConnector.js');

class StripeConnector extends BaseConnector {
  constructor(config = {}) {
    super({
      name:    config.name    || 'stripe',
      version: config.version || '2.0.0',
      apiKey:  config.apiKey  || process.env.STRIPE_API_KEY || null,
      enabled: config.enabled ?? true,
    });
    if (!this.apiKey) {
      console.warn('[stripe] STRIPE_API_KEY not set — connector disabled');
    } else {
      // Lazy-init the Stripe client so startup doesn't throw if key is missing
      this._stripe = require('stripe')(this.apiKey);
    }
  }

  _client() {
    if (!this._stripe) throw new Error('Stripe: STRIPE_API_KEY not set');
    return this._stripe;
  }

  // ── Health check ─────────────────────────────────────────────────────────
  async checkHealth() {
    if (!this.apiKey) return { status: 'disabled', note: 'STRIPE_API_KEY missing' };
    try {
      const balance = await this._client().balance.retrieve();
      const available = balance.available.map(b => `${(b.amount / 100).toFixed(2)} ${b.currency.toUpperCase()}`).join(', ');
      return { status: 'connected', available };
    } catch (e) {
      return { status: 'error', error: e.message };
    }
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  async run(action, payload = {}) {
    const v = this.validate();
    if (!v.success) return v;
    if (!this.apiKey) return { success: false, error: 'Stripe: STRIPE_API_KEY not set' };

    try {
      if (action === 'createInvoice')   return await this._createInvoice(payload);
      if (action === 'checkPayment')    return await this._checkPayment(payload);
      if (action === 'generateReport')  return await this._generateReport(payload);
      if (action === 'createCustomer')  return await this._createCustomer(payload);
      if (action === 'listCharges')     return await this._listCharges(payload);
      return { success: false, error: `Stripe: unknown action "${action}"` };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // Create an invoice for a customer.
  // payload: { customerId?, customerEmail?, amount (cents), currency?, description? }
  async _createInvoice(payload) {
    const stripe = this._client();
    const currency = (payload.currency || 'usd').toLowerCase();

    let customerId = payload.customerId;
    if (!customerId && payload.customerEmail) {
      const list = await stripe.customers.list({ email: payload.customerEmail, limit: 1 });
      if (list.data.length > 0) {
        customerId = list.data[0].id;
      } else {
        const c = await stripe.customers.create({ email: payload.customerEmail });
        customerId = c.id;
      }
    }
    if (!customerId) return { success: false, error: 'createInvoice requires customerId or customerEmail' };
    if (!payload.amount || payload.amount <= 0) return { success: false, error: 'createInvoice requires amount > 0 (in cents)' };

    await stripe.invoiceItems.create({
      customer:    customerId,
      amount:      payload.amount,
      currency,
      description: payload.description || 'ACC Service',
    });

    const invoice = await stripe.invoices.create({
      customer:         customerId,
      auto_advance:     false,
      collection_method: 'send_invoice',
      days_until_due:   30,
    });

    return {
      success: true,
      output: {
        invoiceId:  invoice.id,
        status:     invoice.status,
        amount:     invoice.amount_due,
        currency:   invoice.currency,
        hostedUrl:  invoice.hosted_invoice_url,
        pdfUrl:     invoice.invoice_pdf,
      },
    };
  }

  // Retrieve a PaymentIntent by ID.
  // payload: { paymentId }
  async _checkPayment(payload) {
    if (!payload.paymentId) return { success: false, error: 'checkPayment requires paymentId' };
    const stripe = this._client();
    const pi = await stripe.paymentIntents.retrieve(payload.paymentId);
    return {
      success: true,
      output: {
        paymentId: pi.id,
        status:    pi.status,
        amount:    pi.amount,
        currency:  pi.currency,
        created:   new Date(pi.created * 1000).toISOString(),
      },
    };
  }

  // Balance + recent charges summary.
  // payload: { limit? }
  async _generateReport(payload) {
    const stripe = this._client();
    const [balance, charges] = await Promise.all([
      stripe.balance.retrieve(),
      stripe.charges.list({ limit: payload.limit || 10 }),
    ]);
    const available = balance.available.map(b => ({ amount: b.amount, currency: b.currency }));
    const pending   = balance.pending.map(b => ({ amount: b.amount, currency: b.currency }));
    return {
      success: true,
      output: {
        balance:   { available, pending },
        recentCharges: charges.data.map(c => ({
          id:       c.id,
          amount:   c.amount,
          currency: c.currency,
          status:   c.status,
          created:  new Date(c.created * 1000).toISOString(),
        })),
      },
    };
  }

  // Create or retrieve a customer by email.
  // payload: { email, name?, metadata? }
  async _createCustomer(payload) {
    if (!payload.email) return { success: false, error: 'createCustomer requires email' };
    const stripe = this._client();
    const existing = await stripe.customers.list({ email: payload.email, limit: 1 });
    if (existing.data.length > 0) {
      const c = existing.data[0];
      return { success: true, output: { customerId: c.id, email: c.email, existing: true } };
    }
    const c = await stripe.customers.create({
      email:    payload.email,
      name:     payload.name,
      metadata: payload.metadata || {},
    });
    return { success: true, output: { customerId: c.id, email: c.email, existing: false } };
  }

  // List recent charges with optional filter.
  // payload: { limit?, customerId? }
  async _listCharges(payload) {
    const stripe = this._client();
    const params = { limit: Math.min(payload.limit || 20, 100) };
    if (payload.customerId) params.customer = payload.customerId;
    const charges = await stripe.charges.list(params);
    return {
      success: true,
      output: charges.data.map(c => ({
        id: c.id, amount: c.amount, currency: c.currency,
        status: c.status, description: c.description,
        created: new Date(c.created * 1000).toISOString(),
      })),
    };
  }
}

module.exports = { StripeConnector };
