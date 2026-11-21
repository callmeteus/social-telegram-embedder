# Options setup wizard

Migrated from the impeccable surface for `src/options/OptionsPage.html`.

## Scope

- Primary target: `src/options/OptionsPage.html`
- Related targets: `src/options/dev.html`, `src/options/SetupWizard.ts`, `src/options/BotConnectionEditor.ts`, `src/options/ConnectionsList.ts`, `src/options/OptionsRoute.ts`, `src/options/SendChannels.css`
- Mode: Operate
- Audience: first-run and returning users configuring a Telegram send path in the popup or full options page.
- Job: pick bot or personal account, complete that path, and reach ready-to-send without seeing both setups at once.
- Primary action: choose a send path, then finish its form.

## Direction

- Thesis: first-run options is a single-path chooser. It does not dump every Telegram setting. Do not stack bot and account cards until one path is chosen.
- Own world: the existing Telegram-night surface stays, with ground `#0e1621`, cards `#17212b`, accent `#2aabee`, and system sans. Choice rows inherit card language with stronger type steps: title about 1.5rem, path titles about 1.05rem.
- Story: the user sees that they need one send path, picks bot or account, completes only that flow, and can add the other path later.
- First viewport: header plus two full-width path buttons, Account first as personal send, Bot second. No secondary cards are visible. The path press itself is the primary CTA.
- After setup: show a "Send channels" list of connections, with many bots and many Telegram accounts allowed. Each connection is a flat row with a route icon, name, summary, and chevron. "Add" beside the title reopens the chooser. A row click opens its detail screen, with a Back button, hash route, and unsaved-changes guard. Bot detail edits token, destinations, and removal. Account detail handles login and logout.
- Form: an extension of the incumbent options world, a local Operate addition with no new identity.
- Finish: unreviewed and undocumented work is unfinished. This build ends with the finish review, the verdict, `DESIGN.md`, and every shipping raster carrying its provenance.
