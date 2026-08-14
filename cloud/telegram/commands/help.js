'use strict';
// cloud/telegram/commands/help.js
// Modular Telegram /help command

async function execute(chatId, userId, text, msg, ctx) {
  const { sendMsg } = ctx;
  const helpText = `❓ *ACC v2 Help & Commands*

*Core Bot Commands:*
/start - Main menu categories
/menu - Quick feature navigation
/dashboard - System metrics & health
/status - Detailed connection status
/jobs - Job search controls
/notes - Private notes vault
/tracker - Job tracker view
/settings - Profile & language settings

*Agent Task Bus:*
/tasks - Recent tasks queue
/taskstats - Task status analytics
/agents - Connected LLMs & latency
/approvals - Actions waiting for approval
/latesttask - Show newest task
/latestresult - Show newest result

Type anything naturally to chat with deepseek fallback! 🎤`;

  await sendMsg(chatId, helpText);
}

module.exports = {
  name: 'help',
  aliases: ['h'],
  execute
};
