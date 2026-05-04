// cloud/security/piiRedactor.js
// Lightweight PII detection and redaction for snapshot previews.

const EMAIL_RE       = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/g;
const PHONE_RE       = /(\+?\d{1,3}[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g;
const CREDIT_CARD_RE = /\b(?:\d[ -]*?){13,16}\b/g;
const SSN_RE         = /\b\d{3}-\d{2}-\d{4}\b/g;

function redactText(text) {
  if (!text || typeof text !== "string") return text;
  let out = text;
  out = out.replace(EMAIL_RE,       "[REDACTED_EMAIL]");
  out = out.replace(PHONE_RE,       "[REDACTED_PHONE]");
  out = out.replace(CREDIT_CARD_RE, "[REDACTED_CC]");
  out = out.replace(SSN_RE,         "[REDACTED_SSN]");
  out = out.replace(/\b\d{6,}\b/g,  "[REDACTED_NUMBER]");
  return out;
}

function redactObject(obj) {
  try {
    const json     = JSON.stringify(obj);
    const redacted = redactText(json);
    return JSON.parse(redacted);
  } catch {
    return obj;
  }
}

module.exports = { redactText, redactObject };
