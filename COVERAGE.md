# social-telegram-embedder test coverage

## How to read this document

Items are grouped by area, then by file or route. Each item is one test case, tagged with its kind:

- `[happy]` valid input, expected flow.
- `[sad]` invalid input, failing dependency, domain error.
- `[edge]` limits, empty, null, concurrency, cache, timing.
- `[security]` auth, spoofing, injection, replay, leaks.
`[x]` means the test exists. `[ ]` means it is still missing.
## 1. Core

### `src/index.ts`

- [ ] [happy] Primary entry path succeeds with valid input
- [ ] [sad] Primary entry path rejects invalid input

## 2. Telegram account client

### `src/core/storage/ConfigMigrations.ts`

- [x] [happy] v1 config migrates to v3 in one load, last used channel becomes a recent destination
- [x] [happy] v2 config migrates to v3 with telegramUser defaults
- [x] [happy] Current config with account settings and recents is left untouched
- [x] [sad] Broken legacy config is repaired instead of throwing
- [x] [edge] Recents are deduped, capped at 8, and refs to missing channels dropped
- [x] [edge] Config with 10 channels and 8 long-titled recents stays under the 8 KB sync item quota
- [x] [security] Malformed destination refs (unsafe peer ids, unknown kinds, wrong types) are rejected

### `src/core/storage/Storage.ts`

- [x] [happy] Successful destinations are recorded as recents, newest first
- [x] [happy] Extension counts as ready with only a connected Telegram account
- [x] [security] Logout drops account chats from recents and keeps bot channels

### `src/core/telegram-user/Credentials.ts`

- [x] [happy] Valid api_id and api_hash are trimmed, lowercased and saved to device-local storage only
- [x] [sad] Malformed api_id values are rejected
- [x] [sad] Malformed api_hash values are rejected
- [x] [security] Tampered stored credentials are ignored

### `src/core/telegram-user/Errors.ts`

- [x] [happy] Every Telegram error code maps to a plain-language message
- [x] [sad] API_ID_INVALID and API_ID_PUBLISHED_FLOOD map to the check-your-app-keys state
- [x] [edge] Flood and slow mode waits are read from the error and shown in seconds or minutes
- [x] [edge] Unknown, null and string errors fall back safely

### `src/core/telegram-user/FormattedText.ts`

- [x] [happy] Bold tags become ranges and HTML entities are unescaped
- [x] [edge] Unknown tags stripped, empty or unclosed bold ignored, emoji use UTF-16 offsets

### `src/core/telegram-user/Dialogs.ts`

- [x] [happy] Dialogs ordered pinned by rank, then by last activity, archived last
- [x] [happy] Live upserts rename and add chats; new activity moves a chat up
- [x] [sad] Chats without posting rights are dropped and removed on rights change
- [x] [edge] Later pages never lose newer activity; unpinning forgets the pin rank
- [x] [edge] Channels need creator or post rights; banned, left and deleted peers excluded

### `src/background/telegram-user/TelegramUserSession.ts`

- [x] [happy] QR login shows the code, the scanned state, asks for 2FA with its hint and logs in
- [x] [happy] Phone login goes phone, code, password, ready
- [x] [happy] Logged-in account is restored lazily after restart without connecting
- [x] [happy] Concurrent callers share one lazy connection
- [x] [sad] Wrong 2FA password keeps the password step with an error (QR and phone)
- [x] [sad] Wrong code keeps the code step; expired code returns to logged out
- [x] [sad] Telegram rejecting the app keys sends the user back to the keys step
- [x] [sad] Network failure shows an error without logging out
- [x] [edge] Flood wait during login is reported with the wait time
- [x] [edge] Login cancel aborts and disconnects
- [x] [edge] Idle disconnect only after the last hold is released
- [x] [security] Changing app keys is refused while logged in or during a login
- [x] [security] Revoked session (server or pushed update) wipes local session data
- [x] [security] Logout revokes on the server and wipes locally even if the server call fails
- [ ] [happy] Manual: QR login on a test account in the unpacked extension, browser restart keeps the session
- [ ] [sad] Manual: revoking the session from the Telegram app shows logged out in the extension

### `src/background/telegram-user/PortRouter.ts`, `AuthPortHandler.ts`, `DialogsPortHandler.ts`

- [x] [happy] Picker receives the session state, dialog pages in order, then live updates
- [x] [happy] Searches answered with a minimum query length; failures return empty results
- [x] [happy] Avatars served as data URLs, cached and fetched once per chat
- [x] [happy] Options page receives snapshots, runs commands and gets the account avatar
- [x] [edge] Closing the picker releases the connection so the idle timer runs
- [x] [edge] Login in progress is cancelled when the last options page closes
- [x] [sad] Unknown or malformed commands are ignored
- [x] [security] Ports from other extensions are dropped
- [x] [security] Login port refused from content scripts on web pages

### `src/options/TelegramAccountSection.ts`

- [x] [happy] Keys step with guide and link, keys sent and hash field cleared after saving
- [x] [happy] QR code rendered with scanned hint; phone and code flow; 2FA with hint
- [x] [happy] Connected account shows name and avatar
- [x] [sad] Malformed keys flagged inline without being sent
- [x] [sad] Rejected keys bring back the keys step with a clear error
- [x] [edge] Logout only after confirmation
- [ ] [edge] Manual: every login state checked in the options dev preview at desktop and narrow width

### `src/content/ui/picker/DestinationPicker.ts`, `PickerModel.ts`

- [x] [happy] Arrow keys, wrap-around, Enter and Escape; single click sends one destination
- [x] [happy] Local filter is case and accent insensitive over title and @username
- [x] [happy] Debounced server search merged without duplicates, chats without rights hidden
- [x] [happy] Sections Recent, Bot channels, Your Telegram with live updates and lazy avatars
- [x] [happy] Multi-select with Space, Ctrl+click and checkbox; Send to N in selection order
- [x] [sad] Signed-out state shows a sign-in hint and never searches the server
- [x] [edge] Stale search results ignored; one-character queries stay local
- [x] [edge] Selection limited to 10 with a notice; selection survives query changes
- [x] [edge] Recent account chat visible before the live list loads, listed once
- [x] [security] Keys typed in the picker never reach X or Facebook shortcuts
- [ ] [edge] Manual: picker on x.com and facebook.com at desktop and narrow width, large account stays smooth

### `src/core/destinations/TelegramUserDestinationSender.ts`

- [x] [happy] Text-only post sends caption and link
- [x] [happy] Single photo downloaded and sent with upload progress
- [x] [happy] Video sent from prefetched bytes without a second download
- [x] [happy] Album sends caption on the first message
- [x] [edge] More than 10 media split into albums with a follow-up link
- [x] [sad] Failed download maps to a friendly message
- [x] [sad] No rights and flood wait mapped, flood wait seconds reported
- [ ] [happy] Manual: X post with 4 photos and a Facebook reel sent to a contact, a group and a channel

### `src/background/handlers/MultiDestinationSend.ts`, `SendPostHandler.ts`

- [x] [happy] Single destination path unchanged: no prefetch, no prefix, no delay
- [x] [happy] Media downloaded once and reused, per-destination progress prefix
- [x] [happy] Link-only send when the post could not be fetched
- [x] [sad] One failure does not cancel the rest; summary names the failures
- [x] [edge] Delay only between consecutive account sends; flood wait skips remaining account sends
- [x] [security] More than 10 destinations refused; duplicates and malformed refs dropped first
- [ ] [happy] Manual: one X post to a bot channel, a contact and a group in one click with one forced failure
