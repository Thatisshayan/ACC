import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Audio } from 'expo-av';
import { voiceTranscribe } from '../lib/api';

type Props = {
  userId?: string;
  onTranscript: (payload: any) => void;
};

export default function VoiceRecorder({ userId, onTranscript }: Props) {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Tap and hold to speak');

  const canRecord = useMemo(() => !busy, [busy]);

  async function start() {
    if (!canRecord) return;
    const perm = await Audio.requestPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Microphone required', 'ACC needs microphone permission for push-to-talk.');
      return;
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      staysActiveInBackground: false,
    });

    const next = new Audio.Recording();
    await next.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    await next.startAsync();
    setRecording(next);
    setStatus('Recording...');
  }

  async function stop() {
    const current = recording;
    if (!current) return;
    setBusy(true);
    setStatus('Uploading audio...');
    try {
      await current.stopAndUnloadAsync();
      const uri = current.getURI();
      setRecording(null);
      if (!uri) throw new Error('No audio URI captured.');

      const form = new FormData();
      form.append('userId', String(userId || 'mobile'));
      form.append('audio', {
        uri,
        name: 'voice.m4a',
        type: 'audio/m4a',
      } as any);

      const payload = await voiceTranscribe(form);
      onTranscript(payload);
      setStatus(payload?.command ? `Heard: ${payload.command}` : 'Voice command ready');
    } catch (err: any) {
      setStatus('Tap and hold to speak');
      Alert.alert('Voice failed', err?.message || 'Could not transcribe audio.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <Pressable
        onPressIn={start}
        onPressOut={stop}
        style={({ pressed }) => [styles.button, pressed && styles.pressed, recording && styles.recording]}
      >
        <Text style={styles.icon}>{recording ? '■' : '🎙'}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>{recording ? 'Release to send' : 'Push to talk'}</Text>
          <Text style={styles.status}>{status}</Text>
        </View>
        {busy ? <ActivityIndicator color="#fff" /> : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  button: {
    minHeight: 78,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  recording: {
    borderColor: 'rgba(16,185,129,0.45)',
    backgroundColor: 'rgba(16,185,129,0.10)',
  },
  pressed: { opacity: 0.88 },
  icon: { color: '#fff', fontSize: 24, width: 28, textAlign: 'center' },
  label: { color: '#fff', fontSize: 15, fontWeight: '700' },
  status: { color: '#9ca3af', fontSize: 12, marginTop: 2 },
});
