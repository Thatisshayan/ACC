import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { approveAdminApproval, getTaskbusApprovals, rejectAdminApproval } from '../../src/lib/api';
import { ActionButton, Card, Pill, SectionTitle } from '../../src/components/Ui';

function timeLabel(value: any) {
  try {
    return new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return 'just now';
  }
}

export default function ApprovalsScreen() {
  const [approvals, setApprovals] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  async function refresh() {
    const payload = await getTaskbusApprovals().catch(() => ({ approvals: [] }));
    setApprovals(Array.isArray(payload.approvals) ? payload.approvals : []);
  }

  useEffect(() => {
    refresh().catch(() => {});
  }, []);

  async function decide(id: string, action: 'approve' | 'reject') {
    setBusy(id);
    try {
      if (action === 'approve') await approveAdminApproval(id);
      else await rejectAdminApproval(id);
      await refresh();
    } catch (err: any) {
      Alert.alert('Approval failed', err?.message || 'Could not complete approval.');
    } finally {
      setBusy(null);
    }
  }

  const pending = approvals.filter((approval) => approval.status === 'pending');

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Card tone="hero">
        <Pill tone="warn">APPROVALS INBOX</Pill>
        <Text style={styles.h1}>Review risky actions before they leave ACC.</Text>
        <Text style={styles.lead}>
          The mobile app keeps approvals readable, mobile-friendly, and human-led so launch decisions stay honest.
        </Text>
        <View style={styles.metrics}>
          <Pill tone="warn">Pending {pending.length}</Pill>
          <Pill tone="neutral">Total {approvals.length}</Pill>
        </View>
      </Card>

      <Card>
        <SectionTitle title="Pending approvals" subtitle="Approve or reject directly from the phone." />
        {pending.length === 0 ? <Text style={styles.empty}>No approvals waiting right now.</Text> : pending.map((approval) => (
          <View key={approval.id} style={styles.approval}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{approval.action || 'high_risk_execution'}</Text>
                <Text style={styles.sub}>Task {String(approval.task_id || '').slice(0, 8)} - {timeLabel(approval.timestamp)}</Text>
              </View>
              <Pill tone="warn">Pending</Pill>
            </View>
            <Text style={styles.note}>Keep approval human-led before external actions or publishes.</Text>
            <View style={styles.buttonRow}>
              <ActionButton label={busy === approval.id ? 'Working...' : 'Approve'} onPress={() => decide(approval.id, 'approve')} tone="primary" compact />
              <ActionButton label={busy === approval.id ? 'Working...' : 'Reject'} onPress={() => decide(approval.id, 'reject')} tone="danger" compact />
            </View>
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0a0a0f' },
  content: { padding: 16, paddingBottom: 40, gap: 14 },
  h1: { color: '#fff', fontSize: 28, fontWeight: '900', lineHeight: 32, marginTop: 8 },
  lead: { color: '#9ca3af', fontSize: 14, lineHeight: 20, marginTop: 8 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  empty: { color: '#9ca3af', fontSize: 12 },
  approval: {
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    gap: 8,
  },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  title: { color: '#fff', fontWeight: '800', fontSize: 15 },
  sub: { color: '#9ca3af', fontSize: 12, marginTop: 3 },
  note: { color: '#d1d5db', fontSize: 12, lineHeight: 18 },
  buttonRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
});
