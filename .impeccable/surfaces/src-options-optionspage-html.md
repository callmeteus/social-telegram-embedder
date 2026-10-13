---
version: 1
slug: "src-options-optionspage-html"
primary_target: "src/options/OptionsPage.html"
related_targets: ["src/options/dev.html","src/options/SetupWizard.ts","src/options/BotConnectionEditor.ts","src/options/ConnectionsList.ts","src/options/OptionsRoute.ts","src/options/SendChannels.css"]
---

# Options setup wizard

mode: Operate
audience: First-run and returning users configuring a Telegram send path in the popup or full options page.
job: Pick bot or personal account, complete that path, reach ready-to-send without seeing both setups at once.
primary action: Choose a send path, then finish its form.

## Direction contract

THESIS: First-run options is a single-path chooser, not a dump of every Telegram setting; refuse stacking bot and account cards until one path is chosen.
OWN-WORLD: Existing Telegram-night surface (#0e1621 ground, #17212b cards, #2aabee accent, system sans); choice rows inherit card language with stronger type steps (title ~1.5rem, path titles ~1.05rem).
STORY: User understands they need one send path, picks bot or account, completes only that flow, can add the other later.
FIRST VIEWPORT: Header + two full-width path buttons (Account first as personal send, Bot second); no secondary cards visible; primary CTA is the path press itself.
AFTER SETUP: A "Send channels" list of connections (many bots, many Telegram accounts), each a flat row with route icon, name, summary and chevron; "Add" beside the title reopens the chooser. Clicking a row drills into its detail screen (Back button, hash route, unsaved-changes guard); bot detail edits token, destinations and removal, account detail handles login and logout.
FORM: Extension of incumbent options world; local Operate addition, no new identity.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
