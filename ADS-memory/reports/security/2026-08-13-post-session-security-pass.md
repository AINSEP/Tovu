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

## Summary

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| 1 | **Critical** | `.svg`/`.html` stored XSS survives `d822d87` outside a compiled theme's `sourceDir` | **PROVEN, then FIXED 2026-08-12** — see FIX addendum in Finding 1 below |
| 2 | **High** | Agent Plugins tenant isolation is caller convention, not enforced by the layout type | **PROVEN as architectural gap**; not network-reachable today (no caller wired) |

Five priority surfaces (archive extraction, deployments/GitHub SSRF, commerce checkout/webhook,
storefront XSS omission, static-asset re-judgment, capability/tool-execution boundary) were reviewed in
full and found either sound or not currently exploitable — see their own sections below for what was
specifically checked and why. A recurring pattern across this session's NEW feature slices (Agent
Plugins, deployments, commerce checkout/webhook) is real: each is well-hardened on its own terms but has
**zero HTTP route or agent-tool caller wired yet** — confirmed by grep, not assumed, for each one
individually. That is why Finding 2 is High rather than Critical, and why several sections below end
"no live exploit, re-check the day a route lands" rather than "clean."

**Is the `.svg` XSS class actually closed? No — only the one location the previous session's fix
targeted (`build.sourceDir`) is closed. Finding 1 is the same class, still open, in the far more common
location (every ordinary theme).**

---

## Findings

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

## FIX addendum (2026-08-12) — Finding 1 closed, team-lead-authorized

**Fix chosen: serve-side, not write-side.** `isThemeFileWritable`/`TEXT_READABLE_EXTENSIONS`/
`ASSET_EXTENSIONS`/`READ_ONLY_GROUPS` are UNCHANGED — `.svg` and top-level `.html` stay exactly as
writable as before this fix; theme authoring is unaffected. New shared middleware,
`src/server/middleware/theme-content-security-headers.ts`, sets `X-Content-Type-Options: nosniff` and
`Content-Security-Policy: default-src 'none'; sandbox` on every response served by theme-file mounts.
`sandbox` (no `allow-scripts`) disables script execution for any document a browser would construct FROM
the response — direct navigation, `<iframe>`, `<object>`/`<embed>` — regardless of extension, while
`<img src>`/`<link rel=stylesheet>`/`<script src>` sub-resource fetches are completely unaffected (those
are governed by the REFERENCING page's own CSP, never the fetched resource's own headers). This is a
blanket, mount-wide policy, not a per-extension allowlist — there is no branch to narrow, so it cannot
repeat `d822d87`'s "narrowed one side of an OR, the other side still admits" mistake.

**Enumeration performed before implementing (per the team lead's explicit requirement):**
- Write-side: `isThemeFileWritable`/`isInsideCompiledSourceDir`/`isSourceDirWritableExtension`
  (explore.ts PUT), `resolveThemeFileWriteScope` (ADR-020 generated-tree check), the rename route's
  inline `sourceRenamable` check, and the copy route (copies existing, already-vetted bytes only — no
  new content introduced, left unchanged).
- Serve-side: `theme-static-assets.ts` (`/theme-assets/…`) — the one this report's original Finding 1
  named — AND `theme-preview-static.ts` (`/theme-preview/…`), a SECOND, independent `express.static`
  mount found during this enumeration, serving a theme's `preview/` build output, previously untested
  and independently vulnerable to the identical class. `theme-page-preview.ts` (`/theme-explore/…`) was
  reviewed and is a different mechanism (renders through the real theme loader, not a raw file serve) —
  out of scope for this vulnerability class, left untouched.
- **A related gap found during enumeration, also closed:** `isGeneratedThemePath` (theme-files.ts)
  already excluded `preview/` from the Explore file LIST, but PUT never consulted it — the list filter
  and the write gate were two independent predicates that had drifted apart, so `preview/evil.svg` was
  writable despite being hidden from the UI. Closed in `isThemeFileWritable` and the rename route's
  inline check, so both gates now agree.

**Options considered and rejected** (full reasoning in `theme-content-security-headers.ts`'s own header):
sanitizing content at write time (SVG XSS sanitization is a long-running, evasion-prone problem with no
vetted library in this codebase, and would need to handle arbitrary author HTML for the `.html` case
too); isolating theme-asset serving on its own origin (architecturally correct long-term, but needs new
DNS/TLS/deployment infrastructure out of scope for this pass); banning `.svg`/top-level `.html` from the
write allowlist (explicitly rejected by the team lead — real theme assets, and unnecessary once the
actual risk is removed).

**Red-before/green-after, verified explicitly:** the rewritten `explore-svg-xss.test.ts` (3 tests
asserting the fixed behavior) was run against the pre-fix code and failed all 3 with `expected a
sandboxing CSP directive, got ""` — committed at `10900da` in that failing state. The fix landed in the
next commit (`d01e142`); re-running the identical tests against post-fix code passes all 3, plus a 4th
(`preview/` write-gap) and 2 new tests for the `theme-preview-static.ts` mount (`theme-preview-static.test.ts`,
committed alongside the 4th test at `c63efbe`, also verified red beforehand). 32/32 in the full scoped
suite (`theme-static-assets.test.ts`, `theme-preview-static.test.ts`, `explore-built-theme-gate.test.ts`,
`explore-svg-xss.test.ts`) pass at HEAD. No existing test was weakened or deleted.

`npx tsc -p tsconfig.json --noEmit`: zero errors attributable to any file this fix touched (confirmed by
grepping the touched filenames out of the full error list). A concurrent agent's in-progress,
**uncommitted** taxonomy refactor (`content-lookup.ts` and others showing `D` in `git status` at the time
of this check) transiently breaks `createApp()`'s import chain and therefore the LAST few tests in
`theme-static-assets.test.ts` plus `tsc`'s taxonomy-route output — verified NOT attributable to this fix
by checking the committed HEAD directly (`git cat-file -e HEAD:src/features/taxonomy/content-lookup.ts`
→ exists; `git show HEAD:.../tool-registrations.ts` → correctly imports it) — this is the other agent's
working tree, not this repository's committed state.

**Commits:** test (RED) `10900da`, fix `d01e142`, test (RED, second gap + new mount coverage) `c63efbe`
— test-before-fix ordering preserved in git history as requested, even though the second gap's test and
its fix were verified red→green locally before either was committed.

---

### FINDING 2 — HIGH — PROVEN (as an architectural gap; UNPROVEN as a live network exploit today) — Agent Plugins tenant isolation is caller convention, not enforced by the layout type or `installAgentPlugin`

**Type:** Broken access control / confused deputy (CWE-441-adjacent) — missing self-consistency check on
a security-load-bearing value object
**Component:** `src/features/agent-plugins/layout.ts`, `src/features/agent-plugins/install.ts`
**Affected files:**
- `src/features/agent-plugins/layout.ts:78-92` (`AgentPluginWorkspaceLayout` — no `workspaceId` field, no tag back to the instance root it was derived from)
- `src/features/agent-plugins/install.ts:165-220` (`installAgentPlugin` uses `layout.packages`/`layout.staging` directly, with no re-derivation or containment check against any expected workspace or instance root)

**Description:**
The 2026-08-12 tenant-isolation redesign (`layout.ts`'s own header) states the guarantee is true "by
construction": *"there is no shared enumerable path, so there is nothing to leak through."* That is true
of the PATHS `forWorkspace()` computes when called correctly. It is not true of the TYPE those paths flow
through afterward. `AgentPluginWorkspaceLayout` is a plain interface — `root: string`, `packages: string`,
`staging: string`, `pluginDataDir(id): string` — with no field identifying which workspace it belongs to
and no way for `installAgentPlugin` (or any future caller) to verify a given `layout` value was actually
produced by `resolveAgentPluginLayout().forWorkspace(theRequestsOwnWorkspaceId)` rather than hand-assembled,
stitched from two different real calls, or stale from a different request. The existing
`layout.unit.test.ts` and `install.unit.test.ts` only ever exercise the CORRECT-usage path (call
`forWorkspace` once per workspace, use the result immediately) — never what happens when a caller doesn't.

**Exploit path (proven at the unit level against the real `installAgentPlugin`, not a mock):**
1. Two real, disjoint layouts are resolved: `workspaceA = instanceLayout.forWorkspace(idA)`,
   `workspaceB = instanceLayout.forWorkspace(idB)`.
2. A caller-side bug (wrong variable capture, a stale layout cached against the wrong request, a future
   code path that assembles the object by hand instead of calling `forWorkspace`) produces
   `{ root: workspaceA.root, packages: workspaceB.packages, staging: workspaceB.staging, pluginDataDir:
   workspaceA.pluginDataDir }` — a value that type-checks as `AgentPluginWorkspaceLayout` with no error.
3. `installAgentPlugin({ ..., layout: thatObject })` runs to completion with no error and publishes the
   archive into **workspace B's real, on-disk package store** — proven by reading
   `workspaceB.packages/<digest>/plugin.json` back afterward.
4. A second test shows the floor is even lower: a `layout` never derived from `forWorkspace` at all
   (arbitrary strings pointing outside `infra/agent-plugins` entirely) is accepted identically —
   `installAgentPlugin` has no notion of "is this even a real Agent Plugins root."

**Why HIGH and not Critical, and why the exploit path is honestly UNPROVEN over the network today:**
`installAgentPlugin` has zero callers anywhere in `src/` (confirmed in the P2 finding below) — no route,
no agent tool. There is currently no way for an external request to reach this function at all, so there
is no live, network-triggerable instance of "workspace A's request writes into workspace B's tree" today.
What IS proven is that the function itself provides no defense against it — the day a route or agent tool
is wired (which the owner's "anyone can author plugins" decision implies is coming), the isolation
guarantee will depend ENTIRELY on that new caller getting `forWorkspace(req-authenticated-workspaceId)`
right, with nothing in `installAgentPlugin` or the type system catching a mistake. Rated High rather than
Critical specifically because of that unreachability; it should be re-rated Critical the moment a caller
is wired, unless the mitigation below lands first.

**Regression test (committed, passing, demonstrates the gap):**
`src/features/agent-plugins/__tests__/unit/install.unit.test.ts` — two new tests, "PROVEN GAP: a layout
literal stitching workspace A's `packages` onto workspace B's `staging`..." and "PROVEN GAP: a layout
never derived from forWorkspace() at all...". Committed at `72a8537`.

**Mitigation:**
Give `AgentPluginWorkspaceLayout` a way to prove its own provenance — the cheapest version: an opaque,
non-enumerable `workspaceId` (or a branded/nominal marker) carried on the object, and have
`installAgentPlugin` assert `layout.workspaceId === expectedWorkspaceId` (passed alongside `layout` by
the caller, sourced from the authenticated principal's own request context — never from the object
itself, which a hand-built literal could fake identically). A stronger version: have
`installAgentPlugin` independently re-derive the expected `packages`/`staging` paths from
`resolveAgentPluginLayout()` + a caller-supplied `workspaceId`, and assert `layout.packages`/`layout.staging`
equal what it independently computed — turning "trust the object" into "verify the object," the same
shift `resolveThemeFilePath`'s `realpath`-based re-checks (Finding 1's neighborhood) already apply for
filesystem containment.

**Human sign-off required:** Yes (High; also flag for follow-up the moment any route/agent-tool wiring
for Agent Plugin install is proposed — this finding's severity is contingent on that wiring, not fixed).

---

## FIX addendum (2026-08-13) — Finding 2 closed

**Independent re-verification of Finding 1 first (continuation agent, before touching Finding 2):** ran
`explore-svg-xss.test.ts` (4 tests) and the two `theme-*-static.test.ts` middleware files (12 tests)
directly — all 16 pass at HEAD. Independently re-enumerated every mount that serves a theme's raw files
(`grep`'d `express.static`/`sendFile`/`createReadStream` across `src/server`, not trusted from the
addendum's own list) and found exactly the same two: `theme-static-assets.ts` and
`theme-preview-static.ts`, both wired through `themeAssetSecurityHeaders` before `express.static` runs,
unconditionally. Confirmed `explore.ts`'s file-content GET route only ever `res.json()`s (never raw
bytes with a sniffable content-type), and confirmed `theme-page-preview.ts` is genuinely a different
mechanism (renders through the real `renderStaticPage` loader, not a raw file serve) — the prior agent's
call on both stands, independently re-derived rather than accepted on trust. The `.svg`/`.html` XSS fix
holds.

**Fix chosen for Finding 2: structural, not conventional.** `installAgentPlugin` no longer accepts a
pre-resolved `AgentPluginWorkspaceLayout` at all — it now takes the instance-level `AgentPluginLayout`
plus one `workspaceId`, and calls `layout.forWorkspace(workspaceId)` itself, exactly once, internally.
There is no longer any workspace-shaped parameter for a caller to stitch together from two different
`forWorkspace()` results. Considered and rejected: (a) a branded/opaque `workspaceId` field carried on
`AgentPluginWorkspaceLayout` plus an equality check inside `installAgentPlugin` — works, but still
accepts a workspace-shaped value as input, leaving a stitched-object surface to defend against with an
equality check that could itself be gotten wrong (e.g. forgetting to compare one field); (b) a runtime
assertion that re-derives and compares `packages`/`staging` against an independently-resolved value —
same weakness as (a), plus doubles the resolution work. The chosen design removes the confusable value's
entry point entirely rather than validating it after the fact, matching the "factory that is the only
way to construct a layout" option named in the dispatch.

**Two-proof closure, not one:** each of the two negative tests in `install.unit.test.ts` now proves
closure two independent ways — (1) a compile-time `@ts-expect-error` showing honest TypeScript usage
cannot construct the old exploit call anymore, verified load-bearing by direct `tsc` invocation with the
project's own compiler options (this repo's `tsconfig.json` excludes `**/__tests__/**`/`*.test.ts`, so
this is not gate-enforced by `npm run typecheck` today — confirmed by inspection, flagged rather than
assumed); and (2) a cast-bypassed runtime call (`as unknown as AgentPluginLayout`) proving that even a
caller who defeats the type system gets a hard `TypeError` (`forWorkspace is not a function`) instead of
silent cross-workspace publication, since the hostile object was never produced by the real resolver.

**How the negative test was changed, explicitly:** the two tests that used to be named "PROVEN GAP" and
assert the exploit *succeeds* (`installed.packageRoot` lands in workspace B's tree, bytes readable back
from workspace B's real store) are now named "CLOSED" and assert the *identical* hostile object literals
(unchanged, so this is still evidence against the same exploit attempt) now fail both ways described
above. Nothing was deleted or weakened — the exploit construction is preserved verbatim; only the
expected outcome changed, deliberately, to match the fixed behavior.

**Explicitly NOT claimed closed:** a caller could still hand `installAgentPlugin` a fully-fabricated
`AgentPluginLayout` whose own `forWorkspace` implementation is malicious (returns mismatched paths on
purpose). That is no longer "stitching two real, already-resolved values together" — the demonstrated
bug class this fix targets (wrong variable capture, a stale cached layout, hand-assembly for
convenience) — but "reimplementing the trusted resolver itself," a materially more deliberate act, and
carries the same residual trust every caller-supplied port in this module already has (`archiveReader`
is equally free to lie about archive contents). Recorded here rather than silently assumed away.

**Red-before/green-after, verified explicitly:** the two rewritten tests were committed first in a
state that fails against pre-fix `install.ts` (`AssertionError: Missing expected rejection` — the
hostile layout is silently honored, exactly the original gap) — committed at `febb2a8` with only that
one file staged (`git diff --cached --stat` verified before commit). The fix landed in the next commit,
`3bd2101`, alongside the necessary mechanical call-site updates to `yauzl-archive-reader.unit.test.ts`
and `agent-plugin-pipeline.integration.test.ts` (signature change, no behavior change) — re-running the
same two tests afterward passes, and the full `agent-plugins` test tree is 78/78. `installAgentPlugin`
still has zero callers in `src/` (unchanged by this fix) — this is what kept the fix cheap: no call site
to migrate.

`npx tsc -p tsconfig.json --noEmit`: zero errors attributable to `agent-plugins`.

**Commits:** test (RED) `febb2a8`, fix (GREEN) `3bd2101`.

---

## FIX addendum (2026-08-13, round 2) — Finding 1's `preview/` write gate: two more instances found and closed

**Scope of this round:** the team lead asked for narrower re-verification of the already-shipped Finding
1 fix — was there a third raw-serving mount, could the CSP be bypassed, and was the `preview/` write gap
*actually* closed (not just tested). All three were checked directly against running code, not by
re-reading the addendum's own claims.

**1. Third serving path — none found.** Repo-wide `grep` for `express.static`/`sendFile`/
`createReadStream`/`.pipe(res)`/`res.end(Buffer…)` across `src/server` turns up exactly the two mounts
already fixed (`theme-static-assets.ts`, `theme-preview-static.ts`) plus `admin-static.ts`'s SEA-asset
serving (trusted build artifact, not theme/user content — out of scope). `theme-page-preview.ts`
(`/theme-explore/…`) re-confirmed as a different mechanism: it renders through the real
`renderStaticPage`/`renderStaticPartial` loader, never raw file bytes. Checked every OTHER
`app.get`/`app.post`/`res.type(...)` in `src/server/routes` for anything that could stream theme file
content back to a client under a different name (a "download"/"export" idea) — the one real hit,
`routes/admin/marketplace/download.ts`, is POST-only and returns `res.json()` with metadata
(`assignedId`/`tier`/`lineage`); it triggers `downloadMarketplaceTheme`'s server-side directory copy, but
never streams bytes to the response. No third path exists.

**2. CSP bypass — none found for the actual vulnerability class; one inert, previously-undocumented
fact found and refuted.** Tested empirically (a scratch test app hitting the real
`registerThemeStaticAssets` mount), not merely reasoned about:
- 200 and 206 (Range) responses both carry the full `Content-Security-Policy: default-src 'none';
  sandbox` + `X-Content-Type-Options: nosniff` — confirmed by direct request/response inspection.
- Could not force a genuine 304 through the test harness (fetch/undici's conditional-request handling
  didn't trigger one), but a 304 carries no body by protocol definition — there is no fresh
  content-bearing response for altered headers to matter on, so this gap in the test harness doesn't
  leave a gap in the security property.
- Middleware ordering: `themeAssetSecurityHeaders` runs FIRST and unconditionally inside each mount's
  own `app.use(path, themeAssetSecurityHeaders, handler)` registration; nothing in `app.ts` inserts
  anything between those two specific functions. Confirmed no GLOBAL header-touching middleware exists
  anywhere in `app.ts` (`applyDevCors`/`applySiteServingGate`, the only two `app.use`-with-no-path
  middlewares, touch CORS/503-gating only, never CSP/nosniff). Directly tested the "a later global CSP
  middleware gets added someday" scenario by registering one after the mount in a scratch app — it never
  ran for a successfully-served file, because `express.static` fully answers a matched request (calls
  `res.end()`, never `next()`), so nothing registered after it in the stack can touch that response.
  This is structurally safe, not merely currently-safe.
- **Found and refuted:** Express's own built-in `finalhandler` (which generates the default "Cannot GET
  …" page for any request that falls through every registered route) OVERWRITES the CSP header on ITS
  OWN generated 404 page — `res.getHeader('content-security-policy')` on that specific response comes
  back `"default-src 'none'"`, missing the `; sandbox` suffix our middleware set. This is real and
  reproducible, not a test artifact (confirmed for both an unknown-theme-id 404 and a
  known-theme/missing-file 404). It does NOT reopen the vulnerability: (a) the 404 page's body is
  Express's own static HTML template, never the requested theme's file bytes — a 404 means no such file
  was served, which is the opposite of the exploit precondition; (b) the reflected request-path segment
  stays percent-encoded in the echoed `<pre>` block (verified with a literal `<script>` payload —
  `%3Cscript%3E…`, never decoded to a live tag) — no reflected-XSS angle either; (c) `default-src 'none'`
  alone, per CSP semantics, already blocks inline script execution as a fallback for `script-src`, so
  even the narrower header still prevents the one risk that matters. Recorded here for completeness
  (this codebase's own convention is to state what was checked and found safe, not only what was
  broken), not flagged for a fix.

**3. `preview/` write gate — was NOT uniformly closed. Two more instances found and closed this round.**
The original fix added an `isGeneratedThemePath` refusal to `isThemeFileWritable` (PUT) and to the
rename route's `sourceRenamable` check — but two of the six routes in `explore.ts` were never audited
against this specific question, because they use a DIFFERENT, unrelated write-scope gate
(`resolveThemeFileWriteScope`, the ADR-020 compiled-theme-generated-tree question) that has nothing to
do with `isGeneratedThemePath`/`preview/` and resolves `"editable"` for every non-compiled theme
regardless of path:
- **Copy** (`registerAdminThemeFileCopyRoute`): empirically confirmed a COPY of an already-existing
  `preview/dark/index.html` returned 200 and created `preview/dark/index-1.html` — a live write into
  `preview/`, matching the addendum's own "list filter and write gate must agree" reasoning that
  motivated the original fix. NOT a new content-injection vector (`copyThemeFile` only duplicates bytes
  already on disk, same directory, same extension — no attacker-supplied content path exists), but a
  real write-gate inconsistency. Closed by adding the same `isGeneratedThemePath` check on the copy
  source, mirroring rename's own `sourceRenamable` pattern (destination is always the same folder as the
  source, so checking the source alone suffices). RED test `18fc5f4`, fix `c8d06fc`.
- **Reset** (`registerAdminThemeFileResetRoute`): empirically confirmed a single-file RESET of a
  `preview/` path reads the theme's own catalog snapshot via `readThemeFile` and writes it straight back
  to the live file with no `isGeneratedThemePath` check — 200, not refused. Also not attacker-content
  injection (the restored bytes come from the theme's own pristine catalog, not request input), same
  nuance as copy. Closed the same way, placed after the ADR-020 generated-tree branch (which correctly
  handles compiled-theme whole-release restores already and is unrelated). RED test `b1bd772`, fix
  `b27fcf7`.

All 6 of `explore.ts`'s exported routes now consistently agree on `preview/`: the two read-only ones
(`registerAdminThemeDetailRoute`'s file list, `registerAdminThemeFileGetRoute`) already filtered it out;
all four mutating ones (PUT, copy, rename, reset) now refuse it. 22/22 in the full `admin/themes` test
tree pass; `npx tsc -p tsconfig.json --noEmit` clean for both touched files.

**Verdict on the team lead's three questions:** no third serving path; CSP cannot be bypassed for the
actual vulnerability class (one inert, non-exploitable finalhandler nuance found and refuted); the
`preview/` write gate was NOT actually fully closed as claimed — two more instances existed and are now
fixed in this round.

---

### Note — XSS in rendered output (priority #4): the `description` omission holds; one dead-but-dangerous template landmine found

**Component:** `src/features/commerce/storefront.ts`, `src/server/http/site/render.ts`, theme `.liquid` templates

**The `product.description` omission is verified airtight, not merely asserted.** Traced the full chain:
- `toSiteProduct` (`storefront.ts:92-104`) builds its return object as an explicit field list —
  `id`/`title`/`price`/`compareAtPrice`/`currency`/`specs` — never spreading `input.product`, so
  `description` cannot leak through by accident even if a future field is added to
  `CommerceProductRecord`.
- The render pipeline's OWN single choke point, `siteProductRenderShape` (`render.ts:1673-1683`), which
  is the ONE function that maps `SiteProduct` → every Liquid/Handlebars template's `product`/`products`
  context (both the Commerce-sourced path and the sample `store` plugin path converge here), likewise
  builds an explicit field list with no `description`.
- The regression test (`storefront.unit.test.ts:111-116`) genuinely proves what it claims: it feeds
  `product({ description: "<script>alert(1)</script>" })` through `toSiteProducts` and asserts
  `"description" in result === false` — a real negative assertion, not a smoke test.
- `post.content | raw` (the other `| raw` sink, `entry.liquid` in both `storefront` and `fashion-modern`)
  is likewise verified safe, not merely trusted: `render.ts:1661` sets `content: renderPostBody(ctx)`,
  and `renderPostBody` → `renderDocNode` is a closed `switch` over TipTap node types that maps each to a
  fixed HTML tag with `escapeHtml`'d text and `safeHref`-scheme-checked link `href`s (`render.ts:682` on)
  — there is no default case that passes an unknown node's raw content or attributes through, and no path
  from a database string straight into this output.

**One LOW/UNPROVEN residual finding:** `src/themes/templated/fashion-modern/templates/product.liquid:118`
still contains `{{ product.description | raw }}`. Today this is inert — `description` is never a key on
the object `siteProductRenderShape` hands to Liquid, so the expression evaluates to empty — but it is a
landmine, not a closed gap: the day any future code path adds `description` back onto `SiteProduct` (which
`storefront.ts`'s own header explicitly frames as a "revisit later, once sanitized" item) without ALSO
touching this template line, the XSS the current design carefully avoids reopens immediately, silently,
with no code change needed in the render pipeline itself. Recommend either removing the dead `| raw`
line now (there is nothing for it to render) or converting it to escaped output so a future data wire-up
fails safe by default instead of fail-open.

**Human sign-off required:** No (informational; the live-omission design is sound and independently
verified. Flag the template landmine for cleanup, not urgent).

---

### Note — capability/tool exposure boundary (priority #8): name-visibility and executability stay structurally separate

**Component:** `src/server/modules/assistant.ts`, `apps/admin/src/features/plugins/tool-catalog-composer-source.ts`,
`apps/admin/src/features/plugins/composer-capabilities.ts`, `src/assistant/mcp-ui-tool-calls.ts`,
`src/assistant/mcp-ui-tool-calls-route.ts`, `src/features/post/tool-registrations.ts`

**Verified the boundary holds at three independent layers, not just documented:**
1. **The enumeration route itself cannot execute anything.** `/api/tools` (`assistant.ts:524-526`) is
   mounted with `app.get` only — no `POST`/`PUT`/`DELETE` on that path — so a request that isn't a GET
   never reaches `proxyPassthrough` at all; this is enforced by Express's own routing, not by a check
   inside the handler that could be bypassed. Gated by `requireAdminSession`.
2. **A server-enumerated tool name cannot become a client-side execution binding.** The browser-side
   `ComposerCapabilitySource` built from `/api/tools/search` results (`tool-catalog-composer-source.ts`'s
   `toCapability()`) constructs items with no `resolve` field at all. `ComposerHostBinding`'s `resolve` is
   optional by type (`composer-capabilities.ts:88`), and the ONE capability that does carry a `resolve`
   producing `kind: "allowlisted-tool-call"` (`tool:content-search`, the `/search` item) has its
   `toolName: "content_post_search"` hardcoded as a source-code string literal (`composer-capabilities.ts:264`)
   — never derived from server-returned data. There is no code path from "a name appeared in the
   enumerated catalog" to "that name became callable."
3. **The actual execution call site re-checks the allowlist independently of the browser-facing proxy,
   and says so.** `mcp-ui-tool-calls-route.ts:184` calls `isMcpUiToolCallAllowed(toolName)` immediately
   before touching `SurfaceExchangeStore`/`ToolExecutor`, with an explicit comment: *"Checked again here
   even though Tovu's proxy already checks it, because this route — not the proxy — is the one call site
   that can actually reach `toolExecutor.execute`. A proxy-only check would be a suggestion, not a
   boundary."* This is the correct place to enforce it, and it is enforced there, not only upstream.

**`content_post_search`'s allowlisting is a settled decision (per the dispatch), verified sound rather
than re-litigated:** its handler (`tool-registrations.ts:236-259`) calls
`requireToolPermission(routeDeps, { principalId, permission: "content.read", entityType: "post" })`
before running `searchAdminPosts`, which performs one read-only `SELECT` against the FTS5 index with no
repo save, command gateway, outbox, or bus call — matching the allowlist comment's claim exactly, checked
against the real handler rather than trusted from the comment.

**Jini commits `8e0a437b`/`0d5f25d0`:** reviewed and found unrelated to this boundary — both are
composer-UI async-race-condition fixes (an in-flight host effect no longer silently overwrites live
keystrokes; a slash-command's argument grammar). Neither touches tool registration, execution, or the
allowlist. No finding.

**Human sign-off required:** No.

---

### Note — static asset serving re-judgment (priority #7): `068a4e2`'s call stands, one LOW info-disclosure note

**Component:** `src/server/middleware/theme-static-assets.ts`, `src/themes/templated/*/templates/*.liquid`

The dispatch asked me to independently re-judge `068a4e2`'s decision that making `templates/*.liquid`
SOURCE web-fetchable (e.g. `/theme-assets/fashion-modern/templates/product.liquid`) is "an extension of
an already-accepted exposure," not a new one. Re-derived the claim rather than trusting it:

- **Content-type claim, re-verified:** `express.static`'s `send`/`mime-types` dependency has no MIME
  entry for `.liquid`, so it serves as `application/octet-stream` (confirmed by the existing test,
  `theme-static-assets.test.ts:133-149`, which asserts the content-type contains neither `text/html` nor
  `javascript` nor `svg`). A direct GET cannot execute as a script or render as a document the way
  Finding 1's `.svg`/`.html` case does — this really is a different risk class from Finding 1, not a
  restatement of it.
- **"Already-accepted exposure" claim, re-verified against the actual code, not just the commit
  message:** `theme-static-assets.ts`'s mount was already unscoped to any subpath for the `static` tier
  BEFORE this commit (`express.static(themeDir)` serves the whole folder — confirmed by reading the
  pre-068a4e2 mount logic, unchanged by this commit) — so a static theme's own `pages/*.html`,
  `build.sourceDir` framework source, etc. were already fetchable in full. Widening the SAME mechanism to
  a second theme tier is genuinely the same exposure class extended, not a new one introduced.
- **"Can a Liquid template leak secrets, internal paths, or another tenant's data?" — checked directly
  against the actual template files, not assumed:** read all 7 `.liquid` files across both templated
  themes (`storefront`, `fashion-modern`). No credentials, API keys, or connection strings in any of
  them (grepped for `api[_-]?key|secret|password|token|bearer|private[_-]?key|-----BEGIN` across the
  whole `src/themes/` tree — every hit is a UI label like a login form's "Password" field, not a real
  secret). **"Another tenant's data" does not apply to this mount at all**: `builtInThemesDir()`
  (`deps.ts:144`) resolves theme storage to one filesystem tree for the whole running process
  (`TOVU_THEMES_DIR`, defaulting to the repo's own `src/themes/`), and `ContentRouteDeps.workspaceId` is
  bound once at composition-root time — this codebase's v1 topology is one workspace per running
  process/`content.db` (`deps.ts:494`'s own comment: *"siteId reuses workspaceId for v1's
  single-workspace-per-content.db topology"*). Two DIFFERENT Tovu tenants, per the owner's "one website
  should have nothing to do with another" rule, are two SEPARATE deployments/processes in this
  architecture, not two rows sharing one running server — so there is no cross-tenant read available
  through this one process's `/theme-assets/` mount today. (This is a materially different topology than
  Finding 2/3's Agent Plugins layer, which explicitly designed for one process serving many
  `ws/<workspaceId>/` trees — themes are not built that way.)

**One LOW/UNPROVEN note:** the `.liquid` template comments themselves are unusually rich developer
documentation (by design — this codebase writes evidence-heavy comments throughout) and several
reference the Tovu codebase's OWN internal file paths and approximate line numbers (e.g.
`fashion-modern/templates/product.liquid`'s header: *"Traced directly from `buildTemplateRenderData()`
(src/server/http/site/render.ts ~L1572)"*). This is source-code-structure information disclosure —
useful reconnaissance for an attacker mapping the codebase, though not a secret and not tenant data.
Low severity, and arguably already implied by the product being extensible/inspectable by design; flagged
for completeness since the brief specifically asked about "internal paths."

**Verdict: `068a4e2`'s call stands.** Re-judged independently and reached the same conclusion for
different, individually-verified reasons rather than accepting the prior session's stated justification
at face value.

**Human sign-off required:** No.

---

### Note — commerce checkout + webhook (priority #6): price is server-computed, idempotency/ordering verified correct, signature verification honestly deferred

**Component:** `src/features/commerce/checkout.ts`, `src/features/commerce/webhook-inbox.ts`,
`src/features/commerce/repo.sqlite.ts`

**Price/total is never trusted from the client.** `checkout()` (`checkout.ts:78-133`) takes only
`priceId` + `quantity` from the caller. `price.unitAmountCents` is looked up server-side via
`deps.prices.findById({ workspaceId, id: input.priceId })` — the client cannot supply a price directly —
and `order.totalAmountCents = price.unitAmountCents * quantity` is computed entirely from that
server-fetched value. `quantity` is bounded `1..MAX_CHECKOUT_QUANTITY` (100) and validated as an integer
before use, closing the "unbounded multiplier into a financial figure" class named in the code's own
comment. A price belonging to a different workspace is indistinguishable from nonexistent
(`findById` is workspace-scoped), so there is no cross-tenant price/product read here either.

**Idempotency and ordering, verified against the actual SQL, not just the doc comment:**
`applyProviderEvent` (`repo.sqlite.ts:339-406`) runs two statements inside one `db.transaction`:
1. `INSERT ... ON CONFLICT (provider, eventId) DO NOTHING` — genuine DB-level replay protection (a
   UNIQUE constraint, not an application-level check-then-insert race).
2. `UPDATE commerceOrders SET status=... WHERE id=? AND workspaceId=? AND (providerEventAt IS NULL OR
   providerEventAt < ?)` — a single atomic UPDATE, not a SELECT-then-UPDATE, so "is this event newer"
   and "apply it" cannot race against a concurrent webhook delivery for the same order.

Both mechanisms were traced end-to-end against the real SQL (not merely the file header's prose
description of them) and match exactly what the comments claim.

**Signature verification is honestly absent, not silently missing.** `webhook-inbox.ts`'s own header
states outright: *"Deliberately excludes signature verification... A real provider adapter MUST verify
the request signature before calling this function — `ingestProviderEvent` trusts `event` completely."*
This is accurate, not aspirational: `ingestProviderEvent` has no HTTP route calling it anywhere in
`src/server/` (grepped `applyProviderEvent`/`webhook-inbox` across `src/server/` — zero matches), so
there is no live endpoint today that accepts an unverified webhook body. The gap to track is a REQUIRED
item for whenever a real Stripe-or-other adapter is wired: that adapter must verify the provider's HMAC
signature BEFORE calling `ingestProviderEvent`, since this function has no way to do it itself (it never
sees the raw signing secret, by design — provider-specific).

**Same "not yet reachable" pattern as Findings 2/3/5:** `checkout()` also has no HTTP route caller
(`src/server/routes/site/store.ts`'s own `checkout` call is the unrelated sample `store` PLUGIN's
in-memory demo, not `features/commerce/checkout.ts` — confirmed by reading that route file directly, not
assumed from the name match). Both `commerce/checkout.ts` and `commerce/webhook-inbox.ts` are, like
deployments and agent-plugins, hardened-but-unwired vertical slices from this session.

**Human sign-off required:** No (no exploitable finding). Track as a REQUIRED gate: signature
verification must land before any provider adapter is wired to `ingestProviderEvent` in production.

---

### Note — deployments HTTP chokepoint + GitHub App adapter (priority #5): SSRF-hardened, credentials handled correctly

**Component:** `src/http/client.ts`, `src/http/transport.fetch.ts`, `src/features/deployments/providers/github.ts`

**SSRF defenses, checked against the full dispatch checklist and found sound:**
- `resolvePinnedPeer` (`client.ts:76-119`) explicitly resolves DNS via `node:dns/promises.lookup`
  (never relies on the transport's own resolution) and classifies EVERY resolved address —
  `classifyAddress`/`classifyIpv4`/`classifyIpv6` — against loopback/private/link-local/reserved
  ranges, before any connection is attempted. `169.254.169.254` (cloud metadata) is explicitly covered
  (`a === 169 && b === 254` → `"link-local"`), `0.0.0.0` is covered (`a === 0` → `"reserved"`), and
  IPv4-mapped IPv6 (`::ffff:a.b.c.d`) is normalized to its IPv4 form BEFORE classification — the
  specific bypass that classifying only the IPv6 literal form would miss.
- **DNS rebinding is actually defeated, not just checked-then-hoped:** `transport.fetch.ts`'s
  `requestPinned` connects to `peer.ip` directly (`options.host = peer.ip`, raw `node:http`/`node:https`,
  never `fetch`, which would re-resolve DNS at connect time) while still sending the original `Host`
  header and TLS `servername` for correct virtual-hosting/cert validation. This is the detail that most
  guarded-fetch implementations get wrong — checking a resolved address, then letting the actual HTTP
  library re-resolve the hostname a moment later, reopening exactly the rebinding window the check was
  meant to close. This implementation does not have that gap.
- **Redirects are re-verified, not merely followed:** each redirect hop calls `resolvePinnedPeer` again
  on the new target (`sendWithPolicy` recurses), and `Authorization`/`Cookie` headers are stripped on any
  cross-origin hop (`withStrippedSensitiveHeaders`, `client.ts:121-128, 168-170`).
- Credentials-in-URL (`user:pass@host`) and disallowed schemes are rejected before any DNS lookup.
- `devHostAllowlist` (the one bypass of the private-address check) is a policy field with no production
  construction site found anywhere in `src/` for this session's new deployments surface — it exists for
  test/dev composition, not something a request or workspace config can populate.

**GitHub App adapter — also sound:**
- `sendPinned` (github.ts:98-106) is the sole `http.send` call site and hard-pins the origin to
  `https://api.github.com`, independent of and in addition to the `EgressPolicy` layer — explicitly
  defense-in-depth against "a future workspace-supplied GitHub Enterprise base URL" per its own
  (verified-accurate, not just asserted) comment.
- `githubApiUrl` builds every request via `new URL(path, GITHUB_API_ORIGIN)`, requiring every
  caller-influenced segment (`owner`/`repo`/`installationId`/`providerRunRef`) to be
  `encodeURIComponent`-encoded first. Verified this actually defeats path-based escape: `encodeURIComponent`
  escapes `/` to `%2F` but leaves `.` unescaped, so `"../../app/installations/1"` becomes one literal
  segment `"..%2F..%2Fapp%2Finstallations%2F1"` — no unescaped `/../` sequence exists for RFC 3986
  dot-segment removal to act on, so it cannot resolve outside the intended endpoint. (Moot in practice
  today since `owner`/`repo`/`environmentName` come from an authenticated admin's own target config, not
  cross-tenant input — but correctly implemented regardless.)
- The GitHub App private key never leaves the process (RS256 JWT signed locally, `signGitHubAppJwt`), the
  installation token is minted fresh per call rather than cached (smaller exposure window, explicitly
  disclosed tradeoff), and `sanitizeMessage` strips CR/LF/NUL from GitHub's own response text before it
  ever reaches a `DeploymentError.message` — log-injection-safe. No credential or token value appears in
  any error path traced (`TRANSPORT_ERROR`/`PROVIDER_ERROR`/`PROVIDER_RESPONSE_INVALID` all carry only
  status codes or GitHub's own sanitized description).

**Same "not yet reachable" pattern as Findings 2/3:** `createGitHubDeploymentProvider`/`startRun`/`pollRun`
have no caller outside `src/features/deployments/` itself — no admin route, no scheduled job, no webhook
handler triggers a real deployment run yet. The commit's own message calls this "first vertical slice."
This does not change the code-quality assessment above (it is correct on its own terms) but means, like
Findings 2/3 above, there is no live network exploit to demonstrate today.

**Human sign-off required:** No (no exploitable finding; both the guarded client and the GitHub adapter
pass the full SSRF/credential checklist on inspection).

---

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
opinion on where the caller gets it from). This is also why Finding 2 above is rated High, not Critical.

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

## Surfaces reviewed and found clean (or not currently reachable)

For the owner's benefit, distinguishing "checked and sound" from "not checked at all":

- **Media upload/serving** (`src/server/routes/admin/media/original.ts`) — content-sniffs bytes at
  serve time regardless of client-claimed type; forces `application/octet-stream` +
  `Content-Disposition: attachment` + `X-Content-Type-Options: nosniff` for any sniffed
  `text/html`/`image/svg+xml`. This is the correct pattern Finding 1's fix should borrow from.
- **Public media rendition route** (`routes/site/media-rendition.ts`) — `Content-Type` is derived from a
  fixed transform-format enum (`mimeForTransformFormat`), never from uploaded bytes or client input.
- **Agent Plugins archive extraction** (`install.ts`/`yauzl-archive-reader.ts`/`package-paths.ts`) —
  zip-slip, symlink entries, decompression bombs (single-file and many-small-files), TOCTOU, digest
  verification: all checked against the real code and found correctly implemented (P2 section above).
- **Guarded HTTP egress client + GitHub App adapter** (`src/http/client.ts`, `transport.fetch.ts`,
  `deployments/providers/github.ts`) — SSRF (DNS rebinding, cloud metadata, private/link-local/reserved
  ranges, redirect re-verification), credential handling, and log-injection all checked (P5 section
  above).
- **Commerce checkout pricing** (`checkout.ts`) — price and total are server-computed, never trusted
  from the client; quantity is bounded (P6 section above).
- **Commerce webhook idempotency/ordering** (`repo.sqlite.ts`'s `applyProviderEvent`) — traced against
  the real SQL, not just its doc comment; both guards are genuinely atomic (P6 section above).
- **Storefront `description` XSS omission** (`storefront.ts` → `render.ts`'s `siteProductRenderShape`)
  — traced end to end through the one real choke point; the existing regression test genuinely proves
  what it claims (P4 section above).
- **`post.content | raw`** (`render.ts`'s `renderDocNode`) — a closed AST `switch` over TipTap node
  types with `escapeHtml`/`safeHref` throughout, no default pass-through of unknown content or
  attributes (P4 section above).
- **Tool name-enumeration vs. tool-execution boundary** — verified structurally separate at three
  independent layers, including server-side re-enforcement at the actual `ToolExecutor.execute` call
  site (P8 section above).
- **Theme marketplace "download"** (`marketplace.ts`'s `downloadMarketplaceTheme`) — not an
  archive-extraction or network-fetch surface at all; a validated-id local fixture copy (P2 section
  above).

**Not reviewed / out of scope for this pass:** the admin RBAC/permission catalog itself (`identity`
package, out of this session's commit scope); the widgets/menus rendering path beyond what Finding 4's
sweep covered; any commit outside the stated 2026-08-12 Tovu + 6 named Jini commits window.
