// scripts/testClaude.js
import * as sdkModule from "@anthropic-ai/sdk";
import { readSecret } from "../cloud/security/vaultStub.js";

const key = readSecret("CLAUDE_API_KEY");
if (!key) {
  console.error("CLAUDE_API_KEY not found in vault");
  process.exit(1);
}

async function callResponses(client) {
  // Try the modern responses.create shape
  if (client?.responses && typeof client.responses.create === "function") {
    return client.responses.create({ model: "claude-2.1", input: "Hello from local ACC smoke test. Reply briefly." });
  }
  // Try messages.create shape
  if (typeof client.messages?.create === "function") {
    return client.messages.create({ model: "claude-2.1", messages: [{ role: "user", content: "Hello from local ACC smoke test. Reply briefly." }] });
  }
  // Try completions.create shape
  if (typeof client.completions?.create === "function") {
    return client.completions.create({ model: "claude-2.1", prompt: "Hello from local ACC smoke test. Reply briefly.", max_tokens: 200 });
  }
  throw new Error("No supported client method found on Anthropic SDK client");
}

async function main() {
  try {
    // Construct client depending on SDK export shape
    let client;
    if (typeof sdkModule.default === "function") {
      // default export is a constructor/class
      const Constructor = sdkModule.default;
      client = new Constructor({ apiKey: key });
    } else if (sdkModule.Anthropic && typeof sdkModule.Anthropic === "function") {
      client = new sdkModule.Anthropic({ apiKey: key });
    } else {
      // fallback: some SDKs export functions directly; try using the module as client
      client = sdkModule;
    }

    const res = await callResponses(client);
    console.log("Claude test response received");
    // Print a short, non-sensitive snippet
    const snippet = JSON.stringify(res).slice(0, 240);
    console.log("Response snippet:", snippet);
  } catch (e) {
    console.error("Claude test failed:", e.message || e);
    process.exit(1);
  }
}

main();
