import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { apiBaseUrl, getAlphonsoBridgeStatus, getSocialclawStatus, getStatusSummary } from '../../src/lib/api';
import { Card, Pill, SectionTitle } from '../../src/components/Ui';
import { resetSession, useSession } from '../../src/lib/session';

export default function SettingsScreen() {
  const { session, setApiBaseUrl, setCurrentUserId } = useSession();
  const [summary, setSummary] = useState<any>(null);
  const [bridge, setBridge] = useState<any>(null);
  const [socialclaw, setSocialclaw] = useState<any>(null);
  const [currentUserInput, setCurrentUserInput] = useState(String(session.currentUserId || '1'));
  const [apiBaseInput, setApiBaseInput] = useState(session.apiBaseUrl || apiBaseUrl());
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');

  async function refresh() {
    const [runtime, bridgePayload, socialPayload] = await Promise.all([
      getStatusSummary().catch(() => null),
      getAlphonsoBridgeStatus().catch(() => null),
      getSocialclawStatus().catch(() => null),
    ]);
    setSummary(runtime);
    setBridge(bridgePayload);
    setSocialclaw(socialPayload);
  }

  useEffect(() => {
    refresh().catch(() => {});
  }, []);

  useEffect(() => {
    setCurrentUserInput(String(session.currentUserId || '1'));
    setApiBaseInput(session.apiBaseUrl || apiBaseUrl());
  }, [session.currentUserId, session.apiBaseUrl]);

  async function saveSession() {
    setSaveState('saving');
    await Promise.all([
      setCurrentUserId(currentUserInput.trim() || '1'),
      setApiBaseUrl(apiBaseInput.trim()),
    ]);
    setSaveState('saved');
    setTimeout(() => setSaveState('idle'), 1500);
  }

  async function clearSession() {
    setSaveState('saving');
    await resetSession();
    setCurrentUserInput('1');
    setApiBaseInput(apiBaseUrl());
    setSaveState('saved');
    setTimeout(() => setSaveState('idle'), 1500);
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Card tone="hero">
        <Pill tone="blue">DEPLOYMENT TRUTH</Pill>
        <Text style={styles.h1}>Keep mobile launch honest.</Text>
        <Text style={styles.lead}>
          The mobile app talks to the same backend contract as web and desktop. The launch target is Railway, but the current truth here is still local until cutover.
        </Text>
      </Card>

      <Card>
        <SectionTitle title="Connection" subtitle="This app uses a single backend source of truth." />
        <Text style={styles.row}>API base: {apiBaseUrl()}</Text>
        <Text style={styles.row}>Backend: {summary?.backend?.status || 'unknown'}</Text>
        <Text style={styles.row}>Bot: {summary?.bot?.status || 'unknown'}</Text>
        <Text style={styles.row}>Messenger: {summary?.messenger?.status || 'unknown'}</Text>
      </Card>

      <Card>
        <SectionTitle title="Session" subtitle="Remember the operator and the backend target." />
        <Text style={styles.label}>Operator user id</Text>
        <TextInput
          value={currentUserInput}
          onChangeText={setCurrentUserInput}
          placeholder="1"
          placeholderTextColor="#6b7280"
          keyboardType="numeric"
          style={styles.input}
        />
        <Text style={styles.label}>Backend URL override</Text>
        <TextInput
          value={apiBaseInput}
          onChangeText={setApiBaseInput}
          placeholder="https://acc-production-a26c.up.railway.app"
          placeholderTextColor="#6b7280"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
        <Text style={styles.helper}>
          Saved locally with Secure Store. Leave the backend URL blank to use the default local-or-production routing.
        </Text>
        <View style={styles.actionRow}>
          <Text onPress={() => saveSession().catch(() => {})} style={styles.saveButton}>
            {saveState === 'saving' ? 'Saving...' : saveState === 'saved' ? 'Saved' : 'Save session'}
          </Text>
          <Text onPress={() => clearSession().catch(() => {})} style={styles.clearButton}>
            Reset
          </Text>
        </View>
      </Card>

      <Card>
        <SectionTitle title="Bridge and publishing" subtitle="Alphonso and SocialClaw stay transparent." />
        <View style={styles.pills}>
          <Pill tone={bridge?.configured ? 'good' : 'warn'}>{bridge?.status || 'bridge unknown'}</Pill>
          <Pill tone={socialclaw?.socialclaw?.status === 'connected' ? 'good' : 'warn'}>{socialclaw?.socialclaw?.status || 'setup_required'}</Pill>
        </View>
        <Text style={styles.row}>Telegram fallback only</Text>
        <Text style={styles.row}>SocialClaw publish key still required before live publishing</Text>
      </Card>

      <Card>
        <SectionTitle title="Launch note" subtitle="This is the phone-first front door, not a separate brain." />
        <Text style={styles.row}>ACC orchestrates, messenger handles private chat, approvals gate risky actions, bridge sync stays visible, and mobile becomes the primary interface.</Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0a0a0f' },
  content: { padding: 16, paddingBottom: 40, gap: 14 },
  h1: { color: '#fff', fontSize: 28, fontWeight: '900', lineHeight: 32, marginTop: 8 },
  lead: { color: '#9ca3af', fontSize: 14, lineHeight: 20, marginTop: 8 },
  row: { color: '#d1d5db', fontSize: 13, lineHeight: 19, marginTop: 4 },
  label: { color: '#9ca3af', fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: '700', marginTop: 6 },
  helper: { color: '#9ca3af', fontSize: 12, lineHeight: 18, marginTop: 6 },
  input: {
    marginTop: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    color: '#fff',
    padding: 12,
  },
  saveButton: {
    marginTop: 12,
    color: '#34d399',
    fontWeight: '800',
    fontSize: 13,
  },
  clearButton: {
    marginTop: 12,
    color: '#fca5a5',
    fontWeight: '800',
    fontSize: 13,
  },
  actionRow: { flexDirection: 'row', gap: 18, alignItems: 'center' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
});
