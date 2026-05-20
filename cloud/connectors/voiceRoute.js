'use strict';
// cloud/connectors/voiceRoute.js
// Voice recognition route for ACC v2
// POST /api/voice/transcribe — accepts audio, returns transcript + task routing

var express  = require('express');
var fs       = require('fs');
var path     = require('path');
var axios    = require('axios');
var router   = express.Router();
var FormData = require('form-data');

var OPENAI_KEY = process.env.OPENAI_API_KEY;
var ACC_PORT   = process.env.PORT || '4000';

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

// Route command text to ACC Task Bus
async function routeToTaskBus(command, userId) {
  try {
    var res = await axios.post('http://localhost:' + ACC_PORT + '/api/taskbus/task', {
      title: command.slice(0, 80),
      instruction: command,
      assigned_agent: 'claude',
      automation_mode: 'semi_auto',
      approval_required: false,
      created_by: userId || 'voice',
    }, { timeout: 30000 });
    return res.data;
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

    // Route to Task Bus
    var routing = await routeToTaskBus(command, req.body && req.body.userId);

    res.json({
      success: true,
      transcript: transcript,
      command: command,
      taskId: routing.task && routing.task.id,
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
