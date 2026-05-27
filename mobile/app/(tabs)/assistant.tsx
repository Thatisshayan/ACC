import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View, Pressable } from 'react-native';
import {
  executeAssistantPrompt,
  getAssistantStatus,
  getAlphonsoBridgePackets,
  getAlphonsoBridgeStatus,
  getSocialclawStatus,
  getStatusSummary,
  getTaskbusResults,
  listMessengerUsers,
  parseAssistantPrompt,
} from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import VoiceRecorder from '../../src/components/VoiceRecorder';
import { ActionButton, Card, Pill, SectionTitle } from '../../src/components/Ui';

function timeLabel(value: any) {
  try {
    return new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return 'just now';
  }
}

const QUICK_ACTIONS = [
  'Show my inbox',
  'Show pending approvals',
  'Show recent results',
  'Show bridge packets',
  'Open workflows',
  'Apply for jobs for me: product manager remote',
  'Publish social content through alphonso and socialclaw',
  'Send a private message to user X: Ready for approval.',
];

export default function AssistantScreen() {
  const { session } = useSession();
  const [prompt, setPrompt] = useState('Show my inbox');
  const [users, setUsers] = useState<any[]>([]);
  const [status, setStatus] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [bridge, setBridge] = useState<any>(null);
  const [socialclaw, setSocialclaw] = useState<any>(null);
  const [packets, setPackets] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [parsed, setParsed] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const currentUser = useMemo(() => users.find((user) => String(user.id) === String(session.currentUserId)) || users[0] || null, [users, session.currentUserId]);

  async function refresh() {
    const [assistantStatus, runtime, bridgeStatus, socialclawStatus, userList, packetPayload, resultPayload] = await Promise.all([
      getAssistantStatus().catch(() => null),
      getStatusSummary().catch(() => null),
      getAlphonsoBridgeStatus().catch(() => null),
      getSocialclawStatus().catch(() => null),
      listMessengerUsers().catch(() => ({ users: [] })),
      getAlphonsoBridgePackets(4).catch(() => ({ packets: [] })),
      getTaskbusResults(4).catch(() => ({ results: [] })),
    ]);

    setStatus(assistantStatus);
    setSummary(runtime);
    setBridge(bridgeStatus);
    setSocialclaw(socialclawStatus);
    setUsers(Array.isArray(userList?.users) ? userList.users : []);
    setPackets(Array.isArray(packetPayload?.packets) ? packetPayload.packets : []);
    setResults(Array.isArray(resultPayload?.results) ? resultPayload.results : []);
  }

  useEffect(() => {
    refresh().catch((err) => setError(err?.message || 'Could not load assistant state'));
  }, []);

  async function handleParse(text = prompt) {
    if (!text.trim()) return;
    setBusy(true);
    setError('');
    try {
      const payload = await parseAssistantPrompt({ text, userId: String(session.currentUserId) });
      setParsed(payload.parsed || null);
      setResult(null);
    } catch (err: any) {
      setError(err?.message || 'Could not parse prompt');
    } finally {
      setBusy(false);
    }
  }

  async function handleExecute(text = prompt) {
    if (!text.trim()) return;
    setBusy(true);
    setError('');
    try {
      const payload = await executeAssistantPrompt({ text, userId: String(session.currentUserId) });
      setParsed(payload.parsed || null);
      setResult(payload);
    } catch (err: any) {
      setError(err?.message || 'Assistant execution failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleVoice(payload: any) {
    const command = payload?.command || payload?.transcript || '';
    if (!command) return;
    setPrompt(command);
    await handleParse(command);
  }

  const recentPackets = packets.slice(0, 3);
  const truth = summary || {};

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Card tone="hero">
        <Pill tone="good">VOICE-FIRST ASSISTANT</Pill>
        <Text style={styles.h1}>Talk to ACC like a chief operator.</Text>
        <Text style={styles.lead}>
          This mobile shell routes through the same contract-first backend used by web and desktop. Voice, text, approvals, messenger, workflows, and bridge truth all stay under ACC control.
        </Text>
        <View style={styles.sessionRow}>
          <Pill tone="neutral">User {session.currentUserId || '1'}</Pill>
          <Pill tone="neutral">{session.apiBaseUrl || 'auto backend routing'}</Pill>
        </View>
        <View style={styles.quickGrid}>
          {QUICK_ACTIONS.map((item) => (
            <Pressable key={item} onPress={() => setPrompt(item)} style={styles.quickChip}>
              <Text style={styles.quickChipText}>{item}</Text>
            </Pressable>
          ))}
        </View>
      </Card>

      <View style={styles.grid2}>
        <Card>
          <Text style={styles.cardLabel}>Runtime truth</Text>
          <Text style={styles.cardValue}>{truth.overall || 'loading'}</Text>
          <Text style={styles.cardSub}>
            Backend {truth.backend?.status || 'n/a'} - Bot {truth.bot?.status || 'n/a'} - Messenger {truth.messenger?.status || 'n/a'}
          </Text>
        </Card>
        <Card>
          <Text style={styles.cardLabel}>User</Text>
          <Text style={styles.cardValue}>{currentUser?.name || 'Shayan'}</Text>
          <Text style={styles.cardSub}>{users.length} messenger users loaded</Text>
        </Card>
      </View>

      <Card>
        <SectionTitle title="Push-to-talk + text" subtitle="Voice is primary. Text stays available as fallback." />
        <VoiceRecorder userId={String(currentUser?.id || session.currentUserId || '1')} onTranscript={handleVoice} />
        <TextInput
          value={prompt}
          onChangeText={setPrompt}
          placeholder="Ask ACC anything..."
          placeholderTextColor="#6b7280"
          multiline
          style={styles.input}
        />
        <View style={styles.buttonRow}>
          <ActionButton label={busy ? 'Working...' : 'Parse intent'} onPress={() => handleParse(prompt)} tone="secondary" compact />
          <ActionButton label={busy ? 'Working...' : 'Execute'} onPress={() => handleExecute(prompt)} tone="primary" compact />
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </Card>

      <Card>
        <SectionTitle title="Suggested flows" subtitle="Fast paths for common launch actions." />
        <View style={styles.flowGrid}>
          {[
            ['Inbox', 'Show my inbox'],
            ['Approvals', 'Show pending approvals'],
            ['Bridge', 'Show bridge packets'],
            ['Results', 'Show recent results'],
            ['Workflows', 'Open workflows'],
            ['Job apply', 'Apply for jobs for me: product manager remote'],
            ['Publish', 'Publish social content through alphonso and socialclaw'],
          ].map(([title, text]) => (
            <Pressable key={String(text)} onPress={() => setPrompt(String(text))} style={styles.flowCard}>
              <Text style={styles.flowTitle}>{title}</Text>
              <Text style={styles.flowText}>{text}</Text>
            </Pressable>
          ))}
        </View>
      </Card>

      <View style={styles.grid2}>
        <Card>
          <Text style={styles.cardLabel}>Parsed intent</Text>
          <Text style={styles.cardValue}>{parsed?.intent || 'n/a'}</Text>
          <Text style={styles.cardSub}>{parsed?.arguments?.workflowRef || parsed?.arguments?.role || parsed?.arguments?.recipientQuery || 'Waiting for parse.'}</Text>
        </Card>
        <Card>
          <Text style={styles.cardLabel}>Execution result</Text>
          <Text style={styles.cardValue}>{result?.intent || 'n/a'}</Text>
          <Text style={styles.cardSub}>{result?.routing?.status || result?.message || 'No execution yet.'}</Text>
        </Card>
      </View>

      <Card>
        <SectionTitle title="Bridge status and recent packets" subtitle="Alphonso packets stay visible in mobile." />
        <View style={styles.metaRow}>
          <Pill tone={bridge?.status === 'configured' ? 'good' : 'warn'}>{bridge?.status || 'unknown'}</Pill>
          <Pill tone={socialclaw?.socialclaw?.status === 'connected' ? 'good' : 'warn'}>{socialclaw?.socialclaw?.status || 'setup_required'}</Pill>
        </View>
        {recentPackets.length === 0 ? <Text style={styles.empty}>No bridge packets yet.</Text> : recentPackets.map((packet) => (
          <View key={packet.id} style={styles.listItem}>
            <Text style={styles.listTitle}>{packet.kind || 'packet'}</Text>
            <Text style={styles.listSub}>{packet.status || 'received'} - {timeLabel(packet.createdAt || packet.updatedAt)}</Text>
          </View>
          ))}
        </Card>

      <Card>
        <SectionTitle title="Recent results" subtitle="Workflow outcomes stay near the operator surface." />
        {results.length === 0 ? <Text style={styles.empty}>No recent results yet.</Text> : results.map((item) => (
          <View key={item.id} style={styles.listItem}>
            <Text style={styles.listTitle}>{item.summary || 'Untitled result'}</Text>
            <Text style={styles.listSub}>{item.provider_used || 'manual'} - {timeLabel(item.timestamp)}</Text>
          </View>
        ))}
      </Card>

      <Card>
        <SectionTitle title="Live runtime notes" subtitle="Honest states only." />
        <Text style={styles.bullet}>- ACC backend is the brain.</Text>
        <Text style={styles.bullet}>- Telegram stays fallback-only.</Text>
        <Text style={styles.bullet}>- SocialClaw remains setup_required until its API key exists.</Text>
        <Text style={styles.bullet}>- This mobile shell is designed to become the launch front door on iOS and Android.</Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0a0a0f' },
  content: { padding: 16, paddingBottom: 40, gap: 14 },
  h1: { color: '#ffffff', fontSize: 30, lineHeight: 34, fontWeight: '900', marginTop: 8, letterSpacing: -0.5 },
  lead: { color: '#9ca3af', fontSize: 14, lineHeight: 20, marginTop: 8 },
  sessionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  quickChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  quickChipText: { color: '#e5e7eb', fontSize: 11, fontWeight: '700' },
  grid2: { flexDirection: 'row', gap: 12 },
  cardLabel: { color: '#6b7280', fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', fontWeight: '800' },
  cardValue: { color: '#ffffff', fontSize: 24, fontWeight: '900', marginTop: 4 },
  cardSub: { color: '#9ca3af', fontSize: 12, marginTop: 4, lineHeight: 18 },
  input: {
    marginTop: 10,
    minHeight: 104,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    color: '#fff',
    padding: 14,
    textAlignVertical: 'top',
  },
  buttonRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  error: { color: '#fca5a5', marginTop: 10, fontSize: 12 },
  flowGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  flowCard: {
    width: '48%',
    borderRadius: 18,
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 4,
  },
  flowTitle: { color: '#fff', fontWeight: '800', fontSize: 14 },
  flowText: { color: '#9ca3af', fontSize: 11, lineHeight: 16 },
  metaRow: { flexDirection: 'row', gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  empty: { color: '#9ca3af', fontSize: 12, marginTop: 8 },
  listItem: {
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.07)',
  },
  listTitle: { color: '#fff', fontWeight: '800', fontSize: 13 },
  listSub: { color: '#9ca3af', fontSize: 11, marginTop: 3 },
  bullet: { color: '#d1d5db', fontSize: 12, lineHeight: 18, marginTop: 3 },
});
