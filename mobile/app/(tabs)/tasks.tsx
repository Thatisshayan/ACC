import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { getTaskbusResults, getTaskbusTasks } from '../../src/lib/api';
import { Card, Pill, SectionTitle } from '../../src/components/Ui';

function groupByStatus(tasks: any[]) {
  return tasks.reduce((acc: Record<string, any[]>, task) => {
    const key = task.status || 'pending';
    acc[key] = acc[key] || [];
    acc[key].push(task);
    return acc;
  }, {});
}

export default function TasksScreen() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);

  async function refresh() {
    const [taskPayload, resultPayload] = await Promise.all([
      getTaskbusTasks().catch(() => ({ tasks: [] })),
      getTaskbusResults(5).catch(() => ({ results: [] })),
    ]);
    setTasks(Array.isArray(taskPayload.tasks) ? taskPayload.tasks : []);
    setResults(Array.isArray(resultPayload.results) ? resultPayload.results : []);
  }

  useEffect(() => {
    refresh().catch(() => {});
  }, []);

  const grouped = useMemo(() => groupByStatus(tasks), [tasks]);

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Card tone="hero">
        <Pill tone="blue">LIVE TASK LANES</Pill>
        <Text style={styles.h1}>Task Bus truth, organized for launch.</Text>
        <Text style={styles.lead}>
          P0/P1/P2 work should stay visible in lanes, not buried in a table.
        </Text>
        <View style={styles.metrics}>
          <Pill tone="good">Total {tasks.length}</Pill>
          <Pill tone="warn">Waiting approval {grouped.waiting_approval?.length || 0}</Pill>
          <Pill tone="bad">Failed {grouped.failed?.length || 0}</Pill>
        </View>
      </Card>

      {Object.entries(grouped).slice(0, 5).map(([status, rows]) => (
        <Card key={status}>
          <SectionTitle title={`${status.replace(/_/g, ' ')}`} subtitle={`${rows.length} tasks`} />
          {(rows as any[]).slice(0, 5).map((task) => (
            <View key={task.id} style={styles.task}>
              <Text style={styles.title}>{task.title || 'Untitled task'}</Text>
              <Text style={styles.sub}>Assigned to {task.assigned_agent || 'human'} - Priority {task.priority || 'normal'}</Text>
            </View>
          ))}
        </Card>
      ))}

      <Card>
        <SectionTitle title="Recent results" subtitle="The freshest workflow outcomes stay near the task lanes." />
        {results.length === 0 ? <Text style={styles.empty}>No recent results yet.</Text> : results.map((result) => (
          <View key={result.id} style={styles.task}>
            <Text style={styles.title}>{result.summary || 'Untitled result'}</Text>
            <Text style={styles.sub}>{result.provider_used || 'manual'} - {result.execution_mode || 'n/a'}</Text>
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
  task: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    gap: 3,
  },
  title: { color: '#fff', fontWeight: '800', fontSize: 14 },
  sub: { color: '#9ca3af', fontSize: 12 },
});
