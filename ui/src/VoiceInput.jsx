import React, { useState, useRef, useEffect } from 'react';

const API = 'http://localhost:4000';

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
      var res = await fetch(API + '/api/voice/transcribe', { method: 'POST', body: form });
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
    <div className="flex flex-col items-center gap-3 p-4">
      <div className="text-xs text-zinc-500 mb-1">🎙️ Say: <span className="text-indigo-400">Hey ACC, ...</span></div>
      <button
        onMouseDown={startListening} onMouseUp={stopListening}
        onTouchStart={startListening} onTouchEnd={stopListening}
        className={`w-16 h-16 rounded-full border-2 flex items-center justify-center text-2xl transition-all duration-200 ${
          listening
            ? 'bg-red-500/20 border-red-500 scale-110 animate-pulse'
            : 'bg-white/[0.05] border-white/20 hover:bg-white/[0.08] hover:border-indigo-500/50'
        }`}
      >
        🎙️
      </button>
      <div className={`text-xs ${statusColors[status]}`}>{statusLabels[status]}</div>
      {transcript && (
        <div className="max-w-xs text-center text-sm text-zinc-300 bg-white/[0.04] rounded-lg px-3 py-2 border border-white/[0.06]">
          "{transcript}"
          {taskId && <div className="text-xs text-zinc-600 mt-1">Task: {taskId.slice(0,8)}</div>}
        </div>
      )}
    </div>
  );
}
