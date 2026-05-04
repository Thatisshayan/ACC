// cloud/memory/memoryEngine.js

class MemoryEngine {
  constructor() {
    this.ltm = {}; // long-term memory (persisted to Notion)
  }

  /**
   * loadLTM — load long-term memory via a loader function
   * @param {Function} loader - async fn that returns an object
   */
  async loadLTM(loader) {
    this.ltm = (await loader()) || {};
  }

  /**
   * saveLTM — persist long-term memory via a saver function
   * @param {Function} saver - async fn(data)
   */
  async saveLTM(saver) {
    await saver(this.ltm);
  }

  /**
   * initSTM — initialize short-term memory on a snapshot
   */
  initSTM(snapshot) {
    snapshot.memory = snapshot.memory || {};
    snapshot.memory.stm = {
      extractedFacts:   [],
      userPreferences:  {},
      jobKeywords:      [],
      researchFindings: [],
    };
  }

  /**
   * addSTMFact — add a fact to the snapshot's short-term memory
   */
  addSTMFact(snapshot, fact) {
    snapshot.memory = snapshot.memory || {};
    snapshot.memory.stm = snapshot.memory.stm || { extractedFacts: [] };
    snapshot.memory.stm.extractedFacts.push(fact);
  }

  /** addLTMFact */
  addLTMFact(key, value) {
    this.ltm[key] = value;
  }

  /** getLTMFact */
  getLTMFact(key) {
    return this.ltm[key];
  }

  /**
   * mergeSTMtoLTM — promote STM facts into LTM at end of session
   */
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
  }
}

const memoryEngine = new MemoryEngine();

module.exports = { MemoryEngine, memoryEngine };
