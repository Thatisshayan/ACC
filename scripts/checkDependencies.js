#!/usr/bin/env node
'use strict';
// scripts/checkDependencies.js
//
// Static dependency-completeness guard (Task Group A of the
// HANDOFF_2026-08-01_deployment-readiness-hardening.md).
//
// Fails CI (exit 1) if any first-party source file `require()`s an npm
// package that is missing from package.json's `dependencies` +
// `devDependencies`. This is a static-analysis guard against the twilio /
// openai bug class: a route file require()s a package that was never added
// to package.json, so the runtime `safeRequire` wrapper silently disables
// the feature and nobody gets paged.
//
// Deliberately regex-based (not a full AST parse): it only needs to catch
// the common static case — the `require("pkg")` / `require('pkg')` literal
// string form. Dynamic / computed requires are out of scope and intentionally
// ignored (that pattern has never been the failure mode in this repo).

const fs = require('fs');
const path = require('path');
const { builtinModules, isBuiltin: nodeIsBuiltin } = require('module');

const ROOT = path.join(__dirname, '..');
const PKG = require(path.join(ROOT, 'package.json'));

const PROD_DEPS = new Set(Object.keys(PKG.dependencies || {}));
const DEV_DEPS = new Set(Object.keys(PKG.devDependencies || {}));
const ALL_DEPS = new Set([...PROD_DEPS, ...DEV_DEPS]);

// First-party scan roots. Excludes node_modules, ui/, mobile/, desktop/,
// and any *.test.js (tests use devDependencies anyway, but they are not part
// of the runtime surface this guard protects).
const SCAN_DIRS = ['cloud', 'scripts'];
const EXCLUDE_DIRS = new Set(['node_modules', 'ui', 'mobile', 'desktop']);

function walk(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    if (EXCLUDE_DIRS.has(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walk(full, out);
    } else if (ent.isFile() && ent.name.endsWith('.js') && !ent.name.endsWith('.test.js')) {
      out.push(full);
    }
  }
}

function collectFiles() {
  const files = [];
  for (const dir of SCAN_DIRS) {
    walk(path.join(ROOT, dir), files);
  }
  for (const name of fs.readdirSync(ROOT)) {
    const full = path.join(ROOT, name);
    if (name.endsWith('.js') && !name.endsWith('.test.js') && fs.statSync(full).isFile()) {
      files.push(full);
    }
  }
  return files;
}

// Normalize a specifier to its package name:
//   '@aws-sdk/client-s3/lib/foo' -> '@aws-sdk/client-s3'
//   'express/lib/router'         -> 'express'
//   'node:fs'                    -> handled as builtin upstream
function packageNameOf(spec) {
  if (spec.startsWith('@')) return spec.split('/').slice(0, 2).join('/');
  return spec.split('/')[0];
}

function extractRequires(source) {
  const out = new Set();
  const stripped = stripComments(source);
  const re = /require\(\s*(['"])([^'"]+)\1\s*\)/g;
  let m;
  while ((m = re.exec(stripped)) !== null) {
    out.add(m[2]);
  }
  return out;
}

// Remove // line comments and /* */ block comments so doc comments that
// mention `require('pkg')` (or the like) are not scanned as real requires.
// This is a best-effort stripper; it does not need to be string-literal-safe
// because a require() call is never inside a comment in real code here.
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function isBuiltin(spec) {
  if (typeof nodeIsBuiltin === 'function') {
    return nodeIsBuiltin(spec);
  }
  const bare = spec.startsWith('node:') ? spec.slice(5) : spec;
  return builtinModules.includes(bare);
}

function main() {
  const files = collectFiles();
  const missing = new Map(); // pkg -> [files]
  const devOnlyInProd = new Map(); // pkg -> [files]

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    const relativePath = path.relative(ROOT, file);
    const isRuntimeFile = !relativePath.startsWith('scripts' + path.sep) && !relativePath.startsWith('scripts/');

    for (const spec of extractRequires(source)) {
      if (spec.startsWith('.') || spec.startsWith('/')) continue; // relative / absolute
      if (isBuiltin(spec)) continue;
      const pkg = packageNameOf(spec);
      if (!ALL_DEPS.has(pkg)) {
        if (!missing.has(pkg)) missing.set(pkg, []);
        missing.get(pkg).push(relativePath);
      } else if (isRuntimeFile && !PROD_DEPS.has(pkg) && DEV_DEPS.has(pkg)) {
        if (!devOnlyInProd.has(pkg)) devOnlyInProd.set(pkg, []);
        devOnlyInProd.get(pkg).push(relativePath);
      }
    }
  }

  let failed = false;

  if (missing.size > 0) {
    console.error('checkDependencies: FAIL — require()d package(s) completely missing from package.json:');
    for (const [pkg, refs] of [...missing.entries()].sort()) {
      console.error(`  ${pkg}  (required by: ${refs.join(', ')})`);
    }
    failed = true;
  }

  if (devOnlyInProd.size > 0) {
    console.error('checkDependencies: FAIL — devDependencies required by production/runtime file(s):');
    for (const [pkg, refs] of [...devOnlyInProd.entries()].sort()) {
      console.error(`  ${pkg}  (is only in devDependencies but required by runtime: ${refs.join(', ')})`);
    }
    console.error('Move these package(s) from devDependencies to dependencies in package.json.');
    failed = true;
  }

  if (failed) {
    process.exit(1);
  }

  console.log(`checkDependencies: OK — all require()'d packages (${files.length} first-party files scanned) are present in package.json.`);
}

main();
