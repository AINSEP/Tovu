# Handoff — desktop site cards (agent rotated out mid-preview)

- Date: 2026-09-12
- Package: `apps/desktop`
- Branch: `restructure/apps-website-phased`
- Companion design doc: `ADS-memory/reports/2026-09-12-desktop-site-cards-design.md` — **read it
  first**; this file only records what changed since and what is left.

## Tree state at handoff

**Green.** From `apps/desktop`:

| gate | result |
|---|---|
| `node --test "src/**/*.test.js"` | 585 pass / 0 fail |
| `node --import tsx --test "src/**/*.test.ts"` | 22 pass / 0 fail |
| `npm run typecheck` | rc=0 |
| `node scripts/check-complexity.mjs` | OK — 10 grandfathered, 0 new |

Nothing of mine is uncommitted. Re-baseline before trusting those numbers — this tree moved eight
times in one day.

## Commits landed

| SHA | What |
|---|---|
| `0cb9181a` | "Add Tovu Website" gets the high-contrast fill (`--contrast` trio, inverts per theme) |
| `6251d031` | Sites home window gets `minWidth: 960` / `minHeight: 600` |
| `569120ab` | The ⋮ overflow menu, with Rename as its first real action |
| `b48a0392` | Sites home responds to its content column, not the viewport |
| `dbd1de20` | The card-preview cache — **unwired**, nothing imports it yet |

## Where the preview stands

`dbd1de20` landed the **first half**: `src/site-preview-store.js` plus 14 tests. It is complete,
green, mutation-checked (7/7), and imported by nothing. The second half — IPC, the capture in
`main.js`, and the renderer — is **not started**, and a partial wiring of it was deliberately
reverted before handoff so the tree would not be left red.

### What was reverted, and must be redone

I had begun wiring and undid it. Redo exactly this, all of it together or the drift detector fails:

1. **`src/contracts/project.ts`** — `previewVersion: number | null` on `SiteRecord`, and
   `preview: 'runner:sites:preview'` in `SITE_IPC_CHANNELS`.
2. **`src/project-ipc.js`** — the same channel literal in its own re-declared `SITE_IPC_CHANNELS`
   (CommonJS main-process code cannot import the TS contract); `previewVersion:
   deps.readPreviewVersion(row.siteDir)` in `buildSiteRecord`; `deps.deletePreview(id)` beside
   `untrackSite` in `handleDelete`; one `ipcMain.handle` for the preview channel; three `@param`
   lines on the deps block.
3. **`src/runner-ipc-stubs.test.js`** — add `"runner:sites:preview"` to `IMPLEMENTED_CHANNELS`.
   **This is the one I had not yet done and it is why the tree went red.** Adding a channel means
   adding it in all three places or `project-ipc.test.js`'s drift detector fails, correctly.
4. `src/preload/preload.mts` + `src/renderer/runner-api.ts` — the `getSitePreview` binding and type.

`baseDeps()` in `project-ipc.test.js` will also need `readPreviewVersion`/`readPreviewDataUrl`/
`deletePreview` stubs, or every `buildSiteRecord` test throws on an undefined dep.

### What is still to design-and-build

- **The capture**, in `main.js`. Offscreen `BrowserWindow` loading `http://127.0.0.1:<port>/` on the
  site's own partition, `capturePage()`, downscale via `nativeImage.resize()`, hand the bytes to
  `writePreview`. Hook it where a site enters `openSites` — there are two such sites,
  `openSiteWindow` (~line 689) and `openSiteServer` (~line 747); a single
  `scheduleSitePreview(siteDir, port, partition)` helper called after both is cleaner than two
  copies. Debounced, once per site per run, never on the tab-open path.
- **The boot sweep** — `sweepOrphanedPreviews(userData, trackedDirs)` once during startup.
- **The deps wiring in `main.js`** — bind the store's functions to `app.getPath("userData")` at the
  same time every other userData consumer resolves it. See the *Traps* section.
- **The renderer** — a hook that fetches the `data:` URL per site and refetches when
  `previewVersion` **changes** (not "is greater" — a restored or clock-skewed capture must still
  refresh; team-lead called this out explicitly). Then the `<img>` in `.card__tile` with
  `object-fit: cover; object-position: top`, falling back to today's port tile.
- **CSS** for that `<img>`. `.card__tile` already carries `aspect-ratio: 16 / 10`, so it drops in
  with no layout change and no reflow as images load. Carry across
  `apps/admin/src/styles.css:2340`'s reasoning as a comment.

## Decisions made since the design doc — these supersede it

1. **The capture source is an OFFSCREEN window, not the live `<webview>` guest.** `App.tsx:496`
   defaults the workspace view to `'admin'`, and `App.tsx:500` shows both surfaces are the same
   origin on different paths (`/` vs `/admin/`). Capturing the guest would therefore screenshot the
   *Tovu admin* for most operators most of the time — every card showing identical admin chrome. It
   would not fail to preview; it would preview the wrong thing, uniformly and confidently. Gating on
   "URL is not /admin/" is correct but fires only when someone clicks "View site", which is rare.
   The offscreen path is also **simpler**: no `did-attach-webview`, no partition→siteDir map, no
   webview tracking — just `siteDir → port`, which `openSites` already is.
2. **The record carries a version token, never the image.** `useSitesPolling` (`App.hooks.ts:52`)
   calls `listSites()` every 4s and cannot be made lazy. A `data:` URL on `SiteRecord` would move
   ~1.25MB per poll at 50 sites, forever, for images that have not changed. An mtime plus an
   on-demand fetch is the same feature at a thousandth of the traffic.
3. **`<img src="file://…">` was never settled, and does not need to be.** The only honest test is a
   running Electron, and launching a second instance kills the owner's app. The `data:` path removes
   the dependency. A custom protocol (`protocol.handle`) was considered and rejected: marginally
   cheaper at runtime, but scheme registration before app-ready plus a main handler plus a new URL
   scheme in a renderer that has none is real permanent surface for thumbnails.
4. **Theme preview PNGs remain rejected.** Full reasoning in the design doc; the short version is
   that 3 of the 9 themes installed in the real `sites/tovu-com` ship no screenshot, and that gap is
   permanent and arbitrary rather than temporary and self-explaining.

## Open asks

- **`minWidth` is deliberately still 960 and is known to be too conservative.** The two facts that
  produced it — the single 680px breakpoint and the overflowing header row — are both gone as of
  `b48a0392`. The real floor is probably `.topnav` (a `max-width: fit-content` pill that cannot
  wrap), around 440px, but that is an estimate and estimates are exactly what this task existed to
  correct. **team-lead asked the owner to drag the window narrow and report where it first looks
  wrong.** When they answer it is a one-number commit in `main.js`. Both the code comment and the
  wiring guard already say it is pending.
- **`complexity-debt.json` has a stale entry.** `SiteGrid.tsx`'s `SiteCard` is recorded at 10; it is
  now below the ceiling, and the gate reports `FIXED (remove from complexity-debt.json)`. team-lead
  ruled: **delete that entry on the next `--update`, never refresh it.**

## Traps that cost me time — do not rediscover these

- **`isStillTheRecordedSite` cannot gate a rename.** It returns false unless `row.siteId` is a
  non-empty string, and `buildTrackedRow` stamps `siteId` only on a `created` row — so every
  *adopted* site (every real one) would be unrenameable. `handleRename`'s doc carries the full
  asymmetry argument; do not "fix" it to match the delete guard next door. There is a regression
  test that fails under the original design.
- **`app.getPath("userData")` must be read at the same time as every other consumer.**
  `main.js:99-134` documents the `TOVU_DESKTOP_USER_DATA_DIR` E2E override and why it must be
  applied before `whenReady()`. A module that resolves userData independently writes E2E previews
  into the real user's profile — silent pollution nobody notices for weeks. `site-preview-store.js`
  takes `userDataDir` as a parameter for exactly this reason; keep it that way.
- **Do not put `container-type` on `.main`.** Containment makes an element a containing block for
  `position: fixed` descendants and opens a new stacking context, and `.main` holds the site
  `<webview>` and its overlays. `b48a0392` scoped it to `.onboarding` for that reason. (Container
  queries themselves are fine — Electron 43 ships Chromium 150, well past the 105 baseline.)
- **Mutation-testing with plain text replacement hits doc comments.** My first sweep over
  `site-preview-store.js` reported a false SURVIVED because the header quotes
  `sha256(path.resolve(siteDir))` in prose and that matched before the code did. Anchor on the full
  code line, or strip comments first.
- **Verify against what you are committing, not what is on disk.** `7ed4f29c` renamed an export in
  the contract but left `preload.mts` importing the old name — typecheck was rc=0 for the agent that
  ran it, because the fix was sitting uncommitted in its working tree, and rc≠0 for HEAD. I carried
  that repair in `569120ab` with attribution. In a shared tree those two states diverge constantly.
- **`git commit -- <pathspec>` takes working-tree state, not the index.** That is why the above could
  not be separated out.
- **Renderer tests are source-text guards; there is no DOM runner for `.tsx`.** Strip comments before
  matching — `SiteGrid.tsx`'s prose discusses `stopPropagation`, `role="menu"` and "Stop" by name.

## Findings to route elsewhere (outside `apps/desktop`, untouched)

1. **False comment.** `apps/website/src/platform/site-dir/site-registry.ts:220` claims *"This repo's
   own `sites/tovu-com` carries neither marker file, so `readSiteDir` rejects it"*, and reasons about
   not loosening `readSiteDir` on that basis. Now false: the real site carries both markers with
   `templateId: "unknown"` / `templateVersion: "0.0.0"` — `repairSite`'s exact constants — from a
   `tovu adopt` dated 2026-09-07. True when written, quietly false since.
2. **Live crop defect in the admin.** `apps/admin/src/styles.css` sets `.theme-card-preview img
   { object-fit: cover }` with the default `object-position: center`. `basic` and `basic-2` ship
   1200×3322 full-page captures, so the Themes screen currently shows a band from **38.7% to 61.3%
   down the page** — a mid-page section, not the hero — for the two default themes most sites use.
   One-line fix: `object-position: top`.

## Not verified

- That `capturePage()` works on an offscreen `BrowserWindow` in this app. The API is standard;
  nothing here has exercised it.
- `nativeImage.resize()` — standard Electron API, not run in this codebase.
- The `.topnav` ~440px floor estimate behind the `minWidth` ask.
- Any of this in a running window. No Electron instance was launched at any point.
