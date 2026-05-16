// cloud/services/notebookExport.js
// NotebookLM has no API — exports Markdown packets for manual source upload
// Bot sends the file to Shayan via Telegram for drag-drop into NotebookLM
'use strict';

const fs   = require('fs');
const path = require('path');
const store = require('../taskbus/store.js');

const EXPORT_DIR = path.join(__dirname, '../../data/notebook-exports');
if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });

function buildExportPacket(sinceDate) {
  const since = sinceDate ? new Date(sinceDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const tasks = store.getTasks().filter(function(t) {
    return (t.status === 'done' || t.status === 'completed') && new Date(t.updated_at) >= since;
  });
  if (!tasks.length) return null;

  var lines = [
    '# ACC v2 NotebookLM Source Update',
    'Export: ' + new Date().toISOString() + ' | Tasks: ' + tasks.length, '', '---', '',
  ];

  tasks.forEach(function(t, i) {
    var result = store.getLatestResult(t.id);
    lines.push('## ' + (i+1) + '. ' + t.title);
    lines.push('- ID: ' + t.id.slice(0,8) + ' | Agent: ' + t.assigned_agent + ' | Provider: ' + (t.provider_used||'?'));
    lines.push('- Completed: ' + t.updated_at);
    lines.push('');
    if (result && result.summary) lines.push('**Summary:** ' + result.summary);
    if (result && result.output)  { lines.push(''); lines.push(result.output.slice(0,1200)); }
    if (result && result.next_request) lines.push('\n**Next:** ' + result.next_request);
    lines.push('', '---', '');
  });
  return lines.join('\n');
}

function saveExport(content) {
  var fname = 'ACC-NLM-' + new Date().toISOString().slice(0,10) + '.md';
  var fpath = path.join(EXPORT_DIR, fname);
  fs.writeFileSync(fpath, content, 'utf8');
  return fpath;
}

function listExports() {
  return fs.readdirSync(EXPORT_DIR).filter(function(f){ return f.endsWith('.md'); }).sort().reverse().slice(0,10);
}

module.exports = { buildExportPacket, saveExport, listExports, EXPORT_DIR };
