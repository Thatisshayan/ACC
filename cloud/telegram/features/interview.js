// cloud/telegram/features/interview.js — Feature 6: Interview Simulator
'use strict';
const fs    = require('fs');
const path  = require('path');
const users = require('../users.js');
const axios = require('axios');

function getSessionFile(userId) {
  return path.join(users.getUserStorageDir(userId), 'interview_session.json');
}
function getSession(userId) {
  const fp = getSessionFile(userId);
  if (!fs.existsSync(fp)) return null;
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch(_) { return null; }
}
function saveSession(userId, session) {
  fs.writeFileSync(getSessionFile(userId), JSON.stringify(session, null, 2), 'utf8');
}
function clearSession(userId) {
  const fp = getSessionFile(userId);
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
}

async function startInterview(userId, role, language) {
  const session = {
    role,
    language: language || 'en',
    questions: generateQuestions(role),
    currentQ: 0,
    answers: [],
    scores: [],
    startedAt: new Date().toISOString(),
  };
  saveSession(userId, session);
  return session;
}

function generateQuestions(role) {
  // Base questions for any role + role-specific
  const base = [
    'Tell me about yourself and your background.',
    'Why are you interested in this role?',
    'What is your greatest professional achievement?',
    'Describe a challenge you faced at work and how you overcame it.',
    'Where do you see yourself in 5 years?',
  ];
  const tech = role.toLowerCase().match(/engineer|developer|software|tech|data|ml|ai/) ? [
    'Explain a complex technical concept in simple terms.',
    'How do you approach debugging a REDACTED issue?',
    'Tell me about a technical decision you made and its outcome.',
  ] : [];
  const manager = role.toLowerCase().match(/manager|director|lead|head|vp|president/) ? [
    'How do you handle underperforming team members?',
    'Describe your leadership style.',
    'How do you prioritize competing deadlines?',
  ] : [];
  return [...base, ...tech, ...manager].slice(0, 7);
}

function getCurrentQuestion(session) {
  if (!session || session.currentQ >= session.questions.length) return null;
  return session.questions[session.currentQ];
}

function getTotalQuestions(session) {
  return session ? session.questions.length : 0;
}

function submitAnswer(userId, answerText) {
  const session = getSession(userId);
  if (!session) return null;
  const q = session.questions[session.currentQ];
  session.answers.push({ question: q, answer: answerText, timestamp: new Date().toISOString() });
  session.currentQ++;
  saveSession(userId, session);
  return session;
}

function formatFeedback(question, answer, lang) {
  // Simple rule-based feedback (replaced with AI when key available)
  const wordCount = answer.split(' ').length;
  var score = 5;
  var tips = [];
  if (wordCount < 20) { score -= 2; tips.push(lang === 'fa' ? 'پاسخ کوتاه است. جزئیات بیشتری اضافه کن.' : 'Answer is too short. Add more detail.'); }
  if (wordCount > 200) { score -= 1; tips.push(lang === 'fa' ? 'کمی طولانی است. مختصرتر باش.' : 'A bit long. Be more concise.'); }
  if (answer.toLowerCase().includes('i') || answer.includes('من')) score += 1;
  score = Math.min(10, Math.max(1, score));
  const stars = '⭐'.repeat(Math.round(score / 2));
  var msg = stars + ' *' + score + '/10*\n\n';
  if (tips.length) msg += (lang === 'fa' ? '💡 نکات:\n' : '💡 Tips:\n') + tips.map(function(t) { return '• ' + t; }).join('\n') + '\n\n';
  msg += lang === 'fa' ? '_پاسخ بعدی را آماده کنید..._' : '_Get ready for the next question..._';
  return { score, feedback: msg };
}

function formatSummary(session) {
  const lang = session.language;
  const avg  = session.scores.length ? Math.round(session.scores.reduce(function(a,b){return a+b;},0) / session.scores.length) : 0;
  var msg = (lang==='fa' ? '🎯 *نتایج مصاحبه*\n\n' : '🎯 *Interview Results*\n\n');
  msg += (lang==='fa' ? 'موقعیت: ' : 'Role: ') + '*' + session.role + '*\n';
  msg += (lang==='fa' ? 'سوالات پاسخ داده شده: ' : 'Questions answered: ') + session.answers.length + '/' + session.questions.length + '\n';
  msg += (lang==='fa' ? 'میانگین امتیاز: ' : 'Average score: ') + avg + '/10\n\n';
  if (avg >= 8) msg += (lang==='fa' ? '🏆 عالی! برای این موقعیت آماده‌ای!' : '🏆 Excellent! You are ready for this role!');
  else if (avg >= 6) msg += (lang==='fa' ? '👍 خوب! با کمی تمرین بیشتر عالی می‌شوی.' : '👍 Good! A bit more practice and you\'ll be great.');
  else msg += (lang==='fa' ? '💪 نیاز به تمرین بیشتری داری. دوباره امتحان کن!' : '💪 Needs more practice. Try again!');
  return msg;
}

module.exports = { startInterview, getCurrentQuestion, getTotalQuestions, submitAnswer, formatFeedback, formatSummary, getSession, clearSession };
