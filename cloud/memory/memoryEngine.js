// cloud/memory/memoryEngine.js
// LTM persisted to disk — survives restarts.
// Swappable to Redis/Notion later without changing callers.
'use strict';

const fs   = require('fs');
const path = require('path');

const LTM_CACHE_FILE = path.join(__dirname, '.ltm_cache.json');

class MemoryEngine {
  constructor() {
    this.ltm = {};
    this._loadLTMFromDisk();
  }

  // ── Disk persistence ────────────────────────────────────────────────────────

  _loadLTMFromDisk() {
    try {
      if (fs.existsSync(LTM_CACHE_FILE)) {
        const raw = fs.readFileSync(LTM_CACHE_FILE, 'utf8');
        this.ltm  = JSON.parse(raw);
        console.log('[memoryEngine] LTM restored from disk.');
      }
    } catch (e) {
      console.warn('[memoryEngine] Could not load LTM cache:', e.message);
      this.ltm = {};
    }
  }

  _saveLTMToDisk() {
    try {
      fs.writeFileSync(LTM_CACHE_FILE, JSON.stringify(this.ltm, null, 2), 'utf8');
    } catch (e) {
      console.warn('[memoryEngine] Could not persist LTM:', e.message);
    }
  }

  // ── LTM API ─────────────────────────────────────────────────────────────────

  async loadLTM(loader) {
    // Prefer external loader (Notion) if available, fall back to disk cache
    try {
      const data = await loader();
      if (data && Object.keys(data).length > 0) {
        this.ltm = data;
        this._saveLTMToDisk(); // keep disk in sync
      }
      // else: already loaded from disk in constructor — keep it
    } catch (e) {
      console.warn('[memoryEngine] loadLTM external loader failed, using disk cache:', e.message);
    }
  }

  async saveLTM(saver) {
    // Save to disk first (fast, reliable)
    this._saveLTMToDisk();
    // Then attempt external save (Notion etc.) — non-fatal if it fails
    try {
      await saver(this.ltm);
    } catch (e) {
      console.warn('[memoryEngine] saveLTM external saver failed (disk copy is safe):', e.message);
    }
  }

  addLTMFact(key, value) {
    this.ltm[key] = value;
    this._saveLTMToDisk();
  }

  getLTMFact(key) {
    return this.ltm[key];
  }

  // ── STM API (per-session, not persisted) ────────────────────────────────────

  initSTM(snapshot) {
    snapshot.memory = snapshot.memory || {};
    snapshot.memory.stm = {
      extractedFacts:   [],
      userPreferences:  {},
      jobKeywords:      [],
      researchFindings: [],
    };
  }

  addSTMFact(snapshot, fact) {
    snapshot.memory          = snapshot.memory          || {};
    snapshot.memory.stm      = snapshot.memory.stm      || { extractedFacts: [] };
    snapshot.memory.stm.extractedFacts.push(fact);
  }

  // ── STM → LTM merge ─────────────────────────────────────────────────────────

  mergeSTMtoLTM(snapshot) {
    const stm = snapshot.memory?.stm;
    if (!stm) return;

    if (stm.jobKeywords?.length) {
      this.ltm.jobKeywords = [
        ...new Set([...(this.ltm.jobKeywords || []), ...stm.jobKeywords]),
      ];
    }
    if (stm.extractedFacts?.length) {
      this.ltm.extractedFacts = [
        ...(this.ltm.extractedFacts || []),
        ...stm.extractedFacts,
      ];
    }
    if (stm.userPreferences && Object.keys(stm.userPreferences).length) {
      this.ltm.userPreferences = {
        ...(this.ltm.userPreferences || {}),
        ...stm.userPreferences,
      };
    }

    this._saveLTMToDisk(); // persist merged LTM
  }
}

const memoryEngine = new MemoryEngine();

module.exports = { MemoryEngine, memoryEngine };
