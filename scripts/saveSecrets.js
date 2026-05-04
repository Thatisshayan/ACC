// acc/scripts/saveSecrets.js
import { writeSecret } from "../cloud/security/vaultStub.js";

async function main() {
  writeSecret("ACC_VAULT_MASTER_KEY", process.env.ACC_VAULT_MASTER_KEY || "");
  writeSecret("ACC_APPROVAL_HMAC_SECRET", process.env.ACC_APPROVAL_HMAC_SECRET || "");
  writeSecret("CLAUDE_API_KEY", process.env.CLAUDE_API_KEY || "");
  writeSecret("OPENAI_API_KEY", process.env.OPENAI_API_KEY || "");
  writeSecret("DEEPSEEK_API_KEY", process.env.DEEPSEEK_API_KEY || "");
  writeSecret("NOTION_API_KEY", process.env.NOTION_API_KEY || "");
  writeSecret("TELEGRAM_BOT_TOKEN", process.env.TELEGRAM_BOT_TOKEN || "");
  writeSecret("SHAYAN_TELEGRAM_CHAT_ID", process.env.SHAYAN_TELEGRAM_CHAT_ID || "");
  console.log("Secrets written to local vault stub.");
}
main().catch(e => { console.error("Failed to write secrets:", e.message); process.exit(1); });


