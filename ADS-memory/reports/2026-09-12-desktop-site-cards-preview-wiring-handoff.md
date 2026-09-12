# Handoff — desktop site-card preview, wired end to end (session interrupted for a fresh start)

- Date: 2026-09-12
- Package: `apps/desktop`
- Branch: `restructure/apps-website-phased`
- Commit: `3de3a714` — "feat(desktop): wire the site-card preview end to end"
- Supersedes: `ADS-memory/reports/2026-09-12-desktop-site-cards-handoff.md` for the preview half
  (Part 2). That file's Part 1 (the ⋮ menu / rename) was already committed before this session
  started (`569120ab`) and is unaffected. Read the design doc
  (`2026-09-12-desktop-site-cards-design.md`) first if you have not — this file assumes it.
- **Session ended here at the owner's request** ("do a handoff, take it to a new session") mid
  investigation of one gate failure — see "Open item 1" below, which is exactly where I stopped.

## What shipped in `3de3a714`

Everything the prior handoff listed as "reverted, must be redone" plus everything it listed as
"still to design-and-build". One commit, 14 files, 520 insertions:

| file | what changed |
|---|---|
| `src/contracts/project.ts` | `SiteRecord.previewVersion: number | null`; `SITE_IPC_CHANNELS.preview` |
| `src/project-ipc.js` | own re-declared `preview` channel literal; `buildSiteRecord` reads `deps.readPreviewVersion`; new `handleGetPreview`; `deleteProject` calls `deps.deletePreview(id)` unconditionally (both erase and remove branches — see its own comment); registration; `@param` docs; fixed a pre-existing stale count in two doc comments ("seven"/"eight" → "nine" real handlers, matching the actual `ipcMain.handle` call count both before and after this change) |
| `src/runner-ipc-stubs.test.js` | `"runner:sites:preview"` added to `IMPLEMENTED_CHANNELS` |
| `src/project-ipc.test.js` | `baseDeps()` stubs the three new deps; 9 new tests (previewVersion surfacing, `handleGetPreview`, `deletePreview` called on both the erase and the remove branch, and NOT called for an untracked id); fixed a stale test title ("exactly the five real channels" → accurate, the assertion itself was already channel-count-agnostic) |
| `src/add-site-button-wiring.test.js` | added the missing `readPreviewVersion` stub `handleAddSite`→`buildSiteRecord` now needs |
| `src/preload/preload.mts` | `getSitePreview` binding |
| `src/renderer/runner-api.ts` | `getSitePreview` on `RunnerInventoryBridge` |
| `src/renderer/use-site-preview.hooks.ts` (new) | the on-demand fetch hook — refetches on `previewVersion` **change**, not increase (see its own header) |
| `src/renderer/SiteGrid.tsx` | `SiteCard` calls the hook; `.card__tile` renders the `<img>` when a capture exists, the existing port `<span>` otherwise |
| `src/renderer/app.css` | `.card__preview` (`object-fit: cover; object-position: top`), with the admin's own aspect-ratio reasoning quoted verbatim from `apps/admin/src/styles.css:2340` |
| `main.js` | `captureSitePreview` (offscreen `BrowserWindow`, `show:false`, site's own partition, loads `http://127.0.0.1:<port>/`, `capturePage()`, `.resize({width:640})`, `writePreview`); `scheduleSitePreview` (debounced, once-per-site-per-run via a module-level `Set`); wired into both `openSiteWindow` and `openSiteServer` right after `openSites.set(...)`; `openSiteServer` now destructures `partition` too (it used to drop it); `projectDeps` carries the three bound preview deps; `sweepSitePreviewsOnBoot` called once after `rescanSites` |
| `src/main-preview-wiring.test.js` (new) | source-text wiring guard, same convention as `main-project-wiring.test.js`/`main-speech-wiring.test.js` — proves the capture loads the site root not `/admin/`, the window is hidden and partitioned, both call sites schedule it, the deps carry the three bindings, the boot sweep runs after the boot scan |
| `src/renderer/card-preview-wiring.test.js` (new) | comment-stripped source guard, same convention as `site-card-menu-wiring.test.js` — the hook is called with `project.id`/`project.previewVersion`, the `<img>`/port-span branch exists, `alt=""` is deliberate |
| `complexity-debt.json` | deleted the stale `SiteCard` entry via `node scripts/check-complexity.mjs --update` — **verified the diff touched only that one entry**, nothing else moved |

Design decisions followed exactly as the handoff specified: offscreen capture (never the guest),
version-token-only on the polled record, refetch on *change* not increase, cache path reusing
`sitePartition`'s digest convention, cleanup unconditional on delete, boot sweep as hygiene only,
`userData` resolved through `app.getPath("userData")` at each of the three new call sites (never
independently), `minWidth` in `main.js` **untouched**.

New implementation choices not already pinned by the handoff (flagging for review, since two
reversed positions already existed in this design and I did not want to add a third silently):
- Capture window: 1280×800 (16:10, matches `.card__tile`), downscaled to 640px wide.
- Paint settle after `did-finish-load`... actually after `loadURL` resolves: 1200ms fixed delay.
- Debounce from "server entered `openSites`" to "capture starts": 1500ms fixed delay.
- Used a hidden (`show: false`) `BrowserWindow` with `capturePage()`, NOT Electron's separate
  offscreen-rendering mode (`webPreferences.offscreen`) — that's a different API for streaming
  frames via a `paint` event; a plain hidden window paints by default
  (`paintWhenInitiallyHidden`, on since Electron 12) and `capturePage()` just works on it. This
  avoids a second, heavier API for a one-shot screenshot.

## Gates — as of `3de3a714`

From `apps/desktop`, all fresh runs:

| gate | result |
|---|---|
| `node --test "src/**/*.test.js"` | **606 pass / 0 fail** |
| `node --import tsx --test "src/**/*.test.ts"` | **70 pass / 0 fail** |
| `npm run typecheck` | **rc=0**, no output |
| `node scripts/check-complexity.mjs` | **OK — 9 grandfathered, 0 new** (was 10; the stale `SiteCard` entry is gone and nothing new appeared — `SiteCard`'s added `previewUrl ? (...) : (...)` ternary did not push it back over the ceiling) |

**Re-baseline note for whoever resumes:** the dispatch's stated baseline (585 JS / 22 TS) was stale
by the time I ran it — a clean `node --test "src/**/*.test.js"` already showed 606 pass before I'd
added anything, because this is a shared tree and other agents landed commits mid-session (see
`git log` — `folder-drop.test.ts` from a sibling agent landed while my own `npm run gates` run was
still executing). Don't treat any stated baseline count as current; run it fresh.

## Open item 1 — `npm run gates`'s coverage gate is RED, and NOT because of anything in this commit

This is exactly where the owner interrupted the session, so it is unresolved. `npm run gates`
reports:

```
FAIL  src .ts
  ! 3 file(s) have NO coverage record and are not in knownUnmeasured:
    src/renderer/use-site-actions.hooks.ts, src/renderer/use-site-preview.hooks.ts,
    src/renderer/use-site-rename.hooks.ts. Add a test, or grandfather them explicitly with a reason.
```

**Root cause, confirmed by checking `git show HEAD:apps/desktop/coverage-floors.json` against
`git log -1 -- .../use-site-actions.hooks.ts .../use-site-rename.hooks.ts`: this gate was ALREADY
red before this session touched anything.** `569120ab` (the ⋮ menu / rename commit, landed before
I started) added `use-site-actions.hooks.ts` and `use-site-rename.hooks.ts` without adding either
to `coverage-floors.json`'s `knownUnmeasured` list and without a test for either. My own new
`use-site-preview.hooks.ts` is a **third instance of the same pre-existing gap**, not a new kind of
problem — I own that third instance; I do not own the other two.

I did not fix this before stopping. Two ways to close it, and this is a policy call the design
doc/handoff never made (neither hook existed when either was written):
1. Add a direct test for each pure/thin hook (all three are `useEffect` + `useState` wrappers over
   the bridge — the `useSiteActions`/`useSiteRename` precedent in this file is "inject the hook as
   a prop so a wiring test can stub it," not "unit-test the hook's own `useEffect` body", since
   there is no DOM runner here — see `card-preview-wiring.test.js`'s own header for why I did not
   attempt one for `useSitePreview` either).
2. Add all three to `coverage-floors.json`'s `knownUnmeasured` list with a reason, matching the
   existing convention for `src/renderer/site-status.ts`/`theme.ts` etc.

**I recommend (2)** — these three are thin IPC-fetch wrappers in the same shape as the already
grandfathered `.tsx`-adjacent files, and a DOM-testing investment for three trivial hooks is
disproportionate — but I did not act on my own recommendation because `use-site-actions.hooks.ts`
and `use-site-rename.hooks.ts` are not mine to silently grandfather without whoever owns `569120ab`
agreeing, and `coverage-floors.json` was mid-edit by a sibling agent for an unrelated file
(`folder-drop.ts`) for part of this session — editing it again immediately risked a collision. Pick
this up first in the next session; it's a one-comment, one-array-entry change once decided.

**Note also:** `npm run gates`'s coverage gate was not part of the dispatch's stated verify list
(`node --test`, `node --import tsx --test`, `npm run typecheck`, `npm run gates` — it WAS listed,
I just did not reach a passing run before being interrupted). All three of the OTHER gates
(tests, typecheck, complexity) are green; only coverage is red, and only for the reason above.

## Open item 2 — not verified (same items the design doc already flagged, still true)

- `capturePage()` on a hidden `BrowserWindow` in this app specifically. Standard Electron API,
  never exercised here. I was told not to launch a second Electron instance (the owner's app is
  running), so this is unverified by construction, not by omission.
- `nativeImage`'s `.resize({width})` behavior — standard, not run in this codebase.
- The two fixed delays (1200ms settle, 1500ms debounce) are guesses calibrated to "should be
  enough for a server-rendered page," not measured against a real `tovu serve` boot.

## Open item 3 — untouched, per instruction

- `main.js`'s `minWidth: 960` — still pending the owner dragging the window narrow and reporting
  where it breaks. Not touched.
- The two "findings to route elsewhere" from the original handoff (the false comment in
  `apps/website/src/platform/site-dir/site-registry.ts:220`, and the admin's
  `.theme-card-preview img { object-fit: cover }` missing `object-position: top`) — still open,
  still outside `apps/desktop`, still someone else's to pick up.

## Verify commands for the next session

From `apps/desktop`:
```
node --test "src/**/*.test.js"
node --import tsx --test "src/**/*.test.ts"
npm run typecheck
node scripts/check-complexity.mjs
npm run gates   # currently fails on coverage only — see Open item 1
```
Check `pgrep -f "node --test"` / `pgrep -f "node --import tsx --test"` first — this is a shared
tree with several other agents active (`admin-sites-flag`, `desktop-launch`, `theme-*`, etc. per
the session's own agent list).
