# Security pass — 2026-08-12 session commits

**Date:** 2026-08-13
**Scope verified:** `git log --oneline --since="2026-08-12 00:00" --until="2026-08-13 00:00"` on Tovu
`general-work` returns **180 commits** (not ~94 as estimated in the dispatch brief — stated here per
the "verify the actual count" instruction). Plus 6 named Jini commits on `general-work`:
`e6175496`, `6dc06941`, `6cd491b8`, `6af7f218`, `8e0a437b`, `0d5f25d0` (all in `packages/chat` — chat
composer/discovery async-handling work, not a security-sensitive surface on inspection; see P8).

This report reviews the CODE AS IT NOW STANDS, using the commit list to scope where to look. Findings
are ordered by severity. Every finding has a concrete exploit path; anything without one is labeled
UNPROVEN and ranked below proven findings, per the security-review skill's evidence bar.

---

## Findings

### Note — untrusted archive extraction (priority #2): hardened, but not yet reachable

**Component:** `src/features/agent-plugins/install.ts`, `yauzl-archive-reader.ts`, `package-paths.ts`

`installAgentPlugin()` is genuinely well-hardened against every zip-slip/decompression-bomb/TOCTOU
vector in scope: symlink entries are refused categorically (not validated-then-allowed); path
containment (`assertContainedOnDisk`) re-`realpath`s BOTH the root and the deepest existing ancestor on
every single entry, catching a symlinked-parent-directory-planted-by-an-earlier-entry attack, not just a
lexical `../` check; size is bounded on bytes ACTUALLY streamed off `openReadStream()`, never the
archive's own declared size (defeats the classic "declared size lies" bomb); entry count, per-file size,
and running total are all capped (`LIMITS`, install.ts:115-120); writes use `O_EXCL|O_NOFOLLOW`; publish
is an atomic same-filesystem `rename`; the digest is verified BEFORE the archive reader ever touches the
bytes, so a mismatched-digest archive is never even parsed. I tried to refute this by hand-tracing each
of the checklist items in the dispatch brief (zip-slip, absolute paths, symlinks, zip-bomb,
declared-vs-actual size, TOCTOU, entry-name normalization) against the code above and could not find a
bypass.

**One LOW/UNPROVEN note:** `normalizePackageEntryPath` does not apply Unicode normalization (NFC/NFD).
Two entries that are visually identical but differ in Unicode normalization form both pass the lexical
`seen`-based `DUPLICATE_ENTRY` check as "different," even though some filesystems (historically HFS+)
normalize on write and would collide on disk. This does **not** break containment — `assertContainedOnDisk`
re-resolves the real filesystem path independently for every entry, so nothing escapes the package root
this way — worst case is a silently-dropped `DUPLICATE_ENTRY` refusal on a platform where the two forms
collide on disk, which is a robustness gap, not a security one on the file systems Tovu actually deploys
to (Linux, not HFS+). Not pursued further given the severity ceiling.

**Material finding, not a vulnerability but changes urgency:** `installAgentPlugin` has **zero callers**
anywhere in `src/` outside its own file and its own tests — no HTTP route, no agent-tool registration.
`src/server/routes/admin/plugins/{list.ts,set-enabled.ts}` is a different, unrelated "plugins" surface
(the `.tovu-plugin`/`plugin-runtime` loader, explicitly distinguished in `install.ts`'s own header). This
hardening is real and correct, but the archive-extraction attack surface it defends is **not yet
reachable from the network or from any agent tool** — worth confirming with the owner whether a route is
coming in a follow-up session, since that is the day this review's assumptions need re-checking (e.g.
whether the eventual route re-validates `expectedSha256` server-side rather than trusting a client-supplied
value, which `install.ts`'s own doc comment already flags as "a real marketplace flow would supply this
from the server's own metadata" — i.e. today's function signature accepts it as a parameter with no
opinion on where the caller gets it from).

**The theme install path is not an archive-extraction surface at all.** `downloadMarketplaceTheme`
(`src/features/theme/marketplace.ts:247`) copies a THEME directory via `cpSync`, sourced only from a
local, repo-shipped `__marketplace__` fixture folder — not from an uploaded or fetched archive. The
`marketplaceId` request parameter is validated against `SAFE_THEME_ID` (a regex) before any path is
built from it, and the fixture directory itself is looked up by iterating a fixed, small set of
`ENGINE_SUBFOLDERS` under a trusted root — no network fetch, no user-supplied bytes, no zip parsing.
There is currently no code path where an external theme package (zip, tarball, or otherwise) is
ingested. If "anyone can author themes" is meant to describe a near-term feature, the archive-extraction
hardening above should be the template for it — it is not yet built for themes.

**Human sign-off required:** No (no exploitable finding; informational for planning).

---

### FINDING 1 — CRITICAL — PROVEN — Stored XSS via `.svg` upload survives outside a compiled theme's `sourceDir`

**Type:** Stored XSS (CWE-79) via content-type/extension allowlist gap
**Component:** Theme Explore file-write API + theme static-asset serving
**Affected files:**
- `src/server/routes/admin/themes/explore.ts:123-125` (`TEXT_READABLE_EXTENSIONS` includes `.svg`)
- `src/server/routes/admin/themes/explore.ts:141-155` (`ASSET_EXTENSIONS`/`isAssetExtension` — `.svg` classifies as group `"asset"`)
- `src/server/routes/admin/themes/explore.ts:198` (`READ_ONLY_GROUPS = new Set(["script", "other"])` — `"asset"` is not in it)
- `src/server/routes/admin/themes/explore.ts:206-208` (`isThemeFileWritable` — the general gate every write route falls back to outside a compiled theme's `sourceDir`)
- `src/server/middleware/theme-static-assets.ts:57-69` (`express.static(themeDir)`, unscoped to any subpath, same-origin as `/api/admin/*`)

**Description:**
`d822d87` (2026-08-12, "close the sourceDir XSS gap the narrower allowlist alone didn't") fixed a real,
verified `.svg`/`.html`/`.js` XSS — but only for the location `isInsideCompiledSourceDir` covers: a
compiled theme's `build.sourceDir`. That fix deliberately did **not** touch `TEXT_READABLE_EXTENSIONS`,
`ASSET_EXTENSIONS`, or `READ_ONLY_GROUPS` — the general `isThemeFileWritable` gate every OTHER write
(every authored theme, which is every theme on disk today; and every non-`sourceDir` location in a
compiled theme) still falls back to. That gate classifies `.svg` as group `"asset"` via `fileGroup`
(explore.ts:174-182), and `"asset"` has never been in `READ_ONLY_GROUPS`. `.svg` is also unconditionally
in `TEXT_READABLE_EXTENSIONS`. So `isThemeFileWritable(".../anything.svg")` is `true` everywhere except
inside a compiled theme's `sourceDir`.

This is not an inference — it is stated outright by the codebase's own commit message (`d822d87`: "an
`.svg` asset with embedded `<script>` was already writable into ANY theme's (any tier's) plain asset
folder ... and is still writable after it") and by `theme-static-assets.ts:29-34`'s header, and even
named in the existing test suite's own test title
(`explore-built-theme-gate.test.ts:177`: "even though those extensions ARE writable elsewhere in a
theme"). The comment reads as an accurate observation here, not an inference dressed as fact (the
[[feedback_verify_claims_in_code_comments]] concern) — it was independently reproduced below.

**Exploit path (verified with a real HTTP request against the real routes, not code-reading alone):**
1. An authenticated principal holding `theme.set` for a workspace (the only permission gating Explore —
   granted to any non-owner role that can touch presentation, not just the workspace owner; see the
   identity/RBAC catalog) sends:
   `PUT /api/admin/v1/workspaces/{ws}/themes/{themeId}/file`
   `{ "path": "assets/evil.svg", "content": "<svg xmlns=...><script>...</script></svg>" }`
2. `isThemeFileWritable("assets/evil.svg")` → `true` (text-readable, group `"asset"`, not read-only) →
   write succeeds, 200.
3. Anyone (no auth required — `theme-assets` carries no auth middleware) requests
   `GET /theme-assets/{themeId}/assets/evil.svg` and receives the file back with
   `Content-Type: image/svg+xml` and the `<script>` byte-for-byte unescaped. A direct navigation to that
   URL (e.g. a link an admin clicks, a `window.open`, an `<iframe>`/`<object>` embed elsewhere in the
   product) executes it in the page's own origin — the same origin `/api/admin/*` lives on.
4. Session cookies are `HttpOnly`/`SameSite=Strict`/`Secure` (`dev-auth.ts:75-79`), so the script cannot
   read the cookie directly — but `SameSite=Strict` does **not** stop the browser attaching it to
   same-origin requests the script itself issues, because this is same-origin, not cross-site. A script
   running at `/theme-assets/{themeId}/evil.svg` can `fetch("/api/admin/v1/...", {credentials: "include"})`
   with full ambient authority of whoever's session is active in that tab — i.e. this is same-origin
   session riding, not merely a cookie-theft-blocked "self-XSS."

**Why this is CRITICAL, not just High:** the "ANYONE can author themes" trust model (priority #2 in this
pass) means an untrusted third-party theme package can ship this payload already sitting in its own
`assets/` folder — no Explore write needed at all, just installation. The first admin who opens that
theme in Explore, or any visitor who is served a link to the theme's own asset path, runs it. This
crosses from "an authenticated editor can XSS themselves" to "an untrusted theme publisher can plant
persistent same-origin script that executes for whoever the product later points at that URL."

**Regression test (committed, passing, demonstrates the live gap):**
`src/server/routes/admin/themes/__tests__/explore-svg-xss.test.ts` — PUTs `assets/evil.svg` with an
embedded `<script>` on an ordinary authored theme (200), then GETs it back through the real
`registerThemeStaticAssets` mount and asserts `Content-Type` contains `svg` and the body is byte-for-byte
the unescaped payload. Committed at `2e5d4c5`.

**Is the `.svg` class actually closed? NO.** Only the `sourceDir` instance is closed. The general,
far-more-common path (every authored theme, which is every theme on disk today) is open exactly as it
was before `3d36d44`/`d822d87`.

**Mitigation:**
Apply the same disjoint-rule treatment `d822d87` used for `sourceDir`, generally: either (a) remove
`.svg` from `TEXT_READABLE_EXTENSIONS`'s WRITABLE side everywhere (keep it text-*readable*, drop it from
what `isThemeFileWritable` accepts — i.e. add `"asset"` to a narrower "actively-dangerous-if-served"
exclusion distinct from the content-editing `READ_ONLY_GROUPS`), or (b) — the pattern already proven to
work in this exact codebase — sanitize/neutralize `<script>` and event-handler content at write time the
way `media/original.ts` neutralizes it at *read* time for uploaded media (content-sniff + force
`application/octet-stream` + `Content-Disposition: attachment` + `X-Content-Type-Options: nosniff` for
any sniffed `text/html`/`image/svg+xml`). Given `theme-static-assets.ts` is a blanket `express.static`
mount with no per-file inspection, (a) is the smaller change: forbid `.svg` (and re-confirm `.html`/`.js`
stay excluded, which they already are via `script`/`pages`... — `.html` at top level is `"partial"`,
NOT read-only either, same gap) from `isThemeFileWritable` everywhere, not just in `sourceDir`.

**Related, same root cause, same severity — also PROVEN:** a **top-level `.html` file** (`fileGroup` only
classifies `.html` as `"partial"` when it has no `/` in its path — see explore.ts:179) is likewise
writable via the general gate outside `sourceDir`, and `.html` served by `express.static` gets
`text/html` directly — an even more direct stored-XSS vector than `.svg`, not covered by `d822d87` at all
outside `sourceDir`. Proven by the second test in the same file: `PUT { path: "custom.html", content:
"<script>...</script>" }` on an authored theme → 200, served back at `/theme-assets/{id}/custom.html`
with `Content-Type: text/html` and the script unescaped.

**Human sign-off required:** Yes (Critical, XSS, no clear one-line mitigation without touching the
allowlist contract Explore's UI depends on for "what can I save").

---
