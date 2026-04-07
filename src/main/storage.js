'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = path.join(os.homedir(), 'Documents', 'PulseKeeper');
const SOURCES_FILE = path.join(DATA_DIR, 'sources.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const CONTENT_DIR = path.join(DATA_DIR, 'content');
const OUTPUT_DIR = path.join(DATA_DIR, 'output');

const DEFAULT_SETTINGS = {
  refreshInterval: 30,
  collectOnStartup: true,
  maxItemsPerSource: 20,
  outputFormat: 'html',
  llm: {
    enabled: false,
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    apiKey: '',
    generateDigest: true,
    digestPrompt: 'Summarize the following content items into a concise daily digest with key highlights and insights:'
  },
  display: {
    theme: 'dark',
    accentColor: '#0078d4',
    showThumbnails: true,
    groupBySource: false,
    sortBy: 'date'
  },
  notifications: {
    enabled: true,
    onRefresh: false,
    onNewContent: true
  },
  captureServer: {
    enabled: true,
    port: 7828
  }
};

const DEFAULT_SOURCES = [
  {
    id: uuidv4(),
    name: 'Hacker News',
    type: 'rss',
    enabled: true,
    config: { url: 'https://news.ycombinator.com/rss' },
    maxItems: 15,
    icon: 'rss'
  },
  {
    id: uuidv4(),
    name: 'r/technology',
    type: 'reddit',
    enabled: true,
    config: { subreddit: 'technology' },
    maxItems: 10,
    icon: 'reddit'
  }
];

function deepMerge(defaults, overrides) {
  const result = { ...defaults };
  for (const key of Object.keys(overrides)) {
    if (overrides[key] !== null && typeof overrides[key] === 'object' && !Array.isArray(overrides[key])
        && typeof defaults[key] === 'object' && defaults[key] !== null) {
      result[key] = deepMerge(defaults[key], overrides[key]);
    } else {
      result[key] = overrides[key];
    }
  }
  return result;
}

class Storage {
  constructor() {
    this._lock = false;
  }

  async init() {
    for (const dir of [DATA_DIR, CONTENT_DIR, OUTPUT_DIR]) {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(SETTINGS_FILE)) {
      await this._write(SETTINGS_FILE, DEFAULT_SETTINGS);
    }
    if (!fs.existsSync(SOURCES_FILE)) {
      await this._write(SOURCES_FILE, DEFAULT_SOURCES);
    }
  }

  // --- Settings ---
  async getSettings() {
    try {
      const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
      return deepMerge(DEFAULT_SETTINGS, JSON.parse(raw));
    } catch {
      return deepMerge({}, DEFAULT_SETTINGS);
    }
  }

  async saveSettings(settings) {
    await this._write(SETTINGS_FILE, settings);
  }

  // --- Sources ---
  async getSources() {
    try {
      const raw = fs.readFileSync(SOURCES_FILE, 'utf8');
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  async saveSources(sources) {
    await this._write(SOURCES_FILE, sources);
  }

  async addSource(source) {
    const sources = await this.getSources();
    const newSource = { id: uuidv4(), enabled: true, maxItems: 20, ...source };
    sources.push(newSource);
    await this.saveSources(sources);
    return newSource;
  }

  async updateSource(id, updates) {
    const sources = await this.getSources();
    const idx = sources.findIndex(s => s.id === id);
    if (idx === -1) throw new Error(`Source ${id} not found`);
    sources[idx] = { ...sources[idx], ...updates };
    await this.saveSources(sources);
    return sources[idx];
  }

  async deleteSource(id) {
    let sources = await this.getSources();
    sources = sources.filter(s => s.id !== id);
    await this.saveSources(sources);
    const contentFile = path.join(CONTENT_DIR, `${id}.json`);
    if (fs.existsSync(contentFile)) fs.unlinkSync(contentFile);
  }

  // --- Content Cache ---
  async getContent(sourceId) {
    const file = path.join(CONTENT_DIR, `${sourceId}.json`);
    try {
      const raw = fs.readFileSync(file, 'utf8');
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  async saveContent(sourceId, items) {
    const file = path.join(CONTENT_DIR, `${sourceId}.json`);
    await this._write(file, items);
  }

  async getAllContent() {
    const sources = await this.getSources();
    const allItems = [];
    for (const source of sources.filter(s => s.enabled)) {
      const items = await this.getContent(source.id);
      allItems.push(...items);
    }
    allItems.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
    return allItems;
  }

  getOutputPath(format) {
    const ext = format === 'markdown' ? 'md' : format;
    return path.join(OUTPUT_DIR, `digest.${ext}`);
  }

  async saveOutput(format, content) {
    const file = this.getOutputPath(format);
    // PDF content is a Buffer — don't force utf8 encoding on binary data
    if (Buffer.isBuffer(content)) {
      fs.writeFileSync(file, content);
    } else {
      fs.writeFileSync(file, content, 'utf8');
    }
    return file;
  }

  getDataDir() { return DATA_DIR; }
  getOutputDir() { return OUTPUT_DIR; }

  async _write(file, data) {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, file);
  }
}

module.exports = { Storage };
