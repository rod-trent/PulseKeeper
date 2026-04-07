'use strict';

const {
  app, BrowserWindow, Tray, Menu, nativeImage,
  ipcMain, shell, dialog, Notification
} = require('electron');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const os = require('os');

const { Storage } = require('./storage');
const { Collector } = require('./collector');
const { Scheduler } = require('./scheduler');
const { renderHTML, renderMarkdown } = require('./outputRenderer');
const { generateDigest, getProviders } = require('./llmClient');
const { exportPack } = require('./agentExport');
const { SOURCE_TYPES } = require('./sources/index');
const { CaptureServer } = require('./server');
const { discoverFeed } = require('./sources/rssDiscover');

// ─── App setup ────────────────────────────────────────────────────────────────
app.setAppUserModelId('com.rodtrent.pulsekeeper');
app.setName('PulseKeeper');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }

// ─── State ────────────────────────────────────────────────────────────────────
let tray = null;
let settingsWin = null;
let digestWin = null;
let popupWin = null;
let storage = null;
let collector = null;
let scheduler = null;
let captureServer = null;
let isCollecting = false;
let unreadCount = 0;
let lastViewedAt = new Date(0);

// ─── App ready ────────────────────────────────────────────────────────────────
app.on('second-instance', () => {
  if (settingsWin) {
    settingsWin.isMinimized() && settingsWin.restore();
    settingsWin.focus();
  }
});

app.whenReady().then(async () => {
  storage = new Storage();
  await storage.init();

  // Write icon file to disk so electron-builder can pick it up
  ensureIconFile();

  collector = new Collector(storage);
  collector.onProgress(evt => {
    if (evt.type === 'start') {
      isCollecting = true;
      broadcastToAll('collect:start', {});
      updateTrayTooltip('PulseKeeper — Collecting…');
    } else if (evt.type === 'complete') {
      isCollecting = false;
      broadcastToAll('collect:complete', evt);
      updateUnreadBadge();
      storage.getSettings().then(s => {
        if (s.notifications?.onRefresh) {
          notify('PulseKeeper Updated', `${evt.succeeded} source${evt.succeeded !== 1 ? 's' : ''} refreshed.`);
        }
      });
    } else if (evt.type === 'sourceError') {
      broadcastToAll('collect:sourceError', { name: evt.source?.name, error: evt.error });
    }
  });

  scheduler = new Scheduler(storage, collector);
  await scheduler.start();

  // Start capture server for browser extension
  captureServer = new CaptureServer(storage);
  captureServer.start();

  createTray();
  setupIPC();

  const settings = await storage.getSettings();
  if (settings.collectOnStartup) {
    setTimeout(() => collector.collectAll(), 2000);
  }
});

app.on('window-all-closed', e => e.preventDefault());

// ─── Tray ─────────────────────────────────────────────────────────────────────
function createTray() {
  tray = new Tray(makePKIcon(16));
  tray.setToolTip('PulseKeeper');
  tray.setContextMenu(buildContextMenu());
  tray.on('click', () => togglePopup());
  tray.on('double-click', () => openDigest());
}

function buildContextMenu() {
  return Menu.buildFromTemplate([
    { label: '💓 PulseKeeper', enabled: false },
    { type: 'separator' },
    { label: '📰 View Digest', click: () => openDigest() },
    { label: '🔄 Refresh Now', click: () => { if (!isCollecting) collector.collectAll(); }, enabled: !isCollecting },
    { type: 'separator' },
    { label: '⚙️  Settings', click: () => openSettings() },
    { label: '📤 Export to AgentPlatform', click: () => exportToAgentPlatform() },
    { label: '📂 Open Data Folder', click: () => shell.openPath(storage.getDataDir()) },
    { type: 'separator' },
    { label: 'Quit PulseKeeper', click: () => app.exit(0) }
  ]);
}

function updateTrayTooltip(text) {
  if (!tray) return;
  tray.setToolTip(text || (unreadCount > 0 ? `PulseKeeper — ${unreadCount} new` : 'PulseKeeper'));
  tray.setContextMenu(buildContextMenu());
}

// ─── Popup (left-click tray) ──────────────────────────────────────────────────
function togglePopup() {
  if (popupWin && !popupWin.isDestroyed()) {
    if (popupWin.isVisible()) { popupWin.hide(); return; }
    showPopup();
    return;
  }
  createPopup();
}

async function updateUnreadBadge() {
  if (!tray) return;
  try {
    const items = await storage.getAllContent();
    unreadCount = items.filter(i => new Date(i.fetchedAt || i.publishedAt) > lastViewedAt).length;
    tray.setImage(makePKIcon(16, unreadCount));
    tray.setToolTip(unreadCount > 0 ? `PulseKeeper — ${unreadCount} new item${unreadCount !== 1 ? 's' : ''}` : 'PulseKeeper');
    tray.setContextMenu(buildContextMenu());
  } catch {}
}

function markPopupViewed() {
  lastViewedAt = new Date();
  unreadCount = 0;
  if (tray) {
    tray.setImage(makePKIcon(16, 0));
    tray.setToolTip('PulseKeeper');
  }
}

function createPopup() {
  markPopupViewed();
  const { x, y } = getPopupPosition();
  popupWin = new BrowserWindow({
    width: 420,
    height: 600,
    x, y,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  popupWin.loadFile(path.join(__dirname, '../../src/renderer/popup.html'));
  popupWin.on('blur', () => { if (popupWin && !popupWin.isDestroyed()) popupWin.hide(); });
  popupWin.on('closed', () => { popupWin = null; });
}

function showPopup() {
  if (!popupWin || popupWin.isDestroyed()) return createPopup();
  markPopupViewed();
  const { x, y } = getPopupPosition();
  popupWin.setPosition(x, y);
  popupWin.show();
  popupWin.focus();
}

function getPopupPosition() {
  if (!tray) return { x: 100, y: 100 };
  const { screen } = require('electron');
  const bounds = tray.getBounds();
  const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y });
  const { workArea } = display;
  const W = 420, H = 600;
  let x = Math.round(bounds.x + bounds.width / 2 - W / 2);
  let y = bounds.y > workArea.height / 2 ? bounds.y - H - 8 : bounds.y + bounds.height + 8;
  x = Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - W));
  return { x, y };
}

// ─── Settings window ──────────────────────────────────────────────────────────
function openSettings(tab) {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.focus();
    if (tab) settingsWin.webContents.send('navigate', tab);
    return;
  }
  settingsWin = new BrowserWindow({
    width: 920,
    height: 700,
    minWidth: 740,
    minHeight: 540,
    title: 'PulseKeeper',
    backgroundColor: '#1a1a2e',
    icon: makePKIcon(32),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  settingsWin.loadFile(path.join(__dirname, '../../src/renderer/index.html'));
  settingsWin.on('closed', () => { settingsWin = null; });
  if (tab) settingsWin.webContents.once('did-finish-load', () => settingsWin.webContents.send('navigate', tab));
}

// ─── Digest window ─────────────────────────────────────────────────────────────
async function openDigest() {
  const items = await storage.getAllContent();
  const settings = await storage.getSettings();
  const format = settings.outputFormat || 'html';

  if (format === 'html') {
    let aiDigest = null;
    if (settings.llm?.enabled && settings.llm?.apiKey && items.length) {
      try { aiDigest = await generateDigest(settings.llm, items); } catch {}
    }
    const html = renderHTML(items, { title: 'PulseKeeper Digest', aiDigest });
    const outPath = await storage.saveOutput('html', html);

    if (digestWin && !digestWin.isDestroyed()) {
      digestWin.loadFile(outPath);
      digestWin.focus();
      return;
    }
    digestWin = new BrowserWindow({
      width: 1200,
      height: 820,
      title: 'PulseKeeper — Digest',
      backgroundColor: '#1a1a2e',
      icon: makePKIcon(32),
      webPreferences: { contextIsolation: true, nodeIntegration: false, webSecurity: false }
    });
    digestWin.loadFile(outPath);
    digestWin.on('closed', () => { digestWin = null; });
  } else if (format === 'markdown') {
    const md = renderMarkdown(items, { title: 'PulseKeeper Digest' });
    shell.openPath(await storage.saveOutput('markdown', md));
  } else if (format === 'pdf') {
    await generatePDF(items);
  }
}

async function generatePDF(items) {
  const html = renderHTML(items, { title: 'PulseKeeper Digest' });
  const htmlPath = await storage.saveOutput('html', html);
  const win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false } });
  await win.loadFile(htmlPath);
  const pdfData = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4' });
  win.destroy();
  shell.openPath(await storage.saveOutput('pdf', pdfData));
}

// ─── AgentPlatform export ──────────────────────────────────────────────────────
async function exportToAgentPlatform() {
  const settings = await storage.getSettings();
  const packJson = exportPack(settings);
  const result = await dialog.showSaveDialog({
    title: 'Export AgentPlatform Pack',
    defaultPath: path.join(os.homedir(), 'Documents', 'PulseKeeper-AgentPack.json'),
    filters: [{ name: 'Agent Pack', extensions: ['json'] }]
  });
  if (result.canceled) return;
  fs.writeFileSync(result.filePath, packJson, 'utf8');
  notify('Exported!', `Agent pack saved: ${path.basename(result.filePath)}`);
  shell.showItemInFolder(result.filePath);
}

// ─── Notifications ─────────────────────────────────────────────────────────────
function notify(title, body) {
  if (!Notification.isSupported()) return;
  new Notification({ title, body, icon: makePKIcon(32) }).show();
}

// ─── IPC ───────────────────────────────────────────────────────────────────────
function setupIPC() {
  ipcMain.handle('sources:list', () => storage.getSources());
  ipcMain.handle('sources:add', (_, s) => storage.addSource(s));
  ipcMain.handle('sources:update', (_, id, u) => storage.updateSource(id, u));
  ipcMain.handle('sources:delete', (_, id) => storage.deleteSource(id));
  ipcMain.handle('sources:toggle', (_, id, enabled) => storage.updateSource(id, { enabled }));
  ipcMain.handle('sources:types', () => SOURCE_TYPES);
  ipcMain.handle('sources:collectOne', (_, id) => collector.collectOne(id));
  ipcMain.handle('sources:collectAll', () => collector.collectAll());
  ipcMain.handle('sources:isRunning', (_, id) => collector.isRunning(id));

  ipcMain.handle('content:getAll', () => storage.getAllContent());
  ipcMain.handle('content:getBySource', (_, id) => storage.getContent(id));

  ipcMain.handle('settings:get', () => storage.getSettings());
  ipcMain.handle('settings:save', async (_, s) => { await storage.saveSettings(s); await scheduler.restart(); });
  ipcMain.handle('settings:getProviders', () => getProviders());

  ipcMain.handle('output:openDigest', () => openDigest());
  ipcMain.handle('output:exportPDF', async () => { const items = await storage.getAllContent(); await generatePDF(items); });
  ipcMain.handle('output:exportMarkdown', async () => { const items = await storage.getAllContent(); const md = renderMarkdown(items, { title: 'PulseKeeper Digest' }); const p = await storage.saveOutput('markdown', md); shell.openPath(p); return p; });
  ipcMain.handle('output:exportAgentPack', async (_, scriptOnly) => { const s = await storage.getSettings(); return exportPack(s, scriptOnly); });

  ipcMain.handle('llm:generateDigest', async () => {
    const s = await storage.getSettings();
    if (!s.llm?.enabled || !s.llm?.apiKey) throw new Error('LLM not configured');
    const items = await storage.getAllContent();
    return generateDigest(s.llm, items);
  });

  ipcMain.handle('ui:openSettings', (_, tab) => openSettings(tab));
  ipcMain.handle('ui:openDigest', () => openDigest());
  ipcMain.handle('ui:openDataDir', () => shell.openPath(storage.getDataDir()));
  ipcMain.handle('ui:openOutputDir', () => shell.openPath(storage.getOutputDir()));
  ipcMain.handle('ui:openExtensionDir', () => shell.openPath(path.join(__dirname, '../../extension')));
  ipcMain.handle('ui:openExternal', (_, url) => shell.openExternal(url));
  ipcMain.handle('ui:exportAgentPlatform', () => exportToAgentPlatform());

  ipcMain.handle('popup:close', () => { if (popupWin) popupWin.hide(); });
  ipcMain.handle('popup:getLatest', async () => (await storage.getAllContent()).slice(0, 100));

  // Read tracking
  ipcMain.handle('content:getReadIds', async () => [...(await storage.getReadIds())]);
  ipcMain.handle('content:markRead', (_, ids) => storage.markRead(ids));
  ipcMain.handle('content:markAllRead', async () => {
    const items = await storage.getAllContent();
    await storage.markAllRead(items.map(i => i.id));
  });

  // Source health
  ipcMain.handle('sources:getHealth', () => storage.getSourceHealth());

  // RSS auto-discovery
  ipcMain.handle('sources:discoverFeed', (_, url) => discoverFeed(url));

  // Digest history
  ipcMain.handle('digest:getHistory', () => storage.getHistory());
  ipcMain.handle('digest:openHistory', (_, filePath) => shell.openPath(filePath));

  // Settings backup / restore
  ipcMain.handle('settings:exportBackup', async () => {
    const json = await storage.exportBackup();
    const result = await dialog.showSaveDialog({
      title: 'Export PulseKeeper Backup',
      defaultPath: path.join(os.homedir(), 'Documents', `PulseKeeper-backup-${new Date().toISOString().slice(0,10)}.json`),
      filters: [{ name: 'JSON Backup', extensions: ['json'] }]
    });
    if (result.canceled) return;
    fs.writeFileSync(result.filePath, json, 'utf8');
    notify('Backup Exported', path.basename(result.filePath));
    shell.showItemInFolder(result.filePath);
  });

  ipcMain.handle('settings:importBackup', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Import PulseKeeper Backup',
      filters: [{ name: 'JSON Backup', extensions: ['json'] }],
      properties: ['openFile']
    });
    if (result.canceled || !result.filePaths.length) return;
    const json = fs.readFileSync(result.filePaths[0], 'utf8');
    await storage.importBackup(json);
    await scheduler.restart();
    notify('Backup Restored', 'Sources and settings have been restored.');
    broadcastToAll('backup:imported', {});
  });
}

function broadcastToAll(channel, data) {
  for (const win of [settingsWin, popupWin]) {
    if (win && !win.isDestroyed()) {
      try { win.webContents.send(channel, data); } catch {}
    }
  }
}

// ─── PulseKeeper Icon (programmatic PNG) ──────────────────────────────────────
function makePKIcon(size = 16, badge = 0) {
  const s = size;
  const buf = new Array(s * s * 4).fill(0);

  const set = (x, y, r, g, b, a = 255) => {
    if (x < 0 || x >= s || y < 0 || y >= s) return;
    const i = (y * s + x) * 4;
    buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
  };

  // Blue rounded-square background
  const cr = s * 0.22;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const rx = Math.min(x, s - 1 - x);
      const ry = Math.min(y, s - 1 - y);
      const inCorner = rx < cr && ry < cr && Math.sqrt((rx - cr) ** 2 + (ry - cr) ** 2) > cr;
      if (!inCorner) set(x, y, 11, 29, 58);  // #0b1d3a dark navy
    }
  }

  // EKG/pulse line in cyan (#60cdff = 96, 205, 255)
  const line = (x0, y0, x1, y1) => {
    x0 = Math.round(x0); y0 = Math.round(y0);
    x1 = Math.round(x1); y1 = Math.round(y1);
    let dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    let dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      set(x0, y0, 96, 205, 255);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  };

  // Scale factor: map 64-unit SVG coords to icon size
  const t = v => v * s / 64;

  // Match the SVG pulse path: 4,34 14,34 18,26 22,42 26,16 30,50 34,34 44,34 48,27 52,41 60,34
  const pts = [[4,34],[14,34],[18,26],[22,42],[26,16],[30,50],[34,34],[44,34],[48,27],[52,41],[60,34]];
  for (let i = 0; i < pts.length - 1; i++) {
    line(t(pts[i][0]), t(pts[i][1]), t(pts[i+1][0]), t(pts[i+1][1]));
  }

  // Peak dot emphasis
  set(Math.round(t(26)), Math.round(t(16)), 150, 230, 255);

  // Unread badge — red circle in top-right corner
  if (badge > 0) {
    const dotR = Math.max(2, Math.round(s * 0.22));
    const cx = s - dotR - 1;
    const cy = dotR + 1;
    for (let dy = -dotR; dy <= dotR; dy++) {
      for (let dx = -dotR; dx <= dotR; dx++) {
        if (dx * dx + dy * dy <= dotR * dotR) set(cx + dx, cy + dy, 232, 17, 35);
      }
    }
  }

  return bufToPNG(buf, s);
}

function bufToPNG(buf, s) {
  const rows = [];
  for (let y = 0; y < s; y++) {
    const row = Buffer.alloc(1 + s * 4);
    row[0] = 0;
    for (let x = 0; x < s; x++) {
      const i = (y * s + x) * 4;
      row[1 + x * 4] = buf[i]; row[1 + x * 4 + 1] = buf[i + 1];
      row[1 + x * 4 + 2] = buf[i + 2]; row[1 + x * 4 + 3] = buf[i + 3];
    }
    rows.push(row);
  }
  const compressed = zlib.deflateSync(Buffer.concat(rows));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(s, 0); ihdr.writeUInt32BE(s, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const png = Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', compressed), pngChunk('IEND', Buffer.alloc(0))]);
  return nativeImage.createFromBuffer(png);
}

function pngChunk(type, data) {
  const len = Buffer.allocUnsafe(4); len.writeUInt32BE(data.length, 0);
  const tb = Buffer.from(type, 'ascii');
  const crcVal = Buffer.allocUnsafe(4); crcVal.writeUInt32BE(crc32(Buffer.concat([tb, data])), 0);
  return Buffer.concat([len, tb, data, crcVal]);
}

function crc32(buf) {
  if (!crc32.t) {
    crc32.t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      crc32.t[i] = c;
    }
  }
  let crc = 0xFFFFFFFF;
  for (const b of buf) crc = crc32.t[(crc ^ b) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// Write icon PNG to disk for electron-builder
function ensureIconFile() {
  const iconPath = path.join(__dirname, '../../assets/icon.png');
  if (!fs.existsSync(iconPath)) {
    try {
      const img = makePKIcon(256);
      fs.writeFileSync(iconPath, img.toPNG());
    } catch {}
  }
}
