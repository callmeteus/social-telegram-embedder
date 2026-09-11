<div align="center">

# Social Telegram Embedder

> Embed social posts in Telegram channels with one click - rich media today on X/Twitter, more networks planned.
>
> [github.com/callmeteus/social-telegram-embedder](https://github.com/callmeteus/social-telegram-embedder)

**A Chrome extension that adds a send button to social posts, lets you pick a Telegram channel, and delivers photos, videos, GIFs, and text with source links. X/Twitter is supported first via FixupX.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Chrome Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4.svg)](#)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-339933.svg)](#)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript-blue.svg)](#)

[Download](#download) • [Quick Start](#quick-start) • [Features](#features) • [Setup](#telegram-setup) • [Development](#development)

</div>

---

## What Is Social Telegram Embedder?

Sharing posts from social networks to a Telegram channel usually means copy-paste and broken previews. This extension embeds the real media in Telegram. **X/Twitter is supported today**; additional platforms are planned.

```text
  Tweet on X/Twitter
         |
         v
  Click the send button (paper plane)
         |
         v
  Pick a Telegram channel
         |
         v
  FxTwitter API resolves media
         |
         v
  Telegram receives native attachments + FixupX link caption
```

| You get | How |
|---------|-----|
| Photos | Sent as Telegram photos (albums for multi-image tweets) |
| Videos | Sent as Telegram video files |
| GIFs | Sent as Telegram animations (video fallback) |
| Text-only tweets | Message with FixupX link preview |
| Multiple images | Album preserving tweet order (10 items per batch) |

Under the hood it uses the public [FxTwitter Status API](https://github.com/FxEmbed/FxEmbed/wiki/Status-Fetch-API) and the [Telegram Bot API](https://core.telegram.org/bots/api). No X login, no Telegram user session - just your bot token and channel list stored locally in the browser.

---

## Download

**Recommended:** install from [GitHub Releases](https://github.com/callmeteus/social-telegram-embedder/releases/latest).

1. Open the latest release page.
2. Download `social-telegram-embedder-vX.Y.Z.zip` (and optionally verify the `.sha256` checksum).
3. Unzip the archive. You should see `manifest.json`, `background.js`, `content.js`, and the rest of the extension files at the top level of the folder.
4. Continue with [Install in Chrome](#install-in-chrome) below.

### Verify checksum (optional)

```bash
sha256sum -c social-telegram-embedder-v1.1.0.zip.sha256
```

On Windows (PowerShell):

```powershell
Get-FileHash .\social-telegram-embedder-v1.1.0.zip -Algorithm SHA256
```

Compare the output with the contents of the `.sha256` file from the release.

---

## Quick Start

### 1. Install in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the **unzipped release folder** (the folder that contains `manifest.json`)

### 2. Configure the extension

1. Click the extension icon, then **Options** (or right-click the icon -> Options)
2. Paste your bot token from [@BotFather](https://t.me/BotFather)
3. Click **Validate token**
4. Add your channels:
   - Click **Discover channels** to detect channels from bot updates, or
   - Add them manually (friendly name + `@channel` or `-100...` ID)
5. Click **Save settings**
6. Use **Test channel** on each channel to confirm posting works

### 3. Send a tweet

1. Open any tweet on [x.com](https://x.com) or [twitter.com](https://twitter.com)
2. Click the **paper-plane button** in the tweet action bar (next to Share)
3. Choose a channel from the picker
4. The extension posts media and/or text to that channel

---

## Features

- **One-click send** from the tweet action bar on timeline and tweet detail pages
- **Channel picker on every send** - always asks which channel, even if you only have one
- **Multi-channel config** - friendly names, reorder, test, and remove channels
- **Bot channel discovery** - reads pending Telegram bot updates to suggest channels
- **FixupX URLs** - `x.com` becomes `fixupx.com`, `twitter.com` becomes `fxtwitter.com`
- **Rich Telegram posts** - native attachments instead of link-only previews when media exists
- **Upload fallback** - if Telegram cannot fetch a media URL, the extension downloads and re-uploads it
- **Local-only secrets** - bot token stays in `chrome.storage.sync` on your machine

---

## Telegram Setup

You need a Telegram bot with permission to post in your target channel(s).

| Step | Action |
|------|--------|
| 1 | Talk to [@BotFather](https://t.me/BotFather) and run `/newbot` |
| 2 | Copy the bot token into the extension options |
| 3 | Add the bot to your channel as an **administrator** |
| 4 | Grant **Post Messages** permission |
| 5 | Use `@yourchannel` for public channels or `-100...` for private ones |

### Channel discovery notes

Telegram does not expose a "list all my channels" API. **Buscar canais** reads `getUpdates` events (bot added to channel, posts, etc.). If a channel is missing:

1. Add the bot as channel admin
2. Post any message in the channel
3. Click **Buscar canais** again

Bots with an active **webhook** must remove it (`deleteWebhook`) before discovery works from the extension.

---

## How Media Sending Works

```text
fixupx.com/user/status/123
         |
         v
GET api.fxtwitter.com/user/status/123
         |
         v
Parse media.all (photos, videos, GIFs)
         |
         +--> 0 items  -> sendMessage (FixupX link)
         +--> 1 item   -> sendPhoto / sendVideo / sendAnimation
         +--> 2-10     -> sendMediaGroup (album)
         +--> 11+      -> batches of 10 + follow-up link message
```

Each caption includes the tweet text (when available) and the FixupX link so readers can open the original post.

---

## Localization

The extension uses Chrome's built-in i18n (`chrome.i18n`) with automatic locale detection from the browser language.

| Locale folder | Language |
|---------------|----------|
| `_locales/en/` | English (default) |
| `_locales/pt_BR/` | Brazilian Portuguese |

All user-facing copy (options page, toasts, progress messages, and errors) comes from `_locales/*/messages.json`. To add a language, create a new folder under `_locales/` following [Chrome's locale rules](https://developer.chrome.com/docs/extensions/reference/api/i18n).

Example button labels in English:

| Label | Action |
|-------|--------|
| Validate token | Check the @BotFather token |
| Discover channels | Read bot updates to find channels |
| Add channel | Add a channel manually |
| Save settings | Persist bot token and channel list |
| Test channel | Send a test message to that channel |

With Portuguese (`pt-BR`) as the browser language, the same controls appear in Brazilian Portuguese automatically.

---

## Troubleshooting

| Symptom | What to try |
|---------|-------------|
| Bot cannot post | Confirm the bot is a channel admin with **Post Messages** |
| Channel not in discovery | Post in the channel, then click **Discover channels** again |
| Media missing in Telegram | Retry; extension falls back to direct upload if URL fetch fails |
| Button not visible on tweets | Reload the extension; X DOM changes may require an update |
| Invalid token | Re-copy the token from @BotFather |
| Broken link preview only | Tweet may be private or API unavailable; link-only fallback is used |

---

## Security

- The bot token is stored **only in your browser** (`chrome.storage.sync`)
- Intended for **personal use** - do not share builds or screenshots of the options page
- Do not commit tokens to git or publish them in issue trackers

---

## Development

### Requirements

- Node.js 20+
- Yarn 1.x
- Google Chrome or Chromium

### Scripts

```bash
git clone https://github.com/callmeteus/social-telegram-embedder.git
cd social-telegram-embedder

yarn install
yarn typecheck
yarn test
yarn build                 # outputs dist/
yarn package:zip           # builds + creates release/social-telegram-embedder-vX.Y.Z.zip
```

Load the `dist/` folder via **Load unpacked** while developing. After changes, click **Reload** on `chrome://extensions`.

### Project layout

| Path | Role |
|------|------|
| `src/core/` | Types, storage, Telegram client, network helpers |
| `src/core/i18n/` | `chrome.i18n` helper and options page localization |
| `_locales/` | Localized message catalogs (`en`, `pt_BR`) |
| `src/platforms/` | Social platform registry and adapters (`x/` today) |
| `src/platforms/x/` | X/Twitter: FixupX URL, FxTwitter API, action bar injection |
| `src/content/` | Content script orchestrator and shared UI (picker, toasts) |
| `src/background/` | Service worker and send handler |
| `src/options/` | Settings page |
| `manifest.json` | Extension version source of truth |
| `dist/` | Built loadable extension |

To add a new social network later: create `src/platforms/<id>/`, implement `SocialPlatform`, and register it in `src/platforms/registry.ts`.

---

## Releasing (maintainers)

Version lives in [`manifest.json`](./manifest.json). GitHub Actions builds and publishes a release when you push a matching tag.

```bash
# 1. Bump version in manifest.json
# 2. Commit and push
git tag v1.1.0
git push origin v1.1.0
```

The [Release workflow](./.github/workflows/release.yml) will:

1. Run typecheck and tests
2. Build the extension
3. Create `social-telegram-embedder-vX.Y.Z.zip` and a SHA256 checksum
4. Publish a GitHub Release with both files attached

You can also trigger a release manually from the **Actions** tab (`workflow_dispatch`). The workflow reads the version from `manifest.json` and refuses mismatched tags on tag pushes.

---

## Credits

- [FxEmbed / FixupX](https://docs.fxembed.com/) for tweet metadata and media URLs
- [Telegram Bot API](https://core.telegram.org/bots/api) for channel posting

---

## License

[MIT](./LICENSE)
