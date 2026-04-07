'use strict';

// YouTube via public RSS feeds — accepts any YouTube URL format
// Supports: @handles, /channel/UC..., /c/name, /user/name, playlist URLs
// No API key required for basic usage.

const https = require('https');
const http = require('http');
const zlib = require('zlib');
const Parser = require('rss-parser');

const parser = new Parser({
  timeout: 15000,
  headers: { 'User-Agent': 'PersonalContentBuilder/1.0' },
  customFields: {
    item: [
      ['media:group', 'mediaGroup'],
      ['media:thumbnail', 'mediaThumbnail'],
      ['yt:videoId', 'videoId'],
      ['yt:channelId', 'channelId']
    ]
  }
});

const YT_VIDEO_URL = (id) => `https://www.youtube.com/watch?v=${id}`;
const YT_THUMBNAIL = (id) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;

/**
 * Fetch YouTube channel or playlist videos.
 * Accepts config.url as any of:
 *   https://www.youtube.com/@jolly
 *   https://www.youtube.com/channel/UCxxxxxx
 *   https://www.youtube.com/c/SomeName
 *   https://www.youtube.com/feeds/videos.xml?channel_id=UC...  (RSS directly)
 *   https://www.youtube.com/playlist?list=PL...
 */
async function fetchYouTube(source) {
  const { config, maxItems = 20, name } = source;

  // Support legacy channelId / playlistId fields
  if (!config?.url && config?.channelId) {
    config.url = `https://www.youtube.com/channel/${config.channelId}`;
  }
  if (!config?.url && config?.playlistId) {
    config.url = `https://www.youtube.com/playlist?list=${config.playlistId}`;
  }

  if (!config?.url) {
    throw new Error('YouTube source requires a channel URL (e.g. https://www.youtube.com/@channelname)');
  }

  const feedUrl = await resolveToFeedURL(config.url);
  const feed = await parser.parseURL(feedUrl);

  return (feed.items || []).slice(0, maxItems).map(item => {
    const videoId = item.videoId || extractVideoId(item.link || '');
    return {
      id: `youtube:${source.id}:${videoId || item.guid}`,
      sourceId: source.id,
      sourceName: name || feed.title || 'YouTube',
      sourceType: 'youtube',
      title: item.title || '(no title)',
      description: extractDescription(item).slice(0, 400),
      url: videoId ? YT_VIDEO_URL(videoId) : (item.link || ''),
      thumbnail: videoId ? YT_THUMBNAIL(videoId) : extractThumb(item),
      author: feed.title || item.author || '',
      publishedAt: item.pubDate || item.isoDate || new Date().toISOString(),
      videoId,
      fetchedAt: new Date().toISOString()
    };
  });
}

/**
 * Convert any YouTube URL format to an RSS feed URL.
 * Fetches the channel page to extract the canonical RSS link if needed.
 */
async function resolveToFeedURL(url) {
  const trimmed = url.trim();

  // Already a YouTube RSS feed URL
  if (trimmed.includes('feeds/videos.xml')) return trimmed;

  // Playlist URL
  const playlistMatch = trimmed.match(/[?&]list=([\w-]+)/);
  if (playlistMatch && !trimmed.includes('/channel/') && !trimmed.includes('/@')) {
    return `https://www.youtube.com/feeds/videos.xml?playlist_id=${playlistMatch[1]}`;
  }

  // /channel/UC... URL — extract ID directly
  const channelIdMatch = trimmed.match(/\/channel\/(UC[\w-]+)/);
  if (channelIdMatch) {
    return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelIdMatch[1]}`;
  }

  // @handle — try legacy ?user= RSS URL first (fast, no page fetch needed)
  const handleMatch = trimmed.match(/\/@([\w-]+)/);
  if (handleMatch) {
    const handle = handleMatch[1];
    const legacyUrl = `https://www.youtube.com/feeds/videos.xml?user=${handle}`;
    try {
      await parser.parseURL(legacyUrl);
      return legacyUrl;
    } catch { /* not a legacy username — fall through to page scraping */ }
  }

  // /c/name or /user/name — try ?user= with the path segment
  const userMatch = trimmed.match(/\/(?:c|user)\/([\w-]+)/);
  if (userMatch) {
    const legacyUrl = `https://www.youtube.com/feeds/videos.xml?user=${userMatch[1]}`;
    try {
      await parser.parseURL(legacyUrl);
      return legacyUrl;
    } catch { /* fall through */ }
  }

  // Fetch the channel page and extract channel ID from the embedded JSON / link tags
  const pageUrl = trimmed.startsWith('http') ? trimmed : `https://www.youtube.com/${trimmed}`;
  const html = await fetchPageHTML(pageUrl);

  const patterns = [
    // <link rel="alternate"> tag
    { re: /type="application\/rss\+xml"[^>]+href="([^"]+feeds\/videos\.xml[^"]+)"/, full: true },
    { re: /href="([^"]+feeds\/videos\.xml[^"]+)"[^>]+type="application\/rss\+xml"/, full: true },
    // ytInitialData / ytcfg embedded JSON — channel ID fields
    { re: /"channelId"\s*:\s*"(UC[\w-]+)"/, full: false },
    { re: /"externalChannelId"\s*:\s*"(UC[\w-]+)"/, full: false },
    { re: /"browseId"\s*:\s*"(UC[\w-]+)"/, full: false },
    // Escaped feeds URL inside JSON strings
    { re: /feeds\\\/videos\.xml\?channel_id=(UC[\w-]+)/, full: false },
    { re: /"(https:\/\/www\.youtube\.com\/feeds\/videos\.xml\?channel_id=[^"\\]+)"/, full: true },
    // itemprop / meta tags
    { re: /itemprop="channelId"[^>]+content="(UC[\w-]+)"/, full: false },
    { re: /<meta[^>]+name="channelId"[^>]+content="(UC[\w-]+)"/, full: false },
  ];

  for (const { re, full } of patterns) {
    const m = html.match(re);
    if (m) {
      if (full) return m[1].replace(/\\u0026/g, '&');
      return `https://www.youtube.com/feeds/videos.xml?channel_id=${m[1]}`;
    }
  }

  throw new Error(
    `Could not find YouTube RSS feed for: ${url}\n` +
    `Try using the channel URL directly, e.g. https://www.youtube.com/channel/UC...\n` +
    `Or find your channel ID via YouTube Studio → Settings → Channel → Basic Info`
  );
}

function fetchPageHTML(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        // Bypass YouTube consent gate (EU / cookie consent screens)
        'Cookie': 'CONSENT=YES+cb; YSC=irrelevant; VISITOR_INFO1_LIVE=irrelevant'
      }
    }, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const loc = res.headers.location.startsWith('http')
          ? res.headers.location
          : `https://www.youtube.com${res.headers.location}`;
        res.resume();
        fetchPageHTML(loc).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} fetching YouTube page: ${url}`));
        return;
      }

      // Decompress if the server sent gzip/deflate/br
      const enc = res.headers['content-encoding'];
      let stream = res;
      if (enc === 'gzip')    stream = res.pipe(zlib.createGunzip());
      else if (enc === 'deflate') stream = res.pipe(zlib.createInflate());
      else if (enc === 'br') stream = res.pipe(zlib.createBrotliDecompress());

      let html = '';
      let settled = false;
      const done = v => { if (!settled) { settled = true; resolve(v); } };
      const fail = e => { if (!settled) { settled = true; reject(e); } };

      stream.setEncoding('utf8');
      stream.on('data', chunk => {
        html += chunk;
        if (html.length > 600000) { req.destroy(); done(html); }
      });
      stream.on('end', () => done(html));
      stream.on('error', () => { if (html.length > 1000) done(html); else fail(new Error('Decompress error')); });
    });
    req.on('error', e => { reject(e); });
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('Timeout fetching YouTube page')); });
  });
}

function extractVideoId(url) {
  const m = url.match(/[?&]v=([^&]+)/) || url.match(/youtu\.be\/([^?]+)/);
  return m?.[1] || null;
}

function extractDescription(item) {
  if (item.mediaGroup) {
    const g = Array.isArray(item.mediaGroup) ? item.mediaGroup[0] : item.mediaGroup;
    const desc = g?.['media:description']?.[0];
    if (desc) return typeof desc === 'string' ? desc : (desc._ || '');
  }
  return item.contentSnippet || item.summary || '';
}

function extractThumb(item) {
  if (item.mediaThumbnail?.$.url) return item.mediaThumbnail.$.url;
  if (item.mediaGroup) {
    const g = Array.isArray(item.mediaGroup) ? item.mediaGroup[0] : item.mediaGroup;
    const thumbs = g?.['media:thumbnail'];
    if (thumbs?.length) return thumbs[thumbs.length - 1]?.$.url || null;
  }
  return null;
}

module.exports = { fetchYouTube, resolveToFeedURL };
