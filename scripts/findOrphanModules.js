#!/usr/bin/env node
// scripts/findOrphanModules.js
// Phase 5 dead-code sweep: walks cloud/ for .js modules with zero incoming
// require() references from any other first-party file.
//
// Rules:
//   - *.test.js files are excluded as BOTH candidates and reference sources
//     (a module whose only importer is its own test is still an orphan).
//   - Reference sources include cloud/, scripts/, and root-level .js files.
//   - Valid entrypoints (run directly / started by scripts) are allowlisted.
//   - Files loaded via dynamic require(dir + '/name.js') patterns are NOT
//     orphaned — listed separately for transparency.
//   - Connector/marketplace adapters listed in manifest JSON (loaded by
//     registry.js via variable require) are NOT orphaned.
//   - Always exits 0: advisory only, never a CI gate (wired as ::notice in
//     scripts/verify.sh).

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CLOUD = path.join(ROOT, 'cloud');

const ENTRYPOINTS = [
  'cloud/server.js',
  'cloud/worker.js',
  'cloud/telegram/bot.js',
].map((p) => path.resolve(ROOT, p));

function listJsFiles(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) listJsFiles(full, out);
    else if (ent.name.endsWith('.js')) out.push(full);
  }
  return out;
}

function isTestFile(p) {
  return p.endsWith('.test.js') || p.endsWith('.spec.js');
}

// --- gather first-party .js sources: cloud/, scripts/, root-level ---
const firstPartyDirs = [CLOUD, path.join(ROOT, 'scripts')];
const rootFiles = fs
  .readdirSync(ROOT)
  .filter((n) => n.endsWith('.js'))
  .map((n) => path.join(ROOT, n));

const srcFiles = new Set();
for (const d of firstPartyDirs) if (fs.existsSync(d)) for (const f of listJsFiles(d)) srcFiles.add(f);
for (const f of rootFiles) srcFiles.add(f);

const srcs = new Map();
for (const f of srcFiles) srcs.set(f, fs.readFileSync(f, 'utf8'));

// --- static require patterns: require / safeRequire / safeRequireWithName ---
const staticRequireRe = /(?:require|safeRequire|safeRequireWithName)\(\s*['"](\.\.?\/[^'"]+)['"]/g;
const dynamicDirRe = /(?:require|safeRequire|safeRequireWithName)\(\s*['"]((?:\.\.?\/)[^'"]*\/)['"]\s*\+/g;

const referenced = new Set();
const dynamicDirs = new Set();

for (const [file, src] of srcs) {
  if (isTestFile(file)) continue; // tests don't count as references

  let m;
  staticRequireRe.lastIndex = 0;
  while ((m = staticRequireRe.exec(src))) {
    const base = path.resolve(path.dirname(file), m[1]);
    const target = base.endsWith('.js') ? base : base + '.js';
    if (srcFiles.has(target)) referenced.add(target);
  }

  dynamicDirRe.lastIndex = 0;
  while ((m = dynamicDirRe.exec(src))) {
    dynamicDirs.add(path.resolve(path.dirname(file), m[1]));
  }
}

// --- manifest-driven dynamic loads (registry.js: require(filePath)) ---
function collectManifestFiles(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) collectManifestFiles(full, acc);
    else if (ent.name.endsWith('.json')) acc.push(full);
  }
  return acc;
}

const manifestFiles = collectManifestFiles(CLOUD);
const manifestLoaded = new Set();
for (const mf of manifestFiles) {
  try {
    const data = JSON.parse(fs.readFileSync(mf, 'utf8'));
    const list = data && (data.connectors || data.integrations || data.modules);
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      if (entry && typeof entry.file === 'string' && entry.file.endsWith('.js')) {
        manifestLoaded.add(path.resolve(path.dirname(mf), entry.file));
      }
    }
  } catch { /* ignore unparseable json */ }
}

const dynamicReferenced = new Set(manifestLoaded);
for (const dir of dynamicDirs) {
  for (const f of srcFiles) if (f.startsWith(dir)) dynamicReferenced.add(f);
}

// --- classify ---
const orphans = [];
const dynamicOrphans = [];
for (const f of srcFiles) {
  if (!f.startsWith(CLOUD)) continue; // only cloud/ are candidates
  if (isTestFile(f)) continue;
  if (ENTRYPOINTS.includes(f)) continue;
  if (referenced.has(f)) continue;
  if (dynamicReferenced.has(f)) { dynamicOrphans.push(path.relative(ROOT, f)); continue; }
  orphans.push(path.relative(ROOT, f));
}

orphans.sort();
console.log('=== Orphan modules (zero incoming first-party require references) ===');
for (const o of orphans) console.log(o);
console.log('orphan_count=' + orphans.length);

if (dynamicOrphans.length) {
  console.log('\n=== Loaded dynamically (manifest / require(dir/ + name)) — NOT orphaned ===');
  for (const o of dynamicOrphans.sort()) console.log(o);
}
