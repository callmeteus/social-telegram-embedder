# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People who already run Telegram channels or chats and want to forward posts from X/Twitter or Facebook without copy-paste. They open the extension popup or options page once to connect a send path, then use a send button on the social site. *(Inferred from README and extension UX; not interview-confirmed.)*

## Product Purpose

Chrome MV3 extension that embeds real post media into Telegram (photos, videos, GIFs, text + source links) from X and Facebook with one click. Success: user can send a post to at least one destination after a short setup.

## Positioning

Send path is local to the browser: either a Telegram bot token + channel list, or the user's own Telegram account (MTProto) to any writable chat. No X login; session and credentials stay on-device.

## Operating Context

- Toolbar popup (~400px) and full options page share the same settings UI.
- Content scripts inject a send button on X and Facebook; destination picker is a modal on the page.
- Bot mode uses Bot API; account mode uses mtcute in the service worker with user-provided api_id/api_hash.

## Capabilities and Constraints

- Two send providers: Telegram bot channels and Telegram user account dialogs; Discord is roadmap only.
- First-run setup should choose **bot or account** as the primary path (wizard), without forcing both at once. Adding the other later remains possible once one path works. *(Inferred from user request 2026-10-12; coexistence after first path is preserved.)*
- i18n: English and Brazilian Portuguese; no technical jargon in user-facing copy.
- Manifest V3, Chrome 116+, WASM crypto CSP for account mode.

## Brand Commitments

Product name: **Social Telegram Embedder**. Voice: plain, direct, setup-oriented. No emoji in UI copy.

## Evidence on Hand

README, options/content CSS, locale catalogs, working bot + account implementations in `src/`. No marketing site or user research artifacts.

## Product Principles

1. One clear path to “ready to send” beats showing every control at once.
2. Credentials and sessions stay on this device; never ask users to share secrets.
3. Bot and account are equal first-class send paths; neither is a second-class afterthought.
4. Familiar extension settings craft over novelty: scanability in a narrow popup.

## Accessibility & Inclusion

Keyboard-usable forms, `aria-live` status regions, and visible focus already exist; preserve them. No WCAG target was interview-confirmed.
