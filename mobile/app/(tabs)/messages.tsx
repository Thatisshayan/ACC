import React, { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { apiBaseUrl, createMessengerThread, getMessengerInbox, getMessengerThread, listMessengerUsers, sendMessengerMessage } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { ActionButton, Card, Pill, SectionTitle } from '../../src/components/Ui';

function timeLabel(value: any) {
  try {
    return new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return 'just now';
  }
}

export default function MessagesScreen() {
  const { session } = useSession();
  const [users, setUsers] = useState<any[]>([]);
  const currentUserId = String(session.currentUserId || '1');
  const [threads, setThreads] = useState<any[]>([]);
  const [selectedThread, setSelectedThread] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [recipientQuery, setRecipientQuery] = useState('user X');
  const [body, setBody] = useState('Ready for approval.');
  const [composerMode, setComposerMode] = useState<'inbox' | 'compose' | 'thread'>('inbox');
  const [loading, setLoading] = useState(false);

  const currentUser = useMemo(() => users.find((user) => String(user.id) === String(currentUserId)) || users[0] || null, [users, currentUserId]);

  async function refresh() {
    const [usersPayload, inboxPayload] = await Promise.all([
      listMessengerUsers().catch(() => ({ users: [] })),
      getMessengerInbox(currentUserId).catch(() => ({ threads: [] })),
    ]);
    setUsers(Array.isArray(usersPayload.users) ? usersPayload.users : []);
    setThreads(Array.isArray(inboxPayload.threads) ? inboxPayload.threads : []);
  }

  useEffect(() => {
    refresh().catch(() => {});
  }, [currentUserId]);

  async function openThread(thread: any) {
    setSelectedThread(thread);
    setComposerMode('thread');
    const payload = await getMessengerThread(thread.id, currentUserId);
    setMessages(Array.isArray(payload.messages) ? payload.messages : []);
  }

  async function createOrSend() {
    const user = users.find((item) => String(item.id) === String(currentUserId)) || users[0];
    if (!user) {
      Alert.alert('No user loaded', 'Load messenger users before sending a message.');
      return;
    }

    try {
      if (composerMode === 'compose') {
        const recipient = users.find((item) => String(item.name || '').toLowerCase().includes(recipientQuery.toLowerCase()))
          || users.find((item) => String(item.id) === recipientQuery)
          || users.find((item) => String(item.name || '').toLowerCase() === recipientQuery.toLowerCase());
        if (!recipient) {
          Alert.alert('Recipient missing', 'Could not find that recipient.');
          return;
        }
        const threadPayload = await createMessengerThread({
          senderId: currentUserId,
          recipientIds: [recipient.id],
          subject: 'ACC private message',
        });
        const thread = threadPayload.thread || threadPayload.data?.thread || null;
        const threadId = thread?.id || threadPayload.threadId;
        if (threadId) {
          await sendMessengerMessage({
            threadId,
            senderId: currentUserId,
            recipientIds: [recipient.id],
            content: body,
            senderType: 'user',
            transport: 'in_app',
          });
          setBody('');
          setRecipientQuery(recipient.name || String(recipient.id));
          await refresh();
          await openThread(thread || { id: threadId });
        }
      } else if (selectedThread) {
        await sendMessengerMessage({
          threadId: selectedThread.id,
          senderId: currentUserId,
          recipientIds: selectedThread.participantIds?.filter((id: string) => String(id) !== String(currentUserId)) || [],
          content: body,
          senderType: 'user',
          transport: 'in_app',
        });
        setBody('');
        await openThread(selectedThread);
      }
    } catch (err: any) {
      Alert.alert('Send failed', err?.message || 'Could not send message.');
    }
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Card tone="hero">
        <Pill tone="blue">PRIVATE INBOX</Pill>
        <Text style={styles.h1}>User-to-user messaging, encrypted at rest.</Text>
        <Text style={styles.lead}>
          ACC keeps the messenger private and fallback-aware. Telegram only mirrors notifications when a linked user is available.
        </Text>
        <View style={styles.sessionRow}>
          <Pill tone="neutral">User {currentUserId}</Pill>
          <Pill tone="neutral">{apiBaseUrl()}</Pill>
        </View>
        <View style={styles.topRow}>
          <Pill tone="good">Threads {threads.length}</Pill>
          <Pill tone="neutral">Users {users.length}</Pill>
          <Pill tone="warn">Telegram fallback only</Pill>
        </View>
      </Card>

      <Card>
        <SectionTitle title="Inbox" subtitle="Tap a thread to open the conversation." />
        <View style={styles.switchRow}>
          <ActionButton label="Inbox" onPress={() => setComposerMode('inbox')} tone={composerMode === 'inbox' ? 'primary' : 'secondary'} compact />
          <ActionButton label="Compose" onPress={() => setComposerMode('compose')} tone={composerMode === 'compose' ? 'primary' : 'secondary'} compact />
          <ActionButton label="Thread" onPress={() => setComposerMode('thread')} tone={composerMode === 'thread' ? 'primary' : 'secondary'} compact />
        </View>
      </Card>

      {composerMode === 'inbox' ? (
        <Card>
          {threads.length === 0 ? <Text style={styles.empty}>No threads yet. Start a private message.</Text> : (
            threads.map((thread) => (
              <Pressable key={thread.id} onPress={() => openThread(thread)} style={styles.threadCard}>
                <Text style={styles.threadTitle}>{thread.subject || 'Private thread'}</Text>
                <Text style={styles.threadSub}>{thread.participantNames?.join(', ') || 'Participants hidden'} - {timeLabel(thread.updatedAt)}</Text>
              </Pressable>
            ))
          )}
        </Card>
      ) : null}

      {composerMode !== 'inbox' ? (
        <Card>
          <SectionTitle title={composerMode === 'compose' ? 'Compose' : 'Conversation'} subtitle="Message delivery stays inside ACC." />
          {composerMode === 'compose' ? (
            <TextInput
              value={recipientQuery}
              onChangeText={setRecipientQuery}
              placeholder="Recipient name or id"
              placeholderTextColor="#6b7280"
              style={styles.input}
            />
          ) : null}
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="Write your message..."
            placeholderTextColor="#6b7280"
            multiline
            style={[styles.input, styles.messageInput]}
          />
          <ActionButton label={composerMode === 'compose' ? 'Send new thread' : 'Send message'} onPress={createOrSend} tone="primary" />
          {selectedThread ? (
            <View style={styles.threadMeta}>
              <Pill tone="neutral">Thread {selectedThread.id?.slice(0, 8)}</Pill>
              <Pill tone="neutral">{selectedThread.participantNames?.join(', ') || 'Participants hidden'}</Pill>
            </View>
          ) : null}
          {messages.length ? (
            <View style={styles.messageList}>
              {messages.map((message) => (
                <View key={message.id} style={[styles.messageBubble, String(message.senderId) === String(currentUserId) ? styles.meBubble : styles.themBubble]}>
                  <Text style={styles.messageText}>{message.content}</Text>
                  <Text style={styles.messageTime}>{timeLabel(message.createdAt || message.timestamp)}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </Card>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0a0a0f' },
  content: { padding: 16, paddingBottom: 40, gap: 14 },
  h1: { color: '#fff', fontSize: 28, fontWeight: '900', lineHeight: 32, marginTop: 8 },
  lead: { color: '#9ca3af', fontSize: 14, lineHeight: 20, marginTop: 8 },
  sessionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  topRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  switchRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  empty: { color: '#9ca3af', fontSize: 12 },
  threadCard: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  threadTitle: { color: '#fff', fontWeight: '800', fontSize: 14 },
  threadSub: { color: '#9ca3af', fontSize: 12, marginTop: 3 },
  input: {
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    color: '#fff',
    padding: 14,
    marginBottom: 10,
  },
  messageInput: { minHeight: 96, textAlignVertical: 'top' },
  threadMeta: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 12 },
  messageList: { gap: 10, marginTop: 14 },
  messageBubble: {
    borderRadius: 18,
    padding: 12,
    maxWidth: '92%',
    borderWidth: 1,
  },
  meBubble: { backgroundColor: 'rgba(16,185,129,0.12)', borderColor: 'rgba(16,185,129,0.18)', alignSelf: 'flex-end' },
  themBubble: { backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.08)', alignSelf: 'flex-start' },
  messageText: { color: '#fff', fontSize: 14, lineHeight: 20 },
  messageTime: { color: '#9ca3af', fontSize: 10, marginTop: 6 },
});
