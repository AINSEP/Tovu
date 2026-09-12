# Desktop site cards — ⋮ menu and card preview (design)

- Date: 2026-09-12
- Package: `apps/desktop`
- Branch: `restructure/apps-website-phased`
- Status: **design settled, not built.** Held pending `rename-c456`'s Commits 5-6.
- Build order when released: ⋮ menu with rename, then the preview. Both touch `SiteGrid.tsx`;
  one pass over that component rather than two.

Two owner requests drove this:

1. *"i also want a 3 vertical dots option to bring up and edit in case we wanna change the name
   or change other details."*
2. *"is there a way we can preview the site with an image in the card? either the active theme
   pngs or a screenshot of the active site or something?"*

Everything below is evidence-backed against the tree at `4252c1ed`/`6b063184`. Line numbers were
accurate at that point and will drift; the file and symbol names are the durable part.

---

## Part 1 — the ⋮ overflow menu

### 1.1 What the card can do today

Exactly two things: click-anywhere-to-open, and the trash button with its inline confirm overlay
(`SiteGrid.tsx`). Start is **not** on the card — it is `SiteStartPanel`, an overlay rendered
*inside* the workspace once a tab is already open (`App.tsx`). Stop has no control at all.

### 1.2 Menu contents

| item | status | cost |
|---|---|---|
| **Rename…** | new product behaviour | new IPC channel + handler + preload + contract |
| **Start** | `handleStart` registered (`project-ipc.js:461`), `useProjectStart` exists | none |
| **Open in browser** | `handleOpenExternal` registered (`project-ipc.js:460`), preload-bound | none |
| **Reveal in Finder** | wants `shell.showItemInFolder` | a 2nd new channel — fold into the rename commit |
| **Delete** | exists | only if it opens the *same* confirm overlay |
| ~~Stop~~ | **impossible today** | — |

**Stop is out, and that is the product's current state rather than a design choice.**
`project-ipc.js:457-463` registers seven handlers and `stop` is not among them; `project-ipc.js:10`
records it as *"a throwing stub"*. Do not ship a disabled item implying it is coming — say so in
the commit message instead.

**Start and Open in browser each close a real gap.** Today a stopped site can only be started by
opening its tab and clicking the overlay panel, and `openExternal` is only reachable from the
workspace bar — so a site never opened as a tab **cannot be opened externally at all**.

**Delete:** keep the trash button visible. Its copy changes on `deleteErasesFiles` ("erases the
folder" vs "only drops the card"), which is the affordance preventing the worst mistake in the
app. A menu entry is acceptable only if it opens that same overlay, never a bare confirm.

### 1.3 What is editable, and what is not

The site's displayed name comes from `readSiteName(siteDir)` (`main.js:347`), which reads
`config.json`'s `name` and falls back to `path.basename(siteDir)`. Wired into `projectDeps` at
`main.js:1163`, consumed as `displayName` at `project-ipc.js:70`.

`ConfigJson` — `apps/website/src/platform/site-dir/types.ts:59`, header:
*"static site identity … Never written by `serve`."*

| field | verdict |
|---|---|
| `name` | **The only v1 target.** Required, 1..200 chars after trim, re-validated at *every* boot (`validateConfig`, `read-site-dir.ts:58`). |
| `domain` | **Leave out.** Documented as *"informational until a routing/deploy spec consumes it"* — it currently does nothing, and a field that changes nothing is worse than an absent one because the operator assumes it did something. |
| `port` | **The sharp edge. Second phase at best.** `config.port` *is* consumed at boot (`resolveServePort`, `serve.ts:260`), so editing it needs a restart *and* a collision story against the ports the desktop assigns itself. |

Whole file capped at 64 KiB; must be a regular file.

**Not editable at all:**

- `.site-meta.json` in its entirety — `schemaVersion` is monotonic (INV-05) and `siteId` is what
  the delete guard's identity test rests on. Editing it is a corruption vector, not a preference.
- The `desktop-projects.json` row — `siteDir` is the row key *and* the record's `id`, `origin`
  decides whether delete erases the folder, `siteId` is the delete guard's proof, `createdAt` is
  provenance. Keys are frozen.
- Derived, stored nowhere: `port` (live, from `openSites`), `status`, `statusDetail`, `partition`
  (a pure function of `siteDir`), `slug` (basename), `deleteErasesFiles` (computed by the guard).

**Therefore the dialog behind the ⋮ is a rename box, not a form.** One field, one rule, no restart
semantics to explain. No frozen registry key has to move to ship it.

### 1.4 There is no rename path anywhere in the product

Not merely none in the desktop shell. The nearest write path **refuses**.

`repairSite` (`apps/website/src/platform/site-dir/repair-site.ts`) writes `config.json` and is
CLI-reachable as `tovu adopt --name`, but throws `MARKER_ALREADY_EXISTS` when either marker file
exists: *"a repair must never overwrite an existing marker file"* (`repair-site.ts:211`).

**Why it refuses — and why that invariant does not bind a rename.** The header states the reason:
`.site-meta.json` carries `{schemaVersion, schemaTag}`, and `tovu serve`/`bootSiteDir` compare that
stamp against the runtime's bundled migration identity **before the database is ever opened**
(`schema-guard.ts`'s `compareSchemaVersion`). *"Stamping the WRONG version is worse than no stamp
at all — a wrong 'compatible' stamp would make `serve` skip a migration the database still needs,
silently."* `config.json` is swept into the refusal only because `repairSite` writes the **pair**
as one commit marker — the pair is what makes a directory count as a site (`site-registry.ts`).

A rename writes one string in `config.json`, never touches `.site-meta.json`, and therefore
**structurally cannot** cause the harm the refusal exists to prevent. It is a different operation,
not a workaround. **This reasoning belongs in the commit message** — "we added a write path next
to a function that refuses to write" looks wrong to the next reader without it.

### 1.5 The rename guard

Different harm, so a different guard:

1. **Identity** — reuse `isStillTheRecordedSite` from `project-delete-guard.js`. Do not invent a
   second notion of site identity. Its header documents the exact failure a rename could cause: an
   operator moves their site, something else takes the old path, and *"the card even renders under
   the NEW site's name, since `readSiteName` reads whatever `config.json` is there now."* Without
   this check, a rename writes into a stranger's site.
2. **Validity** — enforce `validateConfig`'s 1..200-after-trim in the hook **and** re-validate in
   the handler. Never trust the renderer.
3. **Atomicity** — atomic write. `writeJsonFileAtomic` exists (`atomic-write.ts:92`) but is a
   website-package internal; the desktop needs its own. It already writes JSON registry files in
   `tracked-sites.js`.
4. **Read-modify-write**, never a fresh `{name, domain, port}`. `ConfigJson` is documented as an
   *"additive-only compatibility surface"*; rebuilding from the parsed shape silently drops
   whatever a newer Tovu added.

### 1.6 The running-site case: nothing happens

`bootSiteDir` calls `readSiteDir` once (`boot-site-dir.ts:71`); `serve.ts:260` uses the result for
`resolveServePort` and **nothing else**. Across the whole website app `config.name` has three
consumers — `site-registry.ts:97` (the admin Sites screen's `displayName`, re-read per call) and
two `process.stdout.write` lines in `init.ts`/`adopt.ts`. **None in a running server.**

With `types.ts:58`'s explicit *"Never written by `serve`"*, that settles it in both directions:
**no clobber, no race, no restart, no reload.** The server reads the name at boot and discards it.

| surface | after a rename |
|---|---|
| Site card | **Updates immediately** — re-read from disk on every `list`. |
| Desktop window title | Stale — see 1.7. |
| Admin Sites screen | Updates on next load. |

### 1.7 The window title — narrow, and worth one line

**In the sites-home flow there is no window to go stale.** Cards open as `<webview>` tabs inside
the sites-home window, whose title is pinned by a `page-title-updated` preventDefault
(`main.js:463`). The card path is `handleStart`/`openSiteServer`, documented as *"spawn-only, no
window"* (`main.js:723`).

The only window carrying `readSiteName`'s output comes from `openSiteWindow` (`main.js:682`), whose
single production caller is `adoptAndOpenSite` (`main.js:823`) — **File > Open Site… and Open
Recent**. So the stale case needs the operator to have opened a site through the native menu *and*
rename it from the grid with both windows up.

**Fix it anyway, with one guarded line:** `openSites.get(siteDir)?.window?.setTitle(newName)`. The
`page-title-updated` preventDefault does not block this; it only stops the *page* changing the
title. Worth the line because `main.js:345` says the title is *"what makes Electron's native Window
menu double as a site switcher (distinct titles, distinct entries)"* — a stale title there is a
stale **control**, not a stale label.

**`refreshAppMenu` is NOT needed.** Traced: `main.js:868` builds the submenu as
`recents.map((dir) => ({ label: dir, … }))` — the "Open Recent" label is the **directory path**,
not the site name. A rename cannot stale it.

### 1.8 Unhappy paths

- **Running site** — nothing happens to the server (1.6).
- **Folder moved or replaced** — the dangerous one; the whole reason for the identity check (1.5).
- **Invalid name** — empty, whitespace-only, or >200 chars throws `SiteDirInvalidError` →
  `SITE_DIR_INVALID`, exit 3. **Delayed fuse:** it does not break the running site, it breaks the
  *next* boot.
- **Crash mid-write** — a truncated `config.json` fails the same validation. Hence atomicity.
- **Unknown keys** — hence read-modify-write.

---

## Part 2 — the card preview

### 2.1 Decision: offscreen capture of the site surface

Cache a screenshot of each site's own public surface, captured in a hidden `BrowserWindow`, keyed
by `siteDir`. **Not** theme preview PNGs (2.5), and **not** a capture of the live `<webview>` guest
(2.2).

### 2.2 Why offscreen, not the guest webContents

The obvious design — capture the guest when a tab settles — is wrong, because of two lines:

- `App.tsx:500` — both surfaces are the **same origin, different path**:
  `http://127.0.0.1:${port}/` for the site, `/admin/` for the admin.
- `App.tsx:496` — **the default view is `'admin'`.**

So a passive guest capture would screenshot the **Tovu admin** for most operators most of the time,
and every card would show identical admin chrome. That fails in a specific and bad way: it does not
fail to preview, it previews the *wrong thing*, confidently and uniformly, and it looks like it is
working.

Gating on "URL does not contain `/admin/`" is correct but near-useless — it fires only when someone
explicitly clicks "View site", leaving the feature invisible for a subtler version of the same
permanent-and-arbitrary failure that disqualified theme PNGs.

**The offscreen design is also strictly simpler.** It needs no `did-attach-webview`, no
partition→siteDir map, and no webview tracking — only `siteDir → port`, which `openSites` already
is (`main.js:755`: *"`openSites` already IS this shell's registry of what is running"*).

Confirmed nothing was already started down the guest-tracking road: `main.js` touches `webContents`
in exactly two places — `setWindowOpenHandler` (`:392`) and `will-attach-webview` (`:469`), and the
latter only mutates the `webPreferences` object Electron hands it. No `did-attach-webview`, no
`webContents.fromId`, no `getAllWebContents` anywhere in the package. Note also that `openSites` is
`Map<siteDir, {server, window?}>` where `window` is a **`BrowserWindow`** from the standalone path
(`main.js:689`) — never the embedded guest.

### 2.3 Capture trigger and staleness

**Capture when a site enters `openSites`** (its server came up), debounced past first-boot settle,
at most once per site per run. Load `http://127.0.0.1:<port>/` in a hidden `BrowserWindow` on the
site's own partition, wait for load, `capturePage()`, downscale via `nativeImage.resize()`
(Electron built-in — no new dependency), write, destroy. Off the tab-open hot path entirely.

**Staleness is correct behaviour, not a bug — write this down in the code.** The cache refreshes
every time the site starts, so a thumbnail is at most one session old: it shows the site as it was
when you last ran it, which is what "last known" should mean. A site you changed but have not
restarted showing its pre-change state is *right*. Recording this stops someone later "fixing" it
with a timer. No staleness badge — a slightly old thumbnail is normal, and the badge is noise.

### 2.4 Storage, cleanup, rendering

**Path:** `<userData>/site-previews/<sha256(path.resolve(siteDir)).slice(0,32)>.png`, reusing the
digest convention `sitePartition` already uses (`desktop-auth.js:112`).

**No registry key.** The filename is *derived* from `siteDir`, which is already the frozen row key
and already the record's `id`. `desktop-projects.json` is untouched.

**Use the same `app.getPath("userData")` accessor at the same time as every other userData
consumer.** `main.js:99-134` documents the `TOVU_DESKTOP_USER_DATA_DIR` E2E override and why it
must run before `whenReady()`. Getting this wrong writes previews into the real user's profile
during E2E — silent pollution nobody would notice for weeks.

**Cleanup:** delete in `handleDelete` (`project-ipc.js:326`, `untrackSite`'s single production call
site), plus a boot sweep — one `readdir` of `site-previews/` against the in-memory set of tracked
digests. The sweep is hygiene, not correctness: `buildSiteRecord` only ever asks for previews of
rows it is already building, so an orphaned file is unreachable from the UI. Say that in the
comment so nobody escalates it into a filesystem watcher.

**Rendering:** the `<img>` goes in `.card__tile`, which already carries `aspect-ratio: 16 / 10` and
`place-items: center` (`app.css:812`) — the same ratio as the admin's `.theme-card-preview`. So it
drops in with **no layout change and no reflow as images load**. Carry the admin's own reasoning
across as a comment (`apps/admin/src/styles.css:2340`): *"`aspect-ratio` (not a fixed height) keeps
every card's thumbnail the same shape before either the real image or the placeholder has painted,
so the grid doesn't reflow when screenshots load in."*

Use `object-fit: cover; object-position: top`.

**Fallback: today's port tile, unchanged.** No file → the card renders exactly as it does now. The
existing argument for it (`SiteGrid.tsx:115`) is better than a grey image glyph: the port is *"the
project's real address — the thing you would type to reach it"*. A feature that degrades to the
current design cannot make anything worse.

**Open verification item:** the renderer is a `file://` page (`main.js:456` is `loadFile`, not
`loadURL`), so `<img src="file://…">` is plausibly same-origin and free. **Prove this before
building on it.** If blocked, a `data:` URL over IPC sidesteps the question entirely — downscaled
to 640×400 that is ~25 KB as JPEG, cheap even at 50 sites.

### 2.5 Rejected: theme preview PNGs

Themes ship `screenshots/index.{png,jpg}` and they are **copied into each site**
(`marketplace.ts:169` deliberately does not filter `screenshots/` out of either copy). Real bytes,
69 KB–275 KB — this is **not** the media-seed "rows without bytes" shape; nothing references a
missing file. Already HTTP-served at `/theme-assets/{id}/screenshots/…` by `theme-static-assets.ts`,
and the admin already renders them (`Themes.tsx:89`, `ThemeCardPreview`, jpg→png→placeholder).

Rejected for two independent reasons:

**1. Coverage.** Of the 9 themes installed in the real `sites/tovu-com`, **3 have no screenshot**
(`declarative/basic-declarative`, `static/kuinetic-showcase`, `templated/storefront`). No
`theme.json` in the repo declares a `preview`/`previewGallery` key; `assets.previewGallery` appears
only in one validation test fixture.

That gap is **permanent and arbitrary** — blank forever, for a reason invisible from the card, with
nothing the operator can do about it. That is an inconsistency feature. Contrast the capture
approach, whose gap is **temporary and self-explaining**: "the site I have never opened has no
thumbnail" needs no explanation, and opening it once fixes it permanently. That distinction, not
the plumbing, is what decided this.

**2. The active theme is not knowable for a stopped site.** It lives only in `content.db`
(`presentation_settings.active_theme_id`, `schema.ts:189`, surfaced as
`core.presentation.activeThemeId`). No on-disk marker — checked `.site-meta.json`, `config.json`,
and the `themes/` dir. Reading it needs `better-sqlite3`, which `tracked-sites.js:3` records this
shell has **twice, in writing**, declined. `tovu introspect` describes the CLI's own commands, not
site data.

**If that second blocker disappears** (another agent is surveying whether a site can have *no*
theme, which touches how the active theme is represented), nothing structural changes here — only
*what fills the cache*. The end state would be layered: theme screenshot as the immediate
first-paint for a never-opened site, real capture overwriting it once available. The 1-in-3 gap
stops mattering when it is a gap in a *fallback*. And if that survey concludes a site can have no
theme at all, capture is the only source left. Both branches point the same way, which is why the
capture path is the one to build now.

### 2.6 Two facts worth keeping

**Full-page vs viewport screenshots.** `basic` and `basic-2` are **1200×3322** full-page captures;
`tailark-*` and `fashion-modern` are 1440×900 viewport shots. At 16:10, `object-fit: cover` shows
1200/1.6 = 750 original px = **22.6%** of a full-page capture. With `object-position: top` that is
the hero — a usable crop. (An earlier figure of 9% in the working thread was arithmetic error.)

**A live defect in the admin, for whoever owns it.** `apps/admin/src/styles.css` sets
`.theme-card-preview img { object-fit: cover }` with the default `object-position: center`. For
`basic`/`basic-2` — the default themes, the ones most sites are on — the Themes screen therefore
shows a band from **38.7% to 61.3% down the page**: a mid-page section, not the hero. One-line fix
(`object-position: top`), independent of anything on the desktop side.

### 2.7 Not a foundation

`<siteDir>/out/export/` holds a real static export of the actual site, renderable offline —
`tovu-com` has one. But it exists only if someone ran `tovu export`, and that one is dated Aug 15.
Bonus, not foundation. Do not build on it.

---

## File map for the build

| file | change |
|---|---|
| `apps/desktop/src/contracts/project.ts` | rename channel + input/result types; optional preview field on `SiteRecord` |
| `apps/desktop/src/project-ipc.js` | rename handler (identity + validity + atomic write); `deps.readSitePreview`; cache delete in `handleDelete` |
| `apps/desktop/src/preload/preload.mts` | rename binding |
| `apps/desktop/main.js` | offscreen capture + cache write + boot sweep; `setTitle` on rename |
| `apps/desktop/src/renderer/SiteGrid.tsx` | ⋮ menu; `<img>` in `.card__tile` |
| `apps/desktop/src/renderer/app.css` | menu styles; preview `<img>` rule |
| *(new)* rename hook | keep logic out of `.tsx` per repo convention |

**Gates** (from `apps/desktop`): `node --test "src/**/*.test.js"`,
`node --import tsx --test "src/**/*.test.ts"`, `npm run typecheck`.
**Re-baseline first** — `4252c1ed`, `303ba537`, `58cf12dc`, `89687fb1`, `6b063184` all landed
during this work, and one of them puts `.js`/`.mjs` under a complexity rule for the first time, so
`main.js` is now gated where it was not before. Complexity ceiling 9; the pre-existing violations
in `App.tsx` (`App` 12, `SiteWorkspace` 11) and `SiteGrid.tsx` (`SiteCard` 10) are not ours — do
not fix them, do not make them worse. `SiteCard` at 10 is the one to watch: the ⋮ menu lands in it.

---

## Findings to route elsewhere (not in `apps/desktop`)

1. **False comment.** `apps/website/src/platform/site-dir/site-registry.ts:220` claims *"This
   repo's own `sites/tovu-com` carries neither marker file, so `readSiteDir` rejects it"* and
   reasons about not loosening `readSiteDir` on that basis. Now false: the real site carries both
   markers with `templateId: "unknown"` / `templateVersion: "0.0.0"` — `repairSite`'s exact
   `UNKNOWN_TEMPLATE_ID`/`UNKNOWN_TEMPLATE_VERSION` constants — from a `tovu adopt` dated
   2026-09-07. True when written, quietly false since.
2. **Admin theme preview crop** — 2.6 above.

## What could not be verified

- That `<img src="file://…">` loads from the `file://` renderer. No Electron launch (instructed).
- That `capturePage()` works on an offscreen `BrowserWindow` in *this* app specifically — the
  Electron API is standard, but nothing here has exercised it.
- `nativeImage.resize()` — standard Electron API, not run in this codebase.
- The header-row button width underpinning the `minWidth: 960` choice (shipped in `6251d031`) is
  computed from the stylesheet, not measured in a live window.
