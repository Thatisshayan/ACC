// cloud/telegram/features/voice.js — Feature 1: Voice → Whisper transcription
'use strict';
const axios = require('axios');
const path  = require('path');

var TOKEN = null;
function init(token) { TOKEN = token; }

function mimeForExt(ext) {
  var e = String(ext || '.ogg').toLowerCase();
  if (!e.startsWith('.')) e = '.' + e;
  var map = {
    '.ogg': 'audio/ogg', '.oga': 'audio/ogg',
    '.mp3': 'audio/mpeg', '.mpeg': 'audio/mpeg', '.mpga': 'audio/mpeg',
    '.m4a': 'audio/mp4', '.mp4': 'audio/mp4',
    '.wav': 'audio/wav', '.webm': 'audio/webm',
  };
  return map[e] || 'application/octet-stream';
}

async function downloadVoice(fileId) {
  const r1 = await axios.get('https://api.telegram.org/bot' + TOKEN + '/getFile', { params: { file_id: fileId } });
  if (!r1.data.ok) throw new Error('Cannot get file info');
  const r2 = await axios.get('https://api.telegram.org/file/bot' + TOKEN + '/' + r1.data.result.file_path, { responseType: 'arraybuffer', timeout: 30000 });
  return { buffer: Buffer.from(r2.data), ext: path.extname(r1.data.result.file_path) || '.ogg' };
}

async function transcribe(audioBuffer, ext, language) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('[voice] OPENAI_API_KEY not set');
    return null;
  }
  if (!audioBuffer || !Buffer.isBuffer(audioBuffer) || audioBuffer.length === 0) {
    console.warn('[voice] empty audio buffer');
    return null;
  }

  const safeExt = ext && String(ext).startsWith('.') ? String(ext) : ('.' + (ext || 'ogg'));
  const filename = 'audio' + safeExt;

  try {
    const FormData = require('form-data');
    const form = new FormData();
    form.append('file', audioBuffer, { filename: filename, contentType: mimeForExt(safeExt) });
    form.append('model', 'whisper-1');
    if (language === 'fa') form.append('language', 'fa');

    const res = await axios.post('https://api.openai.com/v1/audio/transcriptions', form, {
      headers: Object.assign({ Authorization: 'Bearer ' + apiKey }, form.getHeaders()),
      timeout: 60000,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    const text = res.data && res.data.text ? String(res.data.text).trim() : '';
    return text.length ? text : null;
  } catch (e) {
    var detail = e.response
      ? (e.response.status + ' ' + JSON.stringify(e.response.data || {}).slice(0, 200))
      : e.message;
    console.warn('[voice] transcribe failed:', detail);
    return null;
  }
}

module.exports = { init, downloadVoice, transcribe };
