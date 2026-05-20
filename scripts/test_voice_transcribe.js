'use strict';
// Quick Whisper smoke test — node scripts/test_voice_transcribe.js
require('dotenv').config({ path: require('path').join(__dirname, '../.env'), override: false });

var fs = require('fs');
var path = require('path');
var voice = require('../cloud/telegram/features/voice.js');

// Minimal valid WAV: ~0.5s silence at 16kHz mono 16-bit (Whisper accepts it)
function buildSilentWav() {
  var sampleRate = 16000;
  var numSamples = sampleRate / 2;
  var dataSize = numSamples * 2;
  var buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  return buf;
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('SKIP: OPENAI_API_KEY not set in .env');
    process.exit(1);
  }

  var buffer = buildSilentWav();
  console.log('[test] WAV buffer:', buffer.length, 'bytes');

  var text = await voice.transcribe(buffer, '.wav', 'en');
  // Silent audio may return empty string — API success means non-null path works
  if (text === null) {
    console.error('FAIL: transcribe returned null (API error — check logs above)');
    process.exit(1);
  }
  console.log('[test] OK — API accepted audio. Transcription:', JSON.stringify(text || '(empty)'));
}

main().catch(function(e) {
  console.error('FAIL:', e.message);
  process.exit(1);
});
