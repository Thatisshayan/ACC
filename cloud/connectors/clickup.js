'use strict';

// cloud/connectors/clickup.js — full two-way sync connector
// Get key: app.clickup.com/settings/integrations

const axios = require('axios');
const { BaseConnector } = require('./baseConnector.js');

const BASE = 'https://api.clickup.com/api/v2';

class ClickUpConnector extends BaseConnector {
  constructor(config = {}) {
    super({
      name: config.name || 'clickup',
      version: config.version || '1.0.0',
      apiKey: config.apiKey || process.env.CLICKUP_API_KEY || null,
      enabled: config.enabled ?? true,
    });

    if (!this.apiKey) console.warn('[clickup] CLICKUP_API_KEY not set — connector disabled');
  }

  headers() {
    return { Authorization: this.apiKey, 'Content-Type': 'application/json' };
  }

  ok() {
    return !!this.apiKey && this.enabled !== false;
  }

  async getTeams() {
    if (!this.ok()) return { success: false, error: 'CLICKUP_API_KEY not set' };
    try {
      const r = await axios.get(BASE + '/team', { headers: this.headers(), timeout: 8000 });
      return { success: true, teams: r.data.teams };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async createTask(listId, data) {
    if (!this.ok()) return { success: false, error: 'CLICKUP_API_KEY not set' };
    try {
      const r = await axios.post(
        BASE + '/list/' + listId + '/task',
        {
          name: data.name,
          description: data.description || '',
          priority: data.priority || 3,
          status: data.status || 'to do',
          tags: data.tags || [],
        },
        { headers: this.headers(), timeout: 10000 }
      );
      return { success: true, task: r.data };
    } catch (e) {
      return { success: false, error: e.response ? JSON.stringify(e.response.data) : e.message };
    }
  }

  async updateTask(taskId, data) {
    if (!this.ok()) return { success: false, error: 'CLICKUP_API_KEY not set' };
    try {
      const r = await axios.put(BASE + '/task/' + taskId, data, { headers: this.headers(), timeout: 8000 });
      return { success: true, task: r.data };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async getTasks(listId) {
    if (!this.ok()) return { success: false, error: 'CLICKUP_API_KEY not set' };
    try {
      const r = await axios.get(BASE + '/list/' + listId + '/task', { headers: this.headers(), timeout: 8000 });
      return { success: true, tasks: r.data.tasks };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async onTaskCompleted(task, result, listId) {
    if (!this.ok() || !listId) return;
    return this.createTask(listId, {
      name: '[ACC DONE] ' + task.title.slice(0, 60),
      description: [
        'Task ID: ' + task.id,
        'Provider: ' + ((result && result.provider_used) || 'unknown'),
        'Real AI: ' + (!!(result && result.is_real_ai_result)),
        'Summary: ' + ((result && result.summary) || 'none'),
      ].join('\n'),
      priority: 3,
      tags: ['acc', 'completed'],
    });
  }

  async onTaskFailed(task, listId) {
    if (!this.ok() || !listId) return;
    return this.createTask(listId, {
      name: '[ACC FAILED] ' + task.title.slice(0, 60),
      description: 'Task ID: ' + task.id + '\nError: ' + (task.error || 'unknown'),
      priority: 2,
      tags: ['acc', 'failed'],
    });
  }

  async onApprovalRequired(task, approvalId, listId) {
    if (!this.ok() || !listId) return;
    return this.createTask(listId, {
      name: '[ACC APPROVAL] ' + task.title.slice(0, 50),
      description: 'Approval ID: ' + approvalId + '\nTask: ' + task.id + '\nApprove via Telegram: @OurAccbot',
      priority: 1,
      tags: ['acc', 'needs-approval'],
    });
  }

  async checkHealth() {
    if (!this.ok()) return { status: 'disabled', note: 'CLICKUP_API_KEY not set. Get from app.clickup.com/settings/integrations' };
    try {
      const r = await this.getTeams();
      if (r.success) return { status: 'connected', teams: r.teams.length };
      if (String(r.error || '').includes('401')) {
        return { status: 'error', error: 'clickup api key unauthorized or invalid' };
      }
      if (String(r.error || '').includes('403')) {
        return { status: 'error', error: 'clickup api key lacks permission' };
      }
      return { status: 'error', error: r.error };
    } catch (e) {
      return { status: 'error', error: e.message };
    }
  }

  async run(action, payload = {}) {
    switch (action) {
      case 'checkHealth':
        return this.checkHealth();
      case 'getTeams':
        return this.getTeams();
      case 'createTask':
        return this.createTask(payload.listId, payload.data || {});
      case 'updateTask':
        return this.updateTask(payload.taskId, payload.data || {});
      case 'getTasks':
        return this.getTasks(payload.listId);
      default:
        return { success: false, error: `ClickUp: unknown action "${action}".` };
    }
  }
}

var defaultClickUpConnector;

function getDefaultClickUpConnector() {
  if (!defaultClickUpConnector) {
    defaultClickUpConnector = new ClickUpConnector();
  }
  return defaultClickUpConnector;
}

function enabled() {
  return getDefaultClickUpConnector().ok();
}

function checkHealth() {
  return getDefaultClickUpConnector().checkHealth();
}

function getTeams() {
  return getDefaultClickUpConnector().getTeams();
}

function createTask(listId, data) {
  return getDefaultClickUpConnector().createTask(listId, data);
}

function updateTask(taskId, data) {
  return getDefaultClickUpConnector().updateTask(taskId, data);
}

function onTaskCompleted(task, result, listId) {
  return getDefaultClickUpConnector().onTaskCompleted(task, result, listId);
}

function onTaskFailed(task, listId) {
  return getDefaultClickUpConnector().onTaskFailed(task, listId);
}

function onApprovalRequired(task, approvalId, listId) {
  return getDefaultClickUpConnector().onApprovalRequired(task, approvalId, listId);
}

module.exports = {
  ClickUpConnector: ClickUpConnector,
  enabled: enabled,
  checkHealth: checkHealth,
  getTeams: getTeams,
  createTask: createTask,
  updateTask: updateTask,
  onTaskCompleted: onTaskCompleted,
  onTaskFailed: onTaskFailed,
  onApprovalRequired: onApprovalRequired,
};
