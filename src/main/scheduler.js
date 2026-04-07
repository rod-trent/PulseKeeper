'use strict';

const cron = require('node-cron');

class Scheduler {
  constructor(storage, collector) {
    this.storage = storage;
    this.collector = collector;
    this._task = null;
    this._listeners = [];
  }

  onTick(fn) { this._listeners.push(fn); }

  async start() {
    await this._reschedule();
  }

  stop() {
    if (this._task) {
      this._task.stop();
      this._task = null;
    }
  }

  async restart() {
    this.stop();
    await this._reschedule();
  }

  async _reschedule() {
    const settings = await this.storage.getSettings();
    const intervalMinutes = Math.max(5, settings.refreshInterval || 30);

    // Build cron expression: every N minutes
    const cronExpr = `*/${intervalMinutes} * * * *`;

    this._task = cron.schedule(cronExpr, async () => {
      for (const fn of this._listeners) {
        try { fn('tick'); } catch {}
      }
      await this.collector.collectAll();
    }, { scheduled: true });
  }

  getNextRunMs() {
    // Approximate next run time based on current minute alignment
    const now = new Date();
    return new Date(Math.ceil(now.getTime() / 60000) * 60000).toISOString();
  }
}

module.exports = { Scheduler };
