// cloud/telegram/handlers.js
// Telegram message and callback handlers for ACC v2

'use strict';
const { Router } = require('express');
const axios = require('axios');

const router = Router();

function resolveApiBaseUrl() {
  const explicit = [
    process.env.ACC_API_BASE_URL,
    process.env.ACC_PUBLIC_URL,
    process.env.ACC_WEBAPP_URL,
  ].find((value) => typeof value === 'string' && value.trim());

  if (explicit) {
    try {
      return new URL(explicit.trim()).origin;
    } catch {
      return String(explicit).trim().replace(/\/+$/, '');
    }
  }

  return `http://127.0.0.1:${process.env.PORT || 4000}`;
}

const API_BASE = resolveApiBaseUrl();

// Parse incoming Telegram messages
async function handleMessage(msg) {
  const { text, from, chat } = msg;
  if (!text) return;

  console.log(`[telegram] Message from ${from.first_name}: "${text.slice(0, 50)}"`);

  // Route to appropriate handler
  if (text.startsWith('/')) {
    return handleCommand(text, msg);
  }

  // Natural message routing
  return routeMessage(text, msg);
}

async function handleCommand(cmd, msg) {
  const { chat } = msg;
  const command = cmd.split(' ')[0].toLowerCase();

  const commands = {
    '/start': () => sendStartMenu(chat.id),
    '/help': () => sendHelp(chat.id),
    '/jobs': () => sendJobMenu(chat.id),
    '/tracker': () => sendTrackerStatus(chat.id),
    '/resume': () => sendResumeMenu(chat.id),
    '/interview': () => sendInterviewMenu(chat.id),
    '/salary': () => sendSalaryCoach(chat.id),
    '/notes': () => sendNotesMenu(chat.id),
    '/briefing': () => sendBriefing(chat.id),
  };

  const handler = commands[command];
  if (handler) {
    return await handler();
  }

  return sendError(chat.id, `Unknown command: ${command}`);
}

async function routeMessage(text, msg) {
  const { chat } = msg;

  // Route to Claude for processing
  try {
    const response = await axios.post(`${API_BASE}/api/execute`, {
      instruction: text,
      agent: 'claude',
      user_id: chat.id,
      source: 'telegram'
    }, { timeout: 30000 });

    if (response.data.output) {
      await sendMessage(chat.id, response.data.output.slice(0, 4096));
    }
  } catch (e) {
    console.error('[telegram] Route error:', e.message);
    await sendError(chat.id, 'Processing failed. Try /help');
  }
}

async function handleCallback(callbackQuery) {
  const { id, from, data } = callbackQuery;
  const chatId = from.id;

  console.log(`[telegram] Callback from ${from.first_name}: ${data}`);

  // Parse callback data (e.g., "job_search_remote" or "resume_download_123")
  const [action, ...params] = data.split('_');

  const handlers = {
    'job': () => handleJobCallback(chatId, params),
    'resume': () => handleResumeCallback(chatId, params),
    'interview': () => handleInterviewCallback(chatId, params),
    'approve': () => handleApprovalCallback(chatId, params, id),
    'reject': () => handleRejectionCallback(chatId, params, id),
    'tracker': () => handleTrackerCallback(chatId, params),
    'salary': () => handleSalaryCallback(chatId, params),
  };

  const handler = handlers[action];
  if (handler) {
    await handler();
    await answerCallbackQuery(id, '✅ Processing...');
  } else {
    await answerCallbackQuery(id, '❌ Unknown action');
  }
}

// ============================================================================
// MENU HANDLERS
// ============================================================================

async function sendStartMenu(chatId) {
  const keyboard = {
    inline_keyboard: [
      [{ text: '🔍 Job Search', callback_data: 'job_search' }],
      [{ text: '📄 Resume Tools', callback_data: 'resume_menu' }],
      [{ text: '🎯 Interview Prep', callback_data: 'interview_start' }],
      [{ text: '💼 Salary Coach', callback_data: 'salary_start' }],
      [{ text: '📊 Job Tracker', callback_data: 'tracker_view' }],
      [{ text: '📝 Notes', callback_data: 'notes_menu' }],
      [{ text: '📋 Daily Briefing', callback_data: 'briefing_today' }],
      [{ text: 'ℹ️ Help', callback_data: 'help' }],
    ]
  };

  await sendMessage(chatId, '👋 Welcome to ACC v2! Choose an option:', keyboard);
}

async function sendJobMenu(chatId) {
  const keyboard = {
    inline_keyboard: [
      [{ text: '🔍 Search Jobs', callback_data: 'job_search' }],
      [{ text: '⭐ Remote', callback_data: 'job_remote' }, { text: '🏢 Onsite', callback_data: 'job_onsite' }],
      [{ text: '💼 PM Roles', callback_data: 'job_type_pm' }, { text: '🔧 Engineer', callback_data: 'job_type_eng' }],
      [{ text: '📍 Toronto', callback_data: 'job_location_toronto' }],
      [{ text: '↩️ Back', callback_data: 'menu_main' }],
    ]
  };

  await sendMessage(chatId, '🔍 Job Search Options:', keyboard);
}

async function sendResumeMenu(chatId) {
  const keyboard = {
    inline_keyboard: [
      [{ text: '📤 Upload Resume', callback_data: 'resume_upload' }],
      [{ text: '✂️ Tailor for Job', callback_data: 'resume_tailor' }],
      [{ text: '📋 View Versions', callback_data: 'resume_versions' }],
      [{ text: '🤖 ATS Check', callback_data: 'resume_ats' }],
      [{ text: '↩️ Back', callback_data: 'menu_main' }],
    ]
  };

  await sendMessage(chatId, '📄 Resume Tools:', keyboard);
}

async function sendInterviewMenu(chatId) {
  const keyboard = {
    inline_keyboard: [
      [{ text: '🎤 Start Interview', callback_data: 'interview_start' }],
      [{ text: '📝 PM Questions', callback_data: 'interview_pm' }],
      [{ text: '🔧 Engineer Questions', callback_data: 'interview_eng' }],
      [{ text: '⭐ Star Stories', callback_data: 'interview_star' }],
      [{ text: '↩️ Back', callback_data: 'menu_main' }],
    ]
  };

  await sendMessage(chatId, '🎯 Interview Prep:', keyboard);
}

async function sendSalaryCoach(chatId) {
  const keyboard = {
    inline_keyboard: [
      [{ text: '💰 Market Check', callback_data: 'salary_market' }],
      [{ text: '📈 Negotiate', callback_data: 'salary_negotiate' }],
      [{ text: '📊 Compare', callback_data: 'salary_compare' }],
      [{ text: '↩️ Back', callback_data: 'menu_main' }],
    ]
  };

  await sendMessage(chatId, '💼 Salary Coach:', keyboard);
}

async function sendTrackerStatus(chatId) {
  const keyboard = {
    inline_keyboard: [
      [{ text: '📋 View All', callback_data: 'tracker_all' }],
      [{ text: '⏳ Pending', callback_data: 'tracker_pending' }],
      [{ text: '📞 Interviews', callback_data: 'tracker_interviews' }],
      [{ text: '✅ Offers', callback_data: 'tracker_offers' }],
      [{ text: '↩️ Back', callback_data: 'menu_main' }],
    ]
  };

  await sendMessage(chatId, '📊 Job Tracker:', keyboard);
}

async function sendNotesMenu(chatId) {
  const keyboard = {
    inline_keyboard: [
      [{ text: '✏️ New Note', callback_data: 'notes_new' }],
      [{ text: '📖 View Notes', callback_data: 'notes_list' }],
      [{ text: '🔒 Vault', callback_data: 'notes_vault' }],
      [{ text: '↩️ Back', callback_data: 'menu_main' }],
    ]
  };

  await sendMessage(chatId, '📝 Notes:', keyboard);
}

// ============================================================================
// CALLBACK HANDLERS
// ============================================================================

async function handleJobCallback(chatId, params) {
  await sendMessage(chatId, '🔍 Searching jobs... (Check your browser dashboard for results)');
  // Actual search happens via API
  await axios.post(`${API_BASE}/api/execute`, {
    instruction: 'Search for job opportunities',
    agent: 'claude',
    user_id: chatId
  }).catch(e => console.log('[job search error]', e.message));
}

async function handleResumeCallback(chatId, params) {
  const action = params[0];
  const messages = {
    'upload': '📤 Send me your resume (PDF or DOC)',
    'tailor': '✂️ Share the job description and I\'ll tailor your resume',
    'versions': '📋 Your resume versions:',
    'ats': '🤖 Checking ATS compatibility...'
  };

  await sendMessage(chatId, messages[action] || 'Resume action');
}

async function handleInterviewCallback(chatId, params) {
  await sendMessage(chatId, '🎤 Starting interview simulation. Answer 7 questions.\n\n1️⃣ Tell me about a challenging project...');
}

async function handleApprovalCallback(chatId, params, queryId) {
  const taskId = params[0];
  console.log(`[approval] Task ${taskId} APPROVED by user ${chatId}`);
  
  await axios.post(`${API_BASE}/api/execute/approve`, {
    task_id: taskId,
    user_id: chatId,
    action: 'approve'
  }).catch(e => console.log('[approval error]', e.message));

  await sendMessage(chatId, `✅ Approved. Processing...`);
}

async function handleRejectionCallback(chatId, params, queryId) {
  const taskId = params[0];
  console.log(`[approval] Task ${taskId} REJECTED by user ${chatId}`);
  
  await axios.post(`${API_BASE}/api/execute/reject`, {
    task_id: taskId,
    user_id: chatId,
    action: 'reject'
  }).catch(e => console.log('[rejection error]', e.message));

  await sendMessage(chatId, `❌ Rejected. Task cancelled.`);
}

async function handleTrackerCallback(chatId, params) {
  await sendMessage(chatId, '📊 Loading tracker...');
}

async function handleSalaryCallback(chatId, params) {
  await sendMessage(chatId, '💰 Salary analysis loaded');
}

// ============================================================================
// UTILITIES
// ============================================================================

async function sendMessage(chatId, text, keyboard = null) {
  const payload = {
    chat_id: chatId,
    text: text,
    parse_mode: 'HTML'
  };

  if (keyboard) {
    payload.reply_markup = keyboard;
  }

  try {
    await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, payload);
  } catch (e) {
    console.error('[telegram] Send error:', e.message);
  }
}

async function sendError(chatId, error) {
  await sendMessage(chatId, `❌ Error: ${error}`);
}

async function sendHelp(chatId) {
  const help = `
📚 <b>ACC v2 Commands</b>

/start - Main menu
/jobs - Search jobs
/resume - Resume tools
/interview - Interview prep
/salary - Salary coach
/tracker - Job tracker
/notes - Notes & vault
/briefing - Daily briefing
/help - This help menu

<b>Quick tips:</b>
• Tap buttons instead of typing
• Replies are instant
• Check dashboard for details
  `;

  await sendMessage(chatId, help);
}

async function sendBriefing(chatId) {
  await sendMessage(chatId, '📋 Loading your daily briefing...');
}

async function answerCallbackQuery(queryId, text) {
  try {
    await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
      callback_query_id: queryId,
      text: text,
      show_alert: false
    });
  } catch (e) {
    console.error('[callback error]', e.message);
  }
}

module.exports = {
  handleMessage,
  handleCallback,
  router
};
