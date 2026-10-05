# Handoff: unrun E2E part 3 (W5, W8, desktop D1-D7). Stopped at the 250k context line

## Done (this commit; nothing was run)
- `development/e2e/journeys/themes.journey.ts` (3 tests), `users.journey.ts` (3 tests).
- H2 minimal desktop harness: `development/playwright.desktop-journeys.config.ts`, `development/e2e/desktop/{desktop.globalSetup.ts,_fixtures.ts}`.
- Desktop journeys: `smoke.desktop.ts` (D1, 4), `add-site.desktop.ts` (D2, 5), `site-webview.desktop.ts` (D3, 3).
- Registry lines appended to `development/UNRUN-TESTS.md`; status column updated in `ADS-memory/reports/2026-10-04-e2e-stress-test-ideas.md`.
- Typecheck of all new files: rc=0. Scratch tsconfig at `<scratchpad>/e2e3/tsconfig.json` extends `development/tsconfig.e2e.json` with `typeRoots: [<repo>/node_modules/@types]`, run through `run-gated.sh` with `node node_modules/typescript/bin/tsc -p <that>`.

## Remaining: D4-D7 (one file each, under `development/e2e/desktop/`, reuse `_fixtures.ts` helpers)
- **global-chat.desktop.ts (D4)**: the app-level chat is NOT built. `App.tsx:189` says no host FAB, and `WorkspaceChatPane` has zero call sites. So: (a) sites home has no `.chat-fab` and no `aside[aria-label="Runner chat"]`; (b) the guest assistant answers a stubbed run. Stub through CDP on the guest: `guest.debugger.attach("1.3")`, then `Fetch.enable` with pattern `*/api/runs*`. On `Fetch.requestPaused`: `POST /api/runs` gets `{run:{id,state:"running"}}`. `GET /api/runs/<id>/events` gets an SSE body made of a `text_delta` frame and an `end` frame (copy `frame()` from `journeys/assistant.journey.ts`). `GET /api/runs/<id>` gets `{run:{state:"succeeded"}}`. Everything else gets `Fetch.continueRequest`. Open the guest FAB the way `desktop-shell.spec.ts` does. Focus `textarea.jini-composer-input`, then `guestInsertText`, then click `button[aria-label="Send"]` via guestEval. Poll for the reply in `.admin-chat-dock`. Assert exactly 1 run start.
- **site-lifecycle.desktop.ts (D5)**:
  - Start/Stop: `listSites(win)` gives the port. `portAnswers(port)` is true while running and false after Stop. Also cover Restart.
  - Rename: ⋮ `More actions for X` → `Rename…` → field `Display name` → Save. Check that `config.json.name` changed and that the name survives a relaunch with the same `userDataDir`. A blank name keeps Save disabled.
  - Remove: on an adopted card, `Remove from Projects…` opens the group `Remove X from Projects?`. Cancel keeps the card. Remove drops it, the folder stays on disk, and the card is still gone after a relaunch.
  - Locate: use `fs.renameSync` on the site dir before launch. The card should show `Folder moved or deleted`; then stubFolderPicker(new path) and click `Locate the folder for X`.
- **settings.desktop.ts (D6)**:
  - Zoom: `clickAppMenuItem(app, "Zoom In")` (it passes the window, see `src/zoom-menu.ts`). The guest's `getZoomLevel()` should become 0.5. The level is persisted in localStorage `tovu:zoom:<projectId>` and should come back after a relaunch.
  - Window bounds: `setBounds`, close, relaunch with the same userData, then check that width and height match (`window-bounds-store.ts`).
  - The Settings gear is aria-disabled by design. D1 already covers it.
- **multi-instance.desktop.ts (D7)**: two `launchDesktop()` calls with separate userData run at the same time. Both draw, and the first stays alive after the second launches and after the second closes (owner rule: no single-instance lock). Also cover two sites in one instance: both Running, with distinct ports from `listSites`.
- Then: typecheck, append registry lines, flip the D4-D7 row in the ideas report, and commit with `git commit -F msg -- <paths>`.

## Decisions
- W9 tool-call journey skipped: there is no reusable fake-model helper (only the inline Gemini deputy in `development/e2e/byok-google-tool-schema.spec.ts`). The idea and the helper it needs are in the ideas report row.
- Desktop env leaves `TOVU_ADMIN_PASSWORD` UNSET, not set: the desktop signs in with a boot token. The root key is a fake `"a".repeat(64)`. `TOVU_ADMIN_DEV_PORT=0` disables the :5173 admin Vite probe.
- The D1 "each section opens" check is written as "present + inert + keeps Websites drawn", because only `projects` is live by design.

## Likely bugs / risks spotted
1. The admin nav is not permission-filtered: `panels.tsx` declares no permission per panel. An editor sees Users and Roles, and the users journey's nav test asserts the intended behaviour, so it likely fails. The server gate does refuse (`users/list.ts`: 403).
2. The desktop globalSetup fails loud when `apps/admin/dist` is older than `apps/admin/src`. Other agents edit admin src constantly, so expect to rebuild admin before every desktop run.
3. The checkout's `sites/tovu-dev` is seeded as a card in every fresh userData (`seedDevFallbackSite`). Journeys never touch it.
4. If public HTML is cached, the theme switch may not reach `/` immediately. The themes journey would catch that.

## Warnings
- Shared tree: commit only your own paths.
