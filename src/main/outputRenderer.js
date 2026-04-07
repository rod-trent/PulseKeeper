'use strict';

const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

// Source type icons (inline SVG paths for use in HTML)
const SOURCE_ICONS = {
  rss: '📡',
  podcast: '🎙️',
  youtube: '▶️',
  reddit: '🔴',
  newsletter: '📧',
  blog: '✍️',
  webpage: '🌐',
  'web-capture': '🧩'
};

const SOURCE_COLORS = {
  rss: '#f26522',
  podcast: '#9b59b6',
  youtube: '#ff0000',
  reddit: '#ff4500',
  newsletter: '#0078d4',
  blog: '#2ecc71',
  webpage: '#16a085',
  'web-capture': '#8e44ad'
};

/**
 * Generate a full HTML digest page
 */
function renderHTML(items, options = {}) {
  const { title = 'Personal Content Digest', aiDigest = null, generatedAt = new Date() } = options;
  const dateStr = generatedAt.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = generatedAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  // Group items by source type for the sidebar
  const byType = {};
  for (const item of items) {
    const t = item.sourceType || 'rss';
    if (!byType[t]) byType[t] = [];
    byType[t].push(item);
  }

  const sidebarHTML = Object.entries(byType).map(([type, typeItems]) => `
    <div class="sidebar-group">
      <div class="sidebar-label">${SOURCE_ICONS[type] || '📄'} ${type.toUpperCase()} <span class="badge">${typeItems.length}</span></div>
    </div>`).join('');

  const itemsHTML = items.map(item => renderItemHTML(item)).join('\n');

  const aiSection = aiDigest ? `
    <section class="ai-digest">
      <h2>🤖 AI Digest</h2>
      <div class="ai-content">${marked.parse(aiDigest)}</div>
    </section>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHTML(title)}</title>
  <style>
    :root {
      --bg: #1a1a2e;
      --surface: #16213e;
      --surface2: #0f3460;
      --accent: #0078d4;
      --accent2: #60cdff;
      --text: #f3f3f3;
      --text2: #ababab;
      --border: rgba(255,255,255,0.08);
      --card-bg: rgba(255,255,255,0.04);
      --shadow: 0 4px 20px rgba(0,0,0,0.4);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      min-height: 100vh;
    }
    .header {
      background: linear-gradient(135deg, #0a0a1a 0%, #0f3460 100%);
      border-bottom: 1px solid var(--border);
      padding: 24px 32px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: sticky;
      top: 0;
      z-index: 100;
      backdrop-filter: blur(20px);
    }
    .header-title { font-size: 22px; font-weight: 600; color: var(--accent2); }
    .header-meta { color: var(--text2); font-size: 13px; }
    .header-stats { display: flex; gap: 16px; }
    .stat { background: var(--card-bg); padding: 6px 14px; border-radius: 20px; font-size: 12px; border: 1px solid var(--border); }
    .layout { display: grid; grid-template-columns: 220px 1fr; min-height: calc(100vh - 80px); }
    .sidebar {
      background: var(--surface);
      border-right: 1px solid var(--border);
      padding: 20px 0;
      position: sticky;
      top: 80px;
      height: calc(100vh - 80px);
      overflow-y: auto;
    }
    .sidebar-title { padding: 0 16px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: var(--text2); }
    .sidebar-group { padding: 8px 16px; }
    .sidebar-label { font-size: 13px; color: var(--text2); display: flex; align-items: center; justify-content: space-between; }
    .badge { background: var(--accent); color: white; border-radius: 10px; padding: 1px 7px; font-size: 10px; }
    .main { padding: 24px 32px; max-width: 960px; }
    .ai-digest {
      background: linear-gradient(135deg, rgba(0,120,212,0.15), rgba(96,205,255,0.08));
      border: 1px solid rgba(0,120,212,0.3);
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 32px;
    }
    .ai-digest h2 { font-size: 16px; margin-bottom: 16px; color: var(--accent2); }
    .ai-content { font-size: 14px; line-height: 1.7; color: var(--text); }
    .ai-content h1,.ai-content h2,.ai-content h3 { color: var(--accent2); margin: 16px 0 8px; }
    .ai-content ul { padding-left: 20px; }
    .ai-content a { color: var(--accent2); }
    .section-header {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: var(--text2);
      border-bottom: 1px solid var(--border);
      padding-bottom: 8px;
      margin: 28px 0 16px;
    }
    .items-grid { display: flex; flex-direction: column; gap: 12px; }
    .item-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 16px;
      display: flex;
      gap: 14px;
      transition: all 0.2s;
      text-decoration: none;
    }
    .item-card:hover {
      background: rgba(255,255,255,0.07);
      border-color: rgba(0,120,212,0.4);
      transform: translateY(-1px);
      box-shadow: var(--shadow);
    }
    .item-thumb {
      width: 80px;
      height: 56px;
      border-radius: 6px;
      object-fit: cover;
      flex-shrink: 0;
      background: var(--surface2);
    }
    .item-thumb-placeholder {
      width: 80px;
      height: 56px;
      border-radius: 6px;
      flex-shrink: 0;
      background: var(--surface2);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
    }
    .item-body { flex: 1; min-width: 0; }
    .item-title {
      font-size: 14px;
      font-weight: 500;
      color: var(--text);
      margin-bottom: 5px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .item-desc {
      font-size: 12px;
      color: var(--text2);
      margin-bottom: 8px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .item-meta { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .source-badge {
      font-size: 10px;
      padding: 2px 8px;
      border-radius: 10px;
      font-weight: 500;
      color: white;
    }
    .item-date { font-size: 11px; color: var(--text2); }
    .item-author { font-size: 11px; color: var(--text2); }
    .filter-bar {
      display: flex;
      gap: 8px;
      margin-bottom: 20px;
      flex-wrap: wrap;
    }
    .filter-btn {
      padding: 5px 14px;
      border-radius: 20px;
      border: 1px solid var(--border);
      background: var(--card-bg);
      color: var(--text2);
      cursor: pointer;
      font-size: 12px;
      transition: all 0.15s;
    }
    .filter-btn.active, .filter-btn:hover {
      background: var(--accent);
      color: white;
      border-color: var(--accent);
    }
    .footer {
      border-top: 1px solid var(--border);
      padding: 16px 32px;
      font-size: 11px;
      color: var(--text2);
      text-align: center;
    }
    @media (max-width: 768px) {
      .layout { grid-template-columns: 1fr; }
      .sidebar { display: none; }
      .main { padding: 16px; }
    }
  </style>
</head>
<body>
  <header class="header">
    <div>
      <div class="header-title">📰 ${escapeHTML(title)}</div>
      <div class="header-meta">${dateStr} at ${timeStr}</div>
    </div>
    <div class="header-stats">
      ${Object.entries(byType).map(([type, typeItems]) =>
        `<div class="stat">${SOURCE_ICONS[type] || '📄'} ${typeItems.length} ${type}</div>`
      ).join('')}
    </div>
  </header>
  <div class="layout">
    <nav class="sidebar">
      <div class="sidebar-title">Sources</div>
      ${sidebarHTML}
    </nav>
    <main class="main">
      ${aiSection}
      <div class="filter-bar" id="filterBar">
        <button class="filter-btn active" data-filter="all">All (${items.length})</button>
        ${Object.entries(byType).map(([type, typeItems]) =>
          `<button class="filter-btn" data-filter="${escapeHTML(type)}">${SOURCE_ICONS[type] || '📄'} ${type} (${typeItems.length})</button>`
        ).join('')}
      </div>
      <div class="items-grid" id="itemsGrid">
        ${itemsHTML}
      </div>
    </main>
  </div>
  <footer class="footer">
    Generated by PulseKeeper · ${items.length} items from ${Object.keys(byType).length} source types
  </footer>
  <script>
    document.getElementById('filterBar').addEventListener('click', function(e) {
      const btn = e.target.closest('[data-filter]');
      if (!btn) return;
      const type = btn.dataset.filter;
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.item-card').forEach(card => {
        card.style.display = (type === 'all' || card.dataset.type === type) ? 'flex' : 'none';
      });
    });
    // Open links in default browser (when viewed in Electron)
    document.querySelectorAll('a.item-card').forEach(a => {
      a.addEventListener('click', e => {
        if (window.pcbAPI) { e.preventDefault(); window.pcbAPI.ui.openExternal(a.href); }
      });
    });
  </script>
</body>
</html>`;
}

function renderItemHTML(item) {
  const color = SOURCE_COLORS[item.sourceType] || '#666';
  const icon = SOURCE_ICONS[item.sourceType] || '📄';
  const dateStr = formatDate(item.publishedAt);
  const thumb = item.thumbnail
    ? `<img class="item-thumb" src="${escapeHTML(item.thumbnail)}" alt="" loading="lazy" onerror="this.style.display='none'">`
    : `<div class="item-thumb-placeholder">${icon}</div>`;

  return `<a class="item-card" href="${escapeHTML(item.url)}" target="_blank" rel="noopener" data-type="${escapeHTML(item.sourceType || 'rss')}">
    ${thumb}
    <div class="item-body">
      <div class="item-title">${escapeHTML(item.title)}</div>
      <div class="item-desc">${escapeHTML(item.description || '')}</div>
      <div class="item-meta">
        <span class="source-badge" style="background:${color}">${icon} ${escapeHTML(item.sourceName)}</span>
        ${item.author ? `<span class="item-author">${escapeHTML(item.author)}</span>` : ''}
        <span class="item-date">${dateStr}</span>
      </div>
    </div>
  </a>`;
}

/**
 * Generate Markdown digest
 */
function renderMarkdown(items, options = {}) {
  const { title = 'Personal Content Digest', aiDigest = null, generatedAt = new Date() } = options;
  const dateStr = generatedAt.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const byType = {};
  for (const item of items) {
    const t = item.sourceType || 'rss';
    if (!byType[t]) byType[t] = [];
    byType[t].push(item);
  }

  let md = `# ${title}\n\n`;
  md += `_Generated: ${dateStr} · ${items.length} items_\n\n`;
  md += `---\n\n`;

  if (aiDigest) {
    md += `## 🤖 AI Digest\n\n${aiDigest}\n\n---\n\n`;
  }

  for (const [type, typeItems] of Object.entries(byType)) {
    md += `## ${SOURCE_ICONS[type] || '📄'} ${type.charAt(0).toUpperCase() + type.slice(1)}\n\n`;
    for (const item of typeItems) {
      md += `### [${item.title}](${item.url})\n`;
      md += `**Source:** ${item.sourceName}`;
      if (item.author) md += ` · **By:** ${item.author}`;
      md += ` · **Date:** ${formatDate(item.publishedAt)}\n\n`;
      if (item.description) md += `${item.description}\n\n`;
      md += `---\n\n`;
    }
  }

  return md;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now - d;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = { renderHTML, renderMarkdown, SOURCE_ICONS, SOURCE_COLORS };
