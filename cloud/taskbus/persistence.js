// cloud/taskbus/persistence.js
// Optional Supabase persistence layer — falls back to disk if not configured
// Prevents data loss on Railway restarts
'use strict';

var fs   = require('fs');
var path = require('path');

var SUPABASE_URL = process.env.SUPABASE_URL;
var SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
var supabase     = null;

// Lazy-init Supabase client
function getSupabase() {
  if (supabase) return supabase;
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    var { createClient } = require('@supabase/supabase-js');
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('[persistence] Supabase connected — using cloud storage');
    return supabase;
  } catch(e) {
    console.warn('[persistence] Supabase not installed — using disk only. Run: npm install @supabase/supabase-js');
    return null;
  }
}

// Sync tasks to Supabase (best-effort, non-blocking)
async function syncTaskToCloud(task) {
  var sb = getSupabase();
  if (!sb) return;
  try {
    await sb.from('acc_tasks').upsert({
      id:             task.id,
      title:          task.title,
      status:         task.status,
      assigned_agent: task.assigned_agent,
      created_by:     task.created_by,
      created_at:     task.created_at,
      updated_at:     task.updated_at,
      provider_used:  task.provider_used,
    }, { onConflict: 'id' });
  } catch(e) { /* silent — disk is source of truth */ }
}

async function syncResultToCloud(result) {
  var sb = getSupabase();
  if (!sb) return;
  try {
    await sb.from('acc_results').upsert({
      id:              result.id,
      task_id:         result.task_id,
      provider_used:   result.provider_used,
      is_real_ai:      result.is_real_ai_result,
      cost_tier:       result.cost_tier,
      summary:         result.summary,
      created_at:      result.created_at,
    }, { onConflict: 'id' });
  } catch(e) { /* silent */ }
}

function isSupabaseEnabled() {
  return !!(SUPABASE_URL && SUPABASE_KEY);
}

function getStatus() {
  return {
    enabled:   isSupabaseEnabled(),
    connected: !!getSupabase(),
    url:       SUPABASE_URL ? SUPABASE_URL.slice(0, 30) + '...' : null,
    note:      isSupabaseEnabled() ? 'Cloud sync active' : 'Disk only — add SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for Railway persistence',
  };
}

module.exports = { syncTaskToCloud, syncResultToCloud, isSupabaseEnabled, getStatus };
