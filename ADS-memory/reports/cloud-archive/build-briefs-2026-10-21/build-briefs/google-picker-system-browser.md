# Brief: Google Picker (system browser): what the cloud can do vs what needs a real Google sign-in

## State
**Code is mostly built** in the bundled `google-workspace` agent plugin (`tovu-int/content/agent-plugins/google-workspace/`):
- `lib/picker-flow.mjs`: hosted bootstrap + verify, desktop `startSystemBrowser`/`finishSystemBrowser`.
- `lib/picker-selection.mjs`: server-side verification of every pick.
- `ui/picker*.mjs`, `ui/picker.handler.mjs`: actions `start-system-picker` and `finish-system-picker`.
- `ui/README.md:58-66` covers modes.

The host chooses the mode by `context.hostKind` (`apps/website/src/features/agent-plugins/admin-surfaces/handlers.ts:38-51`): desktop gets `system-browser`, a hosted site gets the `hosted` JS Picker. Supporting pieces:
- Jini: `jini-int/packages/agent-plugins/src/admin-surfaces/{external-links,callback-field-inbox}.ts`.
- Desktop: `openExternal` in `apps/desktop/src/window-navigation-policy.ts:20-59`.

**Known break**, from the 2026-10-20 Chrome check (`/Users/la/Programming/Tovu/ADS-memory/reports/2026-10-20-google-surfaces-chrome/REPORT.md:14`): the hosted JS Picker fails inside the sandboxed (`allow-scripts`, null-origin) surface frame. CSP blocks Google's injected styles, and the Picker needs a real origin. The recommendation was to use the system-browser mode, or a top-level window, for hosted sites too.

## What can be built and tested in the cloud (no Google account)
1. **Hosted fix, mechanism side.** Pick one in the brief and justify it:
   - (a) **Reuse the system-browser flow on hosted sites.** The `trigger_onepick` code + PKCE sign-in opens in a new top-level tab, and the callback comes back to the site's own sign-in route. This makes one path for both host kinds and removes the in-frame Picker.
   - (b) A **top-level admin page** that hosts the JS Picker on the admin origin, with its own CSP (`script-src https://apis.google.com`, `frame-src https://docs.google.com`, Google style origins). It posts the picked id back to the server for the same `verify-picked` check.

   Recommendation: (a). It is less code, keeps one verified path, and needs no browser key or app ID. Whether Google honours `trigger_onepick` for a **web** OAuth client must be confirmed locally (see below), so build (a) behind the existing `hostKind` switch and keep (b) as the fallback.
2. Unit tests at 100% for `picker-flow.mjs`, `picker-selection.mjs` and `picker.handler.mjs` with a fake Google client covering: selected, cancelled, expired, wrong account, non-spreadsheet MIME, no Sheets access, and replayed callback (consume-once inbox).
3. Host integration tests: `start-system-picker` returns a link and the admin page offers it (the frame cannot open links; `external-links.ts`). A fake callback fills the inbox once, and `finish-system-picker` polls to selected, then stops.
4. Desktop unit test: the link goes through `openExternal`, never an in-app webview.
5. Playwright (headless, optional): the Choose-spreadsheet button shows "Open Google to choose" and the poll status text. **No visual judgement.**

Rules: generic surface/inbox/link code stays in Jini. Google specifics stay in the plugin and never go in core. Lots take `(requiredObj, optionalObj = {})` with ports and keep complexity ≤10, coverage 100%, no new deps, vitest `--maxWorkers=2`, and no leftover processes.

## What needs the owner locally (a real Google sign-in and the desktop app)
- Real values for `TOVU_GOOGLE_WORKSPACE_OAUTH_{WEB,DESKTOP}_CLIENT_{ID,SECRET}`, plus `TOVU_GOOGLE_PICKER_BROWSER_KEY` / `_APP_ID` if option (b) is kept.
- A Google account and a real spreadsheet. A real `drive.file` grant per picked file can only be tested this way.
- Confirming that `trigger_onepick` + MIME filter actually shows Google's Picker for the **web** client (decides a vs b) and for the **desktop** client.
- Desktop end to end via `npm run desktop`: the system browser opens, the user picks, the loopback/callback returns, and the frame flips to "selected".
- A Chrome look at the surfaces. Known open items from the report: fixed-height frame clipping on phones, and the Google-blue buttons vs the admin accent.
- An uncommitted `ui/panel.css` edit noted in that report should be checked before any build touches the same file.

## Cloud-buildable: partly
Steps 1–5 above can be built and tested in the cloud. "It works with Google" can only be proven locally with the owner's keys.
