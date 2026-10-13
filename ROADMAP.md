# Roadmap

## Backlog

- [ ] **R-001** Discord destination: send posts to Discord channels through incoming webhooks (provider type already in the config schema)
  priority: medium · status: planned
- [ ] **R-019** Facebook destination: publish posts to Facebook using the account(s) already logged in on the same browser (no API keys)
  priority: medium · status: planned
- [ ] **R-020** Instagram source: capture feed posts and stories from Instagram and repost them to the other networks
  priority: medium · status: planned
- [ ] **R-021** TikTok source: capture posts and stories from TikTok and repost them to the other networks
  priority: medium · status: planned
- [ ] **R-022** Instagram destination: publish to the Instagram feed and stories using the account(s) already logged in on the same browser (no API keys)
  priority: medium · status: planned

## Done

- [x] **R-002** One-click send from X: button in the tweet action bar on timeline and tweet detail pages
  priority: high · status: done
- [x] **R-003** Telegram bot channels: multi-channel config with friendly names, reorder, test and remove, plus channel discovery from pending bot updates
  priority: high · status: done
- [x] **R-004** Rich Telegram posts: native media attachments, FixupX/fxtwitter links, and download-and-reupload fallback when Telegram cannot fetch a media URL
  priority: high · status: done
- [x] **R-005** Facebook support: send button on Facebook posts with text, photos, videos and author attribution
  priority: high · status: done
- [x] **R-006** Multi-provider connections: config v4 with a connections list, automatic migration from older configs, quota-safe sync storage
  priority: high · status: done
- [x] **R-007** Options page rework: connections list, bot connection editor, first-run setup wizard and deep-linkable routes
  priority: high · status: done
- [x] **R-008** Telegram account login: sign in with QR code or phone (code + 2FA), app keys stored on the device only, lazy session restore
  priority: high · status: done
- [x] **R-009** Send as your Telegram account: post to any chat the account can write to, including large media and formatted captions
  priority: high · status: done
- [x] **R-010** Multi-destination send: one click sends the post to up to 10 chats across bots and the account, with per-destination results
  priority: high · status: done
- [x] **R-011** Destination picker: bots and account chats merged, multi-select, search, recent destinations, Enter marks and Ctrl/Cmd+Enter sends
  priority: high · status: done
- [x] **R-012** Pinned destinations: pin chats from the picker, drag to reorder, Telegram pinned chats shown with a short "Pinned" badge
  priority: medium · status: done
- [x] **R-013** Chat list cache: dialogs saved page by page so the picker opens instantly and fills in progressively
  priority: medium · status: done
- [x] **R-014** Telegram folders: folder tags on each chat, search by folder name, icons for groups, channels and bots
  priority: medium · status: done
- [x] **R-015** Chat photos: avatars loaded with a concurrency limit and retried after failures instead of falling back to initials forever
  priority: low · status: done
- [x] **R-016** Send progress feedback: indeterminate progress bar and elapsed-time counter while a send has no percentage yet
  priority: medium · status: done
- [x] **R-017** Facebook extraction fixes: videos with background music, obfuscated Messenger cards, shared posts with comment plus original text and co-authors, avatar status text no longer leaking into the author name
  priority: high · status: done
- [x] **R-018** Telegram folder diagnostics: debug log with chats per folder and how many accept posts from the account
  priority: low · status: done

## Deferred
