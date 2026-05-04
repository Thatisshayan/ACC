// telegram.js (root bot — Module 4)
const TelegramBot = require('node-telegram-bot-api');
const autoMode    = require('./autoMode');
const taskEngine  = require('./taskEngine');
const fs          = require('fs');
const path        = require('path');
const { claimBot, heartbeat, getActiveBot } = require('./cloud/telegram/botLock');

// ─── Bot Guard ───────────────────────────────────────────────────────────────

const BOT_NAME = "root";

if (!claimBot(BOT_NAME)) {
  console.error(`[root bot] Cannot start. Active bot is: ${getActiveBot()}.`);
  process.exit(0);
}

setInterval(() => heartbeat(BOT_NAME), 5000);

// ─── Init ────────────────────────────────────────────────────────────────────

const SNAPSHOT_PATH = path.join(__dirname, 'snapshots.json');
const TOKEN = "8758615737:AAG4wOZbJhOfMWZmLogQv0DwsolKk3GnJoQ";

const bot = new TelegramBot(TOKEN, { polling: true });

function loadSnapshots() {
  return JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
}

// ─── /whoisactive ────────────────────────────────────────────────────────────

bot.onText(/\/whoisactive/, (msg) => {
  bot.sendMessage(msg.chat.id, `Active bot: ${getActiveBot()}`);
});

// ─── /start ──────────────────────────────────────────────────────────────────

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "ACC Telegram Interface Ready.", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Run Auto\u2011Mode",        callback_data: "auto"      }],
        [{ text: "View Snapshots",            callback_data: "snapshots" }],
        [{ text: "Run Example Task Graph",   callback_data: "taskgraph" }]
      ]
    }
  });
});

// ─── Inline buttons ──────────────────────────────────────────────────────────

bot.on("callback_query", (query) => {
  const chatId = query.message.chat.id;

  if (query.data === "auto") {
    const exampleGraph = [
      { id: "T1", title: "Define system architecture", description: "Architect agent defines the system structure.", assigned_agent_role: "architect" },
      { id: "T2", title: "Write user-facing copy",     description: "Writer agent produces copy.",                  assigned_agent_role: "writer"    },
      { id: "T3", title: "Generate implementation plan",description: "Engineer agent produces code plan.",          assigned_agent_role: "engineer"  }
    ];
    bot.sendMessage(chatId, "Running Auto\u2011Mode...");
    autoMode.runAutoMode(exampleGraph, "Telegram Triggered Project");
    bot.sendMessage(chatId, "Auto\u2011Mode Complete.");
  }

  if (query.data === "snapshots") {
    const data = loadSnapshots();
    const last = data.sessions[data.sessions.length - 1];
    if (!last) { bot.sendMessage(chatId, "No snapshots found."); return; }
    bot.sendMessage(chatId, `Last Snapshot:\nProject: ${last.project}\nTimestamp: ${last.timestamp}\nTasks Executed: ${last.execution_log.length}`);
  }

  if (query.data === "taskgraph") {
    const task = { id: "TG1", title: "Example Task", description: "Telegram-triggered task.", assigned_agent_role: "architect" };
    taskEngine.executeTask(task);
    bot.sendMessage(chatId, "Task Graph Executed.");
  }
});

console.log(`[root bot] Running. Lock held by: ${getActiveBot()}`);
