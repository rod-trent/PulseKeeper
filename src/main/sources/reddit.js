'use strict';

// Reddit via public JSON API (no API key required)
const https = require('https');

const REDDIT_JSON = (subreddit, sort, limit) =>
  `https://www.reddit.com/r/${subreddit}/${sort}.json?limit=${limit}&raw_json=1`;

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      }
    }, res => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`Reddit returned HTTP ${res.statusCode} for ${url}`));
        return;
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error('Reddit JSON parse error')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Reddit request timed out')); });
  });
}

/**
 * Fetch Reddit subreddit posts via JSON API
 */
async function fetchReddit(source) {
  const { config, maxItems = 20, name } = source;

  if (!config?.subreddit) throw new Error('Reddit source missing subreddit name');

  const sort = config.sort || 'hot'; // hot | new | top | rising
  const url = REDDIT_JSON(config.subreddit, sort, Math.min(maxItems, 100));

  const data = await fetchJSON(url);
  const posts = (data?.data?.children || []).filter(c => c.kind === 't3');

  return posts.slice(0, maxItems).map(({ data: post }) => ({
    id: `reddit:${source.id}:${post.id}`,
    sourceId: source.id,
    sourceName: name || `r/${config.subreddit}`,
    sourceType: 'reddit',
    title: post.title || '(no title)',
    description: (post.selftext || '').slice(0, 300),
    url: `https://old.reddit.com${post.permalink}`,
    thumbnail: post.thumbnail?.startsWith('http') ? post.thumbnail : null,
    author: post.author || '',
    publishedAt: new Date((post.created_utc || 0) * 1000).toISOString(),
    fetchedAt: new Date().toISOString()
  }));
}

module.exports = { fetchReddit };
