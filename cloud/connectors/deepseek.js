// cloud/connectors/deepseek.js
const fetch = require("node-fetch");

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

if (!DEEPSEEK_API_KEY) {
  console.warn("[deepseek] Warning: DEEPSEEK_API_KEY is not set.");
}

function buildSystemPrompt(mode, context) {
  const base =
    "You are DeepSeek inside a multi-agent system. " +
    "You must be honest, never assume missing facts, never waste time, " +
    "and never cut corners. If you cannot do something, say so directly.";

  if (mode === "reason") {
    return base + " Your role: break down problems, clarify logic, and identify the single most important missing detail.";
  }
  if (mode === "validate") {
    return base + " Your role: validate outputs for logic, correctness, and consistency. Point out issues clearly.";
  }
  if (mode === "optimize") {
    return base + " Your role: improve structure, clarity, and logic of the given content without changing its intent.";
  }
  return base + " Your role: execute low-priority or bulk tasks efficiently and clearly.";
}

/**
 * runDeepseekTask
 * Multi-role: reasoning, validation, optimization, low-cost execution.
 * mode: "reason" | "validate" | "optimize" | "execute"
 */
async function runDeepseekTask(payload = {}) {
  if (!DEEPSEEK_API_KEY) {
    return { success: false, error: "DeepSeek: missing API key." };
  }

  const { mode = "execute", prompt, context } = payload;

  if (!prompt) {
    return { success: false, error: "DeepSeek: missing prompt." };
  }

  const systemPrompt = buildSystemPrompt(mode, context);

  try {
    const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: `DeepSeek HTTP ${res.status}: ${text}` };
    }

    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content || "";

    return { success: true, output: content, raw: json };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = { runDeepseekTask };
