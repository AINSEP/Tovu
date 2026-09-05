# Gemini 3.8 Flash adversarial audit — server / assistant / cli / contracts slice

Scope: everything committed Thu 2026-09-03 and Fri 2026-09-04 under
`apps/website/src/server/**`, `apps/website/src/assistant/**`,
`apps/website/src/cli/**`, `apps/website/src/contracts/**`.

Commit range audited: `5d90b1b5^..04f7bf78` (112 commits touch this slice;
185 files changed under it, 71 non-test source files audited — test-file
diffs were excluded from the source sent to Gemini given the slice's size;
see "Not covered" below).

Orchestrator: this agent. Judge: `gemini-3.8-flash-high` via `agy --print`
(prompt piped through `--print=<text>` — `--print`/stdin alone doesn't work
on this `agy` build, see Method notes), diff-in-prompt (`-U15` context, no
repo tool access, explicit "you have zero tools, don't attempt any" header
required after two failed runs — see Method notes). Every Gemini finding
below was independently verified by this agent by reading the actual current
source file at HEAD before being marked CONFIRMED or DISCARDED.

## Status: COMPLETE — all 4 chunks audited and verified.

## Summary counts

- Chunks audited: 4/4 (A: public-http routes, B: admin-http routes,
  C: assistant module, D: runtime/composition/boot + contracts + cli)
- Findings raised by Gemini: 25
- CONFIRMED (real, reachable, matches current HEAD): 18
- DISCARDED (verified false against current HEAD): 6
- UNVERIFIED (plausible, could not trace reachability without a test run): 1
- Of the 18 confirmed, several were downgraded in severity from Gemini's own
  label once I traced blast radius/reachability/prevalence — noted inline.

**Discard rate was high in Chunk D specifically (4 of 8, 50%)** — every
Chunk D discard traced to Gemini reasoning about a cross-file call (an
import list, a sibling module's resolver function, a same-file helper
defined outside the diff hunk it was shown) that it never actually saw,
because a diff-only chunk cannot show code untouched by this commit range.
This is the single most useful calibration fact from this audit: **treat any
Gemini claim of the shape "X is never imported/defined" or "function Y's
signature is Z" as unverified until you read the real file** — it was wrong
4 times out of 4 attempts at that specific claim shape in this audit.

## THE MOST SEVERE FINDING — read this first, nothing was changed

**Chunk A, Finding 1 (CRITICAL, CONFIRMED)** — a member-gated Page's video
embeds and an entire `bodyFormat: "html"` Page's media (image or video) are
served to anonymous, unauthenticated callers with no gate at all, at the
frozen public media URL. This is a real, currently-shipping authorization
bypass on a production code path. **I made no changes** — audit-only per
the dispatch. Full detail in Findings §1 below; flagging it here per
instructions to surface anything dangerous at the top.

---

## Method notes (useful for whoever runs the next slice)

1. `agy --print --model X --effort Y --print-timeout Z < file` does **not**
   work: `--print` greedily consumes the very next token as its prompt
   argument (it errors "took `--model` as its prompt"), and placing `--print`
   last with nothing after it fails with "flag needs an argument: -print" —
   `--print` is not a boolean flag on this build, it always wants a value.
   Fix: `agy --model X --effort Y --print-timeout Z --print="$(cat file)"`.
   Confirmed working up to a ~160KB prompt string (ARG_MAX is 1MB on this
   Mac).
2. Even with a correct invocation, the FIRST real run returned "no output
   produced — a tool required the mcp permission that headless mode cannot
   prompt for, so it was auto-denied" (exit 0, empty stdout). This machine's
   `agy` has two MCP servers globally registered (`codebase-memory-mcp`,
   `tovu`/Jini) that Gemini tried to reach for tools it wasn't given; the
   permission system correctly auto-denied the call (which is what the
   dispatch wanted — no tool access), but `agy`'s print-mode then produced
   **no output at all** for that whole turn instead of continuing without
   the tool. Do NOT fix this with `--dangerously-skip-permissions` (grants
   tool access, exactly what's prohibited) or by disabling the shared global
   MCP config (affects every other concurrent agent on this machine). Fix
   that worked: prepend an explicit "you have NO tools/MCP/filesystem access,
   do not attempt any tool call, it will silently destroy your whole
   response" paragraph to the prompt. Zero denied-tool-call failures after
   that across all 4 chunks.

---

## Findings, ordered by severity

Each finding: file:line, scenario, why it's wrong, verification verdict.

### CRITICAL

**1. [CHUNK A] `apps/website/src/server/inbound/public-http/routes/site/media-rendition.ts:70-122` — member/paid-gated video and HTML-Page media served to anonymous callers with no gate at all. CONFIRMED.**

`resolveMediaAccessDecision` (line 176) gates an asset by finding which
*published* posts reference it (`findPublishedPostsReferencingAsset`, line
101) and, if NONE do, unconditionally returns `{ gated: false, allowed: true }`
(line 185) — the code's own doc justifies this as "nothing to gate on: freshly
uploaded, or only in a draft." That reasoning only holds if "no referencing
post found" reliably means "no post embeds this asset." It doesn't:

- `findPublishedPostsReferencingAsset` finds references by calling
  `collectImageAssetIds(post.bodyJson, ids)` (line 118), which recurses the
  TipTap doc tree and only ever collects a node where `node.type === "image"`
  (line 76). There is no TipTap "video" node in this codebase — I confirmed
  by grep that video/media assets are referenced exclusively through the
  `data-embed-type="media"` widget-embed mechanism (`render.ts`'s
  `renderWidgetMediaImage`, dispatching to `renderVideoTag` for
  `contentType.startsWith("video/")`), a completely different scan path that
  `collectImageAssetIds` never touches.
- `PostRecord.bodyJson: JsonObject` is non-nullable (`post.ts:26`) but for a
  `bodyFormat: "html"` Page (a real, distinct row kind confirmed at
  `post.ts:12-19` — `PostKind = "post" | "page"`, `PostBodyFormat = "doc" |
  "html"`, same table, same `memberAccessJson` gating field) the real content
  lives in `bodyHtml`, which `collectImageAssetIds` never reads at all.

So: any video embedded anywhere (doc-format post or HTML-format Page), and
literally every embed of any kind (image or video) inside a `bodyFormat:
"html"` Page, is **invisible** to the reference scan. `referencingPosts`
comes back empty, and `resolveMediaAccessDecision` returns `allowed: true`
regardless of the containing post/page's own `memberAccessJson` visibility
(`"members"`/`"paid"`). The gate at `sendMediaRenditionResult`'s
`if (!access.allowed)` (line 234) and `registerMediaOriginalVideoRoute`'s
identical check (line 369) can never fire for these assets. An anonymous
caller who knows (or brute-forces) the assetId gets the real bytes at
`/m/:assetId/original` or `/m/:assetId/{transform}.v{n}/x.ext` — for a
members-only or paid-tier Page's video, or ANY media on an HTML-format Page,
with no session, no cookie, nothing.

**Verification:** read `media-rendition.ts` in full, `post.ts` (confirmed
`PostKind`/`PostBodyFormat`/`bodyJson` non-nullable), grepped for a TipTap
video node type (none exists) and confirmed the `data-embed-type="media"`
widget path in `render.ts:1790-1840` is the actual video-embed mechanism,
entirely separate from `collectImageAssetIds`'s TipTap-only walk.

**Not a known/accepted issue** — the 2026-09-05 SSRF-classifier fix and the
member-RBAC-decorative fix (7fb47f55) named in the dispatch are unrelated to
this gap; this is a fresh finding.

---

### HIGH

**2. [CHUNK A] `media-rendition.ts:108` (draft-status exclusion) — unpublishing a previously-gated post to take it down instead makes its media permanently public AND CDN-cached forever. CONFIRMED.**

`findPublishedPostsReferencingAsset` skips any post where
`post.status !== "published"` (line 108) — the doc comment explicitly
defends this for a NEVER-published draft ("its content is never served any
other way either, so excluding it opens no new leak"), which is sound. It
does not hold for a post that WAS published and gated, then reverted to
draft to take it down: the asset was previously reachable at a KNOWN url
(anyone who viewed the gated content while it was live knows the assetId),
and once unpublished, `referencingPosts` goes empty -> `gated: false` ->
line 282's cache header flips from `private, no-store` to `public,
max-age=31536000, immutable`. The takedown not only fails, the CDN now
caches the "removed" asset for a year. Confirmed by reading the same
function and the cache-header line.

**3. [CHUNK D] `apps/website/src/server/runtime/composition/deps.ts:918-943` — dev-capability origin hardcodes `scheme: "https"` regardless of whether dev TLS is actually active. CONFIRMED, MEDIUM-HIGH not CRITICAL (dev/CI-only).**

`seedDevCapabilityOrigin` seeds `createVerifiedOrigin({ scheme: "https", host: "localhost", port: 3000, ... })` unconditionally; nothing reads `resolveDevTls(...).active` or calls the very `deriveDevScheme` helper this same window's own `dev-tls.ts` introduced for exactly this purpose (confirmed both functions exist, and confirmed the seed call never references either). `dev-tls.ts`'s own doc discloses TWO real, current, non-hypothetical paths where the API dev server runs plain HTTP: (a) "a fresh clone with no certs... boots exactly as it did before" and (b) `TOVU_DISABLE_DEV_TLS`, which that same doc says "every hermetic Playwright `webServer` under `development/*.config.ts` does." In both cases, every URL this origin registry feeds (SEO canonical tags, newsletter verification links, redirect targets) is stamped `https://localhost:3000/...` while the server only answers on HTTP — those links 404/SSL-error when followed. Downgraded from Gemini's CRITICAL because this only affects dev/test environments, never a real deployed origin (production origins come from `TOVU_PUBLIC_URL`/verified-origin flow, untouched by this seed).

---

### MEDIUM

**4. [CHUNK A] `media-rendition.ts:241` vs `:271` — a gated-and-denied 404 is distinguishable from a truly-nonexistent 404 via `Cache-Control`, defeating the route's own stated goal. CONFIRMED, downgraded from Gemini's HIGH.**
Both paths return the same 404 status + JSON body, but the gate-denied branch sends `Cache-Control: private, no-store` while the not-found branch sends `public, max-age=60` — a byte-for-byte oracle for "this assetId exists and is gated" vs "doesn't exist," which the surrounding comment explicitly says the design intends to prevent. Real, but downgraded to MEDIUM: it leaks existence/gated-status only, not content.

**5. [CHUNK A] `apps/website/src/server/inbound/public-http/http/site/form-render.ts:371` — `setInputValueAttr`'s `\bvalue="[^"]*"/i` regex matches inside any attribute ending `-value`, and never matches a single-quoted `value='...'`. CONFIRMED.**
`\b` is a boundary between a word char and non-word char, not "start of attribute name" — `data-default-value="x"` has `\b` right before `value` because `-` precedes it. A theme author's raw form markup with such an attribute gets it corrupted (silently rewritten) while a real `value=` stays untouched or duplicated. The single-quote case regresses the EXACT bug the surrounding comment says was just fixed for double-quoted values (stale value wins, since browsers honor only the first same-named attribute). Reachability requires a theme's own hand-authored form HTML to use such an attribute — this codebase's own generated form markup doesn't, so likely a THEME-authoring-time risk rather than a common-path bug.

**6. [CHUNK A] `apps/website/src/server/inbound/public-http/routes/site/pages.ts:1328-1335` — the post-previews widget applies its DB `LIMIT` before member-visibility filtering, so a gated-heavy "recent posts" window can show fewer than N previews (or none) even when older public posts exist. CONFIRMED.** Functional/UX bug, not security — same limit-then-filter shape is used elsewhere in this codebase per the code's own comment, so this is a pre-existing pattern extended to a new widget, not a novel defect.

**7. [CHUNK A] `apps/website/src/server/inbound/public-http/routes/content/posts/get-by-slug.ts:81` — the member-gated JSON content API sets no `Cache-Control` at all. CONFIRMED.** Every sibling gated route in this same diff window (`pages.ts`, `media-rendition.ts`) explicitly sets `private, no-store` specifically because the response depends on the caller's session cookie; this route's `res.json(...)` sets nothing, so a reverse proxy/shared cache in front of the origin could legally cache and replay a member-only post's JSON to a later unauthenticated caller. No global middleware sets a default Cache-Control for this path (checked).

**8. [CHUNK C] `apps/website/src/server/inbound/assistant/agent-session-resume.ts:161-166` (`wouldForcedColdStartLoseConversationContext`) — the H2-context-loss guard only fires once a PRIOR turn already stored a session id; it does not cover turn 2 arriving while turn 1 is still in flight (no session id stored yet). CONFIRMED as a real server-side gap; exploitability depends on client behavior I could not verify (out of my slice — `assistant-transport.ts` is `apps/admin`).** If the admin chat UI disables its input while a turn streams, this is unreachable through the intended UI (still reachable via multi-tab/API misuse); if it doesn't, rapid double-submission causes silent conversation-history loss plus two CLI agent processes racing on the same conversation. The function's own doc comment scopes itself explicitly to "a PRIOR turn already established a session" — this is a real gap in that scope, not a misreading of intent.

**9. [CHUNK C] `apps/website/src/assistant/tool-failure-recovery.ts:423-435` (`collectRecoveryDecision`) — attaching an `abort` listener to an already-aborted `AbortSignal` never fires it (correct, well-known JS/DOM semantics: the event only fires at the moment `.abort()` is called). CONFIRMED.** If a run is cancelled at/before the moment recovery starts, `exchange.close()` is never called via this path and `resolveRecoveryDecision` hangs until the exchange's own separate timeout — bounded, not a permanent leak, but real.

**10. [CHUNK B] `apps/website/src/server/inbound/admin-http/routes/database/restore-points.ts:32` — `typeof body.idempotencyKey === "string"` accepts `""`, so a caller sending an empty-string key gets the identical stale restore-point summary back forever instead of a fresh capture. CONFIRMED.** The file's own comment discloses "no caller in this codebase sends idempotencyKey today (the admin UI never does)" — real bug, but currently dormant since nothing exercises the parameter.

**11. [CHUNK D] `apps/website/src/server/runtime/boot/resolve-mailer.ts:101-105` (`parseSmtpEndpoint`) — a portless `https://<smtp-host>` baseUrl defaults to port 443 (and a portless `http://` to port 80), neither of which any real SMTP daemon listens on. CONFIRMED, but this is DISCLOSED, DELIBERATE design, not a silent regression** — the function's own doc explains the operator is expected to always type an explicit port (`https://host:587`) in this credential field, and defends the no-port-means-443 choice explicitly ("rather than silently assuming plaintext submission on 587"). Real residual risk: no legitimate SMTP provider hostname will ever succeed under the "portless https = 443 implicit TLS" default, so an operator who omits the port (plausible if nothing in the admin UI's help text spells out this requirement — I could not check, `apps/admin` is out of my slice) gets a silently-nonfunctional mailer rather than a clear validation error at credential-save time.

**12. [CHUNK D] `apps/website/src/server/runtime/boot/dev-tls.ts:87` — `if (env.TOVU_DISABLE_DEV_TLS) return { active: false };` treats ANY non-empty string as true, so `TOVU_DISABLE_DEV_TLS="false"` or `="0"` disables dev TLS instead of leaving it enabled, inverting the operator's evident intent. CONFIRMED.** This file's sibling in the same commit window, `site-switcher-enabled.ts:24`, correctly parses `raw === "1" || raw === "true"` — the inconsistency is a same-day, same-author pattern miss, not a subtle one.

---

### LOW

**13. [CHUNK A] `apps/website/src/server/inbound/public-http/routes/site/pages.ts` (content-owned homepage render path) — a Page claiming the `"/"` root slug renders through `renderTemplateBranchIfEligible`/`renderGenericPostPage`, both of which hardcode `buildExtraHead(deps, "post", ...)` rather than `"home"`. CONFIRMED for the mislabeled-route-context claim (OpenGraph/schema.org will emit article-type metadata for the site root).** The SECOND half of Gemini's finding — that this also produces a protocol-relative `"//"` canonical URL — is **DISCARDED**: `postPublicPath` (`platform/routing/routing.ts:118`) explicitly special-cases the literal `"/"` slug and returns `"/"`, not `"//"`. I read that function directly; it does not have the bug Gemini described.

**14. [CHUNK B] `apps/website/src/server/inbound/admin-http/routes/forms/{get,delete}-submission.ts:12-13` — `findSubmissionScopedToDefinition` is duplicated verbatim across two sibling route files rather than shared. CONFIRMED** (real copy-paste; genuine divergence risk on a future scoping-rule change) — low severity, no behavioral defect today.

**15. [CHUNK C] `apps/website/src/assistant/admin-screen-link-tool.ts` — the tool's own `path` input-schema description tells the calling model to pass the segment "exactly as it appears... in the URL bar," but `buildAdminScreenPath` only strips a leading slash, not an `admin/` prefix; a model that follows the "URL bar" instruction literally (where the visible path already includes `/admin/...`) produces a broken `/admin/admin/...` link. CONFIRMED** — the schema's own given examples (`'access-tokens'`, `'posts'`) contradict its own "as it appears in the URL bar" instruction, so this is a genuine internal-consistency defect in the tool description, not a misreading.

---

## DISCARDED — verified false against current HEAD (6)

- **[CHUNK A] "llms.ts calls `computeIndexableEntries(deps, deps.workspaceId)` with the wrong argument shape, other domain functions take `(deps, {workspaceId})`."** FALSE. `computeIndexableEntries`'s real signature (`features/seo/sitemap.ts:90`) is `(deps: SeoSitemapDeps, workspaceId: UUID)` — a plain positional string, exactly matching the call site. Gemini invented an analogy to a different calling convention that doesn't apply to this function.
- **[CHUNK B] "restore-points.ts leaks raw `err.message` on 500 while sibling admin routes are careful to sanitize."** The code fact is true, but the framing is false: I grepped and found the identical `err instanceof Error ? err.message : "internal error"` pattern in **32 files** across `admin-http/routes/` (database, entries, recovery, taxonomy, and more) — this is a pervasive, pre-existing, whole-codebase convention, not something this diff introduced or an outlier next to careful siblings. All these routes sit behind `requireAdminSession` + RBAC, which meaningfully changes the severity from "leaking internals to an external caller" (as the audit brief frames the category) to "an already-authenticated admin sees a raw error string." Recording as discarded-as-novel rather than a defect in this diff; a systemic fix (if wanted) is a repo-wide concern, not a two-day-window one.
- **[CHUNK D] "`SqliteDbOpsAdapter` is never imported in `deps.ts`, so `applyAdminPasswordResetFromEnvIfConfigured` throws a `ReferenceError` and crash-loops boot."** FALSE. `SqliteDbOpsAdapter` is imported at `deps.ts:134` and used correctly. Gemini reasoned from the diff hunk's visible import lines (101-109) without the actual full import list, which includes it elsewhere in the same file.
- **[CHUNK D] "`app.ts`'s in-memory `createRouteDeps` never instantiates/imports `OriginRegistry`, so `routeDeps.originRegistry` is `undefined` and `createSeoPageHeadHook` throws."** FALSE. `OriginRegistry` is imported at `app.ts:107` and instantiated at `app.ts:374`, present in the returned deps object at three separate lines (405, 414, 577).
- **[CHUNK D] "`seed.ts`'s `rootDoc` calls `link(...)`, which is never defined, causing a top-level `ReferenceError` on module load."** FALSE. `link` is defined at `seed.ts:56`, well within the file Gemini was shown; Gemini itself hedged this one ("if `link` is not defined... or imported") and the hedge resolves to "it is."
- **[CHUNK D] "seeding `templateChoice: \"page-shell.html\"` (with extension) never matches `LEGACY_TEMPLATE_FILENAME_ALIASES`'s stripped-stem keys (`\"page-shell\"`), so the homepage falls back to the generic diagnostic template."** FALSE. `resolveTemplate` (`features/theme/static-render.ts:803`) strips the `.html` suffix (`choice.replace(/\.html$/, "")`) BEFORE the alias-map lookup — `"page-shell.html"` correctly resolves to `"page-shell"` and then to the alias `"pages-default"`. This function lives outside my audited slice (`features/theme/`), which is exactly why Gemini never saw it and reasoned from the `seed.ts` comment's own prose description instead of the real resolution code.

## UNVERIFIED (1)

- **[CHUNK C] `apps/website/src/assistant/tool-failure-recovery.ts:150` (`remedyReportedFailure`) — claimed to hardcode `output["saved"] === false` and therefore treat `external_mcp_reauth_prompt`'s own outcome shape (`{promptShown, acknowledged}` / `{currentStatus}`) as "succeeded," triggering an unwarranted retry against a dead connection.** The function's own doc comment explicitly scopes itself to three named tools/patterns (`custom_credential_set_token`, `external_mcp_*_save`, S3-publish-credential save) and does not mention the reauth-prompt tool. I traced `EXTERNAL_MCP_REAUTH_PROMPT_TOOL_ID` and `ExternalMcpReauthRequiredError` through `external-mcp-oauth.ts` and `external-mcp-reauth-tool.ts` but could not conclusively find the call site that turns a reauth failure into an `{hint, remedyToolId: "external_mcp_reauth_prompt"}` diagnostic feeding `withToolFailureRecovery`'s retry loop — it may be handled through the "in-chat surface" mechanism the comments allude to instead, which would make this finding inapplicable. Needs either a repo-wide trace of where `ToolFailureDiagnostic.remedyToolId` values are actually constructed, or a live run, to settle.

## Not covered

- Test-file diffs in this slice (114 of the 185 changed files) were not sent
  to Gemini — the source-code diff alone was already ~9,200 lines across 4
  chunks, and the dispatch weighted "bugs/security/slop in source" over test
  quality for a slice this size. No test-quality findings in this report.
- `apps/website/src/contracts/core/entry-refs/extractor.ts` and
  `.../embeds/marker.ts`, and `apps/website/src/cli/commands/theme/{validate,migrate}.ts`
  were included in Chunk D's diff but produced zero findings from Gemini —
  not "audited clean," just nothing Gemini flagged as reaching the bar.
- I did not cross into `apps/admin` to verify client-side reachability
  caveats noted on findings 8 and 11 above (out of this agent's assigned
  slice).
