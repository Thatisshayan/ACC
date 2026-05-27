import React, { useState, useRef, useEffect } from 'react';
import { getRuntimeApiBaseUrl } from './lib/api.js';

const API = getRuntimeApiBaseUrl();

export default function VoiceInput({ onResult }) {
  const [listening, setListening]   = useState(false);
  const [transcript, setTranscript] = useState('');
  const [status, setStatus]         = useState('idle'); // idle|listening|processing|done|error
  const [taskId, setTaskId]         = useState(null);
  const recorderRef = useRef(null);
  const chunksRef   = useRef([]);

  function startListening() {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(function(stream) {
        chunksRef.current = [];
        var recorder = new MediaRecorder(stream);
        recorderRef.current = recorder;
        recorder.ondataavailable = function(e) { if (e.data.size > 0) chunksRef.current.push(e.data); };
        recorder.onstop = handleStop;
        recorder.start();
        setListening(true);
        setStatus('listening');
        setTranscript('');
        setTaskId(null);
      })
      .catch(function(e) { setStatus('error'); setTranscript('Mic access denied: ' + e.message); });
  }

  function stopListening() {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
      recorderRef.current.stream.getTracks().forEach(function(t) { t.stop(); });
    }
    setListening(false);
  }

  async function handleStop() {
    setStatus('processing');
    var blob = new Blob(chunksRef.current, { type: 'audio/webm' });
    var form = new FormData();
    form.append('audio', blob, 'voice.webm');

    try {
      var res = await fetch((API ? API : '') + '/api/voice/transcribe', { method: 'POST', body: form });
      var data = await res.json();
      if (data.success) {
        setTranscript(data.command || data.transcript);
        setTaskId(data.taskId);
        setStatus('done');
        if (onResult) onResult(data);
      } else {
        setStatus('error');
        setTranscript(data.error || 'Transcription failed');
      }
    } catch(e) {
      setStatus('error');
      setTranscript('Connection failed: ' + e.message);
    }
  }

  var statusColors = { idle: 'text-zinc-500', listening: 'text-red-400', processing: 'text-amber-400', done: 'text-emerald-400', error: 'text-red-400' };
  var statusLabels = { idle: 'Tap to speak', listening: '🔴 Listening...', processing: '⏳ Processing...', done: '✅ Command sent', error: '❌ Error' };

  return (
    <div className="flex flex-col items-center gap-4 p-4 md:p-5">
      <div className="text-xs uppercase tracking-[0.22em] text-zinc-500 text-center">Voice command</div>
      <button
        onMouseDown={startListening} onMouseUp={stopListening}
        onTouchStart={startListening} onTouchEnd={stopListening}
        aria-label="Voice input"
        className={`w-20 h-20 md:w-24 md:h-24 rounded-full border-2 flex items-center justify-center text-3xl transition-all duration-200 shadow-[0_0_0_0_rgba(16,185,129,0)] ${
          listening
            ? 'bg-red-500/20 border-red-500 scale-110 animate-pulse shadow-[0_0_40px_rgba(239,68,68,0.20)]'
            : 'bg-gradient-to-br from-emerald-500/20 via-white/[0.06] to-sky-500/10 border-white/20 hover:bg-white/[0.08] hover:border-emerald-500/50 shadow-[0_0_32px_rgba(16,185,129,0.10)]'
        }`}
      >
        <span className="translate-y-[1px]">🎙️</span>
      </button>
      <div className={`text-xs text-center ${statusColors[status]}`}>{statusLabels[status]}</div>
      <div className="text-[11px] text-zinc-500 text-center max-w-xs leading-relaxed">
        Press and hold, or tap to speak. ACC will transcribe your command and hand it to the assistant parser.
      </div>
      {transcript && (
        <div className="max-w-sm text-center text-sm text-zinc-300 bg-white/[0.04] rounded-2xl px-4 py-3 border border-white/[0.06]">
          "{transcript}"
          {taskId && <div className="text-xs text-zinc-600 mt-1">Task: {taskId.slice(0,8)}</div>}
        </div>
      )}
    </div>
  );
}
