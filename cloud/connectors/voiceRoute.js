'use strict';
// cloud/connectors/voiceRoute.js
// Voice recognition route for ACC v2
// POST /api/voice/transcribe — accepts audio, returns transcript + task routing

var express  = require('express');
var axios    = require('axios');
var router   = express.Router();
var FormData = require('form-data');
var assistant = require('../messages/service.js');

var OPENAI_KEY = process.env.OPENAI_API_KEY;

// Wake word patterns to strip before routing
var WAKE_WORDS = /^(hey\s+acc|ok\s+acc|okay\s+acc|acc)[,\s]+/i;

function stripWakeWord(text) {
  return text.replace(WAKE_WORDS, '').trim();
}

// Transcribe audio buffer via OpenAI Whisper
async function transcribeWithWhisper(audioBuffer, mimeType) {
  if (!OPENAI_KEY) return null;
  try {
    var form = new FormData();
    form.append('file', audioBuffer, { filename: 'audio.webm', contentType: mimeType || 'audio/webm' });
    form.append('model', 'whisper-1');
    form.append('language', 'en');
    var res = await axios.post('https://api.openai.com/v1/audio/transcriptions', form, {
      headers: Object.assign({ Authorization: 'Bearer ' + OPENAI_KEY }, form.getHeaders()),
      timeout: 30000,
    });
    return res.data.text || null;
  } catch(e) {
    console.warn('[voiceRoute] Whisper failed:', e.message);
    return null;
  }
}

// Route command text through the assistant contract first.
async function routeThroughAssistant(command, userId) {
  try {
    var parsed = assistant.parseAssistantIntent(command);
    var result = await assistant.executeAssistantIntent({
      text: command,
      userId: userId || 'voice',
      intent: parsed.intent,
      arguments: parsed.arguments || {},
      senderType: 'voice',
      transport: 'voice',
      createdBy: userId || 'voice',
      approvalRequired: true,
      meta: {
        source: 'voice',
        parsed_intent: parsed.intent,
      },
    });
    return {
      success: true,
      parsed: parsed,
      result: result,
      taskId: result && result.task && result.task.id ? result.task.id : null,
      routing: result && result.routing ? result.routing : null,
    };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

// POST /api/voice/transcribe
router.post('/transcribe', async function(req, res) {
  try {
    var transcript = '';

    // Option 1: text sent directly (for testing)
    if (req.body && req.body.text) {
      transcript = req.body.text;
    }
    // Option 2: audio file (multipart)
    else if (req.files && req.files.audio) {
      var audioFile = req.files.audio;
      var whisperResult = await transcribeWithWhisper(audioFile.data, audioFile.mimetype);
      if (whisperResult) {
        transcript = whisperResult;
      } else {
        return res.json({ success: false, error: 'Transcription failed. Add OPENAI_API_KEY for Whisper support.' });
      }
    } else {
      return res.json({ success: false, error: 'Send audio file (field: audio) or text (field: text)' });
    }

    // Strip wake word
    var command = stripWakeWord(transcript);
    if (!command) return res.json({ success: false, transcript: transcript, error: 'No command detected after wake word' });

    // Route through assistant parse/execute first.
    var routing = await routeThroughAssistant(command, req.body && req.body.userId);

    res.json({
      success: true,
      transcript: transcript,
      command: command,
      parsed: routing.parsed || null,
      intent: routing.parsed && routing.parsed.intent ? routing.parsed.intent : null,
      assistant: routing.result || null,
      taskId: routing.taskId || null,
      routing: routing.routing || {},
    });
  } catch(e) {
    res.json({ success: false, error: e.message });
  }
});

// GET /api/voice/status
router.get('/status', function(req, res) {
  res.json({
    whisper_available: !!OPENAI_KEY,
    wake_words: ['Hey ACC', 'OK ACC', 'Okay ACC', 'ACC'],
    endpoint: 'POST /api/voice/transcribe',
  });
});

module.exports = router;
