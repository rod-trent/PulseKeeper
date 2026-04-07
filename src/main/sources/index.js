'use strict';

const { fetchRSS } = require('./rss');
const { fetchYouTube } = require('./youtube');
const { fetchTwitter } = require('./twitter');
const { fetchSpotify } = require('./spotify');
const { fetchReddit } = require('./reddit');
const { fetchWebpage } = require('./webpage');

const SOURCE_TYPES = [
  {
    id: 'rss',
    label: 'RSS / Atom Feed',
    icon: 'rss',
    description: 'Any RSS or Atom feed URL',
    fields: [
      { key: 'url', label: 'Feed URL', type: 'url', placeholder: 'https://example.com/feed.xml', required: true }
    ]
  },
  {
    id: 'podcast',
    label: 'Podcast',
    icon: 'mic',
    description: 'Podcast RSS feed URL',
    fields: [
      { key: 'url', label: 'Podcast RSS URL', type: 'url', placeholder: 'https://feeds.example.com/podcast', required: true }
    ]
  },
  {
    id: 'youtube',
    label: 'YouTube Channel / Playlist',
    icon: 'youtube',
    description: 'Paste any YouTube channel URL or handle — no API key needed',
    fields: [
      {
        key: 'url',
        label: 'Channel URL or Handle',
        type: 'url',
        placeholder: 'https://www.youtube.com/@channelname  —or—  https://www.youtube.com/channel/UCxxxxxx',
        required: true,
        hint: 'Accepts @handles, /channel/UC... IDs, /c/name, or playlist URLs'
      }
    ]
  },
  {
    id: 'twitter',
    label: 'X / Twitter',
    icon: 'twitter',
    description: 'User timeline, list, or search query via API v2',
    fields: [
      { key: 'bearerToken', label: 'Bearer Token', type: 'password', placeholder: 'Get one at developer.twitter.com', required: true },
      { key: 'username', label: 'Username', type: 'text', placeholder: '@jolly (without @)', required: false },
      { key: 'searchQuery', label: 'Search Query', type: 'text', placeholder: '#topic OR from:user', required: false },
      { key: 'listId', label: 'List ID', type: 'text', placeholder: '123456789', required: false }
    ]
  },
  {
    id: 'spotify',
    label: 'Spotify',
    icon: 'spotify',
    description: 'Playlist, podcast show, or artist top tracks',
    fields: [
      { key: 'clientId', label: 'Client ID', type: 'text', placeholder: 'From developer.spotify.com', required: true },
      { key: 'clientSecret', label: 'Client Secret', type: 'password', placeholder: 'From developer.spotify.com', required: true },
      { key: 'playlistId', label: 'Playlist URL or ID', type: 'text', placeholder: 'https://open.spotify.com/playlist/... or bare ID', required: false },
      { key: 'showId', label: 'Podcast Show URL or ID', type: 'text', placeholder: 'https://open.spotify.com/show/... or bare ID', required: false },
      { key: 'artistId', label: 'Artist URL or ID', type: 'text', placeholder: 'https://open.spotify.com/artist/... or bare ID', required: false }
    ]
  },
  {
    id: 'reddit',
    label: 'Reddit',
    icon: 'reddit',
    description: 'Subreddit posts — no API key required',
    fields: [
      { key: 'subreddit', label: 'Subreddit Name', type: 'text', placeholder: 'technology', required: true },
      { key: 'sort', label: 'Sort By', type: 'select', options: ['hot', 'new', 'top', 'rising'], default: 'hot', required: false }
    ]
  },
  {
    id: 'newsletter',
    label: 'Newsletter (via RSS)',
    icon: 'mail',
    description: 'Substack, Beehiiv, Ghost, or any newsletter with an RSS feed',
    fields: [
      { key: 'url', label: 'Newsletter RSS URL', type: 'url', placeholder: 'https://yourname.substack.com/feed', required: true }
    ]
  },
  {
    id: 'blog',
    label: 'Blog / Website',
    icon: 'blog',
    description: 'Blog RSS feed or website',
    fields: [
      { key: 'url', label: 'Blog RSS or Feed URL', type: 'url', placeholder: 'https://blog.example.com/rss', required: true }
    ]
  },
  {
    id: 'webpage',
    label: 'Web Page (Scrape)',
    icon: 'globe',
    description: 'Monitor any web page or extract structured content with CSS selectors',
    fields: [
      { key: 'url', label: 'Page URL', type: 'url', placeholder: 'https://example.com/news', required: true },
      { key: 'selector', label: 'Items CSS Selector', type: 'text', placeholder: 'article  —or—  .post-item  —or—  .news-entry', required: false,
        hint: 'Leave blank to capture the whole page as one item' },
      { key: 'titleSelector', label: 'Title Selector (within item)', type: 'text', placeholder: 'h2  —or—  .title', required: false },
      { key: 'linkSelector', label: 'Link Selector (within item)', type: 'text', placeholder: 'a.read-more  —or—  h2 a', required: false },
      { key: 'contentSelector', label: 'Content Selector (within item)', type: 'text', placeholder: 'p  —or—  .summary', required: false },
      { key: 'monitorChanges', label: 'Only alert when content changes', type: 'checkbox', required: false }
    ]
  },
  {
    id: 'web-capture',
    label: 'Browser Captures',
    icon: 'capture',
    description: 'Items sent from the PulseKeeper browser extension',
    fields: []  // Managed automatically by the extension
  }
];

/**
 * Fetch items from a single source based on its type
 */
async function fetchSource(source) {
  switch (source.type) {
    case 'rss':
    case 'podcast':
    case 'newsletter':
    case 'blog':
      return fetchRSS(source);
    case 'youtube':
      return fetchYouTube(source);
    case 'twitter':
      return fetchTwitter(source);
    case 'spotify':
      return fetchSpotify(source);
    case 'reddit':
      return fetchReddit(source);
    case 'webpage':
      return fetchWebpage(source);
    case 'web-capture':
      return []; // Items are inserted directly by the capture server
    default:
      throw new Error(`Unknown source type: ${source.type}`);
  }
}

module.exports = { SOURCE_TYPES, fetchSource };
