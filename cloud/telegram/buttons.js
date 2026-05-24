// cloud/telegram/buttons.js
// Interactive button definitions for Telegram menu

'use strict';

const MAIN_MENU = {
  inline_keyboard: [
    [{ text: '🔍 Job Search', callback_data: 'job_search' }],
    [{ text: '📄 Resume', callback_data: 'resume_menu' }],
    [{ text: '🎯 Interview', callback_data: 'interview_menu' }],
    [{ text: '💼 Salary', callback_data: 'salary_menu' }],
    [{ text: '📊 Tracker', callback_data: 'tracker_menu' }],
    [{ text: '📝 Notes', callback_data: 'notes_menu' }],
    [{ text: '📋 Briefing', callback_data: 'briefing_menu' }],
    [{ text: 'ℹ️ Help', callback_data: 'help_menu' }],
  ]
};

const JOB_SEARCH_MENU = {
  inline_keyboard: [
    [{ text: '🔍 Find Jobs', callback_data: 'job_search_all' }],
    [{ text: '⭐ Remote Only', callback_data: 'job_search_remote' }],
    [{ text: '🏢 Onsite', callback_data: 'job_search_onsite' }],
    [{ text: '💼 PM Roles', callback_data: 'job_search_pm' }],
    [{ text: '🔧 Engineering', callback_data: 'job_search_eng' }],
    [{ text: '📍 Toronto', callback_data: 'job_search_toronto' }],
    [{ text: '← Back', callback_data: 'menu_main' }],
  ]
};

const RESUME_MENU = {
  inline_keyboard: [
    [{ text: '📤 Upload', callback_data: 'resume_upload' }],
    [{ text: '✂️ Tailor', callback_data: 'resume_tailor' }],
    [{ text: '📋 Versions', callback_data: 'resume_versions' }],
    [{ text: '🤖 ATS Check', callback_data: 'resume_ats' }],
    [{ text: '📧 Send to Job', callback_data: 'resume_send' }],
    [{ text: '← Back', callback_data: 'menu_main' }],
  ]
};

const INTERVIEW_MENU = {
  inline_keyboard: [
    [{ text: '🎤 Start', callback_data: 'interview_start' }],
    [{ text: '📝 PM Questions', callback_data: 'interview_pm' }],
    [{ text: '🔧 Engineer Qs', callback_data: 'interview_eng' }],
    [{ text: '⭐ STAR Method', callback_data: 'interview_star' }],
    [{ text: '💬 Mock Interview', callback_data: 'interview_mock' }],
    [{ text: '← Back', callback_data: 'menu_main' }],
  ]
};

const SALARY_MENU = {
  inline_keyboard: [
    [{ text: '💰 Market Check', callback_data: 'salary_market' }],
    [{ text: '📈 Negotiate', callback_data: 'salary_negotiate' }],
    [{ text: '📊 Compare', callback_data: 'salary_compare' }],
    [{ text: '💵 Calculator', callback_data: 'salary_calc' }],
    [{ text: '← Back', callback_data: 'menu_main' }],
  ]
};

const TRACKER_MENU = {
  inline_keyboard: [
    [{ text: '📋 All', callback_data: 'tracker_all' }],
    [{ text: '⏳ Pending', callback_data: 'tracker_pending' }],
    [{ text: '📞 Interviews', callback_data: 'tracker_interview' }],
    [{ text: '🎯 Offers', callback_data: 'tracker_offers' }],
    [{ text: '❌ Rejected', callback_data: 'tracker_rejected' }],
    [{ text: '← Back', callback_data: 'menu_main' }],
  ]
};

const NOTES_MENU = {
  inline_keyboard: [
    [{ text: '✏️ New Note', callback_data: 'notes_new' }],
    [{ text: '📖 List', callback_data: 'notes_list' }],
    [{ text: '🔒 Vault', callback_data: 'notes_vault' }],
    [{ text: '🗑️ Trash', callback_data: 'notes_trash' }],
    [{ text: '← Back', callback_data: 'menu_main' }],
  ]
};

const APPROVAL_YES_NO = {
  inline_keyboard: [
    [
      { text: '✅ Approve', callback_data: 'approve_yes' },
      { text: '❌ Reject', callback_data: 'approve_no' }
    ]
  ]
};

module.exports = {
  MAIN_MENU,
  JOB_SEARCH_MENU,
  RESUME_MENU,
  INTERVIEW_MENU,
  SALARY_MENU,
  TRACKER_MENU,
  NOTES_MENU,
  APPROVAL_YES_NO
};
