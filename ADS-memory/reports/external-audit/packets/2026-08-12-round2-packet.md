# External Audit Packet — ROUND 2

## Ask

- **Audit focus:** Compliance pass. Verify the round-1 ledger's `fixed` claims are genuinely resolved in the diff, and audit the new diff for violations it introduces.
- **Scope:** work-log + explicit diff range (self-contained; assume you cannot read the repo unless told otherwise)
- **Suggested changes mode:** notes
- **Audit target:** `12fee53..HEAD` — **36 commits, 159 files, +13,163 / −838**, on top of round 1's audited base.
- **Planned auditors:** `gemini-3.1-pro-high` (agy), `gemini-3.6-flash-high` (agy), `gpt-5.6-sol` @ xhigh (codex), internal Sonnet 5 verifier

## Threat Model & Scope Contract (frozen — UNCHANGED from round 1)

- **Threat model id:** `TM-TOVU-2026-08-12-A` — **unchanged**, so round-1 scores remain comparable. No failure domain, invariant, actor, or non-goal has been added or removed.
- **Audit round:** **2** — diff-only compliance pass.
- **Intended use:** self-hosted CMS. Authenticated admin SPA (`:5173`) + **public unauthenticated site** (`:3000`). Operators author Tiptap JSON (`bodyJson`); a **separate hand-written server renderer** (`src/server/http/site/render.ts`) emits public HTML. Multi-workspace.
- **Allowed actors:** authenticated operator (full CRUD in-workspace under RBAC; may paste arbitrary text/URLs/HTML/images, possibly hostile content copied from elsewhere); unauthenticated public reader (GET only); a second concurrent operator or tab.
- **In-scope blocking failure domains (ALLOWLIST)** — a blocker must map to exactly one:
  1. Unsafe content reaching public HTML (stored XSS, script/CSS/attribute injection, unsanitised operator values served to unauthenticated readers).
  2. Unauthorized exposure (authenticated-only URLs/assets, or another workspace's data, reachable publicly).
  3. Silent content loss or corruption (authored content vanishing, overwritten, or dropped between editor and published page with no error).
  4. Writing to the wrong record (save/delete/state commit landing on a stale or different entity).
  5. Unrecoverable break on normal operator use (crash, hang, infinite re-render, unusable screen).
- **Mandatory invariants:** **I1** sanitiser coverage for everything reaching public HTML, including the unsaved-body preview override · **I2** editor/renderer parity — never silently empty, always at least a visible placeholder · **I3** a superseded request never commits · **I4** preview never persists · **I5** DI/i18n/fetch-query refactors are behaviour-preserving · **I6** no unbounded re-render or repeated fetching.
- **Blocking impact threshold:** reachable by an allowed actor in normal operation, with concrete evidence.
- **Risk tier & score floor:** medium/high → **8.5**.
- **Gate formula:** `blocking_gate = FAIL` iff `(validated unresolved blockers > 0) OR (score < 8.5)`. Independent terms. Coordinator recomputes and rejects a disagreeing gate.
- **Explicit non-goals (unchanged — do NOT score against these):** performance; `useSettingsContainer` remaining unmigrated; the generic embed contract (6 known-failing `render.test.ts` cases assert an unbuilt feature); `fuel` theme's missing template; ~36 pre-existing `TS2348` vitest typing errors; the 4 remaining themes' capability CSS.

## Prior-Round Disposition Ledger

Match by **underlying causal claim and affected surface — not by ID or wording.** A `fixed` claim you cannot verify in the diff is **itself a blocker** (gate-evasion / non-convergence).

| ID | Finding | Disposition | Evidence / rationale |
|---|---|---|---|
| `IV-F1` | **BLOCKER.** `save()` unguarded against stale responses in `use-widget-instance-editor`, `use-widget-region-editor`, `use-menu-editor`; navigate mid-save → commits over the wrong entity → next save writes to the wrong record | `fixed` | `53b8d6f` per-hook staleness refs guarding `then`/`catch`/`finally`; **plus** `6d3e9c4` adds `key=` to all 7 editor mounts in `panels.tsx` so navigation remounts. 3 behavioural tests (save A → switch to B → resolve A last → assert B survives), negatively verified. |
| `IV-F2` | HIGH. `use-post-editor.hooks.ts` has the identical unguarded shape (pre-existing, not diff-attributable) | `fixed` | Covered by `6d3e9c4` — `PostEditor` now mounts with `key={ctx.params.postId}`. |
| `IV-F3` | ADVISORY. Contract-test comment cites `@tiptap/extension-code-block` where `CodeBlockLowlight` is registered | `wontfix` | Cosmetic comment accuracy; no functional or drift-guard effect. Deliberately not spent. |
| `CX-F1` / `GF-F1` / `GP-F1` | "Img by URL" produces content that can never render publicly; all three auditors recommended REMOVING the control | `fixed differently — owner overrode` | Removed in `62314b9`, then **restored** in `ed72704`. Owner's ruling: refusing every `src` is the defect, not the control. `render.ts` now has `safeImageSrc` — an `http(s)`-only allowlist rejecting `javascript:`/`data:`/`blob:`/`file:`, protocol- and root-relative paths, and the authenticated admin media URL — mirroring the `safeHref` pattern already in the same file. Rejected values still degrade to the visible placeholder. **No SSRF introduced: the server never fetches; the reader's browser does.** 4 hostile-input contract rows added. |
| `CX-F2` | HIGH. No evidence of URL-scheme validation for link/YouTube values; no adversarial matrix for new nodes/marks | `out-of-scope — premise refuted` | Packet-limitation, not a code gap. `safeHref` (render.ts) already scheme-allowlists link hrefs; YouTube never emits the operator URL at all (`extractYoutubeVideoId` re-derives the id and rebuilds `youtube-nocookie.com/embed/{id}`). The adversarial-matrix half is **partly actioned**: 4 new hostile-input rows for `image`. Broader matrix not built. |
| `CX-F3` / `GP-F2` | MEDIUM. Effect-local `cancelled` flags cannot cancel a loader invoked from a post-mutation callback; call sites never inventoried by invocation topology | `fixed` | Same as `IV-F1`. Additionally, an inventory found 3 more instances (`collections`, `media`, `comment-settings`) on the `lib/fetch-query` architecture — closed by the `key=` remount rather than 3 more per-hook refs. |
| `CX-F4` | MEDIUM. `/m/{assetId}/public.v1/…` 404s for 25s under the hermetic harness; only covering test is `fixme` | `accepted-risk` | Unresolved. Root cause not isolated; candidate is `infra/uploads` not being `TOVU_DB`-scoped and colliding across concurrent hermetic boots. Still `test.fixme`. |
| `CX-F5` | LOW. `Translate`/`DictionaryTranslator` distinguished only by arity; TS structural typing permits cross-assignment | `wontfix` | Owner decision: `t` stays at call sites, naming the contract surface was the whole intent. Nominal branding judged disproportionate. |
| `GF-F2` | LOW. No AST depth/node-count bound before synchronous `renderDocNode` traversal of a ≤15MB preview payload | `agree-defer` | Agreed and **not done** — the agent carrying it was stopped mid-task for unrelated reasons. Genuinely still open. |
| `GF-F3` | LOW. `useSettingsContainer` left unmigrated | `out-of-scope` | Scored against an **explicit non-goal** in the frozen contract — a protocol violation, rejected on that basis. The underlying `useQueries` suggestion is recorded as a future option. |

## Work Log — what changed since round 1

1. **Audit blocker remediation** (`53b8d6f`, `6d3e9c4`) — as per ledger `IV-F1`.
2. **"Img by URL" removed then restored with a validating allowlist** (`62314b9`, `ed72704`) — ledger `CX-F1`.
3. **YouTube in the raw draft preview** (`62314b9`) — root-caused to `SrcDocSandbox` omitting `allow-same-origin` by design; YouTube's player needs same-origin storage and throws. Fixed by degrading to a labelled placeholder **before** the markup enters the sandbox, leaving the shared sandbox component untouched. Public rendering unaffected.
4. **Mention links 404'd in preview** (`ffd6a15`) — `templatePreviewUrl` returned a bare `/api/...` path; that response loads as a *navigated document*, so the admin origin became the base URI for every relative link inside. Wrapped in the existing `siteUrl()` helper. `/theme-assets/` kept working only because Vite proxies that prefix.
5. **Image rendering** (`af2eb12`) — `renderWidgetPostContent` called `renderDocNode(bodyJson)` with one argument, so `mediaTransformVersions`/`mediaAssetMetadata` defaulted empty and **every ref image** degraded to a filename placeholder on both the public page and the preview. Threaded a media context through.
6. **`lib/fetch-query` migration finished** (`5a04613`, `6877d68`, `761701e`, `3cdb430`, `5209ad4`) — forms, media, comments, integrations, database. 11 features total on the wrapper.
7. **Complexity ceiling** (`c95ac7a`, `d44957d`, `1ae7601`, `ce0acf6`, `d6fa7ce`, `4b17687`) — every `*.hooks.ts(x)` in the admin under 9/9; 4 grandfathered debt-ledger entries deleted. Branching extracted to **top-level exported** functions, which also made it unit-testable without React.
8. **Concurrent unrelated work by another actor** — `src/core/gated-mutations/**`, `src/features/plugins/data-module.ts`, PostgreSQL schema generation (`90ca299`, `56fe89b`, `b1ffc90`, `167a838`, `e56e283`, `69f9b52`, `62426db`, `f0f8f83`). Committed by someone outside this session; included in the diff range for completeness. **Not authored or reviewed here.**

## Files And Artifacts

| Path | Why it matters this round |
|---|---|
| `apps/admin/src/panels.tsx` | The `key=` remount fix — 7 editor mounts. The single-point remedy for the round-1 blocker class. |
| `apps/admin/src/features/{widgets,menus}/hooks/*.hooks.ts` | Per-hook staleness refs on `save()`. |
| `src/server/http/site/render.ts` | New `safeImageSrc` allowlist + the media-context threading. Sole enforcement point for I1/I2. |
| `src/server/http/site/__tests__/tiptap-render-contract.test.ts` | 49 rows incl. 4 new hostile-input image rows. |
| `apps/admin/src/features/posts/PostEditor.tsx` | Restored "Img by URL"; YouTube preview degradation. |
| `apps/admin/src/lib/api.ts` | `templatePreviewUrl` now absolute via `siteUrl()`. |
| `apps/admin/src/features/{forms,media,comments,integrations,database}/**` | The final 5 fetch-query migrations — **I5 territory**. |

## Validation

- **Checks run:** `npm run check:admin-complexity-drift` **clean** (no file outside the 12-entry debt list over 9/9). `tsc --noEmit` — no new errors above the ~36 pre-existing `TS2348` baseline. Contract suite **49/49**. Scoped vitest per feature. Live headless-Chromium verification for the image, YouTube, mention and swatch fixes, including `getComputedStyle` reads and pre/post screenshots. Negative verification (revert → observe failure → restore) on the save-guard, mention-origin, and image-sizing fixes.
- **Checks not run:** no full-suite run; no perf/load testing; no cross-browser; **mutation testing not run at all this session**; the AST-depth bound (ledger `GF-F2`) not implemented.
- **Known caveats:** one e2e is `test.fixme` (ledger `CX-F4`). 6 pre-existing `render.test.ts` failures assert the unbuilt embed contract (non-goal). **A possible new bug was observed once and NOT reproduced or fixed:** inserting a mention immediately after a still-selected YouTube atom appeared to silently delete the YouTube node from persisted `bodyJson`. Flagged for triage; may be an artifact of that click sequence.
- **Process caveat, stated plainly:** verification remains heavily agent-performed. Across both rounds the coordinator independently checked agent claims and found **several materially wrong** — including a complexity-model claim, a component-state count off by ~8×, and a documented microtask-vs-macrotask assertion that was backwards. Weight self-reported evidence accordingly.

## Open Questions

1. `I5` — behaviour preservation across ~62 changed hook files — was declared in round 1 and **never exercised**; the round-1 internal verifier ran out of scope before reaching it. Does the diff show any migration that quietly turned a test assertion into a no-op (e.g. an assertion that would now pass against the pre-migration code)?
2. Does `safeImageSrc`'s allowlist have a bypass? Specifically: userinfo (`https://user@evil/`), embedded credentials, unicode/punycode homographs, or a URL that satisfies the regex but is not the admin-media pattern yet still resolves to an internal host.
3. Does `key=` on the 7 editor mounts introduce a regression — lost in-progress edits on a navigation that previously preserved them, or a remount storm where a key is not stable across renders?
4. Is degrading YouTube only in the raw-preview branch correct, or does the same sandbox limitation silently affect other embed types in that branch?

## Auditor Instructions

_(Standard round-N instructions appended at dispatch: ledger reconciliation by causal claim, diff + minimum-necessary-context scope, diff-causal link required per finding, blocker-before-score, escape valve, single JSON object, floor 8.5.)_
