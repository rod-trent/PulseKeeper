# PulseKeeper

**Keep your pulse on the content that matters.**

PulseKeeper is a Windows 11 system tray app built with Electron and Node.js. It aggregates content from your chosen sources — RSS feeds, YouTube channels, X/Twitter, Spotify, Reddit, podcasts, newsletters, blogs, and web pages — and delivers it as a clean digest in HTML, Markdown, or PDF. It also integrates directly with [AgentPlatform](https://github.com/rod-trent/AgentPlatform) for AI-powered summarization.

---

## Features

- **System tray app** — lives quietly in the Windows 11 tray; left-click opens the content popup, right-click shows the menu
- **Multiple source types** — RSS, YouTube (handles, channel URLs), X/Twitter, Spotify, Reddit, podcasts, newsletters, blogs, and web pages
- **CSS selector scraping** — target specific sections of any web page, with optional change monitoring
- **Browser extension** — Chrome/Edge Manifest V3 extension to send pages, selections, and links directly to PulseKeeper
- **AI digest generation** — connects to Anthropic, OpenAI, xAI (Grok), Ollama, or any OpenAI-compatible endpoint
- **AgentPlatform export** — export a ready-to-import agent pack JSON for use with [AgentPlatform](https://github.com/rod-trent/AgentPlatform)
- **Output formats** — generate digests as styled HTML, Markdown, or PDF
- **Fluent Design UI** — dark navy/cyan Windows 11 aesthetic throughout
- **Auto-refresh** — configurable cron schedule keeps sources up to date in the background

---

## Screenshot

> *System tray popup and settings window coming soon*

---

## Requirements

- Windows 10 / 11
- [Node.js](https://nodejs.org/) 18 or later
- npm 9 or later

---

## Getting Started

```bash
# Clone the repo
git clone https://github.com/rod-trent/PulseKeeper.git
cd PulseKeeper

# Install dependencies
npm install

# Generate browser extension icons (run once)
node extension/generate-icons.js

# Launch the app
npm start
```

The app will appear in your system tray. Left-click the icon to open the content popup; right-click for the menu.

---

## Building a Distributable

```bash
npm run build
```

This produces a Windows NSIS installer in the `dist/` folder via [electron-builder](https://www.electron.build/).

---

## Source Types

| Type | What you provide |
|---|---|
| **RSS** | Feed URL |
| **Podcast** | Feed URL |
| **YouTube** | Any channel URL — `@handle`, `/channel/UC…`, `/c/name` |
| **X / Twitter** | Username + Bearer token (Twitter API v2) |
| **Spotify** | Show/playlist URL + Client ID & Secret |
| **Reddit** | Subreddit name + sort (hot / new / top / rising) |
| **Newsletter** | Feed URL |
| **Blog** | Feed URL |
| **Web Page** | URL + optional CSS selectors for title, link, and content |
| **Web Capture** | Managed by the browser extension — no manual config needed |

---

## Browser Extension

The `extension/` folder contains a Manifest V3 extension for Chrome and Edge.

### Install

1. Run the icon generator if you haven't already:
   ```bash
   node extension/generate-icons.js
   ```
2. Open **chrome://extensions** or **edge://extensions**
3. Enable **Developer mode**
4. Click **Load unpacked** and select the `extension/` folder

### Usage

- Right-click any page → **Send page to PulseKeeper**
- Right-click a selection → **Send selection to PulseKeeper**
- Right-click a link → **Send link to PulseKeeper**
- Click the PulseKeeper toolbar icon to open the extension popup

The extension communicates with the desktop app via a local HTTP server on port **7828**. PulseKeeper must be running for captures to work.

---

## AgentPlatform Integration

PulseKeeper can export an agent pack that runs inside [AgentPlatform](https://github.com/rod-trent/AgentPlatform).

### Export

In the **Export** tab, click **Export Agent Pack**. This produces a JSON file with two chained agents:

1. **Content Collector** — runs `scripts/pk-bridge.js` to read the latest cached content from all enabled sources and output it as Markdown
2. **AI Digest** — feeds that Markdown into your configured LLM and produces a summarized digest

Import the JSON into AgentPlatform and it will run on the same refresh schedule configured in PulseKeeper.

### pk-bridge.js (standalone)

`scripts/pk-bridge.js` can also be used directly from the command line:

```bash
node scripts/pk-bridge.js --format markdown --max 40
```

| Flag | Values | Default |
|---|---|---|
| `--format` | `text`, `markdown`, `json` | `text` |
| `--max` | number | `30` |

---

## AI / LLM Configuration

Open the **AI / LLM** tab in settings. Supported providers:

| Provider | Notes |
|---|---|
| **Anthropic** | Claude models — requires API key |
| **OpenAI** | GPT models — requires API key |
| **xAI** | Grok models — requires API key |
| **Ollama** | Local models, no API key — set base URL to `http://localhost:11434/v1` |
| **Custom** | Any OpenAI-compatible endpoint |

---

## Data Storage

All data is stored locally in:

```
%USERPROFILE%\Documents\PulseKeeper\
├── sources.json          # Source definitions
├── settings.json         # App settings
└── content\
    └── <sourceId>.json   # Cached items per source
```

Output files (when generated) are saved to:

```
%USERPROFILE%\Documents\PulseKeeper\output\
├── digest.html
├── digest.md
└── digest.pdf
```

---

## Project Structure

```
PulseKeeper/
├── src/
│   ├── main/
│   │   ├── index.js          # Main process, tray, IPC
│   │   ├── preload.js        # contextBridge API
│   │   ├── storage.js        # File-based persistence
│   │   ├── collector.js      # Source fetch orchestration
│   │   ├── scheduler.js      # node-cron refresh
│   │   ├── server.js         # Local HTTP server (port 7828)
│   │   ├── outputRenderer.js # HTML / Markdown / PDF generation
│   │   ├── llmClient.js      # Universal LLM client
│   │   ├── agentExport.js    # AgentPlatform pack builder
│   │   └── sources/
│   │       ├── rss.js
│   │       ├── youtube.js
│   │       ├── twitter.js
│   │       ├── spotify.js
│   │       ├── reddit.js
│   │       ├── webpage.js
│   │       └── index.js
│   └── renderer/
│       ├── index.html        # Settings window
│       ├── popup.html        # Tray popup
│       ├── app.js
│       ├── popup.js
│       └── styles.css
├── extension/                # Chrome/Edge MV3 extension
│   ├── manifest.json
│   ├── background.js
│   ├── content.js
│   ├── popup.html/css/js
│   ├── generate-icons.js     # Run once to generate PNG icons
│   └── icons/
├── scripts/
│   └── pk-bridge.js          # AgentPlatform bridge script
├── assets/
│   └── icon.svg
└── package.json
```

---

## License

MIT — see [LICENSE](LICENSE)

---

*PulseKeeper is a companion app to [AgentPlatform](https://github.com/rod-trent/AgentPlatform).*
