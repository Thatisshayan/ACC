'use strict';

const axios = require('axios');
const store = require('./store.js');
const taskbusStore = require('../taskbus/store.js');
const telegramUsers = require('../telegram/users.js');
const workflowDispatcher = require('../workflows/dispatcher.js');
const workflowRegistry = require('../workflows/registry.js');
const socialclaw = require('../integrations/socialclaw.js');
const bridgeService = require('../services/alphonsoBridgeService.js');
const { getBridgeStatus } = require('../services/alphonsoBridgeService.js');

const TELEGRAM_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();

function getTelegramChatId(user) {
  if (!user) return null;
  return user.telegramChatId || user.telegram_chat_id || user.telegram_chatid || user.telegram_id || null;
}

function makeTelegramClient() {
  if (!TELEGRAM_TOKEN) return null;
  return axios.create({
    baseURL: `https://api.telegram.org/bot${TELEGRAM_TOKEN}`,
    timeout: 15000,
  });
}

async function mirrorMessageToTelegram(messageView) {
  const client = makeTelegramClient();
  if (!client) return { mirrored: false, reason: 'telegram_not_configured' };

  const recipients = (messageView.recipientIds || [])
    .map((userId) => telegramUsers.getUserProfile(String(userId)))
    .filter(Boolean)
    .map((user) => ({ user, chatId: getTelegramChatId(user) }))
    .filter((item) => Boolean(item.chatId));

  if (!recipients.length) {
    return { mirrored: false, reason: 'no_telegram_recipients' };
  }

  const sender = store.resolveUser(messageView.senderId);
  const preview = String(messageView.content || '').slice(0, 160) || '(empty message)';
  const text = [
    '💬 *ACC private message*',
    `From: ${sender && sender.name ? sender.name : messageView.senderId}`,
    `Thread: ${messageView.threadId.slice(0, 8)}`,
    '',
    preview,
  ].join('\n');

  const results = [];
  for (const recipient of recipients) {
    try {
      const res = await client.post('/sendMessage', {
        chat_id: recipient.chatId,
        text,
        parse_mode: 'Markdown',
      });
      results.push({ userId: recipient.user.id, ok: Boolean(res.data && res.data.ok) });
    } catch (err) {
      results.push({ userId: recipient.user.id, ok: false, error: err.message });
    }
  }

  return { mirrored: true, results };
}

function resolveRecipientList(payload) {
  const recipientIds = Array.isArray(payload.recipientIds) ? payload.recipientIds : [];
  if (recipientIds.length) return recipientIds.map(String);
  if (payload.recipientId) return [String(payload.recipientId)];
  return [];
}

function createThread(payload) {
  const thread = store.ensureThread({
    participantIds: payload.participantIds || [payload.senderId].concat(resolveRecipientList(payload)),
    senderId: payload.senderId,
    subject: payload.subject,
    transport: payload.transport || 'in_app',
    createdBy: payload.createdBy || payload.senderId,
  });
  return { thread, threadView: store.getThreadView(thread, payload.viewerId || payload.senderId) };
}

async function sendMessage(payload) {
  const message = store.addMessage({
    threadId: payload.threadId,
    senderId: payload.senderId,
    recipientIds: resolveRecipientList(payload),
    content: payload.content,
    subject: payload.subject,
    attachments: payload.attachments || [],
    meta: payload.meta || {},
    senderType: payload.senderType || 'user',
    transport: payload.transport || 'in_app',
    createdBy: payload.createdBy || payload.senderId,
    clientMessageId: payload.clientMessageId || null,
  });

  const delivery = await mirrorMessageToTelegram(message);
  return {
    success: true,
    message,
    delivery,
    thread: store.getThreadView(store.findThreadById(message.threadId), payload.viewerId || payload.senderId),
  };
}

function listInbox(userId) {
  return {
    success: true,
    userId: String(userId),
    threads: store.listThreadsForUser(userId),
  };
}

function getThread(threadId, viewerId) {
  const thread = store.findThreadById(threadId);
  if (!thread) return null;
  return {
    success: true,
    thread: store.getThreadView(thread, viewerId),
    messages: store.getMessagesForThread(threadId),
  };
}

function markRead(payload) {
  return store.markThreadRead(payload.threadId, payload.userId, payload.messageId || null);
}

function updatePresence(payload) {
  return store.setPresence(payload.userId, payload.status || 'online', {
    device: payload.device || 'web',
    threadId: payload.threadId || null,
  });
}

function searchUserByQuery(query) {
  const text = String(query || '').trim().toLowerCase();
  if (!text) return null;
  const exact = store.listUsers().find((user) => String(user.id) === text || String(user.name || '').toLowerCase() === text);
  if (exact) return exact;
  return store.listUsers().find((user) => {
    const name = String(user.name || '').toLowerCase();
    return name.includes(text) || String(user.id).includes(text);
  }) || null;
}

function stripJobRoleNoise(text) {
  return String(text || '')
    .replace(/^for\s+me\s*[:,-]?\s*/i, '')
    .replace(/^the\s+role\s*[:,-]?\s*/i, '')
    .trim();
}

function listRecentApprovals(limit = 8) {
  return (taskbusStore.getPendingApprovals ? taskbusStore.getPendingApprovals() : [])
    .slice(0, Math.max(0, Number(limit) || 8));
}

function listRecentResults(limit = 8) {
  return taskbusStore.getAllResults ? taskbusStore.getAllResults(limit) : [];
}

function listRecentBridgePackets(limit = 8) {
  return bridgeService.listPackets ? bridgeService.listPackets(limit) : [];
}

function buildWorkflowLaunchArgs(text, lower) {
  const clean = String(text || '').trim();
  if (/\bpublish\b/.test(lower) && /\b(alphonso|socialclaw)\b/.test(lower)) {
    return {
      mode: 'single',
      workflowRef: 'acc:social_publish_pipeline',
      input: clean,
      prompt: clean,
      preferKind: 'publishing_pipeline',
    };
  }
  const workflowMatch = clean.match(/^(?:run|launch|start|open|use)\s+(?:workflow|the workflow)\s*:?\s*(.+?)(?:\s+(?:for|with|using)\s+(.+))?$/i)
    || clean.match(/^workflow:\s*(.+?)(?:\s+(?:for|with|using)\s+(.+))?$/i)
    || clean.match(/^crew:\s*use-workflow\s+(.+?)(?:\s+(?:for|with|using)\s+(.+))?$/i);

  if (workflowMatch) {
    const body = String(workflowMatch[1] || '').trim();
    const parallelMatch = body.match(/^parallel\s+(.+)$/i);
    const refs = (parallelMatch ? parallelMatch[1] : body)
      .split(/[,;+]/)
      .map((item) => String(item || '').trim())
      .filter(Boolean);
    return {
      mode: refs.length > 1 || parallelMatch ? 'parallel' : 'single',
      workflowRef: refs[0] || body,
      workflowRefs: refs,
      input: String(workflowMatch[2] || '').trim(),
      prompt: clean,
      preferKind: clean.toLowerCase().includes('crew:') ? 'crewai_project' : undefined,
    };
  }

  const jobMatch = clean.match(/^apply for jobs for me\s*[:,-]?\s*(.+)$/i)
    || clean.match(/^apply for jobs for this role(?: for me)?\s*[:,-]?\s*(.+)$/i)
    || clean.match(/^job apply(?: for)?\s*[:,-]?\s*(.+)$/i)
    || clean.match(/^find jobs(?: for me)?\s*[:,-]?\s*(.+)$/i);
  if (jobMatch) {
    const role = stripJobRoleNoise(jobMatch[1] || '');
    return {
      mode: 'single',
      workflowRef: 'job_application_workflow',
      input: role || clean,
      role,
      searchQuery: role ? `${role} jobs` : '',
      preferKind: 'crewai_project',
      prompt: clean,
    };
  }

  return null;
}

function buildContentActionArgs(text) {
  const clean = String(text || '').trim();
  const lower = clean.toLowerCase();
  const contentMatch = clean.match(/^(preview|validate|publish|delete|accounts|usage|status)\s+(?:social\s+)?(?:post|content|draft|lane)?\s*[:,-]?\s*(.*)$/i)
    || clean.match(/^(?:socialclaw|social)\s*[:,-]?\s*(preview|validate|publish|delete|accounts|usage|status)\s*(.*)$/i);

  if (contentMatch) {
    const action = String(contentMatch[1] || '').trim().toLowerCase();
    const content = String(contentMatch[2] || '').trim();
    return { action, content, prompt: clean };
  }

  if (/\b(preview|validate|publish|delete)\b/.test(lower) && /\b(social|post|content|draft|socialclaw)\b/.test(lower)) {
    const action = lower.includes('preview') ? 'preview'
      : lower.includes('validate') ? 'validate'
      : lower.includes('delete') ? 'delete'
      : 'publish';
    return { action, content: clean, prompt: clean };
  }

  if (/\b(accounts|usage|status)\b/.test(lower) && /\bsocialclaw\b/.test(lower)) {
    const action = lower.includes('accounts') ? 'accounts'
      : lower.includes('usage') ? 'usage'
      : 'status';
    return { action, content: '', prompt: clean };
  }

  return null;
}

function parseAssistantIntent(text) {
  const input = String(text || '').trim();
  const lower = input.toLowerCase();

  if (!input) {
    return { intent: 'assistant.idle', confidence: 0, arguments: {}, needsClarification: false };
  }

  if (/\b(status|health|dashboard)\b/.test(lower)) {
    return { intent: 'system.status', confidence: 0.9, arguments: {}, needsClarification: false };
  }

  if (/\b(inbox|messages|threads)\b/.test(lower) && !/\b(send|message to|dm|text)\b/.test(lower)) {
    return { intent: 'messenger.inbox', confidence: 0.85, arguments: {}, needsClarification: false };
  }

  if (/\b(pending approvals|approvals inbox|review queue|show approvals)\b/.test(lower)) {
    return { intent: 'taskbus.approvals', confidence: 0.88, arguments: {}, needsClarification: false };
  }

  if (/\b(recent results|latest results|show results)\b/.test(lower)) {
    return { intent: 'taskbus.results', confidence: 0.82, arguments: {}, needsClarification: false };
  }

  if (/\b(bridge packets|bridge history|alphonso packets)\b/.test(lower)) {
    return { intent: 'bridge.packets', confidence: 0.84, arguments: {}, needsClarification: false };
  }

  if (/\b(open workflows|workflow catalog|list workflows|show workflows|workflow launcher)\b/.test(lower)) {
    return { intent: 'workflow.catalog', confidence: 0.9, arguments: {}, needsClarification: false };
  }

  const workflowArgs = buildWorkflowLaunchArgs(input, lower);
  if (workflowArgs) {
    return {
      intent: workflowArgs.mode === 'parallel' ? 'workflow.parallel' : 'workflow.launch',
      confidence: 0.92,
      arguments: workflowArgs,
      needsClarification: false,
    };
  }

  const contentArgs = buildContentActionArgs(input);
  if (contentArgs) {
    return {
      intent: `content.${contentArgs.action}`,
      confidence: 0.9,
      arguments: contentArgs,
      needsClarification: false,
    };
  }

  const sendMatch = input.match(/^(?:send|message|dm|text)\s+(?:to\s+)?([^:]+?)(?:\s*[:,-]\s*|\s+)(.+)$/i);
  if (sendMatch) {
    return {
      intent: 'messenger.send',
      confidence: 0.92,
      arguments: {
        recipientQuery: sendMatch[1].trim(),
        content: sendMatch[2].trim(),
      },
      needsClarification: false,
    };
  }

  const toMatch = input.match(/^(?:send|message|dm)\s+to\s+(.+?)\s+(?:about|:|-)\s+(.+)$/i);
  if (toMatch) {
    return {
      intent: 'messenger.send',
      confidence: 0.9,
      arguments: {
        recipientQuery: toMatch[1].trim(),
        content: toMatch[2].trim(),
      },
      needsClarification: false,
    };
  }

  return {
    intent: 'assistant.chat',
    confidence: 0.4,
    arguments: {},
    needsClarification: false,
  };
}

async function executeAssistantIntent(payload) {
  const userId = String(payload.userId || payload.senderId || '').trim();
  const parsed = payload.intent ? {
    intent: payload.intent,
    arguments: payload.arguments || {},
    confidence: typeof payload.confidence === 'number' ? payload.confidence : 1,
    needsClarification: Boolean(payload.needsClarification),
  } : parseAssistantIntent(payload.text || payload.prompt || '');
  const text = String(payload.text || payload.prompt || '');

  if (!userId) {
    throw new Error('userId is required');
  }

  if (parsed.intent === 'system.status') {
    const bridge = getBridgeStatus ? getBridgeStatus() : {};
    const messenger = getStatus();
    return {
      success: true,
      intent: 'system.status',
      message: 'System status loaded.',
      data: {
        backend: { status: 'ok' },
        bridge,
        messenger,
      },
    };
  }

  if (parsed.intent === 'messenger.inbox') {
    return Object.assign({ intent: 'messenger.inbox' }, listInbox(userId));
  }

  if (parsed.intent === 'taskbus.approvals') {
    return {
      success: true,
      intent: 'taskbus.approvals',
      approvals: listRecentApprovals(payload.limit || 8),
    };
  }

  if (parsed.intent === 'taskbus.results') {
    return {
      success: true,
      intent: 'taskbus.results',
      results: listRecentResults(payload.limit || 8),
    };
  }

  if (parsed.intent === 'bridge.packets') {
    return {
      success: true,
      intent: 'bridge.packets',
      packets: listRecentBridgePackets(payload.limit || 8),
    };
  }

  if (parsed.intent === 'workflow.catalog') {
    const workflows = workflowRegistry.listWorkflows();
    return {
      success: true,
      intent: 'workflow.catalog',
      total: workflows.length,
      workflows: workflows.slice(0, payload.limit || 12).map((workflow) => ({
        id: workflow.id,
        key: workflow.key,
        name: workflow.name,
        category: workflow.category,
        description: workflow.description,
        command: workflow.command,
        user_command: workflow.user_command,
        approval_required_for: workflow.approval_required_for || [],
      })),
    };
  }

  if (parsed.intent === 'messenger.send') {
    const recipientQuery = String(payload.recipientId || payload.recipientQuery || parsed.arguments.recipientQuery || '').trim();
    const content = String(payload.content || parsed.arguments.content || text).trim();
    if (!recipientQuery) {
      return {
        success: false,
        intent: parsed.intent,
        needsClarification: true,
        questions: ['Who should receive the message?'],
      };
    }
    if (!content) {
      return {
        success: false,
        intent: parsed.intent,
        needsClarification: true,
        questions: ['What should the message say?'],
      };
    }

    const recipient = searchUserByQuery(recipientQuery);
    if (!recipient) {
      return {
        success: false,
        intent: parsed.intent,
        needsClarification: true,
        questions: [`I could not find "${recipientQuery}". Who should I send it to?`],
      };
    }

    const result = await sendMessage({
      senderId: userId,
      recipientIds: [recipient.id],
      content,
      subject: payload.subject || '',
      attachments: payload.attachments || [],
      meta: payload.meta || {},
      transport: payload.transport || 'in_app',
      senderType: payload.senderType || 'user',
    });

    return Object.assign({
      success: true,
      intent: parsed.intent,
      recipient,
    }, result);
  }

  if (parsed.intent === 'workflow.launch' || parsed.intent === 'workflow.parallel') {
    const args = Object.assign({}, parsed.arguments || {}, payload.arguments || {});
    if (parsed.intent === 'workflow.parallel') {
      const workflowRefs = Array.isArray(args.workflowRefs) ? args.workflowRefs : [];
      if (!workflowRefs.length) {
        return {
          success: false,
          intent: parsed.intent,
          needsClarification: true,
          questions: ['Which workflows should I launch in parallel?'],
        };
      }
      const result = await workflowDispatcher.launchWorkflowsInParallel(workflowRefs, {
        input: args.input || text,
        prompt: text,
        role: args.role || payload.role || '',
        userId,
        created_by: payload.createdBy || userId,
        approval_required: typeof payload.approvalRequired === 'boolean' ? payload.approvalRequired : true,
        feature_ref: payload.featureRef || `assistant:${parsed.intent}`,
        meta: Object.assign({
          source: 'assistant',
          assistant_intent: parsed.intent,
        }, payload.meta || {}),
      });
      return {
        success: true,
        intent: parsed.intent,
        workflowRefs,
        result,
      };
    }

    const workflowRef = String(args.workflowRef || args.workflow || '').trim() || 'job_application_workflow';
    const launch = await workflowDispatcher.launchWorkflow(workflowRef, {
      input: args.input || text,
      prompt: text,
      role: args.role || payload.role || '',
      searchQuery: args.searchQuery || '',
      userId,
      created_by: payload.createdBy || userId,
      approval_required: typeof payload.approvalRequired === 'boolean' ? payload.approvalRequired : true,
      feature_ref: payload.featureRef || `assistant:${parsed.intent}`,
      preferKind: args.preferKind || payload.preferKind || undefined,
      meta: Object.assign({
        source: 'assistant',
        assistant_intent: parsed.intent,
        workflow_ref: workflowRef,
      }, payload.meta || {}),
    });
    return Object.assign({
      success: true,
      intent: parsed.intent,
      workflowRef,
    }, launch);
  }

  if (parsed.intent && parsed.intent.indexOf('content.') === 0) {
    const args = Object.assign({}, parsed.arguments || {}, payload.arguments || {});
    const content = String(args.content || payload.content || text).trim();
    const action = String(args.action || '').trim().toLowerCase();
    if (action === 'preview') {
      return Object.assign({
        success: true,
        intent: parsed.intent,
      }, await socialclaw.previewCampaign({
        source: 'assistant',
        title: payload.title || 'ACC social draft preview',
        content,
        caption: content,
        lane: 'publish',
        platform: 'social',
        meta: Object.assign({ assistant_intent: parsed.intent }, payload.meta || {}),
      }));
    }
    if (action === 'validate') {
      return Object.assign({
        success: true,
        intent: parsed.intent,
      }, await socialclaw.validateCampaign({
        source: 'assistant',
        title: payload.title || 'ACC social draft validation',
        content,
        caption: content,
        lane: 'publish',
        platform: 'social',
        meta: Object.assign({ assistant_intent: parsed.intent }, payload.meta || {}),
      }));
    }
    if (action === 'publish' || action === 'apply') {
      return Object.assign({
        success: true,
        intent: parsed.intent,
      }, await socialclaw.applyCampaign({
        source: 'assistant',
        title: payload.title || 'ACC social publish',
        content,
        caption: content,
        lane: 'publish',
        platform: 'social',
        meta: Object.assign({ assistant_intent: parsed.intent }, payload.meta || {}),
      }));
    }
    if (action === 'delete') {
      return Object.assign({
        success: true,
        intent: parsed.intent,
      }, await socialclaw.deletePost({
        source: 'assistant',
        title: payload.title || 'ACC social delete',
        content,
        lane: 'publish',
        platform: 'social',
        meta: Object.assign({ assistant_intent: parsed.intent }, payload.meta || {}),
      }));
    }
    if (action === 'accounts') {
      return Object.assign({ success: true, intent: parsed.intent }, await socialclaw.listAccounts());
    }
    if (action === 'usage') {
      return Object.assign({ success: true, intent: parsed.intent }, await socialclaw.getUsage());
    }
    if (action === 'status') {
      return Object.assign({ success: true, intent: parsed.intent }, await socialclaw.checkHealth());
    }
  }

  return {
    success: true,
    intent: parsed.intent,
    message: text ? `Understood: ${text}` : 'Ready.',
    data: {
      parsed,
    },
  };
}

function getStatus() {
  const state = store.getThreadStatus();
  const hasKey = Boolean(String(process.env.ACC_MESSENGER_MASTER_KEY || process.env.ACC_VAULT_MASTER_KEY || process.env.ACC_APPROVAL_HMAC_SECRET || '').trim());
  return {
    status: 'ready',
    keySource: state.keySource,
    keyConfigured: hasKey || state.keySource === 'local-file',
    threads: state.threads,
    messages: state.messages,
    presences: state.activePresences,
    updatedAt: state.updatedAt,
  };
}

module.exports = {
  createThread,
  sendMessage,
  listInbox,
  getThread,
  markRead,
  updatePresence,
  parseAssistantIntent,
  executeAssistantIntent,
  getStatus,
  listUsers: store.listUsers,
  resolveRecipient: searchUserByQuery,
};
