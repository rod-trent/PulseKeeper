'use strict';

const api = window.pcbAPI;

const SOURCE_COLORS = {
  rss: '#f26522', podcast: '#9b59b6', youtube: '#ff0000',
  twitter: '#1da1f2', spotify: '#1db954', reddit: '#ff4500',
  newsletter: '#0078d4', blog: '#2ecc71'
};
const SOURCE_ICONS = {
  rss:'📡', podcast:'🎙️', youtube:'▶️', twitter:'🐦',
  spotify:'🎵', reddit:'🔴', newsletter:'📧', blog:'✍️'
};

let allItems = [];
let activeFilter = 'all';

async function init() {
  await refresh();

  api.on.collectStart(() => {
    document.getElementById('statusDot').className = 'status-dot collecting';
    document.getElementById('statusText').textContent = 'Collecting…';
  });

  api.on.collectComplete(({ succeeded }) => {
    document.getElementById('statusDot').className = 'status-dot';
    document.getElementById('statusText').textContent = `Updated`;
    refresh();
  });
}

async function refresh() {
  const list = document.getElementById('itemsList');
  list.innerHTML = '<div class="loading"><div class="spinner"></div><span>Loading…</span></div>';

  try {
    allItems = await api.popup.getLatest();
    renderFilters();
    renderItems();
  } catch (e) {
    list.innerHTML = `<div class="empty">Failed to load content<br><small>${e.message}</small></div>`;
  }
}

function renderFilters() {
  const types = [...new Set(allItems.map(i => i.sourceType).filter(Boolean))];
  const row = document.getElementById('filterRow');
  const existing = row.querySelector('[data-type="all"]');
  row.innerHTML = '';

  const allChip = document.createElement('button');
  allChip.className = `filter-chip ${activeFilter === 'all' ? 'active' : ''}`;
  allChip.dataset.type = 'all';
  allChip.textContent = `All (${allItems.length})`;
  allChip.onclick = () => setFilter('all', allChip);
  row.appendChild(allChip);

  for (const type of types) {
    const count = allItems.filter(i => i.sourceType === type).length;
    const chip = document.createElement('button');
    chip.className = `filter-chip ${activeFilter === type ? 'active' : ''}`;
    chip.dataset.type = type;
    chip.textContent = `${SOURCE_ICONS[type] || '📄'} ${type} (${count})`;
    chip.onclick = () => setFilter(type, chip);
    row.appendChild(chip);
  }
}

function setFilter(type, el) {
  activeFilter = type;
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderItems();
}

function renderItems() {
  const list = document.getElementById('itemsList');
  const filtered = activeFilter === 'all'
    ? allItems
    : allItems.filter(i => i.sourceType === activeFilter);

  document.getElementById('itemCount').textContent = `${filtered.length} items`;

  if (!filtered.length) {
    list.innerHTML = '<div class="empty">No content yet<br><small>Click refresh to fetch your sources</small></div>';
    return;
  }

  list.innerHTML = filtered.map(item => renderItem(item)).join('');

  // Wire up click handlers
  list.querySelectorAll('.item').forEach((el, i) => {
    el.addEventListener('click', () => {
      const item = filtered[i];
      api.ui.openExternal(item.url);
    });
  });
}

function renderItem(item) {
  const color = SOURCE_COLORS[item.sourceType] || '#666';
  const icon = SOURCE_ICONS[item.sourceType] || '📄';
  const dateStr = relativeTime(item.publishedAt);
  const thumb = item.thumbnail
    ? `<img class="item-thumb" src="${escHTML(item.thumbnail)}" alt="" onerror="this.style.display='none'">`
    : `<div class="item-icon">${icon}</div>`;

  return `<div class="item">
    ${thumb}
    <div class="item-body">
      <div class="item-title">${escHTML(item.title)}</div>
      <div class="item-meta">
        <span class="item-source" style="background:${color}">${escHTML(item.sourceName)}</span>
        <span class="item-date">${dateStr}</span>
      </div>
    </div>
  </div>`;
}

function relativeTime(dateStr) {
  if (!dateStr) return '';
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch { return ''; }
}

function escHTML(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

init();
