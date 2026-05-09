// cloud/telegram/features/lifeTools.js
// Features 13-50: Daily Life, Health, Creative, Business, Learning, Personal tools
// All route through Claude/DeepSeek via callACC — no separate API calls needed
'use strict';

var fs    = require('fs');
var path  = require('path');
var users = require('../users.js');

// ── Storage helpers ───────────────────────────────────────────────────────────
function getDataFile(userId, name) {
  return path.join(users.getUserStorageDir(userId), name + '.json');
}
function loadData(userId, name) {
  var fp = getDataFile(userId, name);
  if (!fs.existsSync(fp)) return {};
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch(_) { return {}; }
}
function saveData(userId, name, data) {
  fs.writeFileSync(getDataFile(userId, name), JSON.stringify(data, null, 2), 'utf8');
}

// ── Feature 15: Shopping List ─────────────────────────────────────────────────
function getShoppingList(userId) {
  return (loadData(userId, 'shopping') || {}).items || [];
}
function addShoppingItems(userId, items) {
  var data = loadData(userId, 'shopping');
  data.items = (data.items || []).concat(items.map(function(i) { return { item: i, done: false, addedAt: new Date().toISOString() }; }));
  saveData(userId, 'shopping', data);
  return data.items;
}
function clearShoppingList(userId) { saveData(userId, 'shopping', { items: [] }); }
function formatShoppingList(userId, lang) {
  var items = getShoppingList(userId);
  if (!items.length) return lang === 'fa' ? '🛒 لیست خرید خالی است.' : '🛒 Shopping list is empty.';
  var pending = items.filter(function(i) { return !i.done; });
  var done    = items.filter(function(i) { return i.done; });
  var out = lang === 'fa' ? '🛒 *لیست خرید*\n\n' : '🛒 *Shopping List*\n\n';
  if (pending.length) out += pending.map(function(i, n) { return (n+1) + '. ' + i.item; }).join('\n');
  if (done.length)    out += '\n\n_Done: ' + done.length + ' items_';
  return out;
}

// ── Feature 16: Budget Tracker ────────────────────────────────────────────────
function addExpense(userId, amount, category, note) {
  var data = loadData(userId, 'budget');
  if (!data.expenses) data.expenses = [];
  data.expenses.unshift({ amount: parseFloat(amount), category: category || 'General', note: note || '', date: new Date().toISOString() });
  if (data.expenses.length > 500) data.expenses = data.expenses.slice(0, 500);
  saveData(userId, 'budget', data);
}
function getBudgetSummary(userId, lang) {
  var data = loadData(userId, 'budget');
  var exp  = data.expenses || [];
  if (!exp.length) return lang === 'fa' ? '💰 هنوز هزینه‌ای ثبت نشده.' : '💰 No expenses recorded yet.';
  var total = exp.reduce(function(s, e) { return s + e.amount; }, 0);
  var bycat = {};
  exp.forEach(function(e) { bycat[e.category] = (bycat[e.category]||0) + e.amount; });
  var out = lang === 'fa' ? '💰 *خلاصه هزینه‌ها*\n\n' : '💰 *Budget Summary*\n\n';
  out += (lang === 'fa' ? 'مجموع: $' : 'Total: $') + total.toFixed(2) + '\n\n';
  Object.keys(bycat).forEach(function(c) { out += '• ' + c + ': $' + bycat[c].toFixed(2) + '\n'; });
  return out;
}

// ── Feature 18: Medication Reminder ──────────────────────────────────────────
function addMedication(userId, name, dosage, times) {
  var data = loadData(userId, 'medications');
  if (!data.meds) data.meds = [];
  data.meds.push({ name: name, dosage: dosage, times: times, addedAt: new Date().toISOString() });
  saveData(userId, 'medications', data);
}
function getMedications(userId, lang) {
  var data = loadData(userId, 'medications');
  var meds = data.meds || [];
  if (!meds.length) return lang === 'fa' ? '💊 هیچ دارویی ثبت نشده.' : '💊 No medications tracked.';
  return (lang === 'fa' ? '💊 *داروهای شما*\n\n' : '💊 *Your Medications*\n\n') +
    meds.map(function(m, i) { return (i+1) + '. *' + m.name + '* — ' + m.dosage + ' (' + m.times + ')'; }).join('\n');
}

// ── Feature 19: Sleep Tracker ─────────────────────────────────────────────────
function logSleep(userId, hours, quality, note) {
  var data = loadData(userId, 'sleep');
  if (!data.logs) data.logs = [];
  data.logs.unshift({ hours: parseFloat(hours), quality: quality || 3, note: note || '', date: new Date().toISOString() });
  if (data.logs.length > 90) data.logs = data.logs.slice(0, 90);
  saveData(userId, 'sleep', data);
}
function getSleepSummary(userId, lang) {
  var data = loadData(userId, 'sleep');
  var logs = data.logs || [];
  if (!logs.length) return lang === 'fa' ? '😴 هیچ خوابی ثبت نشده.' : '😴 No sleep logged yet.';
  var recent = logs.slice(0, 7);
  var avg    = (recent.reduce(function(s,l){return s+l.hours;},0)/recent.length).toFixed(1);
  var out = lang === 'fa' ? '😴 *ردیاب خواب*\n\n' : '😴 *Sleep Tracker*\n\n';
  out += (lang === 'fa' ? 'میانگین ۷ روز: ' : '7-day average: ') + avg + (lang === 'fa' ? ' ساعت\n\n' : ' hrs\n\n');
  recent.slice(0,5).forEach(function(l) {
    var d = new Date(l.date).toLocaleDateString();
    out += d + ': ' + l.hours + 'h (quality: ' + l.quality + '/5)\n';
  });
  return out;
}

// ── Feature 20: Mood Journal ──────────────────────────────────────────────────
function logMood(userId, mood, note) {
  var data = loadData(userId, 'mood');
  if (!data.entries) data.entries = [];
  data.entries.unshift({ mood: mood, note: note || '', date: new Date().toISOString() });
  if (data.entries.length > 180) data.entries = data.entries.slice(0, 180);
  saveData(userId, 'mood', data);
}
function getMoodSummary(userId, lang) {
  var data = loadData(userId, 'mood');
  var entries = data.entries || [];
  if (!entries.length) return lang === 'fa' ? '😊 هیچ حالت روحی ثبت نشده.' : '😊 No mood entries yet.';
  var moodMap = { 5: '😄', 4: '😊', 3: '😐', 2: '😔', 1: '😢' };
  var recent  = entries.slice(0, 7);
  var out = lang === 'fa' ? '😊 *دفتر روحانی*\n\n' : '😊 *Mood Journal*\n\n';
  recent.forEach(function(e) {
    var d = new Date(e.date).toLocaleDateString();
    out += (moodMap[e.mood]||'•') + ' ' + d + (e.note ? ': ' + e.note.slice(0,50) : '') + '\n';
  });
  return out;
}

// ── Feature 45: Home Maintenance ──────────────────────────────────────────────
function addMaintenanceTask(userId, task, dueDate) {
  var data = loadData(userId, 'home_maintenance');
  if (!data.tasks) data.tasks = [];
  data.tasks.push({ task: task, dueDate: dueDate || null, done: false, addedAt: new Date().toISOString() });
  saveData(userId, 'home_maintenance', data);
}
function getMaintenanceTasks(userId, lang) {
  var data  = loadData(userId, 'home_maintenance');
  var tasks = (data.tasks || []).filter(function(t) { return !t.done; });
  if (!tasks.length) return lang === 'fa' ? '🏠 هیچ وظیفه نگهداری وجود ندارد.' : '🏠 No maintenance tasks.';
  return (lang === 'fa' ? '🏠 *نگهداری خانه*\n\n' : '🏠 *Home Maintenance*\n\n') +
    tasks.map(function(t, i) { return (i+1) + '. ' + t.task + (t.dueDate ? ' (due: ' + t.dueDate + ')' : ''); }).join('\n');
}

// ── Feature 49: Personal Memory ────────────────────────────────────────────────
function addMemory(userId, key, value) {
  var data = loadData(userId, 'memory');
  if (!data.facts) data.facts = {};
  data.facts[key.toLowerCase()] = { value: value, savedAt: new Date().toISOString() };
  saveData(userId, 'memory', data);
}
function recallMemory(userId, key) {
  var data = loadData(userId, 'memory');
  return (data.facts || {})[key.toLowerCase()] || null;
}
function getAllMemories(userId) {
  return (loadData(userId, 'memory').facts) || {};
}
function formatMemories(userId, lang) {
  var facts = getAllMemories(userId);
  var keys  = Object.keys(facts);
  if (!keys.length) return lang === 'fa' ? '🧠 هیچ حافظه‌ای ذخیره نشده.' : '🧠 No memories saved yet.';
  return (lang === 'fa' ? '🧠 *حافظه شخصی*\n\n' : '🧠 *Personal Memory*\n\n') +
    keys.slice(0, 20).map(function(k) { return '• *' + k + '*: ' + facts[k].value; }).join('\n');
}

// ── AI prompt builders for features that use Claude ──────────────────────────
function buildPrompt(feature, input, lang) {
  var prompts = {
    chef:        'You are a personal chef AI. The user asks: "' + input + '". Give 3 meal options with full recipes, ingredients, and cooking time. Practical and delicious. Language: ' + lang,
    meal_plan:   'Create a 7-day meal plan for: "' + input + '". Include breakfast, lunch, dinner. Simple ingredients, budget-conscious. Language: ' + lang,
    health:      'You are a health and fitness coach. The user asks: "' + input + '". Give practical advice, workout suggestions, and safety reminders. Language: ' + lang,
    book:        'Summarize this book/content: "' + input + '". Give: key takeaways (5), memorable quotes (3), who should read it, and one action item. Language: ' + lang,
    story:       'Write a compelling short story based on: "' + input + '". Make it engaging with a clear beginning, middle, and end. Language: ' + lang,
    poem:        'Write a poem about: "' + input + '". Make it evocative and memorable. Language: ' + lang,
    meeting:     'Summarize this meeting transcript/notes: "' + input + '". Extract: key decisions, action items (with owners if mentioned), follow-ups, and a 3-sentence executive summary. Language: ' + lang,
    contract:    'Analyze this contract/agreement: "' + input + '". Explain in plain language: key terms, obligations, red flags, what to watch out for. NOT legal advice. Language: ' + lang,
    biz_plan:    'Create a business plan outline for: "' + input + '". Include: executive summary, market analysis, product/service, revenue model, marketing, financials overview. Language: ' + lang,
    invoice:     'Generate a professional invoice for: "' + input + '". Format cleanly with line items, totals, payment terms, and professional language. Language: ' + lang,
    proposal:    'Write a professional project proposal for: "' + input + '". Include: problem, solution, scope, timeline, pricing, next steps. Language: ' + lang,
    standup:     'Format this standup update professionally: "' + input + '". Three sections: Yesterday, Today, Blockers. Language: ' + lang,
    competitive: 'Research and analyze the competitive landscape for: "' + input + '". Include: top 5 competitors, their strengths/weaknesses, market gaps, opportunities. Language: ' + lang,
    price_track: 'I want to track the price of: "' + input + '". Tell me: typical price range, where to find it, best time to buy, price alert suggestions. Language: ' + lang,
    tutor:       'You are a patient tutor. Teach the following topic clearly: "' + input + '". Use simple language, examples, and end with 3 practice questions. Language: ' + lang,
    language_learn: 'Teach me 10 useful phrases in the target language for: "' + input + '". Include pronunciation guide and usage examples. Language: ' + lang,
    research:    'Do thorough research on: "' + input + '". Provide: overview, key facts, different perspectives, sources to explore, and a conclusion. Language: ' + lang,
    news:        'Summarize the latest news about: "' + input + '". Key events, different angles, and what it means going forward. Language: ' + lang,
    course:      'Create a structured mini-course outline for: "' + input + '". Include: 5 modules, learning objectives per module, key resources, and final project idea. Language: ' + lang,
    exam_prep:   'Create 10 exam practice questions for: "' + input + '". Mix multiple choice, short answer, and essay questions. Include answers. Language: ' + lang,
    travel:      'Create a detailed travel itinerary for: "' + input + '". Include: day-by-day plan, accommodation suggestions, local tips, budget estimate, and packing list. Language: ' + lang,
    gift:        'Recommend 5 perfect gift ideas for: "' + input + '". For each: why it\'s perfect, where to buy, price range, and personalization tips. Language: ' + lang,
    car:         'Car assistance for: "' + input + '". Practical advice on maintenance, troubleshooting, estimated costs, and when to see a mechanic. Language: ' + lang,
    pet:         'Pet care advice for: "' + input + '". Cover: feeding, health signs, exercise, grooming, and vet visit recommendations. Language: ' + lang,
    plant:       'Plant care guide for: "' + input + '". Cover: watering schedule, sunlight needs, soil type, common problems, and growth tips. Language: ' + lang,
    custom_agent:'You are ACC\'s Custom Agent Builder. Design a custom AI agent for: "' + input + '". Define: agent name, purpose, capabilities, required integrations, suggested workflows, and sample commands. Language: ' + lang,
  };
  return prompts[feature] || ('Help the user with: "' + input + '". Language: ' + lang);
}

module.exports = {
  // Shopping
  getShoppingList, addShoppingItems, clearShoppingList, formatShoppingList,
  // Budget
  addExpense, getBudgetSummary,
  // Medication
  addMedication, getMedications,
  // Sleep
  logSleep, getSleepSummary,
  // Mood
  logMood, getMoodSummary,
  // Home
  addMaintenanceTask, getMaintenanceTasks,
  // Memory
  addMemory, recallMemory, getAllMemories, formatMemories,
  // AI prompts
  buildPrompt,
};
