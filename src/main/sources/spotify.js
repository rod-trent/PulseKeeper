'use strict';

// Spotify Web API — requires Client ID + Client Secret from developer.spotify.com
const https = require('https');
const querystring = require('querystring');

function post(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(body);
    req.end();
  });
}

function get(path, accessToken) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.spotify.com',
      path,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

async function getAccessToken(clientId, clientSecret) {
  const body = querystring.stringify({ grant_type: 'client_credentials' });
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const result = await post({
    hostname: 'accounts.spotify.com',
    path: '/api/token',
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body)
    }
  }, body);
  if (!result.access_token) throw new Error('Failed to get Spotify access token — check Client ID/Secret');
  return result.access_token;
}

/**
 * Fetch from Spotify: playlist tracks, podcast episodes, or new releases
 */
async function fetchSpotify(source) {
  const { config, maxItems = 20, name } = source;

  if (!config?.clientId || !config?.clientSecret) {
    throw new Error('Spotify source requires Client ID and Client Secret from developer.spotify.com');
  }

  const token = await getAccessToken(config.clientId, config.clientSecret);
  const items = [];

  if (config.playlistId) {
    const data = await get(`/v1/playlists/${config.playlistId}/tracks?limit=${Math.min(maxItems, 50)}&fields=items(track(id,name,artists,album,external_urls,duration_ms,preview_url))`, token);
    for (const entry of (data.items || []).slice(0, maxItems)) {
      const track = entry.track;
      if (!track) continue;
      items.push({
        id: `spotify:${source.id}:${track.id}`,
        sourceId: source.id,
        sourceName: name || 'Spotify Playlist',
        sourceType: 'spotify',
        title: track.name,
        description: `By ${(track.artists || []).map(a => a.name).join(', ')} — ${track.album?.name || ''}`,
        url: track.external_urls?.spotify || `https://open.spotify.com/track/${track.id}`,
        thumbnail: track.album?.images?.[1]?.url || track.album?.images?.[0]?.url || null,
        author: (track.artists || []).map(a => a.name).join(', '),
        publishedAt: new Date().toISOString(),
        duration: track.duration_ms ? Math.round(track.duration_ms / 1000) : null,
        previewUrl: track.preview_url || null,
        fetchedAt: new Date().toISOString()
      });
    }
  } else if (config.showId) {
    // Podcast episodes
    const data = await get(`/v1/shows/${config.showId}/episodes?limit=${Math.min(maxItems, 50)}`, token);
    for (const ep of (data.items || []).slice(0, maxItems)) {
      items.push({
        id: `spotify:${source.id}:${ep.id}`,
        sourceId: source.id,
        sourceName: name || 'Spotify Podcast',
        sourceType: 'spotify',
        title: ep.name,
        description: (ep.description || '').slice(0, 300),
        url: ep.external_urls?.spotify || `https://open.spotify.com/episode/${ep.id}`,
        thumbnail: ep.images?.[1]?.url || ep.images?.[0]?.url || null,
        author: '',
        publishedAt: ep.release_date ? new Date(ep.release_date).toISOString() : new Date().toISOString(),
        duration: ep.duration_ms ? Math.round(ep.duration_ms / 1000) : null,
        fetchedAt: new Date().toISOString()
      });
    }
  } else if (config.artistId) {
    const data = await get(`/v1/artists/${config.artistId}/top-tracks?market=US`, token);
    for (const track of (data.tracks || []).slice(0, maxItems)) {
      items.push({
        id: `spotify:${source.id}:${track.id}`,
        sourceId: source.id,
        sourceName: name || 'Spotify Artist',
        sourceType: 'spotify',
        title: track.name,
        description: `By ${(track.artists || []).map(a => a.name).join(', ')} — ${track.album?.name || ''}`,
        url: track.external_urls?.spotify || `https://open.spotify.com/track/${track.id}`,
        thumbnail: track.album?.images?.[1]?.url || null,
        author: (track.artists || []).map(a => a.name).join(', '),
        publishedAt: new Date().toISOString(),
        fetchedAt: new Date().toISOString()
      });
    }
  } else {
    throw new Error('Spotify source needs playlistId, showId, or artistId');
  }

  return items;
}

module.exports = { fetchSpotify };
