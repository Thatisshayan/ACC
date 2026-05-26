// cloud/connectors/socialclaw.js
// SocialClaw publishing connector for ACC v2
// Connects ACC to the SocialClaw CLI / hosted workspace as a publishing adapter.

const cp = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { BaseConnector } = require("./baseConnector.js");

function parseJsonish(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {}
  const lines = raw.split(/\r?\n/).map(function(line) { return line.trim(); }).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    try {
      return JSON.parse(line);
    } catch (_) {}
  }
  return null;
}

function clampText(value, maxLen) {
  return String(value == null ? "" : value).slice(0, maxLen);
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

class SocialClawConnector extends BaseConnector {
  constructor(config = {}) {
    super({
      name: config.name || "socialclaw",
      version: config.version || "1.0.0",
      apiKey: config.apiKey || process.env.SOCIALCLAW_API_KEY || "",
      enabled: config.enabled ?? true,
    });

    this.baseUrl = config.baseUrl || process.env.SOCIALCLAW_BASE_URL || "https://getsocialclaw.com";
    this.cliPath = config.cliPath || process.env.SOCIALCLAW_CLI_PATH || "socialclaw";
    this.workspaceId = config.workspaceId || process.env.SOCIALCLAW_WORKSPACE_ID || "";
    this.dataDir = path.join(__dirname, "..", "..", "data", "run", "socialclaw");
    this.timeoutMs = Math.max(10000, parseInt(process.env.SOCIALCLAW_CLI_TIMEOUT_MS || "60000", 10) || 60000);

    if (!this.apiKey) console.warn("[socialclaw] SOCIALCLAW_API_KEY not set. Connector will stay setup_required until configured.");
  }

  buildEnv(extraEnv) {
    return Object.assign({}, process.env, extraEnv || {}, {
      SOCIALCLAW_BASE_URL: this.baseUrl,
      SOCIALCLAW_API_KEY: this.apiKey || "",
      SOCIALCLAW_WORKSPACE_ID: this.workspaceId || "",
    });
  }

  execCli(args, options = {}) {
    return new Promise((resolve) => {
      const child = cp.execFile(this.cliPath, args, {
        env: this.buildEnv(options.env),
        cwd: options.cwd || process.cwd(),
        timeout: options.timeout || this.timeoutMs,
        maxBuffer: options.maxBuffer || 10 * 1024 * 1024,
      }, (error, stdout, stderr) => {
        resolve({
          success: !error,
          code: error && typeof error.code === "number" ? error.code : 0,
          stdout: stdout || "",
          stderr: stderr || "",
          error: error ? error.message : "",
        });
      });

      child.on("error", function(err) {
        resolve({ success: false, code: -1, stdout: "", stderr: "", error: err.message });
      });
    });
  }

  async writeSchedulePayload(payload) {
    ensureDir(this.dataDir);
    const fileName = `schedule-${Date.now()}.json`;
    const filePath = path.join(this.dataDir, fileName);
    const source = payload && (payload.schedule || payload.data || payload.payload || payload);
    fs.writeFileSync(filePath, JSON.stringify(source || {}, null, 2), "utf8");
    return filePath;
  }

  async runScheduleAction(actionArgs, payload) {
    const schedulePath = payload && (payload.schedulePath || payload.filePath || payload.path);
    const filePath = schedulePath || await this.writeSchedulePayload(payload);
    const args = [].concat(actionArgs || [], ["-f", filePath, "--json"]);
    return this.execCli(args, { timeout: this.timeoutMs });
  }

  async checkHealth() {
    const v = this.validate();
    if (!v.success) return { status: "disabled", note: v.error };
    if (!this.apiKey) {
      return {
        status: "setup_required",
        note: "Set SOCIALCLAW_API_KEY after creating a workspace API key in SocialClaw.",
        base_url: this.baseUrl,
      };
    }

    const version = await this.execCli(["--version"], { timeout: 10000 });
    if (!version.success && !version.stdout) {
      return {
        status: "setup_required",
        note: "SocialClaw CLI is not available on PATH. Install socialclaw globally first.",
        error: version.error || version.stderr || "socialclaw not found",
        base_url: this.baseUrl,
      };
    }

    const health = await this.execCli(["workspace", "health", "--json"], { timeout: 30000 });
    const parsed = parseJsonish(health.stdout);

    if (health.success && parsed && typeof parsed === "object") {
      return Object.assign({
        status: "connected",
        cli_version: clampText(version.stdout || "", 120).trim(),
        base_url: this.baseUrl,
      }, parsed);
    }

    const detail = clampText(health.stderr || health.error || health.stdout || "SocialClaw health check failed", 400);
    if (/plan_required|subscription_|not authenticated|login|api key/i.test(detail)) {
      return {
        status: "setup_required",
        note: detail,
        base_url: this.baseUrl,
        cli_version: clampText(version.stdout || "", 120).trim(),
      };
    }

    return {
      status: "error",
      error: detail,
      base_url: this.baseUrl,
      cli_version: clampText(version.stdout || "", 120).trim(),
    };
  }

  async run(action, payload = {}) {
    const v = this.validate();
    if (!v.success) return v;

    if (!this.apiKey) {
      return {
        success: false,
        status: "setup_required",
        error: "SOCIALCLAW_API_KEY is missing.",
        base_url: this.baseUrl,
      };
    }

    const normalized = String(action || "").trim().toLowerCase();

    if (normalized === "health" || normalized === "status" || normalized === "workspacehealth") {
      const health = await this.checkHealth();
      return { success: health.status === "connected", output: health, summary: "SocialClaw health check" };
    }

    if (normalized === "accountslist" || normalized === "accounts:list" || normalized === "listaccounts") {
      const result = await this.execCli(["accounts", "list", "--json"], { timeout: 30000 });
      const parsed = parseJsonish(result.stdout);
      return result.success
        ? { success: true, output: parsed || result.stdout, summary: "SocialClaw accounts listed" }
        : { success: false, error: clampText(result.stderr || result.error || "accounts list failed", 400), summary: "SocialClaw accounts list failed" };
    }

    if (normalized === "accountscapabilities" || normalized === "accounts:capabilities") {
      const provider = payload.provider || payload.platform || "";
      if (!provider) return { success: false, error: "SocialClaw accounts capabilities requires payload.provider." };
      const result = await this.execCli(["accounts", "capabilities", "--provider", String(provider), "--json"], { timeout: 30000 });
      const parsed = parseJsonish(result.stdout);
      return result.success
        ? { success: true, output: parsed || result.stdout, summary: "SocialClaw provider capabilities listed" }
        : { success: false, error: clampText(result.stderr || result.error || "accounts capabilities failed", 400), summary: "SocialClaw provider capabilities failed" };
    }

    if (normalized === "assetsupload" || normalized === "assets:upload") {
      const filePath = payload.filePath || payload.file || payload.path;
      if (!filePath) return { success: false, error: "SocialClaw assets upload requires payload.filePath." };
      const result = await this.execCli(["assets", "upload", "--file", String(filePath), "--json"], { timeout: 60000 });
      const parsed = parseJsonish(result.stdout);
      return result.success
        ? { success: true, output: parsed || result.stdout, summary: "SocialClaw asset uploaded" }
        : { success: false, error: clampText(result.stderr || result.error || "assets upload failed", 400), summary: "SocialClaw asset upload failed" };
    }

    if (normalized === "campaignspreview" || normalized === "preview") {
      const result = await this.runScheduleAction(["campaigns", "preview"], payload);
      const parsed = parseJsonish(result.stdout);
      return result.success
        ? { success: true, output: parsed || result.stdout, summary: "SocialClaw campaign preview created" }
        : { success: false, error: clampText(result.stderr || result.error || "campaign preview failed", 400), summary: "SocialClaw campaign preview failed" };
    }

    if (normalized === "validate") {
      const result = await this.runScheduleAction(["validate"], payload);
      const parsed = parseJsonish(result.stdout);
      return result.success
        ? { success: true, output: parsed || result.stdout, summary: "SocialClaw schedule validated" }
        : { success: false, error: clampText(result.stderr || result.error || "validate failed", 400), summary: "SocialClaw validation failed" };
    }

    if (normalized === "apply" || normalized === "publish") {
      const result = await this.runScheduleAction(["apply"], payload);
      const parsed = parseJsonish(result.stdout);
      return result.success
        ? { success: true, output: parsed || result.stdout, summary: "SocialClaw schedule applied" }
        : { success: false, error: clampText(result.stderr || result.error || "apply failed", 400), summary: "SocialClaw publish failed" };
    }

    if (normalized === "postsdelete" || normalized === "posts:delete") {
      const postId = payload.postId || payload.post_id || payload.id;
      if (!postId) return { success: false, error: "SocialClaw posts delete requires payload.postId." };
      const result = await this.execCli(["posts", "delete", "--post-id", String(postId), "--json"], { timeout: 30000 });
      const parsed = parseJsonish(result.stdout);
      return result.success
        ? { success: true, output: parsed || result.stdout, summary: "SocialClaw post deleted" }
        : { success: false, error: clampText(result.stderr || result.error || "post delete failed", 400), summary: "SocialClaw post delete failed" };
    }

    if (normalized === "usage") {
      const result = await this.execCli(["usage", "--json"], { timeout: 30000 });
      const parsed = parseJsonish(result.stdout);
      return result.success
        ? { success: true, output: parsed || result.stdout, summary: "SocialClaw usage retrieved" }
        : { success: false, error: clampText(result.stderr || result.error || "usage failed", 400), summary: "SocialClaw usage lookup failed" };
    }

    return { success: false, error: `SocialClaw: unknown action "${action}".` };
  }
}

module.exports = { SocialClawConnector };
