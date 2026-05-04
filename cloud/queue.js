// cloud/queue.js
/**
 * Priority levels:
 *  3 = high   (admin, power)
 *  2 = normal (normal)
 *  1 = low    (guest)
 */

const tasks  = new Map(); // taskId → task
let counter  = 0;

function nextId() {
  counter += 1;
  return `task-${counter}`;
}

function roleToPriority(role) {
  if (role === "admin" || role === "power") return 3;
  if (role === "guest") return 1;
  return 2; // normal
}

/**
 * enqueueTask
 * @param {Object} params
 * @param {string} params.agentType
 * @param {Object} params.payload
 * @param {Object} [params.meta]   - should include userId + role
 */
function enqueueTask({ agentType, payload, meta = {} }) {
  const id       = nextId();
  const role     = meta.role || "normal";
  const priority = meta.priority || roleToPriority(role);

  const task = {
    id,
    agentType,
    payload,
    meta: { ...meta, role, priority },
    status:    "queued", // queued | running | completed | failed
    result:    null,
    error:     null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  tasks.set(id, task);
  return task;
}

/**
 * getNextTask
 * Returns the highest-priority queued task (ties broken by age).
 */
function getNextTask() {
  const queued = [...tasks.values()].filter((t) => t.status === "queued");
  if (queued.length === 0) return null;

  queued.sort((a, b) => {
    if (b.meta.priority !== a.meta.priority) {
      return b.meta.priority - a.meta.priority; // higher first
    }
    return new Date(a.createdAt) - new Date(b.createdAt); // older first
  });

  return queued[0];
}

/**
 * updateTask
 */
function updateTask(id, patch) {
  const t = tasks.get(id);
  if (!t) return null;
  const updated = { ...t, ...patch, updatedAt: new Date().toISOString() };
  tasks.set(id, updated);
  return updated;
}

/**
 * getTask
 */
function getTask(id) {
  return tasks.get(id) || null;
}

/**
 * getAllTasks
 */
function getAllTasks() {
  return [...tasks.values()];
}

// Legacy compat: queue array view (for admin/api.js queueLength)
const queue = { get length() { return [...tasks.values()].filter(t => t.status === "queued").length; } };

module.exports = { enqueueTask, getNextTask, updateTask, getTask, getAllTasks, tasks, queue };
