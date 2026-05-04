// cloud/connectors/browser.js
const fetch = require("node-fetch");

// Optional: plug in SerpAPI, Tavily, etc. via this key later
const BROWSER_LLM_API_KEY = process.env.BROWSER_LLM_API_KEY;

/**
 * runBrowserTask
 * modes:
 *  - search : query → list of results (stub, plug real API later)
 *  - visit  : url   → raw page HTML
 *  - chat   : query → LLM-style answer stub (no real browsing yet)
 *
 * BrowserPayload contract:
 *  { mode: "search"|"visit"|"chat", query?: string, url?: string, language?: "en"|"fa" }
 */
async function runBrowserTask(payload = {}) {
  const { mode = "search", query, url } = payload;

  // ── SEARCH ──────────────────────────────────────────────────────────────────
  if (mode === "search") {
    if (!query) {
      return { success: false, error: "Browser: search mode requires query." };
    }

    // Plug SerpAPI / Tavily / Exa here when ready.
    return {
      success: true,
      output: [
        { title: "Result 1 (stub)", url: "https://example.com/1" },
        { title: "Result 2 (stub)", url: "https://example.com/2" },
      ],
    };
  }

  // ── VISIT ────────────────────────────────────────────────────────────────────
  if (mode === "visit") {
    if (!url) {
      return { success: false, error: "Browser: visit mode requires url." };
    }

    try {
      const res = await fetch(url);
      if (!res.ok) {
        return { success: false, error: `Browser: HTTP ${res.status} for ${url}` };
      }
      const html = await res.text();
      return { success: true, output: html };
    } catch (err) {
      return { success: false, error: `Browser: ${err.message}` };
    }
  }

  // ── CHAT ─────────────────────────────────────────────────────────────────────
  if (mode === "chat") {
    if (!query) {
      return { success: false, error: "Browser: chat mode requires query." };
    }

    // Route to OpenAI/Claude when ready. Stub for now.
    return {
      success: true,
      output: `Browser chat stub. You asked: "${query}".`,
    };
  }

  return { success: false, error: `Browser: unknown mode "${mode}".` };
}

module.exports = { runBrowserTask };
