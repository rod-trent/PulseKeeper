'use strict';

const { fetchSource } = require('./sources/index');

class Collector {
  constructor(storage) {
    this.storage = storage;
    this._running = new Set();
    this._listeners = [];
  }

  onProgress(fn) { this._listeners.push(fn); }

  _emit(event) {
    for (const fn of this._listeners) {
      try { fn(event); } catch {}
    }
  }

  /**
   * Collect from all enabled sources
   * @returns {{ succeeded: number, failed: number, errors: object[] }}
   */
  async collectAll() {
    const sources = await this.storage.getSources();
    const enabled = sources.filter(s => s.enabled);

    let succeeded = 0;
    let failed = 0;
    const errors = [];

    this._emit({ type: 'start', total: enabled.length });

    // Collect in batches of 3 to avoid overwhelming APIs
    for (let i = 0; i < enabled.length; i += 3) {
      const batch = enabled.slice(i, i + 3);
      const results = await Promise.allSettled(batch.map(s => this._collectOne(s)));

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        const source = batch[j];
        if (result.status === 'fulfilled') {
          succeeded++;
          this._emit({ type: 'sourceComplete', source, count: result.value });
        } else {
          failed++;
          const errMsg = result.reason?.message || String(result.reason);
          errors.push({ sourceId: source.id, sourceName: source.name, error: errMsg });
          this._emit({ type: 'sourceError', source, error: errMsg });
        }
      }
    }

    this._emit({ type: 'complete', succeeded, failed, errors });
    return { succeeded, failed, errors };
  }

  /**
   * Collect from a single source by ID
   */
  async collectOne(sourceId) {
    const sources = await this.storage.getSources();
    const source = sources.find(s => s.id === sourceId);
    if (!source) throw new Error(`Source ${sourceId} not found`);
    return this._collectOne(source);
  }

  async _collectOne(source) {
    if (this._running.has(source.id)) return 0;
    this._running.add(source.id);

    try {
      const items = await fetchSource(source);

      // Deduplicate against existing items
      const existing = await this.storage.getContent(source.id);
      const existingIds = new Set(existing.map(i => i.id));
      const newItems = items.filter(i => !existingIds.has(i.id));

      // Merge: new items at front, keep up to maxItems * 3 for history
      const merged = [...newItems, ...existing].slice(0, (source.maxItems || 20) * 3);
      await this.storage.saveContent(source.id, merged);

      return newItems.length;
    } finally {
      this._running.delete(source.id);
    }
  }

  isRunning(sourceId) {
    return sourceId ? this._running.has(sourceId) : this._running.size > 0;
  }
}

module.exports = { Collector };
