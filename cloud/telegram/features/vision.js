// cloud/telegram/features/vision.js — Feature 2: Image/Document Analysis
'use strict';
var axios = require('axios');

// Analyze image using OpenAI Vision (GPT-4o)
async function analyzeImage(imageUrl, prompt, language) {
  var apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { success: false, error: 'OPENAI_API_KEY not set' };

  var sysprompt = language === 'fa'
    ? 'شما یک دستیار هوش مصنوعی هستید که تصاویر را تحلیل می‌کنید. پاسخ دقیق و مفید بدهید.'
    : 'You are an AI assistant that analyzes images and documents. Be specific and helpful.';

  var userPrompt = prompt || (language === 'fa'
    ? 'این تصویر را کاملاً تحلیل کن. هر چیزی مهم است را توضیح بده.'
    : 'Analyze this image thoroughly. Explain what you see, any text, key information, and what action items or insights you can extract.');

  try {
    var res = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o',
      max_tokens: 1000,
      messages: [
        { role: 'system', content: sysprompt },
        { role: 'user', content: [
          { type: 'text', text: userPrompt },
          { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } }
        ]}
      ]
    }, {
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      timeout: 30000,
    });
    return { success: true, analysis: res.data.choices[0].message.content };
  } catch(e) {
    return { success: false, error: e.response ? e.response.data.error.message : e.message };
  }
}

// Analyze base64 image
async function analyzeImageBuffer(buffer, mimeType, prompt, language) {
  var apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { success: false, error: 'OPENAI_API_KEY not set' };

  var base64 = buffer.toString('base64');
  var dataUrl = 'data:' + (mimeType || 'image/jpeg') + ';base64,' + base64;

  var userPrompt = prompt || (language === 'fa'
    ? 'این تصویر/سند را کاملاً تحلیل کن. متن‌ها، اطلاعات مهم، و هر موردی که باید بدانم را توضیح بده.'
    : 'Analyze this image/document. Extract: all visible text, key information, any red flags or important points, and recommended next steps.');

  try {
    var res = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: userPrompt },
          { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } }
        ]
      }]
    }, {
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      timeout: 45000,
    });
    return { success: true, analysis: res.data.choices[0].message.content };
  } catch(e) {
    return { success: false, error: e.response ? JSON.stringify(e.response.data) : e.message };
  }
}

module.exports = { analyzeImage, analyzeImageBuffer };
