'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Expose a secure, typed API to renderer processes
contextBridge.exposeInMainWorld('pcbAPI', {
  // Sources
  sources: {
    list: () => ipcRenderer.invoke('sources:list'),
    add: (source) => ipcRenderer.invoke('sources:add', source),
    update: (id, updates) => ipcRenderer.invoke('sources:update', id, updates),
    delete: (id) => ipcRenderer.invoke('sources:delete', id),
    toggle: (id, enabled) => ipcRenderer.invoke('sources:toggle', id, enabled),
    types: () => ipcRenderer.invoke('sources:types'),
    collectOne: (id) => ipcRenderer.invoke('sources:collectOne', id),
    collectAll: () => ipcRenderer.invoke('sources:collectAll'),
    isRunning: (id) => ipcRenderer.invoke('sources:isRunning', id)
  },

  // Content
  content: {
    getAll: () => ipcRenderer.invoke('content:getAll'),
    getBySource: (id) => ipcRenderer.invoke('content:getBySource', id)
  },

  // Settings
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    save: (s) => ipcRenderer.invoke('settings:save', s),
    getProviders: () => ipcRenderer.invoke('settings:getProviders')
  },

  // Output
  output: {
    openDigest: () => ipcRenderer.invoke('output:openDigest'),
    exportPDF: () => ipcRenderer.invoke('output:exportPDF'),
    exportMarkdown: () => ipcRenderer.invoke('output:exportMarkdown'),
    exportAgentPack: (scriptOnly) => ipcRenderer.invoke('output:exportAgentPack', scriptOnly)
  },

  // LLM
  llm: {
    generateDigest: () => ipcRenderer.invoke('llm:generateDigest')
  },

  // UI
  ui: {
    openSettings: (tab) => ipcRenderer.invoke('ui:openSettings', tab),
    openDigest: () => ipcRenderer.invoke('ui:openDigest'),
    openDataDir: () => ipcRenderer.invoke('ui:openDataDir'),
    openOutputDir: () => ipcRenderer.invoke('ui:openOutputDir'),
    openExternal: (url) => ipcRenderer.invoke('ui:openExternal', url),
    exportAgentPlatform: () => ipcRenderer.invoke('ui:exportAgentPlatform')
  },

  // Popup
  popup: {
    close: () => ipcRenderer.invoke('popup:close'),
    getLatest: () => ipcRenderer.invoke('popup:getLatest')
  },

  // Events (main → renderer) — removeAllListeners first to prevent accumulation
  // if the renderer calls init() more than once
  on: {
    collectStart:    (fn) => { ipcRenderer.removeAllListeners('collect:start');    ipcRenderer.on('collect:start',    (_, d) => fn(d)); },
    collectComplete: (fn) => { ipcRenderer.removeAllListeners('collect:complete'); ipcRenderer.on('collect:complete', (_, d) => fn(d)); },
    collectError:    (fn) => { ipcRenderer.removeAllListeners('collect:sourceError'); ipcRenderer.on('collect:sourceError', (_, d) => fn(d)); },
    navigate:        (fn) => { ipcRenderer.removeAllListeners('navigate');         ipcRenderer.on('navigate',         (_, tab) => fn(tab)); }
  }
});
