// cloud/telegram/features/jobTracker.js — Feature 7: Smart Job Tracker
'use strict';
const fs = require('fs'), path = require('path');
const users = require('../users.js');

const STATUSES = ['found','applied','interview','offer','rejected'];

function getTrackerFile(userId) { return path.join(users.getUserStorageDir(userId), 'jobs.json'); }
function getJobs(userId) {
  const fp = getTrackerFile(userId);
  if (!fs.existsSync(fp)) return [];
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch(_) { return []; }
}
function saveJobs(userId, jobs) {
  fs.writeFileSync(getTrackerFile(userId), JSON.stringify(jobs, null, 2), 'utf8');
}
function addJob(userId, job) {
  const jobs = getJobs(userId);
  const entry = {
    id:        Date.now(),
    title:     job.title || 'Untitled',
    company:   job.company || '',
    location:  job.location || '',
    url:       job.url || '',
    salary:    job.salary || '',
    status:    'found',
    notes:     '',
    appliedAt: null,
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    remindAt:  null,
  };
  jobs.unshift(entry);
  saveJobs(userId, jobs);
  return entry;
}
function updateJobStatus(userId, jobId, status) {
  const jobs = getJobs(userId);
  const job  = jobs.find(function(j) { return j.id === parseInt(jobId); });
  if (!job) return null;
  job.status    = status;
  job.updatedAt = new Date().toISOString();
  if (status === 'applied') job.appliedAt = new Date().toISOString();
  saveJobs(userId, jobs);
  return job;
}
function getJobsByStatus(userId, status) {
  return getJobs(userId).filter(function(j) { return j.status === status; });
}
function getStaleApplications(userId, days) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return getJobs(userId).filter(function(j) {
    return j.status === 'applied' && j.appliedAt && new Date(j.appliedAt).getTime() < cutoff;
  });
}
function formatTracker(userId, lang) {
  const jobs = getJobs(userId);
  if (!jobs.length) return lang === 'fa' ? '📊 هیچ شغلی ردیابی نمی‌شود.' : '📊 No jobs tracked yet.\n\nUse job search to start finding opportunities!';
  const counts = {};
  STATUSES.forEach(function(s) { counts[s] = jobs.filter(function(j) { return j.status===s; }).length; });
  var out = '📊 *Job Tracker*\n\n';
  out += '🔍 Found: ' + counts.found + '\n';
  out += '📤 Applied: ' + counts.applied + '\n';
  out += '🎯 Interview: ' + counts.interview + '\n';
  out += '🎉 Offer: ' + counts.offer + '\n';
  out += '❌ Rejected: ' + counts.rejected + '\n\n';
  var recent = jobs.slice(0,5);
  out += '*Recent:*\n';
  recent.forEach(function(j) {
    var emoji = {found:'🔍',applied:'📤',interview:'🎯',offer:'🎉',rejected:'❌'}[j.status]||'•';
    out += emoji + ' *' + j.title + '*' + (j.company?' @ '+j.company:'') + '\n';
  });
  return out;
}
module.exports = { addJob, updateJobStatus, getJobs, getJobsByStatus, getStaleApplications, formatTracker, STATUSES };
