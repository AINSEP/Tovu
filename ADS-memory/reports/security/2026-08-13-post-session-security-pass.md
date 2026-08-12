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
