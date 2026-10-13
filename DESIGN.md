# Design

<!-- impeccable:design-schema 1 -->

## Surfaces

- Options / toolbar popup (`src/options/`): Operate mode. Dark Telegram-night settings UI for choosing and configuring a send path.
- Content picker (`src/content/`): Operate mode overlay on X and Facebook. Every row has a round avatar (real photo when available, initials otherwise); Telegram rows carry a small Telegram badge at the avatar's bottom-right. The subtitle names the route with a small icon: "Telegram account · Name" (person icon) or "Telegram bot · @bot" (bot icon). Below the route, a badge line mirrors Telegram's chat list: a gray "Pinned in Telegram" badge for chats pinned in the user's own list, then the colored tags of the Telegram folders holding the chat (only folders with a tag color, and only when the account has folder tags on). Folder names are searchable: typing a folder's name lists the chats it holds. Group, channel and bot chats show a small kind icon (people, megaphone, bot) before the title, like Telegram. Separately, every row has a "Pin to top" toggle (visible on hover, on the active row, and always when pinned) that moves it into a "Pinned" section above Recent; pins sync with the config. Pinned rows reorder by click and drag (the row lifts with a shadow, the others slide aside; a press that barely moves is still a plain click) or with Alt+Up/Down on the active row. Recent rows look like any other row (no border). Clicking a row or pressing Enter only toggles its check circle; Ctrl+Enter (Cmd+Enter on Mac) sends the selection, or the active row when nothing is selected, and the footer says so. The confirm button ("Send (N)") stays disabled while nothing is selected. Sending is the picker's one authored motion: the panel flies into the "sending" toast in the bottom-right corner and cross-fades into it while the backdrop fades out (about 0.5 s, exponential ease-out); with reduced motion it only fades. The chat list is shown instantly from a device-local cache, saved after every loaded page so a picker closed mid-load still leaves one, and reordered once when the fresh list finishes loading. Chats from every connected account and every bot's destinations share one merged list; the connection name only counts for search when the user has two or more connections of the same kind.

## Visual world

Telegram-night settings: deep navy ground (`#0e1621`), raised charcoal cards (`#17212b` / `#1e2a36`), cyan accent (`#2aabee`), system UI sans. Restrained color: accent for primary actions and path icons only. Filled buttons use the deeper `--x2tg-accent-fill` (`#1878b8`) so white labels pass AA; the brighter `#2aabee` stays for icons, links and progress.

## Type

- Page title ~1.5rem / 700
- Wizard title ~1.125rem / 650
- Card titles ~1.0625rem / 650
- Body / path descriptions 0.8125–0.875rem secondary

## Setup wizard

First-run shows a single chooser (account vs bot) with no Back button, since there is nothing to go back to. The same chooser opens from the list's "Add" button, then with a Back button. Picking a path opens that new connection's detail screen.

## Send channels

After setup, the options page is a "Send channels" list of connections: any number of bots and Telegram accounts. Each row is a flat divided button with a tinted route icon (bot or person), the connection name, a one-line summary ("Bot · N destinations" or "Telegram account") and a trailing chevron. "Add" sits beside the list title.

Clicking a row drills in: the detail screen replaces the list, with a Back button in its header (browser back works too, and the URL hash keeps the screen on reload). The bot detail holds the token, its Telegram chats as "destinations" in flat divided rows, and a "Remove bot" danger zone; edits use the bottom save dock. The account detail holds login and logout. Leaving a screen with unsaved changes asks before discarding.

## Tokens

CSS custom properties in `OptionsPage.css` (`--x2tg-*`). Send-channel list styles live in `SendChannels.css`; account and setup styles in `TelegramAccountSection.css` and `SetupWizard.css`.
