'use strict';

const api = window.pcbAPI;

// ─── State ────────────────────────────────────────────────────────────────────
let sourceTypes = [];
let sources = [];
let editingSourceId = null;

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  sourceTypes = await api.sources.types();
  await loadSources();
  await loadSettings();
  await loadLLMSettings();
  setupNavigation();
  setupEventListeners();
  populateSourceTypeDropdown();
  checkServerStatus();
  applyTheme();

  api.on.collectStart(() => setStatus('Collecting…'));
  api.on.collectComplete(({ succeeded, failed }) => {
    setStatus(`Updated — ${succeeded} source${succeeded !== 1 ? 's' : ''} refreshed`);
    loadSources();
  });
  api.on.collectError(({ name, error }) => showToast(`Error in ${name}: ${error}`, 'error'));
  api.on.navigate(tab => switchTab(tab));
  api.on.backupImported(() => { loadSources(); loadSettings(); showToast('Backup restored — reloading…'); });
}

// ─── Navigation ───────────────────────────────────────────────────────────────
function setupNavigation() {
  document.querySelectorAll('.nav-item[data-tab]').forEach(item => {
    item.addEventListener('click', () => switchTab(item.dataset.tab));
  });
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const tab = document.getElementById(`tab-${tabId}`);
  if (tab) { tab.style.display = 'flex'; tab.style.flexDirection = 'column'; }
  const navItem = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
  if (navItem) navItem.classList.add('active');
  if (tabId === 'extension') checkServerStatus();
  if (tabId === 'export') loadHistory();
}

// ─── Sources ──────────────────────────────────────────────────────────────────
let sourceHealth = {};

async function loadSources() {
  [sources, sourceHealth] = await Promise.all([api.sources.list(), api.sources.getHealth()]);
  renderSourceList();
  document.getElementById('sourceBadge').textContent = sources.filter(s => s.enabled).length;
}

function renderSourceList() {
  const container = document.getElementById('sourceList');
  const visible = sources.filter(s => s.type !== 'web-capture');
  if (!visible.length) {
    container.innerHTML = `<div class="empty-state">
      <div class="empty-icon">📡</div>
      <h3>No sources yet</h3>
      <p>Add your first content source to get started</p>
      <button class="btn btn-primary" data-action="add-source">+ Add Source</button>
    </div>`;
    return;
  }
  container.innerHTML = sources.map(s => renderSourceCard(s)).join('');
}

function renderSourceCard(source) {
  const typeInfo = sourceTypes.find(t => t.id === source.type) || {};
  const icon = getSourceIcon(source.type);
  const typeClass = `type-${source.type}`;
  const h = sourceHealth[source.id] || {};
  const healthHTML = renderHealthBadge(h, source);

  return `<div class="source-card ${source.enabled ? '' : 'disabled'}" id="source-${source.id}">
    <div class="source-icon ${typeClass}">${icon}</div>
    <div class="source-info">
      <div class="source-name">${escapeHTML(source.name)}</div>
      <div class="source-meta">${typeInfo.label || source.type} · Max ${source.maxItems || 20} items${source.refreshInterval ? ` · ⏱ ${source.refreshInterval}m` : ''}</div>
      ${healthHTML}
    </div>
    <div class="source-actions">
      <span class="source-status pending" id="status-${source.id}">—</span>
      <button class="btn btn-ghost btn-sm btn-icon" title="Refresh now" data-action="refresh" data-id="${source.id}">🔄</button>
      ${source.type !== 'web-capture' ? `<button class="btn btn-ghost btn-sm btn-icon" title="Edit" data-action="edit" data-id="${source.id}">✏️</button>` : ''}
      <label class="toggle" title="${source.enabled ? 'Disable' : 'Enable'}">
        <input type="checkbox" ${source.enabled ? 'checked' : ''} data-action="toggle" data-id="${source.id}">
        <span class="toggle-slider"></span>
      </label>
      <button class="btn btn-ghost btn-sm btn-icon" title="Delete" data-action="delete" data-id="${source.id}">🗑️</button>
    </div>
  </div>`;
}

function renderHealthBadge(h, source) {
  if (!h.lastFetchedAt) return '';
  const ago = relativeTimeShort(h.lastFetchedAt);
  if (h.lastError) {
    return `<div class="source-health"><span class="health-err" title="${escapeHTML(h.lastError)}">⚠ Error · ${ago}</span></div>`;
  }
  const newTxt = h.lastNewCount != null ? ` · +${h.lastNewCount} new` : '';
  return `<div class="source-health"><span class="health-ok">✓ ${ago}${newTxt}</span></div>`;
}

function relativeTimeShort(dateStr) {
  if (!dateStr) return '';
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  } catch { return ''; }
}

async function toggleSource(id, enabled) {
  await api.sources.toggle(id, enabled);
  await loadSources();
}

async function deleteSource(id) {
  const source = sources.find(s => s.id === id);
  if (!source || !confirm(`Delete "${source.name}"? Cached content will also be removed.`)) return;
  await api.sources.delete(id);
  await loadSources();
}

async function refreshSource(id) {
  const el = document.getElementById(`status-${id}`);
  if (el) { el.className = 'source-status running'; el.textContent = 'Running…'; }
  try {
    const count = await api.sources.collectOne(id);
    if (el) { el.className = 'source-status ok'; el.textContent = `+${count} new`; }
    setTimeout(() => { if (el) { el.className = 'source-status pending'; el.textContent = '—'; } }, 4000);
  } catch (e) {
    if (el) { el.className = 'source-status error'; el.textContent = 'Error'; }
    showToast(e.message, 'error');
  }
}

// ─── Add / Edit Source Modal ───────────────────────────────────────────────────
function openAddSource() {
  editingSourceId = null;
  document.getElementById('modalTitle').textContent = 'Add Source';
  document.getElementById('sourceName').value = '';
  document.getElementById('sourceType').value = '';
  document.getElementById('sourceMaxItems').value = '20';
  document.getElementById('sourceRefreshInterval').value = '0';
  document.getElementById('sourceFields').innerHTML = '';
  document.getElementById('sourceTypeHint').textContent = '';
  document.getElementById('btnSaveSource').textContent = 'Add Source';
  showModal();
}

function openEditSource(id) {
  const source = sources.find(s => s.id === id);
  if (!source) return;
  editingSourceId = id;
  document.getElementById('modalTitle').textContent = 'Edit Source';
  document.getElementById('sourceName').value = source.name;
  document.getElementById('sourceType').value = source.type;
  document.getElementById('sourceMaxItems').value = source.maxItems || 20;
  document.getElementById('sourceRefreshInterval').value = source.refreshInterval || 0;
  document.getElementById('btnSaveSource').textContent = 'Save Changes';
  renderSourceFields(source.type, source.config || {});
  updateTypeHint(source.type);
  showModal();
}

function onSourceTypeChange() {
  const type = document.getElementById('sourceType').value;
  renderSourceFields(type, {});
  updateTypeHint(type);
}

function updateTypeHint(type) {
  const typeInfo = sourceTypes.find(t => t.id === type);
  document.getElementById('sourceTypeHint').textContent = typeInfo?.description || '';
}

function renderSourceFields(type, existing) {
  const typeInfo = sourceTypes.find(t => t.id === type);
  const container = document.getElementById('sourceFields');
  if (!typeInfo?.fields?.length) { container.innerHTML = ''; return; }

  container.innerHTML = typeInfo.fields.map(field => {
    const val = existing[field.key] !== undefined ? existing[field.key] : (field.default || '');
    if (field.type === 'select') {
      const opts = field.options.map(o => `<option value="${o}" ${o === val ? 'selected' : ''}>${o}</option>`).join('');
      return `<div class="form-group">
        <label class="form-label">${field.label}${field.required ? ' *' : ''}</label>
        <select class="select" data-field="${field.key}">${opts}</select>
      </div>`;
    }
    if (field.type === 'checkbox') {
      return `<div class="form-group" style="display:flex;align-items:center;justify-content:space-between">
        <label class="form-label" style="margin:0">${field.label}</label>
        <label class="toggle"><input type="checkbox" data-field="${field.key}" ${val ? 'checked' : ''}><span class="toggle-slider"></span></label>
      </div>`;
    }
    // RSS/feed URL fields get a "Discover" button
    const isDiscoverableURL = field.key === 'url' && field.type === 'url' &&
      ['rss', 'podcast', 'newsletter', 'blog'].includes(type);

    if (isDiscoverableURL) {
      return `<div class="form-group">
        <label class="form-label">${field.label}${field.required ? ' *' : ''}</label>
        <div class="input-with-action">
          <input type="url" class="input" data-field="${field.key}" value="${escapeHTML(String(val))}" placeholder="${escapeHTML(field.placeholder || '')}">
          <button class="btn btn-secondary btn-sm btn-discover" data-discover-field="${field.key}" title="Auto-discover RSS feed from any webpage URL">🔍 Discover</button>
        </div>
        ${field.hint ? `<div class="form-hint">${escapeHTML(field.hint)}</div>` : ''}
      </div>`;
    }

    return `<div class="form-group">
      <label class="form-label">${field.label}${field.required ? ' *' : ''}</label>
      <input type="${field.type}" class="input" data-field="${field.key}" value="${escapeHTML(String(val))}" placeholder="${escapeHTML(field.placeholder || '')}">
      ${field.hint ? `<div class="form-hint">${escapeHTML(field.hint)}</div>` : ''}
      ${field.type === 'password' ? '<div class="form-hint">Stored locally on this machine only</div>' : ''}
    </div>`;
  }).join('');
}

async function saveSource() {
  const type = document.getElementById('sourceType').value;
  const name = document.getElementById('sourceName').value.trim();
  const maxItems = parseInt(document.getElementById('sourceMaxItems').value) || 20;
  const refreshInterval = parseInt(document.getElementById('sourceRefreshInterval').value) || 0;

  if (!type) { showToast('Please select a source type', 'error'); return; }
  if (!name) { showToast('Please enter a display name', 'error'); return; }

  // Validate required fields
  const typeInfo = sourceTypes.find(t => t.id === type);
  for (const field of (typeInfo?.fields || [])) {
    if (field.required) {
      const el = document.querySelector(`#sourceFields [data-field="${field.key}"]`);
      if (el && !el.value.trim()) {
        showToast(`${field.label} is required`, 'error');
        el.focus();
        return;
      }
    }
  }

  const config = {};
  document.querySelectorAll('#sourceFields [data-field]').forEach(el => {
    config[el.dataset.field] = el.type === 'checkbox' ? el.checked : el.value.trim();
  });

  try {
    if (editingSourceId) {
      await api.sources.update(editingSourceId, { name, type, config, maxItems, refreshInterval });
      showToast('Source updated');
    } else {
      await api.sources.add({ name, type, config, maxItems, refreshInterval });
      showToast(`"${name}" added`);
    }
    closeModal();
    await loadSources();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function populateSourceTypeDropdown() {
  const sel = document.getElementById('sourceType');
  // Exclude web-capture (managed automatically by extension)
  const types = sourceTypes.filter(t => t.id !== 'web-capture');
  sel.innerHTML = '<option value="">Select a type…</option>' +
    types.map(t => `<option value="${t.id}">${t.label}</option>`).join('');
}

// ─── Settings ─────────────────────────────────────────────────────────────────
async function loadSettings() {
  const s = await api.settings.get();
  document.getElementById('settingInterval').value = s.refreshInterval || 30;
  document.getElementById('settingCollectOnStartup').checked = s.collectOnStartup !== false;
  document.getElementById('settingMaxItems').value = s.maxItemsPerSource || 20;
  document.getElementById('settingOutputFormat').value = s.outputFormat || 'html';
  document.getElementById('settingNotifyEnabled').checked = s.notifications?.enabled !== false;
  document.getElementById('settingNotifyOnRefresh').checked = !!s.notifications?.onRefresh;
  document.getElementById('settingMuteWords').value = (s.muteWords || []).join(', ');
}

async function saveSettings() {
  const current = await api.settings.get();
  const muteRaw = document.getElementById('settingMuteWords').value;
  const muteWords = muteRaw.split(',').map(w => w.trim()).filter(Boolean);
  await api.settings.save({
    ...current,
    refreshInterval: parseInt(document.getElementById('settingInterval').value),
    collectOnStartup: document.getElementById('settingCollectOnStartup').checked,
    maxItemsPerSource: parseInt(document.getElementById('settingMaxItems').value),
    outputFormat: document.getElementById('settingOutputFormat').value,
    muteWords,
    notifications: {
      enabled: document.getElementById('settingNotifyEnabled').checked,
      onRefresh: document.getElementById('settingNotifyOnRefresh').checked
    }
  });
  showToast('Settings saved');
}

// ─── LLM ──────────────────────────────────────────────────────────────────────
const MODEL_MAP = {
  anthropic: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o3-mini'],
  xai: ['grok-3', 'grok-3-fast', 'grok-3-mini'],
  ollama: ['llama3.2', 'llama3.1', 'mistral', 'phi3', 'gemma2'],
  custom: []
};

async function loadLLMSettings() {
  const s = await api.settings.get();
  const llm = s.llm || {};
  document.getElementById('llmEnabled').checked = !!llm.enabled;
  document.getElementById('llmProvider').value = llm.provider || 'anthropic';
  document.getElementById('llmApiKey').value = llm.apiKey || '';
  document.getElementById('llmBaseURL').value = llm.baseURL || '';
  document.getElementById('llmDigestPrompt').value = llm.digestPrompt || 'Summarize the following content items into a concise daily digest:';
  updateModelDropdown(llm.provider || 'anthropic', llm.model);
  updateCustomURLVisibility(llm.provider);
}

function updateModelDropdown(provider, selected) {
  const models = MODEL_MAP[provider] || [];
  const sel = document.getElementById('llmModel');
  sel.innerHTML = models.map(m => `<option value="${m}" ${m === selected ? 'selected' : ''}>${m}</option>`).join('');
}

function updateCustomURLVisibility(provider) {
  document.getElementById('customBaseURLGroup').style.display = provider === 'custom' ? 'block' : 'none';
}

async function saveLLMSettings() {
  const current = await api.settings.get();
  const provider = document.getElementById('llmProvider').value;
  await api.settings.save({
    ...current,
    llm: {
      enabled: document.getElementById('llmEnabled').checked,
      provider,
      model: document.getElementById('llmModel').value,
      apiKey: document.getElementById('llmApiKey').value.trim(),
      baseURL: document.getElementById('llmBaseURL').value.trim(),
      digestPrompt: document.getElementById('llmDigestPrompt').value.trim()
    }
  });
  showToast('LLM settings saved');
}

async function testLLM() {
  const btn = document.getElementById('btnTestLLM');
  btn.disabled = true; btn.textContent = 'Testing…';
  try {
    await saveLLMSettings();
    await api.llm.generateDigest();
    showToast('LLM connection successful!', 'success');
  } catch (e) {
    showToast(`LLM error: ${e.message}`, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Test Connection';
  }
}

// ─── Theme ─────────────────────────────────────────────────────────────────────
function applyTheme() {
  api.settings.get().then(s => {
    const theme = s.display?.theme || 'dark';
    document.body.classList.toggle('theme-light', theme === 'light');
    updateThemeButton(theme);
  });
}

function updateThemeButton(theme) {
  const btn = document.getElementById('btnThemeToggle');
  if (btn) btn.textContent = theme === 'light' ? '🌙 Dark Mode' : '☀️ Light Mode';
}

async function toggleTheme() {
  const s = await api.settings.get();
  const newTheme = (s.display?.theme || 'dark') === 'dark' ? 'light' : 'dark';
  await api.settings.save({ ...s, display: { ...(s.display || {}), theme: newTheme } });
  document.body.classList.toggle('theme-light', newTheme === 'light');
  updateThemeButton(newTheme);
}

// ─── Digest History ────────────────────────────────────────────────────────────
async function loadHistory() {
  const el = document.getElementById('historyList');
  if (!el) return;
  const history = await api.digest.getHistory();
  if (!history.length) {
    el.innerHTML = '<div style="color:var(--text-disabled);font-size:12px">No digest history yet — generate a digest to start the archive.</div>';
    return;
  }
  el.innerHTML = history.map(h => `
    <div class="history-item">
      <span class="history-label">${escapeHTML(h.label)}</span>
      <span class="history-ext">${escapeHTML(h.ext)}</span>
      <button class="btn btn-secondary btn-sm" data-open-history="${escapeHTML(h.path)}">Open</button>
    </div>`).join('');
  el.querySelectorAll('[data-open-history]').forEach(btn => {
    btn.addEventListener('click', () => api.digest.openHistory(btn.dataset.openHistory));
  });
}

// ─── RSS Discover ──────────────────────────────────────────────────────────────
async function handleDiscoverFeed(fieldKey) {
  const input = document.querySelector(`#sourceFields [data-field="${fieldKey}"]`);
  if (!input || !input.value.trim()) { showToast('Enter a URL first', 'error'); return; }
  const btn = document.querySelector(`[data-discover-field="${fieldKey}"]`);
  const origText = btn.textContent;
  btn.disabled = true; btn.textContent = '⏳';
  try {
    const feedUrl = await api.sources.discoverFeed(input.value.trim());
    if (feedUrl) {
      input.value = feedUrl;
      showToast('Feed discovered!');
    } else {
      showToast('No RSS feed found at that URL', 'error');
    }
  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = origText;
  }
}

// ─── Export ────────────────────────────────────────────────────────────────────
async function exportAgentPack(scriptOnly) {
  try {
    await api.ui.exportAgentPlatform();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ─── Extension / Server status ────────────────────────────────────────────────
async function checkServerStatus() {
  const el = document.getElementById('serverStatus');
  if (!el) return;
  try {
    const res = await fetch('http://localhost:7828/status');
    const data = await res.json();
    if (data.ok) {
      el.innerHTML = '<span style="color:#6ccb5f">● Running on port 7828</span>';
    } else {
      el.innerHTML = '<span style="color:#fc5353">● Not responding</span>';
    }
  } catch {
    el.innerHTML = '<span style="color:#fc5353">● Not reachable — is PulseKeeper running?</span>';
  }
}

// ─── Modal ─────────────────────────────────────────────────────────────────────
function showModal() {
  const overlay = document.getElementById('addSourceModal');
  overlay.style.display = 'flex';
  // Force reflow so the CSS transition fires correctly
  overlay.offsetHeight; // eslint-disable-line no-unused-expressions
  overlay.classList.add('visible');
}

function closeModal() {
  const overlay = document.getElementById('addSourceModal');
  overlay.classList.remove('visible');
  setTimeout(() => { overlay.style.display = 'none'; }, 280);
}

// ─── Event Listeners ───────────────────────────────────────────────────────────
function setupEventListeners() {
  document.getElementById('btnAddSource').addEventListener('click', openAddSource);
  document.getElementById('btnRefreshAll').addEventListener('click', async () => {
    setStatus('Collecting all sources…', true);
    try {
      const r = await api.sources.collectAll();
      showToast(`${r.succeeded} source${r.succeeded !== 1 ? 's' : ''} refreshed${r.failed ? `, ${r.failed} failed` : ''}`);
    } catch (e) {
      showToast(e.message, 'error');
    } finally { setStatus('Ready', false); }
  });
  document.getElementById('btnSaveSettings').addEventListener('click', saveSettings);
  document.getElementById('btnSaveSource').addEventListener('click', saveSource);
  document.getElementById('btnSaveLLM').addEventListener('click', saveLLMSettings);
  document.getElementById('btnTestLLM').addEventListener('click', testLLM);

  document.getElementById('llmProvider').addEventListener('change', e => {
    updateModelDropdown(e.target.value, null);
    updateCustomURLVisibility(e.target.value);
  });

  // Source list — delegated click and change handlers
  const sourceList = document.getElementById('sourceList');
  sourceList.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;
    if (action === 'refresh') refreshSource(id);
    else if (action === 'edit') openEditSource(id);
    else if (action === 'delete') deleteSource(id);
    else if (action === 'add-source') openAddSource();
  });
  sourceList.addEventListener('change', e => {
    const inp = e.target.closest('[data-action="toggle"]');
    if (inp) toggleSource(inp.dataset.id, inp.checked);
  });

  // Discover feed button (delegated — modal rebuilds dynamically)
  document.getElementById('sourceFields').addEventListener('click', e => {
    const btn = e.target.closest('[data-discover-field]');
    if (btn) handleDiscoverFeed(btn.dataset.discoverField);
  });

  // Theme toggle
  document.getElementById('btnThemeToggle').addEventListener('click', toggleTheme);

  // Backup buttons
  document.getElementById('btnExportBackup').addEventListener('click', async () => {
    try { await api.settings.exportBackup(); }
    catch (e) { showToast(e.message, 'error'); }
  });
  document.getElementById('btnImportBackup').addEventListener('click', async () => {
    try { await api.settings.importBackup(); }
    catch (e) { showToast(e.message, 'error'); }
  });

  // Close modal on overlay click or Escape
  document.getElementById('addSourceModal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function setStatus(text) {
  document.getElementById('statusBar').textContent = text;
}

function showToast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity 0.3s'; setTimeout(() => t.remove(), 300); }, 3500);
}

function escapeHTML(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getSourceIcon(type) {
  const m = { rss:'📡', podcast:'🎙️', youtube:'▶️', reddit:'🔴', newsletter:'📧', blog:'✍️', webpage:'🌐', 'web-capture':'🧩' };
  return m[type] || '📄';
}

// ─── Boot ──────────────────────────────────────────────────────────────────────
init();
