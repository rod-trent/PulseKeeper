'use strict';

const api = window.pcbAPI;

const SOURCE_COLORS = {
  rss: '#f26522', podcast: '#9b59b6', youtube: '#ff0000',
  twitter: '#1da1f2', reddit: '#ff4500',
  newsletter: '#0078d4', blog: '#2ecc71', webpage: '#16a085', 'web-capture': '#8e44ad'
};
const SOURCE_ICONS = {
  rss:'📡', podcast:'🎙️', youtube:'▶️', twitter:'🐦',
  reddit:'🔴', newsletter:'📧', blog:'✍️', webpage:'🌐', 'web-capture':'🧩'
};

let allItems = [];
let readIds = new Set();
let activeFilter = 'all';

async function init() {
  await refresh();
  initFilterScroll();

  // Delegated filter chip clicks
  document.getElementById('filterRow').addEventListener('click', e => {
    const chip = e.target.closest('[data-type]');
    if (chip) setFilter(chip.dataset.type, chip);
  });

  // Header button handlers
  document.getElementById('btnRefreshPopup').addEventListener('click', () => {
    api.sources.collectAll().then(refresh);
  });
  document.getElementById('btnViewAll').addEventListener('click', () => {
    api.output.openDigest(); api.popup.close();
  });
  document.getElementById('btnMarkAllRead').addEventListener('click', markAllRead);
  document.getElementById('btnCopy').addEventListener('click', copyToClipboard);

  api.on.collectStart(() => {
    document.getElementById('statusDot').className = 'status-dot collecting';
    document.getElementById('statusText').textContent = 'Collecting…';
  });
  api.on.collectComplete(() => {
    document.getElementById('statusDot').className = 'status-dot';
    document.getElementById('statusText').textContent = 'Updated';
    refresh();
  });
}

async function refresh() {
  const list = document.getElementById('itemsList');
  list.innerHTML = '<div class="loading"><div class="spinner"></div><span>Loading…</span></div>';
  try {
    [allItems, readIds] = await Promise.all([
      api.popup.getLatest(),
      api.content.getReadIds().then(arr => new Set(arr))
    ]);
    renderFilters();
    renderItems();
  } catch (e) {
    list.innerHTML = `<div class="empty">Failed to load<br><small>${escHTML(e.message)}</small></div>`;
  }
}

function renderFilters() {
  const types = [...new Set(allItems.map(i => i.sourceType).filter(Boolean))];
  const row = document.getElementById('filterRow');
  row.innerHTML = '';

  const allChip = makeChip('all', `All (${allItems.length})`, activeFilter === 'all');
  row.appendChild(allChip);

  for (const type of types) {
    const count = allItems.filter(i => i.sourceType === type).length;
    row.appendChild(makeChip(type, `${SOURCE_ICONS[type] || '📄'} ${type} (${count})`, activeFilter === type));
  }

  // Re-evaluate fade indicators after chips are rendered
  const wrap = document.getElementById('filterRowWrap');
  if (wrap) {
    setTimeout(() => {
      wrap.classList.toggle('scroll-end', row.scrollLeft + row.clientWidth >= row.scrollWidth - 4);
    }, 0);
  }
}

function makeChip(type, label, active) {
  const btn = document.createElement('button');
  btn.className = `filter-chip ${active ? 'active' : ''}`;
  btn.dataset.type = type;
  btn.textContent = label;
  return btn;
}

function setFilter(type, el) {
  activeFilter = type;
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  renderItems();
}

function renderItems() {
  const list = document.getElementById('itemsList');
  const filtered = activeFilter === 'all'
    ? allItems
    : allItems.filter(i => i.sourceType === activeFilter);

  document.getElementById('itemCount').textContent = `${filtered.length} items`;

  if (!filtered.length) {
    list.innerHTML = '<div class="empty">No content yet<br><small>Click 🔄 to fetch your sources</small></div>';
    return;
  }

  list.innerHTML = filtered.map((item, i) => renderItem(item, i)).join('');

  // Wire click to open URL and mark read
  list.querySelectorAll('.item').forEach((el, i) => {
    el.addEventListener('click', () => {
      const item = filtered[i];
      api.ui.openExternal(item.url);
      readIds.add(item.id);
      el.classList.add('read');
      api.content.markRead([item.id]);
    });
  });
}

function renderItem(item, i) {
  const color = SOURCE_COLORS[item.sourceType] || '#666';
  const icon = SOURCE_ICONS[item.sourceType] || '📄';
  const dateStr = relativeTime(item.publishedAt);
  const isRead = readIds.has(item.id);
  const thumb = item.thumbnail
    ? `<img class="item-thumb" src="${escHTML(item.thumbnail)}" alt="" onerror="this.style.display='none'">`
    : `<div class="item-icon">${icon}</div>`;

  return `<div class="item${isRead ? ' read' : ''}" data-index="${i}">
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

async function markAllRead() {
  await api.content.markAllRead();
  const items = activeFilter === 'all' ? allItems : allItems.filter(i => i.sourceType === activeFilter);
  items.forEach(i => readIds.add(i.id));
  document.querySelectorAll('.item').forEach(el => el.classList.add('read'));
}

async function copyToClipboard() {
  const filtered = activeFilter === 'all'
    ? allItems
    : allItems.filter(i => i.sourceType === activeFilter);

  if (!filtered.length) return;

  const md = `# PulseKeeper — ${new Date().toLocaleDateString()}\n\n` +
    filtered.map(i =>
      `## [${i.title}](${i.url})\n_${i.sourceName} · ${relativeTime(i.publishedAt)}_\n\n${i.description || ''}`
    ).join('\n\n---\n\n');

  try {
    await navigator.clipboard.writeText(md);
    const toast = document.getElementById('copyToast');
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
  } catch {}
}

function relativeTime(dateStr) {
  if (!dateStr) return '';
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    if (diff < 3600000)  return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch { return ''; }
}

function escHTML(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Filter row horizontal scrolling ──────────────────────────────────────────
function initFilterScroll() {
  const row  = document.getElementById('filterRow');
  const wrap = document.getElementById('filterRowWrap');
  if (!row || !wrap) return;

  function updateFade() {
    wrap.classList.toggle('scroll-start', row.scrollLeft > 4);
    wrap.classList.toggle('scroll-end',   row.scrollLeft + row.clientWidth >= row.scrollWidth - 4);
  }

  // Translate vertical wheel to horizontal scroll
  row.addEventListener('wheel', e => {
    if (e.deltaY === 0) return;
    e.preventDefault();
    row.scrollBy({ left: e.deltaY * 1.5, behavior: 'smooth' });
  }, { passive: false });

  row.addEventListener('scroll', updateFade, { passive: true });

  // Run once after chips are rendered so the fade-right appears if needed
  setTimeout(updateFade, 50);
}

init();
