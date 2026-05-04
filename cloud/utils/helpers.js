// cloud/utils/helpers.js

function safeParseJSON(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function nowTs() {
  return new Date().toISOString();
}

module.exports = { safeParseJSON, nowTs };
