'use strict';
// cloud/connectors/twilio.js — Twilio REST API wrapper (no SDK, just fetch)

const fetch = require('node-fetch');

function creds() {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required.');
  return { sid, token, auth: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64') };
}

function from() {
  const n = process.env.TWILIO_PHONE_NUMBER;
  if (!n) throw new Error('TWILIO_PHONE_NUMBER not set.');
  return n;
}

async function twilioPost(path, params) {
  const { sid, auth } = creds();
  const body = new URLSearchParams(params).toString();
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}${path}`, {
    method:  'POST',
    headers: { 'Authorization': auth, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `Twilio error ${res.status}`);
  return data;
}

async function twilioGet(path) {
  const { sid, auth } = creds();
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}${path}.json`, {
    headers: { 'Authorization': auth },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `Twilio error ${res.status}`);
  return data;
}

async function sendSMS(to, body) {
  return twilioPost('/Messages.json', { From: from(), To: to, Body: body });
}

async function makeCall(to, twiml) {
  return twilioPost('/Calls.json', { From: from(), To: to, Twiml: twiml });
}

async function listMessages(limit = 20) {
  const { sid, auth } = creds();
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json?PageSize=${limit}`, {
    headers: { 'Authorization': auth },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `Twilio error ${res.status}`);
  return data.messages || [];
}

async function getAccountInfo() {
  return twilioGet('');
}

module.exports = { sendSMS, makeCall, listMessages, getAccountInfo };
