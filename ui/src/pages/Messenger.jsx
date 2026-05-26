import React, { useEffect, useMemo, useState } from 'react';
import {
  ensureMessengerUser,
  getMessengerInbox,
  getMessengerStatus,
  getMessengerThread,
  listMessengerUsers,
  markMessengerRead,
  sendMessengerMessage,
  updateMessengerPresence,
  createMessengerThread,
} from '../api.js';

const shell = 'rounded-[28px] border border-white/[0.07] bg-white/[0.04] backdrop-blur-xl';

function shortId(id) {
  return String(id || '').slice(0, 8);
}

function MessageBubble({ message, isMine }) {
  return (
    <div className={`max-w-[88%] rounded-[24px] px-4 py-3 border ${isMine ? 'ml-auto bg-emerald-500/12 border-emerald-500/25 text-emerald-50' : 'bg-white/[0.04] border-white/[0.06] text-zinc-100'}`}>
      <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-zinc-500">
        <span>{isMine ? 'You' : shortId(message.senderId)}</span>
        <span>|</span>
        <span>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      <div className="whitespace-pre-wrap leading-relaxed">{message.content || '(empty message)'}</div>
    </div>
  );
}

function PillButton({ active, children, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-2xl border px-4 py-2 text-sm transition-colors ${
        active
          ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-200'
          : 'border-white/[0.08] bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08]'
      }`}
    >
      {children}
    </button>
  );
}

export default function Messenger() {
  const [users, setUsers] = useState([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const [recipientId, setRecipientId] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [subject, setSubject] = useState('');
  const [draft, setDraft] = useState('');
  const [threads, setThreads] = useState([]);
  const [activeThreadId, setActiveThreadId] = useState('');
  const [threadMessages, setThreadMessages] = useState([]);
  const [messengerStatus, setMessengerStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [mode, setMode] = useState('inbox');

  const currentUser = useMemo(() => users.find((user) => String(user.id) === String(currentUserId)), [users, currentUserId]);
  const quickRecipients = useMemo(
    () => users.filter((user) => String(user.id) !== String(currentUserId)).slice(0, 4),
    [users, currentUserId],
  );

  async function refreshUsers() {
    const payload = await listMessengerUsers();
    const nextUsers = Array.isArray(payload.users) ? payload.users : [];
    setUsers(nextUsers);
    if (!currentUserId && nextUsers.length) {
      const preferred = nextUsers.find((user) => user.role === 'human') || nextUsers[0];
      if (preferred) setCurrentUserId(String(preferred.id));
    }
    return nextUsers;
  }

  async function refreshInbox(userId) {
    if (!userId) return [];
    const inbox = await getMessengerInbox(userId);
    const nextThreads = Array.isArray(inbox.threads) ? inbox.threads : [];
    setThreads(nextThreads);
    return nextThreads;
  }

  async function refreshStatus() {
    const payload = await getMessengerStatus();
    setMessengerStatus(payload.messenger || null);
  }

  async function refreshThread(threadId, userId) {
    if (!threadId || !userId) {
      setThreadMessages([]);
      return;
    }
    const payload = await getMessengerThread(threadId, userId);
    setThreadMessages(Array.isArray(payload.messages) ? payload.messages : []);
    await markMessengerRead({ threadId, userId }).catch(() => {});
  }

  async function bootstrap() {
    try {
      setLoading(true);
      await Promise.all([refreshUsers(), refreshStatus()]);
    } catch (e) {
      setError(e.message || 'Failed to load messenger');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    bootstrap();
  }, []);

  useEffect(() => {
    if (!currentUserId) return;
    refreshInbox(currentUserId).catch((e) => setError(e.message || 'Inbox load failed'));
    updateMessengerPresence({ userId: currentUserId, status: 'online', device: 'mobile-web' }).catch(() => {});
    const id = setInterval(() => {
      refreshInbox(currentUserId).catch(() => {});
      refreshStatus().catch(() => {});
    }, 8000);
    return () => clearInterval(id);
  }, [currentUserId]);

  useEffect(() => {
    if (!activeThreadId || !currentUserId) {
      setThreadMessages([]);
      return;
    }
    refreshThread(activeThreadId, currentUserId).catch((e) => setError(e.message || 'Thread load failed'));
  }, [activeThreadId, currentUserId]);

  useEffect(() => {
    const firstThread = threads[0];
    if (firstThread && !activeThreadId) {
      setActiveThreadId(firstThread.id);
    }
  }, [threads, activeThreadId]);

  async function handleEnsureUser() {
    if (!recipientId && !recipientName && !currentUserId) return;
    const payload = {
      userId: currentUserId || recipientId || recipientName || `user_${Date.now()}`,
      name: recipientName || undefined,
      role: 'member',
    };
    setBusy(true);
    setError('');
    try {
      const result = await ensureMessengerUser(payload);
      const ensuredId = String(result.user?.id || payload.userId);
      await refreshUsers();
      setCurrentUserId((currentUserId && String(currentUserId)) || ensuredId);
      setStatusMsg(`User ${ensuredId} ready.`);
      setMode('compose');
    } catch (e) {
      setError(e.message || 'Could not create user');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateThread() {
    if (!currentUserId || !recipientId) {
      setError('Pick both a sender and recipient first.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await createMessengerThread({
        senderId: currentUserId,
        recipientId,
        subject,
        viewerId: currentUserId,
        createdBy: currentUserId,
      });
      const nextThreadId = result.threadId || result.thread?.id;
      if (nextThreadId) {
        setActiveThreadId(nextThreadId);
        await refreshInbox(currentUserId);
      }
      setMode('chat');
      setStatusMsg('Thread created.');
    } catch (e) {
      setError(e.message || 'Could not create thread');
    } finally {
      setBusy(false);
    }
  }

  async function handleSendMessage() {
    if (!currentUserId || !recipientId || !draft.trim()) {
      setError('Pick a sender, a recipient, and a message first.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await sendMessengerMessage({
        senderId: currentUserId,
        recipientId,
        threadId: activeThreadId || undefined,
        subject,
        content: draft.trim(),
        createdBy: currentUserId,
        viewerId: currentUserId,
        transport: 'in_app',
      });
      const nextThreadId = result.thread?.id || result.message?.threadId || activeThreadId;
      if (nextThreadId) setActiveThreadId(nextThreadId);
      setDraft('');
      setStatusMsg(`Message delivered${result.delivery?.mirrored ? ' and mirrored to Telegram fallback where possible' : ''}.`);
      await refreshUsers();
      await refreshInbox(currentUserId);
      if (nextThreadId) await refreshThread(nextThreadId, currentUserId);
      setMode('chat');
    } catch (e) {
      setError(e.message || 'Could not send message');
    } finally {
      setBusy(false);
    }
  }

  const activeThread = threads.find((thread) => thread.id === activeThreadId) || threads[0] || null;

  if (loading) {
    return <div className="p-6 text-zinc-400">Loading private messenger...</div>;
  }

  return (
    <div className="min-h-full bg-gradient-to-b from-[#0a0a0f] via-[#0c0f18] to-[#0a0a0f] p-4 pb-24 md:p-6 md:pb-6">
      <div className="mx-auto max-w-6xl space-y-4 md:space-y-6">
        <div className={`${shell} p-5 md:p-6`}>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-emerald-200">
                Private messenger
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-4xl">Private inbox for ACC users.</h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400 md:text-base">
                User-to-user messages are encrypted at rest inside ACC. Telegram is only a fallback mirror for notifications when a recipient has a linked Telegram chat and the bot is available.
              </p>
              {messengerStatus?.keySource && (
                <div className="mt-4 text-xs text-zinc-500">
                  Encryption source: <span className="font-mono text-zinc-200">{messengerStatus.keySource}</span>
                </div>
              )}
            </div>
            <div className="grid w-full gap-3 sm:grid-cols-3 lg:w-[360px] lg:grid-cols-1">
              <div className="rounded-2xl border border-white/[0.06] bg-black/20 px-4 py-4">
                <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">Threads</div>
                <div className="mt-1 text-xl font-semibold text-white">{threads.length}</div>
              </div>
              <div className="rounded-2xl border border-white/[0.06] bg-black/20 px-4 py-4">
                <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">Users</div>
                <div className="mt-1 text-xl font-semibold text-white">{users.length}</div>
              </div>
              <div className="rounded-2xl border border-white/[0.06] bg-black/20 px-4 py-4">
                <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">Status</div>
                <div className="mt-1 text-sm font-medium text-emerald-300">{messengerStatus?.status || 'ready'}</div>
              </div>
            </div>
          </div>
        </div>

        <div className={`${shell} p-3 md:p-4`}>
          <div className="grid grid-cols-3 gap-2 md:flex md:flex-wrap">
            <PillButton active={mode === 'inbox'} onClick={() => setMode('inbox')}>Inbox</PillButton>
            <PillButton active={mode === 'compose'} onClick={() => setMode('compose')}>Compose</PillButton>
            <PillButton active={mode === 'chat'} onClick={() => setMode('chat')}>Conversation</PillButton>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
          <div className={`${shell} p-4 space-y-4 md:p-5`}>
            <div>
              <div className="text-xs uppercase tracking-[0.22em] text-zinc-500">Identity</div>
              <div className="mt-1 text-sm text-zinc-400">Pick the sender and route a private conversation.</div>
            </div>

            <div className="space-y-3">
              <label className="block text-xs text-zinc-500">
                Sender
                <select
                  value={currentUserId}
                  onChange={(e) => setCurrentUserId(e.target.value)}
                  className="mt-1 w-full rounded-2xl border border-white/[0.08] bg-black/30 px-3 py-2 text-sm text-white outline-none"
                >
                  <option value="">Select a user</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>{user.name || user.id} | {user.role}</option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs text-zinc-500">
                  Recipient ID
                  <input
                    value={recipientId}
                    onChange={(e) => setRecipientId(e.target.value)}
                    placeholder="user-x"
                    className="mt-1 w-full rounded-2xl border border-white/[0.08] bg-black/30 px-3 py-2 text-sm text-white outline-none"
                  />
                </label>
                <label className="block text-xs text-zinc-500">
                  Recipient name
                  <input
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    placeholder="User X"
                    className="mt-1 w-full rounded-2xl border border-white/[0.08] bg-black/30 px-3 py-2 text-sm text-white outline-none"
                  />
                </label>
              </div>

              <label className="block text-xs text-zinc-500">
                Thread subject
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Optional subject"
                  className="mt-1 w-full rounded-2xl border border-white/[0.08] bg-black/30 px-3 py-2 text-sm text-white outline-none"
                />
              </label>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleEnsureUser}
                  disabled={busy}
                  className="rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm text-zinc-100 hover:bg-white/[0.08] disabled:opacity-50"
                >
                  Ensure user
                </button>
                <button
                  onClick={handleCreateThread}
                  disabled={busy || !currentUserId || !recipientId}
                  className="rounded-xl border border-sky-500/25 bg-sky-500/10 px-3 py-2 text-sm text-sky-300 hover:bg-sky-500/15 disabled:opacity-50"
                >
                  Create thread
                </button>
              </div>
            </div>

            <div className="border-t border-white/[0.06] pt-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-white">Quick recipients</div>
                  <div className="mt-1 text-xs text-zinc-500">Tap to prefill a recipient and jump to compose.</div>
                </div>
              </div>
              <div className="mt-3 grid gap-2">
                {quickRecipients.length === 0 ? (
                  <div className="rounded-2xl border border-white/[0.06] bg-black/20 px-4 py-4 text-sm text-zinc-500">
                    No other users yet.
                  </div>
                ) : quickRecipients.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => {
                      setRecipientId(String(user.id));
                      setRecipientName(user.name || '');
                      setMode('compose');
                    }}
                    className="rounded-2xl border border-white/[0.06] bg-black/20 px-4 py-3 text-left transition-colors hover:bg-white/[0.06]"
                  >
                    <div className="text-sm text-white">{user.name || user.id}</div>
                    <div className="mt-1 text-xs text-zinc-500">{user.role} | {user.state}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className={`${shell} flex min-h-[70vh] flex-col p-4 md:p-5`}>
            {mode === 'inbox' && (
              <div className="flex-1 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.22em] text-zinc-500">Inbox</div>
                    <h2 className="mt-1 text-xl font-semibold text-white">Tap a thread to read it</h2>
                  </div>
                  <button
                    onClick={() => currentUserId && refreshInbox(currentUserId)}
                    className="rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm text-zinc-100 hover:bg-white/[0.08]"
                  >
                    Refresh
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  {threads.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/[0.08] bg-black/20 px-4 py-10 text-center text-sm text-zinc-500">
                      No private threads yet. Create one to start a conversation.
                    </div>
                  ) : threads.map((thread) => (
                    <button
                      key={thread.id}
                      onClick={() => {
                        setActiveThreadId(thread.id);
                        setMode('chat');
                      }}
                      className={`rounded-2xl border px-4 py-4 text-left transition-colors ${activeThreadId === thread.id ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-white/[0.06] bg-black/20 hover:bg-white/[0.06]'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm text-white">
                            {thread.subject || thread.participants?.map((user) => user.name || user.id).filter(Boolean).join(' | ') || shortId(thread.id)}
                          </div>
                          <div className="mt-1 text-xs text-zinc-500">
                            {thread.participants?.map((user) => user.name || user.id).join(' | ') || thread.participantIds.join(' | ')}
                          </div>
                        </div>
                        <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-zinc-300">
                          {thread.unreadCount || 0}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {mode === 'compose' && (
              <div className="space-y-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.22em] text-zinc-500">Compose</div>
                  <h2 className="mt-1 text-xl font-semibold text-white">Send an encrypted private message</h2>
                </div>
                <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-4 text-sm text-zinc-400">
                  Sender: <span className="text-zinc-100">{currentUser?.name || currentUserId || 'not selected'}</span> | Recipient: <span className="text-zinc-100">{recipientName || recipientId || 'not selected'}</span>
                </div>
                <label className="block text-xs text-zinc-500">
                  Private message
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={6}
                    placeholder="Write a private message..."
                    className="mt-1 w-full resize-none rounded-[24px] border border-white/[0.08] bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-emerald-500/40"
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleSendMessage}
                    disabled={busy || !currentUserId || !recipientId || !draft.trim()}
                    className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300 hover:bg-emerald-500/15 disabled:opacity-50"
                  >
                    Send encrypted message
                  </button>
                  <button
                    onClick={() => setMode('inbox')}
                    className="rounded-xl border border-white/[0.08] bg-white/[0.05] px-4 py-2 text-sm text-zinc-100 hover:bg-white/[0.08]"
                  >
                    Back to inbox
                  </button>
                </div>
              </div>
            )}

            {mode === 'chat' && (
              <>
                {activeThread ? (
                  <>
                    <div className="flex flex-col gap-3 border-b border-white/[0.06] pb-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="text-xs uppercase tracking-[0.22em] text-zinc-500">Conversation</div>
                        <h2 className="mt-2 text-xl font-semibold text-white">
                          {activeThread.subject || activeThread.participants?.map((user) => user.name || user.id).join(' | ') || shortId(activeThread.id)}
                        </h2>
                        <div className="mt-1 text-xs text-zinc-500">
                          {activeThread.participants?.map((user) => user.name || user.id).join(' | ') || activeThread.participantIds.join(' | ')}
                        </div>
                      </div>
                      <div className="text-xs text-zinc-500">
                        <div>Unread: <span className="text-zinc-200">{activeThread.unreadCount || 0}</span></div>
                        <div>Updated: <span className="text-zinc-200">{activeThread.lastMessageAt ? new Date(activeThread.lastMessageAt).toLocaleString() : '—'}</span></div>
                      </div>
                    </div>

                    <div className="flex-1 space-y-3 overflow-auto py-4">
                      {threadMessages.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-white/[0.08] bg-black/20 px-4 py-10 text-center text-sm text-zinc-500">
                          No messages yet. Send the first private message.
                        </div>
                      ) : threadMessages.map((message) => (
                        <MessageBubble
                          key={message.id}
                          message={message}
                          isMine={String(message.senderId) === String(currentUserId)}
                        />
                      ))}
                    </div>

                    <div className="border-t border-white/[0.06] pt-4">
                      <label className="block text-xs text-zinc-500">
                        Reply
                        <textarea
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          rows={4}
                          placeholder="Write a reply..."
                          className="mt-1 w-full resize-none rounded-[24px] border border-white/[0.08] bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-emerald-500/40"
                        />
                      </label>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          onClick={handleSendMessage}
                          disabled={busy || !currentUserId || !recipientId || !draft.trim()}
                          className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300 hover:bg-emerald-500/15 disabled:opacity-50"
                        >
                          Send
                        </button>
                        <button
                          onClick={() => refreshThread(activeThread.id, currentUserId)}
                          className="rounded-xl border border-white/[0.08] bg-white/[0.05] px-4 py-2 text-sm text-zinc-100 hover:bg-white/[0.08]"
                        >
                          Refresh
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-white/[0.08] bg-black/20 p-10 text-center text-zinc-500">
                    Pick or create a thread to start the conversation.
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {(error || statusMsg) && (
          <div className={`${shell} p-4 ${error ? 'border-red-500/20 bg-red-500/10 text-red-200' : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200'}`}>
            {error || statusMsg}
          </div>
        )}
      </div>
    </div>
  );
}
