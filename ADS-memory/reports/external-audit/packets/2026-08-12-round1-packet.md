# External Audit Packet

## Ask

- **User request:** Audit this session's work on Tovu.
- **Audit focus:** Correctness and safety of a large single-day refactor across a CMS admin app and its public renderer — specifically whether the refactors preserved behaviour, whether the new public-render paths are safe, and whether the concurrency fixes actually hold.
- **Scope:** work-log (self-contained; you cannot read the repo)
- **Suggested changes mode:** notes (downgraded from `patches`: 241 files changed is too broad for safe file-level diffs from a packet-only view)
- **Audit target:** 78 commits on branch `general-work`, `3a3907f..HEAD`, 241 files, +15,753 / −1,921
- **Planned auditors:** `gemini-3.1-pro-high` (agy), `gemini-3.6-flash-high` (agy), `gpt-5.6-sol` @ xhigh (codex), plus one internal Sonnet 5 verifier
- **Authoring packet:** `ADS-memory/.local-artifacts/external-audit/packets/2026-08-12-session-audit-packet.md`
- **Dispatch packet:** inlined to stdin (self-contained)

## Threat Model & Scope Contract (frozen)

- **Threat model id:** `TM-TOVU-2026-08-12-A` — **hash:** `sha256:packet-body-frozen-at-dispatch`
- **Audit round:** 1 (full threat-model pass; no prior ledger)
- **Intended use / deployment context:** Tovu is a **self-hosted CMS**. Two surfaces run from one repo: an **authenticated admin SPA** (Vite, `:5173`) used by trusted-but-fallible operators, and a **public, unauthenticated website** (`:3000`) that serves content those operators author. Content is authored as Tiptap JSON (`bodyJson`) in the admin and rendered to public HTML by a **separate, hand-written server renderer** (`src/server/http/site/render.ts`). Multi-workspace/multi-tenant by design.
- **Allowed actors & capabilities:**
  - *Authenticated admin operator* — full content CRUD within their workspace, subject to RBAC (`content.read` etc.). May paste arbitrary text, URLs, HTML and images into the editor. Assumed non-malicious but capable of pasting hostile content copied from elsewhere.
  - *Unauthenticated public reader* — HTTP GET on the public site only. No credentials.
  - *A second concurrent operator / second browser tab* — normal, expected.
- **In-scope blocking failure domains (ALLOWLIST).** A blocking finding MUST map to exactly one:
  1. **Unsafe content reaching public HTML** — stored XSS, script/CSS/attribute injection, or any operator-supplied value emitted to unauthenticated readers without passing the render sanitisers.
  2. **Unauthorized exposure** — authenticated-only URLs, private asset paths, or one workspace's data becoming reachable by a public reader or another workspace.
  3. **Silent content loss or corruption** — an operator's authored content vanishing, being overwritten, or being silently dropped between the editor and the published page, with no error surfaced.
  4. **Writing to the wrong record** — a save, delete, or state commit landing on a stale or different entity than the one the operator is looking at.
  5. **Unrecoverable break on normal operator use** — a screen that crashes, hangs, infinite-loops/re-renders, or becomes unusable during ordinary editing.
- **Mandatory invariants:**
  - I1. Every operator-supplied value emitted into public HTML passes the existing sanitisers (`safeCssColor` / `safeCssFontFamily` / `safeCssLength`, bounded `colspan`/`rowspan`, slug validation) — including values arriving via the **new unsaved-body preview override path**.
  - I2. The editor and the public renderer agree: a node/mark type the editor can produce either renders publicly or degrades to a **visible** placeholder — never silently to empty output.
  - I3. A response belonging to a superseded request never commits state (no stale-response writes).
  - I4. The preview path never persists to the database.
  - I5. The dependency-injection and i18n refactors are **behaviour-preserving** — no change to what the operator sees or what is saved.
  - I6. No effect/dependency-array change introduces an unbounded re-render or repeated network fetch.
- **Blocking impact threshold:** Reachable by an allowed actor during normal operation, with concrete evidence tied to a named artifact. Theoretical-only or requiring an actor outside the list above is advisory.
- **Risk tier & score floor:** **medium/high → floor 8.5** (public-facing unauthenticated rendering + destructive content mutation).
- **Gate formula (deterministic):** `blocking_gate = FAIL` iff `(count(validated unresolved blockers) > 0) OR (score < 8.5)`. Independent terms; neither rescues the other. The coordinator recomputes and rejects a disagreeing gate.
- **Explicit non-goals:** performance/bundle optimisation; the deliberately-unmigrated `useSettingsContainer`; the generic embed contract (designed, not built — 6 known-failing tests assert it); `fuel` theme's missing template; the pre-existing ~36 `TS2348` vitest typing errors; the 4 remaining themes' capability CSS.

## Prior-Round Disposition Ledger

_Empty — round 1._

## Work Log

**1. Tiptap editor expansion → public site.** ~15 capabilities added (tables, task lists, colour/highlight, sub/superscript, typography, YouTube, mention, drag-handle, code-block language, font family/size/line-height). **Five separate "silent drop" bugs found and fixed**: `textAlign`, `underline`, `strike`, `hardBreak`, and `mention` all rendered in the editor and were discarded by the public renderer with no error, because the admin uses Tiptap and the public site uses a hand-written `renderDocNode` that only knows types someone explicitly taught it.

**2. Image rendering — two bugs.** (a) `renderWidgetPostContent` called `renderDocNode(bodyJson)` with **one argument**; `mediaTransformVersions`/`mediaAssetMetadata` default to empty maps, so every ref-based image's transform lookup missed and degraded to a placeholder showing the filename. Affected **every post with a ref image**, on both the public page and the preview (same function, two callers). Fixed by threading a media context through `resolvePostContentMediaContext`. (b) The editor node view had **no CSS at all**, so images rendered at intrinsic size; and all themes had `max-width:100%` without `height:auto`, squashing images with stored dimensions.

**3. `useWiredX` dependency-injection sweep.** ~47 of 77 hooks converted to receive dependencies via an injected object rather than importing them, so tests use fakes instead of stubbing `fetch`.

**4. i18n sweep.** ~30 components stopped calling `useAdminLocale()` themselves and now take a bound `t: (key) => string` from their hook. `loadLanguage()` is unmemoized, so each duplicate call was a real concurrent settings fetch; ~11 duplicate per-screen fetches eliminated. Named types `Translate` / `DictionaryTranslator` introduced because the app has **two functions both called `t`** distinguished only by arity (249 two-arg vs 774 one-arg call sites). Owner explicitly decided `t` stays at call sites; only the contract surface was renamed.

**5. `lib/fetch-query` migration (9 of 10 features).** Screens moved off a hand-rolled `useState` data/loading/error triple onto a vendor-neutral wrapper over TanStack Query. ~41+ `useState` declarations deleted. One screen (`useSettingsContainer`) deliberately skipped: it loads an unbounded operator-driven set of namespaces, which one fixed query key cannot express.

**6. Eight stale-response race conditions fixed.** Async effects keyed on a route param that committed their response with no cancellation guard, so fast navigation let an older response overwrite a newer one — wrong record displayed, and in one case a delete firing against a newly-selected id while stale rows were on screen. Found by an independent adversarial audit, not by tests. Fixed with effect-local `cancelled` flags (or a monotonic request-id ref where one loader has two call sites), guarding `then`/`catch`/`finally`.

**7. Unsaved-content preview.** Previously, any edit dropped the preview into an unstyled sandbox. Now a `POST` on the existing `template-preview` route accepts a **pending unsaved `bodyJson`** and renders it through the real theme template. Same route handler and same `content.read` authorization as the pre-existing GET. Transport is a hidden form POST targeting a named iframe (GET cannot carry a body; `fetch`+`srcDoc` breaks root-relative `/theme-assets/` paths). Debounced 500ms.

**8. Complexity sweep.** Every `*.hooks.ts(x)` in the admin brought under a 9/9 cyclomatic/cognitive ceiling; 4 files fixed by extracting branching to **top-level exported** functions (which also makes them unit-testable without React), and their grandfathered debt-ledger entries deleted.

## Files And Artifacts

| Path | Why it matters |
|---|---|
| `src/server/http/site/render.ts` | The hand-written public renderer. Sole enforcement point for I1/I2. Deliberately never reads `attrs.src` on image nodes. |
| `src/widgets/resolver-service.ts` | Builds the render IR; now also resolves media context and carries the pending-body override. |
| `src/server/routes/admin/posts/template-preview.ts` | GET + new POST; shared handler, `content.read` authorization, `express.urlencoded({limit:"15mb"})` scoped to the POST. |
| `apps/admin/src/lib/fetch-query/{index,types}.ts` | Vendor-neutral server-state contract; prefix-based invalidation semantics. |
| `apps/admin/src/lib/media-image-extension.tsx` | Editor node view; resolves preview via authenticated original URL. |
| `apps/admin/src/features/*/hooks/*.hooks.ts` | ~77 hooks; DI, i18n, fetch-query, and race-guard changes. |
| `apps/admin/src/features/*/rules.ts` | 22 modules of pure extracted logic; the testability seam. |

## Validation

- **Checks run:** scoped vitest per feature (hundreds of tests, all green); `tsc --noEmit`; `npm run check:admin-complexity-drift` (clean); ESLint incl. a `no-restricted-imports` rule preventing TanStack imports outside the adapter; Playwright e2e for editor toolbar, preview branches, and image sizing; live browser verification via headless Chromium reading `getComputedStyle`; live `curl` against the public site; an independent adversarial `useEffect` audit by a different model family.
- **Checks not run:** full-suite test run (deliberately avoided); no load/perf testing; no formal security review of the new POST route beyond an authorization/limit-parity check; no cross-browser testing; mutation testing not run this session.
- **Known caveats:** ~36 pre-existing `TS2348` vitest typing errors, untouched. 6 pre-existing failures in `render.test.ts` assert an embed contract that was designed but never implemented. One e2e test is `test.fixme` — a `/m/{assetId}/public.v1/...` probe 404s for 25s under the hermetic harness while `/original` serves in 2s; root cause not isolated (candidate: `infra/uploads` is not `TOVU_DB`-scoped and may collide across concurrent hermetic boots). Verification was heavily agent-performed; several agent claims were independently checked by the coordinator and **three were found wrong**.

## Out-Of-Scope Local Changes

- `src/themes/static/basic/pages/{index,pricing}.html` — the owner's own live-site hand edits, untouched.
- `src/core/gated-mutations/**`, `src/features/plugins/data-module.ts` — committed by a concurrent actor outside this session.

## Open Questions

1. The public renderer **deliberately refuses to trust `attrs.src`** on legacy image nodes (arbitrary URL / `data:` blob / authenticated admin URL are all possible), degrading to a placeholder. But the editor toolbar still offers an "Img by URL" control that produces exactly those nodes — content that can never render publicly. Is the correct fix to remove the control, or to fetch-and-upload server-side (which introduces SSRF surface)?
2. The new preview POST accepts an unsaved `bodyJson` up to 15MB from an authenticated operator and renders it server-side through the real template. Sanitisation is claimed to be shared with the saved path because both funnel into the same `renderDocNode` call. **Is that sufficient, and what would break the equivalence?**
3. Eight race fixes use effect-local `cancelled` flags. Is that sufficient for a loader invoked from both an effect and a post-mutation callback, or does every such case need the monotonic request-id treatment one of them got?
4. `Translate`/`DictionaryTranslator` name two same-shaped functions by arity. Is arity a sound basis for a type distinction, or does it invite silent misuse?

## Auditor Instructions

_(Standard instructions per the audit-packet template are appended at dispatch: threat-model handshake first, falsification mindset, blocker rule, no denylist routing, escape valve, single structured JSON object, score with floor 8.5.)_
