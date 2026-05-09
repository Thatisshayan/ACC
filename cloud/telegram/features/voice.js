// cloud/telegram/features/voice.js — Feature 1: Voice → Whisper transcription
'use strict';
const axios = require('axios');
const fs    = require('fs');
const path  = require('path');
const os    = require('os');

var TOKEN = null;
function init(token) { TOKEN = token; }

async function downloadVoice(fileId) {
  const r1 = await axios.get('https://api.telegram.org/bot' + TOKEN + '/getFile', { params: { file_id: fileId } });
  if (!r1.data.ok) throw new Error('Cannot get file info');
  const r2 = await axios.get('https://api.telegram.org/file/bot' + TOKEN + '/' + r1.data.result.file_path, { responseType: 'arraybuffer', timeout: 30000 });
  return { buffer: Buffer.from(r2.data), ext: path.extname(r1.data.result.file_path) || '.ogg' };
}

async function transcribe(audioBuffer, ext, language) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const tmpPath = path.join(os.tmpdir(), 'acc_voice_' + Date.now() + ext);
  fs.writeFileSync(tmpPath, audioBuffer);
  try {
    const FormData = require('form-data');
    const form = new FormData();
    form.append('file', fs.createReadStream(tmpPath), { filename: 'audio' + ext, contentType: 'audio/ogg' });
    form.append('model', 'whisper-1');
    if (language === 'fa') form.append('language', 'fa');
    const res = await axios.post('https://api.openai.com/v1/audio/transcriptions', form, {
      headers: Object.assign({ Authorization: 'Bearer ' + apiKey }, form.getHeaders()), timeout: 30000,
    });
    return res.data.text || null;
  } finally { try { fs.unlinkSync(tmpPath); } catch(_) {} }
}

module.exports = { init, downloadVoice, transcribe };
