// cloud/telegram/features/imageAnalysis.js — Feature 2: Image/Document Analysis
'use strict';

const axios = require('axios');

async function analyzeImage(imageBase64, mimeType, prompt, language) {
  const claudeKey  = process.env.CLAUDE_API_KEY;
  const openaiKey  = process.env.OPENAI_API_KEY;

  var systemPrompt = language === 'fa'
    ? 'شما یک دستیار هوشمند هستید که تصاویر و اسناد را تحلیل می‌کنید. پاسخ را به فارسی بدهید.'
    : 'You are an intelligent assistant that analyzes images and documents. Be detailed and practical.';

  var userPrompt = prompt || (language === 'fa'
    ? 'این تصویر/سند را تحلیل کنید و نکات مهم را توضیح دهید.'
    : 'Analyze this image/document and explain the key points, any important information, and action items if applicable.');

  // Try Claude first (vision capable)
  if (claudeKey) {
    try {
      var res = await axios.post('https://api.anthropic.com/v1/messages', {
        model: 'claude-opus-4-5',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType || 'image/jpeg', data: imageBase64 } },
            { type: 'text', text: userPrompt }
          ]
        }]
      }, { headers: { 'x-api-key': claudeKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }, timeout: 30000 });
      return res.data.content[0].text;
    } catch(e) { console.log('[imageAnalysis] Claude failed:', e.message); }
  }

  // Fallback: OpenAI GPT-4V
  if (openaiKey) {
    try {
      var res2 = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4-vision-preview',
        messages: [{ role: 'user', content: [
          { type: 'image_url', image_url: { url: 'data:' + (mimeType||'image/jpeg') + ';base64,' + imageBase64 } },
          { type: 'text', text: userPrompt }
        ]}],
        max_tokens: 1024,
      }, { headers: { Authorization: 'Bearer ' + openaiKey }, timeout: 30000 });
      return res2.data.choices[0].message.content;
    } catch(e) { console.log('[imageAnalysis] OpenAI failed:', e.message); }
  }

  return null; // no API available
}

module.exports = { analyzeImage };
