import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { apiBaseUrl, getTaskbusWorkflows, runWorkflow } from '../../src/lib/api';
import { getMiniWebAppUrl } from '../../src/lib/config';
import { useSession } from '../../src/lib/session';
import { Card, Pill, SectionTitle } from '../../src/components/Ui';

function groupByCategory(items: any[]) {
  return items.reduce((acc: Record<string, any[]>, item) => {
    const key = item.category || 'General';
    acc[key] = acc[key] || [];
    acc[key].push(item);
    return acc;
  }, {});
}

export default function WorkflowsScreen() {
  const router = useRouter();
  const { session } = useSession();
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [launching, setLaunching] = useState<string | null>(null);

  async function refresh() {
    const payload = await getTaskbusWorkflows().catch(() => ({ workflows: [] }));
    setWorkflows(Array.isArray(payload.workflows) ? payload.workflows : []);
  }

  useEffect(() => {
    refresh().catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return workflows;
    return workflows.filter((workflow) => {
      const text = [
        workflow.name,
        workflow.category,
        workflow.description,
        workflow.command,
        workflow.user_command,
        (workflow.aliases || []).join(' '),
      ].join(' ').toLowerCase();
      return text.includes(needle);
    });
  }, [workflows, query]);

  const grouped = useMemo(() => groupByCategory(filtered), [filtered]);
  const miniWebUrl = getMiniWebAppUrl();

  async function handleLaunch(workflow: any) {
    const key = workflow.key || workflow.id;
    if (launching) return;
    setLaunching(key);
    try {
      const res = await runWorkflow({ workflow: key, created_by: 'mobile' });
      Alert.alert('Queued', `${workflow.name}\nTask: ${String(res?.task?.id || '').slice(0, 8)}`);
    } catch (err: any) {
      Alert.alert('Launch failed', err?.message || 'Could not launch workflow.');
    } finally {
      setLaunching(null);
    }
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Card tone="hero">
        <Pill tone="blue">WORKFLOW LAUNCHER</Pill>
        <Text style={styles.h1}>Launch ACC workflows from mobile.</Text>
        <Text style={styles.lead}>
          This is the real workflow catalog from the Task Bus. It can also open the mini web app surface for a richer launch view.
        </Text>
        <View style={styles.metaRow}>
          <Pill tone="neutral">{workflows.length} workflows</Pill>
          <Pill tone="neutral">User {session.currentUserId || '1'}</Pill>
          <Pill tone="neutral">Backend {apiBaseUrl()}</Pill>
        </View>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search workflows..."
          placeholderTextColor="#6b7280"
          style={styles.input}
        />
        <Pressable onPress={() => router.push({ pathname: '/webapp', params: { url: miniWebUrl, title: 'ACC Mini Web App' } })} style={styles.webButton}>
          <Text style={styles.webButtonText}>Open mini web app</Text>
        </Pressable>
      </Card>

      {Object.entries(grouped).map(([category, rows]) => (
        <Card key={category}>
          <SectionTitle title={category} subtitle={`${rows.length} workflows`} />
          {(rows as any[]).slice(0, 10).map((workflow) => (
            <View key={workflow.key || workflow.id} style={styles.workflowCard}>
              <View style={styles.workflowTop}>
                <Text style={styles.workflowTitle}>{workflow.name}</Text>
                <Pill tone={workflow.approval_required_for?.length ? 'warn' : 'good'}>
                  {workflow.approval_required_for?.length ? 'approval' : 'open'}
                </Pill>
              </View>
              <Text style={styles.workflowSub}>{workflow.description}</Text>
              <Text style={styles.workflowMeta}>{workflow.command || workflow.user_command}</Text>
              <View style={styles.launchRow}>
                <Pressable
                  onPress={() => handleLaunch(workflow)}
                  disabled={!!launching}
                  style={[styles.launchBtn, launching === (workflow.key || workflow.id) && styles.launchBtnBusy]}
                >
                  <Text style={styles.launchBtnText}>
                    {launching === (workflow.key || workflow.id) ? 'Queuing...' : 'Launch'}
                  </Text>
                </Pressable>
                <Text
                  onPress={() => router.push({ pathname: '/webapp', params: { url: `${miniWebUrl}?workflow=${encodeURIComponent(String(workflow.key || workflow.id))}`, title: workflow.name } })}
                  style={styles.launchLink}
                >
                  Open in mini web app
                </Text>
              </View>
            </View>
          ))}
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0a0a0f' },
  content: { padding: 16, paddingBottom: 40, gap: 14 },
  h1: { color: '#fff', fontSize: 28, fontWeight: '900', lineHeight: 32, marginTop: 8 },
  lead: { color: '#9ca3af', fontSize: 14, lineHeight: 20, marginTop: 8 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  input: {
    marginTop: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    color: '#fff',
    padding: 12,
  },
  webButton: {
    marginTop: 12,
    borderRadius: 16,
    backgroundColor: '#10b981',
    paddingVertical: 12,
    alignItems: 'center',
  },
  webButtonText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  workflowCard: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    gap: 4,
  },
  workflowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  workflowTitle: { color: '#fff', fontWeight: '800', fontSize: 14, flex: 1 },
  workflowSub: { color: '#d1d5db', fontSize: 12, lineHeight: 18 },
  workflowMeta: { color: '#9ca3af', fontSize: 11, lineHeight: 16 },
  launchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
  launchBtn: {
    borderRadius: 12,
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.25)',
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  launchBtnBusy: { opacity: 0.5 },
  launchBtnText: { color: '#34d399', fontSize: 12, fontWeight: '800' },
  launchLink: { color: '#6b7280', fontSize: 12, fontWeight: '700' },
});
