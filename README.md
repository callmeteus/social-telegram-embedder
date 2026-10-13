<div align="center">

# Social Telegram Embedder

> Embed social posts in Telegram channels with one click - rich media on X/Twitter and Facebook.
>
> [github.com/callmeteus/social-telegram-embedder](https://github.com/callmeteus/social-telegram-embedder)

**A Chrome extension that adds a send button to social posts, lets you pick a Telegram channel, and delivers photos, videos, GIFs, and text with source links. Supports X/Twitter (FixupX) and Facebook (page snapshot).**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Chrome Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4.svg)](#)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-339933.svg)](#)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript-blue.svg)](#)

[Download](#download) • [Quick Start](#quick-start) • [Features](#features) • [Setup](#telegram-setup) • [Development](#development)

</div>

---

## What Is Social Telegram Embedder?

Sharing posts from social networks to a Telegram channel usually means copy-paste and broken previews. This extension embeds the real media in Telegram. **X/Twitter and Facebook are supported today.**

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
- **Telegram account mode** - log in as yourself (QR or phone, with two-step verification) and send to any chat, group or channel you can write in; see [Telegram Account Mode](#telegram-account-mode)
- **Searchable live picker** - search bar, recent destinations, live chat list with avatars
- **Send to several destinations at once** - up to 10 per click, across bot channels and account chats

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

## Telegram Account Mode

Account mode logs the extension in as **your own Telegram user**, so you can send a post to any contact, group or channel you are allowed to write in, without adding a bot anywhere. It is send-only: the extension never reads, replies to or archives your messages.

### Create your app keys

Telegram requires every app that logs in as a user to use its own `api_id` and `api_hash`. The extension ships none; you create yours once:

1. Open [my.telegram.org](https://my.telegram.org/apps) and log in with your phone number
2. Choose **API development tools**
3. Create an app (any name and short name work)
4. Copy **App api_id** and **App api_hash** into the **Your Telegram account** card in the extension options and click **Save keys**

Treat the `api_hash` like a password: do not share it, paste it in issues, or commit it.

### Connect

1. Click **Show QR code**
2. On your phone, open Telegram, then **Settings**, **Devices**, **Link Desktop Device**, and scan the code
3. If your account has two-step verification, type the password (the hint is shown)

Prefer a code? Click **Use phone number instead**, type the number with the country code, and enter the code Telegram sends you.

### Sending

The destination picker opens with a search bar and three sections: **Recent**, **Bot channels** and **Your Telegram**. Your chats load live and reorder as new messages arrive. Typing filters instantly; after a short pause the extension also searches Telegram for chats and `@usernames` not loaded yet.

- Click or press Enter to send to one destination
- Press Space, Ctrl+click (Cmd+click on macOS) or tick the circle to select several, then **Send to N** (up to 10 per send)
- Media is downloaded once and reused for every destination; the toast shows progress per destination and a summary if any failed

### Privacy and account safety

- The login session lives only in this browser profile (IndexedDB) and never syncs to other devices. The app keys are stored on this device only (`chrome.storage.local`).
- **Disconnect** in the options ends the session on Telegram's side and deletes the local session data. You can also end it from Telegram under **Settings**, **Devices**.
- Sends are always started by you. Several destinations are sent one after another with a pause between account sends, and if Telegram asks to slow down, the remaining account sends are skipped and the wait time is shown. Avoid using this to mass-message people; Telegram can limit accounts that look automated.

### Bot mode and account mode together

Both modes can be active. Bot channels keep working as before and appear under **Bot channels**; account chats appear under **Your Telegram**. With the account connected, the bot setup is optional.

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
| "Telegram rejected these app keys" | Re-copy `api_id` and `api_hash` from [my.telegram.org](https://my.telegram.org/apps); use keys from an app you created, not someone else's |
| Account chats missing in the picker | Chats where you cannot post (for example channels where you are not an admin) are hidden on purpose |
| "Your Telegram session ended" | The session was ended from another device; connect again in the options |
| "Telegram asked to wait" | You hit a rate limit; wait the time shown before sending from the account again |

---

## Security

- The bot token is stored **only in your browser** (`chrome.storage.sync`)
- Intended for **personal use** - do not share builds or screenshots of the options page
- Do not commit tokens to git or publish them in issue trackers
- Account mode: the Telegram session and app keys stay on this device (IndexedDB and `chrome.storage.local`); only the connected flag and display name sync. Only the extension's own pages can drive the login.

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
| `src/platforms/` | Social platform registry and adapters (`x/`, `facebook/`) |
| `src/platforms/x/` | X/Twitter: FixupX URL, FxTwitter API, action bar injection |
| `src/platforms/facebook/` | Facebook: DOM snapshot, action bar injection, Open Graph fallback |
| `src/content/` | Content script orchestrator and shared UI (picker, toasts) |
| `src/background/` | Service worker and send handler |
| `src/background/telegram-user/` | Telegram account session (mtcute), login and dialogs ports; the only place mtcute is imported |
| `src/core/telegram-user/` | Account types shared by background, picker and options (errors, dialog list reducer, port protocol) |
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
