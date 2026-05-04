// cloud/telegram/bot.js
const TelegramBot                       = require("node-telegram-bot-api");
const fetch                             = require("node-fetch");
const { claimBot, heartbeat, getActiveBot } = require("./botLock.js");
const { transcribeAudioWithWhisper }    = require("../connectors/whisper.js");
const { runGraphStep }                  = require("../orchestrator/graphRunner.js");
const { AUTO_MODES }                    = require("../orchestrator/autoMode.js");
const { saveSnapshot }                  = require("../orchestrator/snapshots.js");
const { buildGraphFromUserRequest }     = require("./graphBuilder.js");
const { buildGraphFromUserRequestV2 }   = require("./graphBuilderV2.js");
const { ensureUserProfile, getUserProfile } = require("./users.js");

// ─── Bot Guard ───────────────────────────────────────────────────────────────

const BOT_NAME = "cloud";

if (!claimBot(BOT_NAME)) {
  console.error(`[cloud bot] Cannot start. Active bot is: ${getActiveBot()}.`);
  process.exit(0);
}

// Heartbeat every 5 seconds
setInterval(() => heartbeat(BOT_NAME), 5000);

// ─── Init ────────────────────────────────────────────────────────────────────

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!TELEGRAM_TOKEN) {
  console.error("[bot] Missing TELEGRAM_BOT_TOKEN");
  process.exit(1);
}

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeLanguage(input) {
  const t = (input || "").toLowerCase();
  if (t.includes("fa") || t.includes("farsi") || t.includes("persian")) return "fa";
  return "en";
}

function normalizeAutoMode(input) {
  const t = (input || "").toLowerCase();
  if (t.startsWith("a") || t.includes("conservative")) return AUTO_MODES.CONSERVATIVE;
  if (t.startsWith("c") || t.includes("autonomous"))   return AUTO_MODES.AUTONOMOUS;
  return AUTO_MODES.BALANCED;
}

// ─── Shared graph flow ───────────────────────────────────────────────────────

async function runFlow(chatId, userId, text) {
  await bot.sendMessage(chatId, "Which language do you want? (English / Farsi)");

  bot.once("message", async (langMsg) => {
    const lang = normalizeLanguage(langMsg.text);

    await bot.sendMessage(
      chatId,
      "Choose automation level:\nA) Conservative\nB) Balanced\nC) Fully Autonomous"
    );

    bot.once("message", async (modeMsg) => {
      const autoMode = normalizeAutoMode(modeMsg.text);

      // Use V2 intent-aware builder
      const profile = getUserProfile(userId) || {};
      const role    = profile.role || "normal";

      const graph = await buildGraphFromUserRequestV2({
        text,
        language: lang,
        userId,
        role,
      });

      const snapshotId = `tg-${userId}-${Date.now()}`;

      saveSnapshot(snapshotId, {
        nodes: graph.map((n) => ({
          ...n, status: "pending", result: null, error: null, taskId: null,
        })),
        meta: { autoMode },
      });

      const { done, snapshot } = await runGraphStep({ snapshotId, graph, autoMode });

      if (done) {
        const final = snapshot.nodes[snapshot.nodes.length - 1];
        await bot.sendMessage(chatId, `Result:\n${final.result?.output || "Done."}`);
      } else {
        await bot.sendMessage(chatId, "Workflow paused. Type 'continue' to resume.");
      }
    });
  });
}

// ─── /whoisactive ────────────────────────────────────────────────────────────

bot.onText(/\/whoisactive/, (msg) => {
  bot.sendMessage(msg.chat.id, `Active bot: ${getActiveBot()}`);
});

// ─── Text messages ───────────────────────────────────────────────────────────

bot.on("message", async (msg) => {
  if (msg.voice) return;
  if (msg.text && msg.text.startsWith("/")) return; // handled by onText

  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const text   = msg.text;

  if (!text) return;

  await ensureUserProfile(userId);
  await runFlow(chatId, userId, text);
});

// ─── Voice messages ──────────────────────────────────────────────────────────

bot.on("voice", async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();

  await ensureUserProfile(userId);

  try {
    const fileLink  = await bot.getFileLink(msg.voice.file_id);
    const audioData = await fetch(fileLink).then((r) => r.arrayBuffer());
    const whisper   = await transcribeAudioWithWhisper(Buffer.from(audioData));

    if (!whisper.success) {
      await bot.sendMessage(chatId, `Voice transcription failed: ${whisper.error}`);
      return;
    }

    await bot.sendMessage(chatId, `Transcribed:\n${whisper.text}`);
    await runFlow(chatId, userId, whisper.text);
  } catch (err) {
    console.error("[bot] voice error:", err);
    await bot.sendMessage(chatId, "Error processing voice message.");
  }
});

console.log(`[cloud bot] Running. Lock held by: ${getActiveBot()}`);

module.exports = { bot };
