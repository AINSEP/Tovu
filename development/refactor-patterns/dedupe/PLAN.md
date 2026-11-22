# Duplicated-code removal plan (Tovu + Jini)

Design 2026-11-13 (design-d3), revised the same day after four Codex reviews (dispositions below). DESIGN plus one worked example. Codex Terra executes the mechanical `dedupe-NN.terra-prompt.md` jobs in this folder. UI lifecycle consolidations (effects, listeners, timers, dialog lifecycles) are Opus work, one feature at a time, listed in `opus-ui-backlog.md` (coordinator decision after review d3r); its "Decisions needed" section holds X31, J07 and J58's timeout half (review d3r2). Every clone group has a decision; nothing is left for Terra to judge. Where this file and a prompt differ, the prompt wins.

## Inputs and method
- Clone pairs: `origin/cloud/quality-1111-static:development/cloud/quality-1111/static/duplication.tsv` (jscpd 4, `--min-tokens 50`, both repos in one staging dir): 925 pairs — 526 Tovu↔Tovu, 324 Jini↔Jini, 75 Tovu↔Jini. RESULTS.md: Tovu 13,749 duplicated lines (2.7%), Jini 8,006 (1.82%), cross-repo 1,088.
- Code read at Tovu `tovu-terra-d3` (branch design-d3, 60f52fea1) and Jini `jini-terra-d3` (design-d3, 48e6159a4). All 925 files still exist; jscpd line numbers are 2 days old and sometimes off (e.g. `get-by-slug.ts` ranges end past the file), so every recipe locates code by content.
- Extraction dossier `ADS-memory/.local-artifacts/extraction-survey/2026-11-11/dossier-v4/` (`files.tsv` labels, `module-twins.jsonl`, `legacy-twins.jsonl`) decided MOVE-PLAN for Tovu↔Jini twins. Those groups are only classified here; the move plan (design-move) designs the moves.
- Pairs under 10 lines were ignored unless the same snippet sits in 3+ places. Pairs were grouped by code shape (one helper copied into N files = one group).
- Decisions: MERGE INTO EXISTING (a survivor already exists), EXTRACT SHARED HELPER (new helper, `(required, optional = {})`), KEEP (tests/fixtures, self-contained theme or plugin copies, vendored kUInetic, layering-forbidden import, deliberate divergence), MOVE-PLAN, REPOINT-NOW (Tovu copy of an already-public Jini export; import swap), FOLD (pair joins another group), GONE.

## Totals

| decision | groups | est. lines saved |
|---|---|---|
| Route preamble RG1 + RG2 (Tovu, jobs 01–02) | 2 (≈265 sites) | ≈1,525 (measured: 184 workspace blocks = 710 lines → 184; 81 authorize blocks = 1,167 lines → 162) |
| EXTRACT SHARED HELPER | 64 | ≈2,020 |
| MERGE INTO EXISTING | 23 (+RG3 helper bodies) | ≈880 (+≈30) |
| REPOINT-NOW (Tovu → existing public Jini export) | 12 | ≈450 |
| MOVE-PLAN (handled by the move plan, not counted here) | 20 | (≈1,600 if the move deletes those Tovu files) |
| KEEP | 34 (+ RG6, RG7) | 0 |
| FOLD / GONE | 10 / 1 | 0 |

Expected from jobs 01–09 and 11: **≈4,900 lines** (≈2,700 Tovu, ≈2,200 Jini). Job 10 (owner-gated) adds ≈120. These are the first design's totals. The revisions moved lines between jobs rather than changing the total much: T33 → 03; J46a split off J46; T30 grew to 31 copies; after review d3r, T16 hooks, T18, T23, T11, J02, J35, J39 and J48 (≈425 lines) moved from Terra to the Opus UI backlog; after review d3r2, X31, J07 and J58's timeout half (≈75 lines) moved to its decisions section. Agents' estimates are marked `~` in the tables; treat them as ±30%. Re-measure after the jobs (see "After the jobs").

## Jobs and status

The prompts are the source of truth; this table is their index. Phase A = the steps a job can run on its own clone; Phase B = steps that import a name the same wave adds to another package, run only after the named gate (next section). "Review" = the latest Codex review verdict (d3r) and what was fixed after it; every Terra job still gets a re-review before dispatch.

Rules in every Terra prompt (review d3r findings 1 and 4): functions ≤50 lines, cyclomatic and cognitive complexity ≤10 (≤9/9 in Tovu `apps/admin`), with a pure extract-function fallback or `OVER-LIMIT` skip; every new or re-homed function takes `(required, optional = {})` (`_optional` / `_required: Record<string, never> = {}` when empty). Legacy exported shapes stay as one-line adapters. Exempt only: React components, library-fixed callbacks (DataTable compare) and the O2 positional guards, each named in its recipe.

| job | lane | repo | scope | groups | phases / gates inside the job | est. saved | risk | status |
|---|---|---|---|---|---|---|---|---|
| dedupe-01 | Terra | Tovu | route preamble part 1 (admin-http non-route + routes a–m) + publish-content guard twin + newsletter/widgets helper bodies | RG1 RG2 RG3 | — | ≈780 | L | **READY** (d3r2 READY) — runnable now |
| dedupe-02 | Terra | Tovu | route preamble part 2 (routes n–z incl. `system/*-credentials.ts` rows 65a/72a, public-http) | RG1 RG2 RG4 | — | ≈760 | L | **READY** (d3r2 READY) — runnable now (01's helpers already committed) |
| dedupe-03 | Terra | Tovu | website features + import swaps to already-public Jini exports | X01 X06 X10 X11 X17 X19 X21 X25 X27 X30 T30 T32 T33 (+RG5) T34 TR01 TR02 TR03 TR07 | — | ≈840 | L/M | d3r3 READY WITH FIXES, fixed: T32 `buildMembersWriteServiceDeps({ deps }, _optional = {})` in the feature, inbound keeps `toMembersWriteServiceDeps(deps)` as a one-line adapter (d3r2: X31 → backlog decisions); ready for dispatch after 01 + 02 land |
| dedupe-04 | Terra | Tovu | admin + desktop React (markup, types, pure functions) | T03 T05 T06 T07 T09 T10 T12 T13 T15 T16 (markup) T17 T19 T20 T21 T22 T27 | — | ≈425 | L/M | d3r2 READY; runnable now |
| dedupe-05 | Terra | Jini | core-level helpers | J03 J05 J09 J32 J45 J53 J56 JR07 TR04 (Jini half) | **05A**: every core addition (incl. J45's two core aliases) + J03, JR07. **05B**: repoints of the new core names after **H1**, incl. the whole J45 cms file | ≈260 | L/M | d3r2 READY WITH FIXES, fixed (J45 cms file entirely Phase B, re-exporting the core aliases as the cms names); 05A runnable now, 05B after H1 |
| dedupe-06 | Terra | Jini | chat + ui: markup, types, pure functions only | J01 J28 J34 J43 J50 J51 J59 JR03 JR04 JR05 | none (J02 and gate H2 moved to Opus) | ≈237 | L | d3r3 READY WITH FIXES, fixed: JR05 `act({ selection }, _optional = {})` with all four callbacks; J28 merges into the existing `template-i18n.ts#interpolate` (new `{ keepPlaceholderWhen }` option, default unchanged) with the four calls migrated explicitly (d3r2: J07 → backlog, J51 object form); after 05 lands |
| dedupe-07 | Terra | Jini | agent-runtime + integrations | J10 J11 J14 J15 J16 J19 J21 J25 J30 J38 J58 (URL half) | J25 Phase A (integrations); Phase B (agent-runtime) after **H3** | ≈403 | L/M | d3r3 NOT READY (J25), fixed: J25 also switches the renderer's own `firstInlineImageData` (aihubmix.ts ~136) to `\|\|`, one-fetch flow kept; test edit committed alone so the cloud gate records RED then GREEN (Terra runs no J25 tests) (d3r2: J58 timeout half → backlog, J15 → existing `src/role-marker-guard.ts`); after 05 lands |
| dedupe-08 | Terra | Jini | cms | J23 J24 J36 J37 J40 J41 J44 J47 J49 X15J | — | ≈240 | L/M | d3r2 READY; after 05 lands |
| dedupe-09 | Terra | Jini | daemon, cli, platform, mcp, user-management, plugins | J06 J08 J12 J20 J29 J42 J46 J52 J54 J55 J57 J60 JR02 JR06 JR08 | J46 = Phase B after **H1**; J42 daemon side and JR02 steps 5–6 after **H4**; J60 = fix commit first, then extraction | ≈480 | L/M | d3r2 READY; after 05 lands |
| dedupe-10 | Terra | Jini | OWNER-GATED | JR01, J46a | JR01 step 1 = A; JR01 steps 2–4 incl. J46a after **H6** | ≈120 | M | **BLOCKED** on O2; after 05–09 (T11 moved to Opus) |
| dedupe-11 | Terra | Tovu | Tovu adopts the new Jini exports | TR04 phase 1, TR04 phase 2, X15 | precondition: runtime check of `toMsClock` + a one-file `tsc` probe importing `@jini-ai/cms/forms` and `@jini-ai/core/primitives` types (finding 8) | ≈25 | L/M | **BLOCKED** on **R1**; TR04 phase 2 also needs O5 |
| opus-ui-backlog | Opus | Jini + Tovu | UI lifecycle consolidations, one feature at a time | T16 (hooks) T18 T23 T11 J48 J35 J39 J02 | per item; Tovu halves that need new Jini exports wait for a Jini release | ≈425 removed, ≈110 added back as new Jini hooks (T18, T23) | M | **NOT for Terra.** 8 items, each with the existing owner to reuse (`useDismissOnOutsideOrEscape`, ui-kit `useNativeDialog`, `useFetchQuery`, …) |

Lanes: Tovu (01–04) and Jini (05–10) touch different repos and run in parallel; inside a repo run in table order. Jini jobs type-check only the touched package and never rebuild or publish; the coordinator rebuilds at each gate after review (owner rule: Jini rebuild only after review). Job 11 runs last, after R1. The Opus backlog runs independently of the Terra lanes, after the Terra jobs that touch the same files (job 04 T10 before T11; job 04 T16 markup before T16 hooks).

## Coordinator gates

Other packages type-check against the BUILT `@jini-ai/*` (exports point to `dist`), so "job N landed" never makes a new export resolvable by itself (review finding 4). The coordinator clears every gate; the job prompt's Phase B starts only when the dispatch says the quoted words.

| gate | what the coordinator does | after | unblocks | dispatch says |
|---|---|---|---|---|
| H1 | review 05A, build `@jini-ai/core` in the Jini clone | 05A | 05B; job 09 J46 (`errorMessageOf`) | "H1 done: @jini-ai/core built" |
| H2 | moved with J02 to the Opus backlog (the chat repoint waits for a ui build there); no Terra prompt references it | — | — | — |
| H3 | review 07 J25 Phase A, build `@jini-ai/integrations` | 07 J25 steps 1–3 | 07 J25 steps 4–5 (agent-runtime) | "H3 done: @jini-ai/integrations built" |
| H4 | review 09 J42/JR02 Phase A, build `@jini-ai/platform` and `@jini-ai/http-kit` | 09 J42 platform side, JR02 steps 1–4 | 09 J42 daemon side, JR02 steps 5–6 | "H4 done: @jini-ai/platform built" / "H4 done: @jini-ai/http-kit built" |
| H5 | reserved, unused (no prompt references it) | — | — | — |
| H6 | review 10 JR01 step 1, build `@jini-ai/core` | 10 JR01 step 1 | 10 JR01 steps 2–4 incl. J46a | "H6 done: @jini-ai/core built" |
| R1 | Jini release: Terra jobs 05–09 reviewed, merged, released to npm with a version bump; Tovu's `@jini-ai/*` minimum versions and lockfile updated to that release | 05–09 | job 11, all groups (its precondition runs a runtime export check and a one-file `tsc` consumer-import probe, and stops with `BLOCKED R1`) | dispatch names the release; no fixed phrase |

## Owner decisions (all OPEN)

| id | question | what waits on it |
|---|---|---|
| O1 | Publishing credentials on ~85 admin routes (plus newsletter, widgets, media) call `deps.authorize` directly; only the ~70 `authorizeOrRespond` sites apply the publishing-grant capability set. The plan keeps today's behavior (`authorizeDirectOrRespond`). Switch every route to honor publishing grants? One word per site after jobs 01–02. | nothing (follow-up only) |
| O2 | JR01 + J46a: `isRecord` copies (11 Jini packages + 22 daemon files) → one core guard. The copies are positional `(value)` (TypeScript narrows only the named argument); the args rule wants objects. Approve a positional exception for type guards, or keep the copies? | job 10 JR01, J46a |
| O3 | T11: the three admin native-dialog modal hooks move onto ui-kit's existing `useNativeDialog` (adapter or an added option, never a second lifecycle). The three headers say "copied rather than imported" on purpose. ui-kit restores focus to the opener and handles backdrop clicks by coordinates; the Tovu hooks do neither. Approve the switch and those two behavior changes? | Opus backlog T11 |
| O4 | Newsletter launch gate: the admin route hard-wires `isSendingEnabled: async () => false` (`routes/newsletter/deps.ts:153`, documented as deliberate); the agent-tool builder `features/newsletter/tool-registrations.ts#toNewsletterSendPipelineDeps` honors `deps.newsletterSendingEnabled`. Which wins? | nothing in this plan any more: T33 passes both bindings explicitly (job 03) |
| O5 | TR04 phase 2: 16 Tovu sites always wrap `{ nowMs: () => Date.parse(x.nowIso()) }`; `toMsClock` would prefer `nowMs` when a clock has both (only test fakes do). | job 11 TR04 phase 2 |
| O6 | X05 media hint attribute: Tovu allows attribute name `value`, Jini does not; pick one before the move converges them. | move plan (X05) |
| O7 | AG-UI `stopReason` (J61 #129, X23): Jini `@jini-ai/chat/core/ag-ui` reduces usage inline and drops `stopReason`; Tovu's copy keeps it. Fix Jini before the move repoints X23. | move plan (X23) |
| O8 | The agent-tool newsletter send path (`toNewsletterSendPipelineDeps`, used by `features/newsletter/delivery/tool-registrations.ts`) passes no `unsubscribe` and no `sleep`, unlike the admin route. Add them? A behavior change, not a dedupe; T33 keeps today's behavior. See Bugs. | nothing (follow-up only) |
| O9 | J48 keeps the four public predicates `isOutsideHeaderMenu`, `isHeaderMenuDismissKey`, `isOutsideLanguageMenu`, `isLanguageMenuDismissKey` (public through `packages/ui/src/index.ts`'s `export *`). Remove them in a breaking `@jini-ai/ui` release? | nothing (follow-up only) |

Small FYI (no decision needed unless the owner objects): JR03 overrides the memory slice's "intentionally duplicated per slice" comment on `withoutKey` under the owner's dedupe rule; J12 and J59 likewise rewrite "own copy on purpose" comments.

## Route preamble (Tovu `apps/website/src/server/inbound`, 343 pairs, 4,086 jscpd lines) — designed here

The biggest cluster is not copied logic but the same request preamble in ~190 route files: the workspace 404 (4 lines) and a hand-rolled `deps.authorize()` + 403 (14 lines). After stripping those two blocks, 86 of 217 ≥10-line route pairs fall below 6 real lines (script: classify the A-side range, remove the two block patterns and pure boilerplate lines).

| id | decision | survivor / helper | reason | est. saved | risk |
|---|---|---|---|---|---|
| RG1 | MERGE INTO EXISTING | `server/inbound/shared/route-guards.ts#rejectForeignWorkspace({ req, res, workspaceId }): boolean` and `#readRouteParam({ req, name })` — moved verbatim from `admin-http/routes/media/route-guards.ts` (the args-rule form). The positional twin `routes/publish-content/route-helpers.ts#rejectForeignWorkspace(req, res, workspaceId)` / `routeParam` is deleted and its 7 importers repointed. | Three copies of one guard existed already (inline ×184, media, publish-content); the media one already has the object-args signature and the why-comment. `shared/` because public-http routes use the same block. | ≈525 | L |
| RG2 | MERGE INTO EXISTING | `admin-http/authorize-guard.ts#authorizeDirectOrRespond({ res, authorize, params })` — moved from `routes/media/route-guards.ts#authorizeMediaOrRespond`; it and `authorizeOrRespond` now share one private `writeForbidden` body. | 81 inline blocks write the byte-identical 403 body. They call `deps.authorize` directly, NOT the publish-trust-aware `authorizeOrRespond`; swapping to `authorizeOrRespond` would change who a publishing credential can act as, so the direct variant keeps today's behavior (owner decision O1). | ≈1,000 | L |
| RG3 | MERGE INTO EXISTING | `http/newsletter.ts#requireNewsletterPermissionOrRespond`, `http/widgets.ts#requireWidgetsPermissionOrRespond` keep their signatures; bodies call `authorizeDirectOrRespond`. | Same 403 body copied twice more; both also bypass publish-trust today (kept). | ≈16 | L |
| RG4 | FOLD RG1/RG2 | `system/custom-credentials.ts` + `system/source-control-credentials.ts` `rejectUnlessAuthorized` (24-line twin) | After RG1/RG2 each closure is 4 lines; a cross-file helper would save ~2 lines. Converted in job 02 (rows 65a/72a) keeping `return true`; the done-check regex in jobs 01 and 02 accepts `return(?: true\| null)?;`. | (in RG1/RG2) | L |
| RG5 | FOLD T33 | `routes/newsletter/deps.ts#toConfirmationDeps` ↔ `public-http/routes/site/newsletter-deps.ts#toPublicConfirmationDeps` | Same newsletter deps-bundle family as T33; one design, one job (job 03: `toPublicConfirmationDeps` becomes `buildConfirmationDeps({ deps })`). | (in T33) | — |
| RG6 | KEEP | `posts/update.ts` ↔ `pages/update.ts` (34 + 20 + 12 lines), `pages/create.ts` ↔ `posts/create.ts`, `pages/delete.ts` ↔ `posts/delete.ts` | Deliberate, documented contract divergence (`pages/update.ts` header: PAGE_UPDATE adds `code` on all three error branches, writes 7 vs 13 fields, posts resolves slug→id first). What is identical is a single `updatePost`/`restorePostForward` call with a deps object; a shared builder would couple two contracts the files say must differ, for ≈30 lines. | 0 | — |
| RG7 | KEEP (re-scan) | remaining ≈130 route↔route pairs (e.g. `assistant/get-settings`↔`put-settings`, `seo/get-settings`↔`put-settings`, `redirects/hits`↔`update`, `users/*`, `newsletter/*`↔`get-by-slug.ts`) | Their shared tokens are the RG1/RG2 blocks plus `try { … } catch → sendAdminFailure` and `deps: { repo }, input: { workspaceId }` call shapes; the remaining lines are different domain calls. Re-run jscpd after jobs 01–02 and design only what still clones ≥10 lines. | 0 now | — |

Rejected alternatives: (a) one `app.use("/api/admin/v1/workspaces/:workspaceId", guard)` middleware instead of per-route calls — deletes all 184 blocks, but route tests call handlers directly via `extractRouteHandler` and assert the 404 (e.g. `routes/sites/site-previews.unit.test.ts:113`), and public-http mounts differ; (b) a full `adminRoute({ permission, operation }, handler)` wrapper — error mapping differs per route (domain error tables, plain-text bodies, SSE), so Terra would have to judge each route.

Worked example (commit `720d47881`, test-first): RED — new `shared/__tests__/route-guards.unit.test.ts` failed (module missing) and `authorize-guard.test.ts` failed (`authorizeDirectOrRespond` missing); GREEN after the move. The divergence the tests pin: the direct guard must NOT consult a publishing grant (`res.locals.publishTrust`), and its 403 equals `authorizeOrRespond`'s byte-for-byte. Converted: media `replace/original/trash/upload/delete.ts` (repointed), `redirects/get-by-id.ts`, `comments/get-settings.ts`. Single-file runs: route-guards 4/4, authorize-guard 10/10, admin-media-routes 21/21, media-original-route 11/11, media-route-failures 81/81, delete-route 7/7, ranked-user-facing-errors 8/8, comments settings 9/9, redirects shared 7/7.

## KEEP — the main reasons
- **Themes** (T01, T02; 1,082 + 579 jscpd lines): `content/themes/__original-themes__/*` are the pristine reset copies (`content/README.md:9,26`; `development/scripts/theme-tool.ts:5-8` "original stays byte-identical forever"), and every theme is copied whole into `<site>/themes` by `seedSiteThemes`, so theme scripts must stay self-contained. kUInetic stays vendored per theme (owner 11-06).
- **Self-contained plugins**: agent-plugin / provider-plugin copies (e.g. descriptor field lists, search-tool vs skill-tool) stay per plugin — plugins never import each other.
- **Test fakes that mirror a real adapter** (cms comments memory vs SQL repo, user-management in-memory repos where only the shape matches), fixtures and generated code.
- **Deliberate divergence** documented in the code (RG6; chat AG-UI reducer independent of run-events, J61/#129).
- Layering: a merge that would need an import "upwards" or between two packages with no common lower dependency (checked in each package.json).

## Characterization tests written by the design (NOT yet run)

The job runs each one first; if it fails for a reason other than the stated one, the job fixes only the test's setup (fixture shape, import path), never its assertions, and reports the change.

| group | file | repo / commit | expected first run | owner |
|---|---|---|---|---|
| T33 | `apps/website/src/features/newsletter/__tests__/deps-builders.characterization.test.ts` | Tovu design-d3 `ceffa9949`, + real-`sleep` case after d3r | GREEN against today's builders (pins admin: `false` + `unsubscribe` + a `sleep` that stays pending until its delay under mocked timers; tool: `newsletterSendingEnabled`, neither) | Terra 03 |
| J60 | `packages/daemon/src/tool-recovery/__tests__/forced-confirmation-forwarding.test.ts` | Jini design-d3 `87406410f` | RED for all four decorators (the bug); GREEN after step 1 | Terra 09 |
| J48 | `packages/ui/src/react/__tests__/components/menu-dismiss-hooks.characterization.test.tsx` | Jini `87406410f` | GREEN before and after the merge | Opus backlog |
| T18J | `packages/ui/src/features/panel-kit/hooks/__tests__/use-optimistic-stored-value.hooks.test.tsx` | Jini `87406410f` | RED until the hook exists | Opus backlog |
| T23J | `packages/ui/src/features/panel-kit/hooks/__tests__/use-bounded-status-poll.hooks.test.tsx` | Jini `87406410f`, re-arm case fixed after d3r | RED until the hook exists; the re-arm case rerenders half an interval into the wait and asserts the fetch at the ORIGINAL deadline | Opus backlog |

Tests the Terra jobs write themselves (specified in the prompts): the J05 core test (cases copied from artifacts, job 05), TR04 `time.test.ts` cases (job 05). The Opus backlog lists its own (T16 hook cases, T11 hook, T18 Tovu port-swap characterization).

## Bugs found while designing (for `development/open-bugs.md`; only the J60 one is fixed by a job)
- **MEDIUM (verified; fixed by job 09 J60 step 1):** four Jini daemon tool-executor decorators (`packages/daemon/src/tool-recovery/{analytics,observability,federated-refusal,redaction}.ts`) forward only part of the per-call `execute` options, so a host's per-call confirmation option is lost whenever the executor is wrapped. Fix: forward `options` whole, failing test first (written, see above), own commit, then the extraction. Detail is in the job 09 prompt.
- **LOW (latent, not reachable while newsletter sending is off):** the agent-tool newsletter send path (`features/newsletter/delivery/tool-registrations.ts` → `toNewsletterSendPipelineDeps`) builds its pipeline deps without `unsubscribe` and `sleep`, which the admin route supplies. Once tool-driven sending is enabled, its batches would lack the one-click-unsubscribe dependencies and would reschedule instead of taking short provider waits. T33 keeps this as is; owner question O8.
- **LOW:** Tovu `reduceAgentWirePayload` (`apps/website/src/server/runtime/composition/modules/assistant-ag-ui.ts:183`) indexes `WIRE_PAYLOAD_REDUCERS[payload.type]` without `Object.hasOwn`; a payload type `"toString"`/`"constructor"` hits `Object.prototype`. Jini's copy has the guard.
- **LOW:** Jini `packages/artifacts/src/text-suppression.ts` `TOOL_CALL_OPEN_RE = /(?:<\s*tool_call\b[^>]*>|<\s*edit\s*>)/i` also matches prose like `x < tool_call.count && y > 0` and hides it; agent-runtime has the hardened regex. J05 keeps the regexes per package (no behavior change).
- **Dead code:** Tovu `apps/admin/src/components/Select/Select.hooks.tsx` helpers have no production importer (only `components/__tests__/Select.hooks.unit.test.tsx`); production uses the Jini Select (X26, move plan).
- **Owner-rule hits:** cms comments memory/SQL repos use non-null `!` (J61 note).
- **Type duplicates (not jscpd hits):** four separate `AuthorizeFn` types in Jini (`cms/src/core/commands/command.ts:99`, `cms/src/taxonomy/write-service.ts:52`, `core/src/gated-mutations/ports.ts:8`, `core/src/settings/write-service.ts:46`). Candidate for the next pass.

## Codex review disposition (review-d3, verdict NOT READY; all 12 findings accepted)

| # | finding | fix | commit (Tovu design-d3 unless noted) |
|---|---|---|---|
| 1 | J25 Phase B removes the local `aihubmixOriginFromBase` binding | explicit `import` + re-export; exact signatures; narrow subpath | `3029c6136` |
| 2 | T33 differs beyond O4 (admin supplies `unsubscribe` + `sleep`) | one builder, both bindings passed explicitly; moved to job 03; characterization test | `9bf6b99ab`, `ceffa9949` |
| 3 | T34 subscription projections are different contracts | merge only delivery-detail + change-set; subscription views stay separate | `9bf6b99ab` |
| 4 | dependency order does not make new exports resolvable | Phase A/B per job + gates H1–H4, H6; R1 + job 11 for Tovu adoption | `3029c6136`, `3a791f5ce`, `a81f99ea0`, `6ffe170af`, `074edabe5` |
| 5 | generic mechanisms get Tovu owners | T16J/T18J/T23J in Jini panel-kit (job 06); T11 hook in Jini admin-widgets (job 10); Tovu wrappers in job 11; T03 Jini SeoIcons KEEP | `a81f99ea0`, `074edabe5` |
| 6 | JR02 adds an Express-only public Jini contract; X15 names `/forms/express` | structural ports `ApiErrorResponseWriter` / `RequestWithOriginHeaders`; X15J framework-neutral home, X15 → job 11 | `3a791f5ce` |
| 7 | J60 contradictory security instructions | one sequence: failing test + forwarding fix commit, then extraction | `3a791f5ce` (test: Jini `87406410f`) |
| 8 | T18 loses subscription replacement on port change | Jini hook keyed on port identity; job 11 characterization test first, display port memo-adapted on `[port]` | `a81f99ea0`, `074edabe5` (test: Jini `87406410f`) |
| 9 | J48 deletes public exports | four predicates kept as compatibility exports; removal = O9 | `a81f99ea0` (test: Jini `87406410f`) |
| 10 | recipes point at a TSV that does not hold signatures / site lists | exact signatures and manifests embedded: T03 (12 files), T18/T23 → Jini signatures, J09 (10 sites), J32 (16 calls / 13 files), J53 (9 sites, 2 excluded), T30 (31 files, G0–G5), J40 signature; test paths | `a81f99ea0`, `6ffe170af`, `ceffa9949` |
| 11 | signature exceptions escape their gate | J46 `isRecord` → J46a under O2 (job 10); J59 object args + public positional adapters; JR03 object args | `3a791f5ce`, `a81f99ea0` |
| 12 | T03 deletes why-comments | combined rationale moves onto `line-icon.ts` | `a81f99ea0` |
| — | J53 scan misses 3 sites | explicit 9-site manifest (bounds/namespace checks kept) | `6ffe170af` |

## After the jobs
1. Re-run `development/cloud/quality-1111/static/scripts/run-jscpd.sh` (same flags) and diff against the TSV; any new ≥10-line clone created by the jobs is a defect in the job.
2. Design RG7 residuals and anything a job reported STALE.
3. Coordinator: clear H1, H3, H4 (and H6 if O2) as the Phase A reports arrive; after review of 05–09, do R1 (release, Tovu minimum bumps, lockfile), then dispatch job 11. Log J60's fix and the O8 latent bug in `development/open-bugs.md`.

## Codex re-review disposition (review-d3r: 01/02 READY, 04 READY WITH FIXES, rest NOT READY; all 8 findings accepted)

| # | finding | fix |
|---|---|---|
| 1 | 50-line / complexity limits conflict with literal recipes (J05 moves an 86-line factory; job 11 allowed 10 in admin) | J05 split into named ≤25-line functions over one state object, with the statement order kept and the artifacts cases copied into the core test; a shared size rule (50 lines, 10/10, admin 9/9, extract-function fallback or `OVER-LIMIT` skip) in every prompt; J02 (84-line survivor) moved to Opus |
| 2 | T16J reimplements the existing Escape owner | T16J dropped; the Tovu hooks compose `useDismissOnOutsideOrEscape` (Escape-only) + `useFocusTrap` (Opus backlog T16) |
| 3 | T11 creates another native-dialog lifecycle | T11 = adapter over ui-kit `useNativeDialog` (Opus backlog); the focus and backdrop differences are added to O3 |
| 4 | new APIs break `(requiredObj, optionalObj)` | defaulted options object on J25's shared functions, J05's exports and T13's factories; T18's port operations specified in the Opus backlog; shared signature rule + exemptions in every prompt |
| 5 | T11 adoption misses the real seams | the seams (`ThemePageDetailsModal.tsx` `{ open: row !== null, onClose }`, `Media.tsx#EditMediaModal` `useEditMediaModalHook({ open: item !== null, onClose: onCancel })`) are listed in the Opus T11 row; job 11 no longer contains T11 |
| 6 | polling test misses timer restarts | the re-arm case now waits half an interval before the rerender and asserts at the original deadline (Jini clone) |
| 7 | T33 does not pin a real sleep | new case: under mocked timers `sleep(250)` is still pending at 249 ms and resolves at 250 ms (Tovu clone) |
| 8 | R1 export check incomplete | job 11 precondition: runtime `toMsClock` check + a one-file `tsc` probe importing `FormSubmissionRedirectResult` from `@jini-ai/cms/forms`; the T11 check left with T11 |

## Codex third review disposition (review-d3r2: 01 02 04 08 09 READY, 05 READY WITH FIXES, 03 06 07 NOT READY; all 7 findings accepted)

| # | finding | fix |
|---|---|---|
| 1 | X31 makes Jini SEO canonical against ADR-PIPE-008's render-contract ownership | X31 out of job 03 → `opus-ui-backlog.md` decisions (ADR revision first); Tovu declarations stay |
| 2 | J07 makes chat's emitted declarations need the optional UI peer | J07 out of job 06 → backlog decisions (framework-neutral contract home; both public aliases kept) |
| 3 | J58 adds a second deadline lifecycle beside platform `createDeadlineSignal` | timeout half → backlog decisions (reuse the owner; explicit abort-reason/classification decision); URL helper stays in job 07 |
| 4 | J25 omits the contradictory empty-inlineData characterization case | job 07 J25 step 0: that case's assertion becomes the decoded snake-case bytes, RED before step 1, GREEN after; input kept |
| 5 | J45 Phase A replaces the cms file before the aliases exist | core aliases in 05A; the whole cms file in 05B, re-exporting them AS `AuthorizationRequired` / `AuthorizationOptional` |
| 6 | J51's returned function is positional | `FakeLatencyDelay = <T>({ value }, _optional?) => Promise<T>`; every `delay(x)` → `delay({ value: x })` in the eleven listed consumers (58 calls) |
| 7 | J15 destination under `providers/` | the existing `packages/agent-runtime/src/role-marker-guard.ts`; the four providers extend their `../role-marker-guard.js` import |

## Codex fourth review disposition (review-d3r3: 05 READY, 03 06 READY WITH FIXES, 07 NOT READY; findings 1–5 accepted)

| # | finding | fix |
|---|---|---|
| 1 | J25's revised test exercises the renderer's own `firstInlineImageData`, which keeps `??` | job 07 J25 step 1 also switches that selector to `\|\|` and rewrites its precedence comment; one-fetch flow kept; the test edit is committed alone so the cloud gate records RED, then GREEN at step 1 (Terra runs no J25 tests) |
| 2 | T32 gives the positional `(deps)` helper a new shared home | `buildMembersWriteServiceDeps({ deps }, _optional = {})` exported from the feature, four feature-local calls migrated; inbound keeps `toMembersWriteServiceDeps(deps)` as a one-line adapter |
| 3 | JR05's `act(selection)` is the helper's own positional callback | `act({ selection }, _optional = {})`; the helper calls `act({ selection })`; all four callbacks updated |
| 4 | J28 leaves the four positional `interpolate(template, vars)` calls implicit | each of context.tsx ~157/~173 and renderers/react/i18n.tsx ~34/~42 is spelled out in object form |
| 5 | J28 ignores the existing `template-i18n.ts#interpolate` (same regex and conversion) | contract compared: only the missing-value policy (presence vs nullish) and absent `vars` differ; the existing owner gains `{ keepPlaceholderWhen }` (default `'absent'`, today's behavior) and accepts `undefined` vars; both contexts delegate with `'nullish'`; no new `interpolate.ts` |

## Review focus for the Codex re-review
- Gate wiring: every Phase B step imports only names its gate has built; no Tovu job imports a Jini name added in this wave before job 11 (R1); job 06 has no Phase B left.
- The five design-written tests above: do their assertions pin exactly the stated behavior?
- M-risk groups left in Terra: J03, J05 (the split), J25, J46, J52, J60, T33, TR01, TR04, X groups with `behavior_divergence` other than none. The Opus backlog is reviewed per item when built, not here.
- The size and signature rules: does any recipe still move a body over 50 lines or complexity 10 (9 in admin), or add a shared function without the options object?
- Every EXTRACT target package is one both sides already depend on (no new package, no upward import) — spot-check J05 (`@jini-ai/core/text`), J09/J32/J53/J56/JR01 (`@jini-ai/core`), J42 (daemon already depends on platform), JR02 (`@jini-ai/core` `RequestWithOriginHeaders` in http-kit).
- Raw per-group data (files, signatures, divergence, tests) is in the job prompts; the tables below are the index.

## All groups

### Jini ↔ Jini (J*, JR*)

| id | decision | area | job | est. lines saved | risk | survivor / helper | reason |
|---|---|---|---|---|---|---|---|
| J01 | EXTRACT SHARED HELPER | chat | 06 | 90 | L | packages/chat/src/react/components/ToolCard.tsx#FamilyCard (file-private React component; single props object… | 10 family cards repeat ExpandableCard+ResultBadge+title+ToolCallDetail |
| J02 | MERGE INTO EXISTING | chat+ui | Opus backlog (survivor `RenderNode` is 84 lines: split first; chat repoint after a ui build) | 100 | M | packages/ui/src/features/a2ui/renderer.tsx#A2uiComponentNode (renamed RenderNode, exported via @jini-ai/ui/a2ui); chat A2uiSurfaceCard renders it | chat already depends on ui; ui renderer is a superset. Survivor keeps ui straight quotes and provider-action map, uses DynamicValueSchema.parse (no cast) |
| J03 | MERGE INTO EXISTING | agent-runtime+integrations | 05 | 12 | M | @jini-ai/core#isIpLiteralHostname({ hostname }) (packages/core/src/origin-validation.ts:197, exported from co… | jscpd 48-line span is mostly doc comment; only the 5-line looksLikeIpLiteral is shared; the two validators intentionally differ (loopback allowed vs blocked) |
| J04 | KEEP | chat | - | 0 | L | - | public barrel lists; index.ts carries the @deprecated alias block and scripts/check-chatpane-public-surface.ts reads these barrels textually |
| J05 | EXTRACT SHARED HELPER | core+artifacts+agent-runtime | 05 (step 1 05A; steps 2–3 05B after H1) | 95 | M | packages/core/src/text/tagged-text-suppression.ts#createTaggedTextSuppressor (object args) | agent-runtime does not depend on artifacts; both depend on core; pure string code. Regexes stay per package (artifacts regex bug reported separately) |
| J06 | MERGE INTO EXISTING | mcp | 09 | 32 | L | packages/mcp/src/core/config.ts#defaultMcpSecretFilesystem (rename+export the existing const defaultFilesyste… | tokens.ts already imports McpConfigFilesystemPort from config.ts |
| J07 | MERGE INTO EXISTING | chat+ui | backlog decisions (d3r2 2) | 48 | L | @jini-ai/ui/renderers types ArtifactKind, ArtifactRendererId, ArtifactExportKind, ArtifactStatus, ArtifactMan… | chat depends on ui; ui doc says "keep in sync by hand" - remove that need |
| J08 | EXTRACT SHARED HELPER | daemon | 09 | 33 | L | packages/daemon/src/http/catalog-route-input.ts#parseCatalogSearchInput(required: {input: RouteInputContext},… | same package; import-line clones (#223 #269 #272) and mcp catalog-tool clone (#289) are import/arg boilerplate -> KEEP |
| J09 | EXTRACT SHARED HELPER | core+platform+sidecar | 05 (core file 05A; repoints 05B after H1) | 35 | L | packages/core/src/primitives/errors.ts#errorCodeOf({ error }) / errorMessageOf({ error }) | 10-site manifest: errorCode in sidecar port.ts, json-ipc.ts, platform download.ts, process.ts, fs.ts; errorMessage in sidecar port.ts, json-ipc.ts, platform download.ts, fs.ts, http.ts. KEEP platform/web/web-page.ts errorCode (returns unknown). COORDINATE with design-jini-errors. J46 reuses errorMessageOf |
| J10 | EXTRACT SHARED HELPER | agent-runtime | 07 | 25 | L | packages/agent-runtime/src/providers/tool-turn.ts#forwardAdapterEvents(required: {input: InternalTurnInput; p… | three protocol runners repeat the same onEvent projection |
| J11 | MERGE INTO EXISTING | agent-runtime | 07 | 40 | L | packages/agent-runtime/src/pi-models.ts#parsePiModels({ stdout }) (unchanged) | pi-models.ts is the transport-free copy; pi-rpc re-exports it |
| J12 | EXTRACT SHARED HELPER | cli | 09 | 95 | L | packages/cli/src/daemon-call-deps.ts: interface DaemonCallDeps; #defaultWrite; #defaultWriteErr; #errorOption… | 3 command modules + main repeat deps/defaults/option builders |
| J13 | KEEP | core+ui | - | 0 | L | - | only the 21-locale import/registry list matches; content differs |
| J14 | EXTRACT SHARED HELPER | agent-runtime | 07 | 22 | L | packages/agent-runtime/src/providers/response-text.ts#extractProviderErrorDetail(required: {rawText: string},… | identical bodies |
| J15 | EXTRACT SHARED HELPER | agent-runtime | 07 | 28 | L | packages/agent-runtime/src/role-marker-guard.ts#emitGuardedTextDelta(required: {state: {guard: RoleMarkerGuar… | identical 10-line bodies; per-provider exported names stay (tests import them) as one-line delegators |
| J16 | EXTRACT SHARED HELPER | agent-runtime | 07 | 8 | L | packages/agent-runtime/src/providers/sse-decode.ts#parseSseJsonRecord(required: {raw: string}, _optional = {}… | identical |
| J17 | KEEP | agent-runtime | - | 0 | L | - | pairs #17 #91 #99 #103 #159 #160 #206 #208 #209 #211 #228 #248 #260 #263 #324 #216: loops already share toolLoopVerdict/createTurnEndGuard/runOpenAiCompatibleRequest; re… |
| J18 | KEEP | agent-runtime | - | 0 | L | - | standalone skill CLI scripts; shared code already lives in scripts/lib/*.mjs; repeated parts are per-script imports/usage text |
| J19 | EXTRACT SHARED HELPER | agent-runtime | 07 | 14 | L | packages/agent-runtime/src/mmd-routes.ts#readMmdRoutesJson(required: {env: RuntimeEnv}, _optional = {}): Prom… | same file |
| J20 | EXTRACT SHARED HELPER | user-management | 09 | 70 | L | packages/user-management/src/server/grant-service.ts#inAuthorizedIdentityTransaction<T>(required: {deps: Auth… | 10 sites open a transaction then assertCallerHasAnyPermission with identical args |
| J21 | EXTRACT SHARED HELPER | agent-runtime | 07 | 65 | L | packages/agent-runtime/src/defs/shared.ts#acpModelFetcher(required: {args: readonly string[]}, optional: {tim… | 10 identical IIFE wrappers around detectAcpModels |
| J22 | KEEP | agent-runtime | - | 0 | L | - | buildArgs share 6 lines of --yolo/--model by coincidence; each CLI owns its flags (#72 #227 #266); #226 GONE (codebuddy.ts is 2 lines now) |
| J23 | EXTRACT SHARED HELPER | cms | 08 | 45 | M | packages/cms/src/content-types/lifecycle.ts#persistLifecycleTransition(required: {repo: ContentTypeRepoPort; … | 3 transitions repeat transaction+revision block; 5 functions repeat the admin.collections.manage authorize block |
| J24 | EXTRACT SHARED HELPER | cms | 08 | 22 | L | packages/cms/src/forms/write-service.ts#formCommandDeps(required: {deps: FormWriteServiceDeps}, optional: {ou… | same file |
| J25 | MERGE INTO EXISTING | integrations+agent-runtime | 07 (Phase A integrations; Phase B agent-runtime after H3) | 110 | M | integrations aihubmix-shared.ts with agent-runtime's public object-arg signatures, on the narrow subpath @jini-ai/integrations/media-providers/aihubmix; agent-runtime imports aihubmixOriginFromBase locally and re-exports the rest | agent-runtime depends on integrations, not the reverse; the local import keeps aihubmixCatalogUrl compiling (review 1) |
| J26 | KEEP | cms+plugins | - | 0 | L | - | structural port copy "without a CMS dependency edge" (plugins does not depend on cms) (#36 #219 #290) |
| J27 | KEEP | ui | - | 0 | L | - | import lists + 3-line app/lang/tokens spread; below value threshold (#38 #50 #93) |
| J28 | MERGE INTO EXISTING (d3r3 4–5) | ui | 06 | ~12 | L | packages/ui/src/features/i18n/template-i18n.ts#interpolate gains optional { keepPlaceholderWhen: 'absent' (default) \| 'nullish' } and accepts undefined vars; both I18n contexts delegate with 'nullish' | renderers moved into @jini-ai/ui so the old "no @jini-ai/ui dependency" reason is obsolete for a pure function |
| J29 | EXTRACT SHARED HELPER | plugins | 09 | 10 | L | packages/plugins/src/glue/manifest-keys.ts#collectManifestKeyErrors<E>(required: {raw: Readonly<Record<string… | glue stays import-free; host may import from ../glue (host already above glue). #244 capabilities check left as is (different error code objects) |
| J30 | EXTRACT SHARED HELPER | integrations | 07 | 60 | L | packages/integrations/src/media-providers/dispatch/openai-compatible.ts#jsonPostInit(required: {ctx: Pick<Ren… | registerVendorAdapters x12 (#169-173 #178-181) KEEP: explicit per-module composition is the documented pattern |
| J31 | KEEP | daemon+integrations | - | 0 | L | - | daemon has no integrations dependency and its module doc says the route pack deliberately owns narrow transport ports (#45 #82 #116 #148) |
| J32 | EXTRACT SHARED HELPER | core+admin+agent-runtime+agentic+daemon+ui | 05 (core function 05A; 16 calls / 13 files 05B after H1) | 44 | L | packages/core/src/records.ts#omitKeys({ source, keys }) | 5 identical copies; all packages depend on core; none public; call sites switch to object args |
| J33 | GONE | daemon+cms | - | 0 | - | - | clone no longer present at or near the recorded lines |
| J34 | MERGE INTO EXISTING | ui | 06 | 27 | L | ResourceBoardToolbar.tsx#ResourceBoardToolbarProps; View props become `extends Omit<ResourceBoardToolbarProps… | View re-declares 25 toolbar props verbatim |
| J35 | EXTRACT SHARED HELPER | ui | Opus backlog (effect deps change; check `useFetchQuery` first) | 14 | L | packages/ui/src/features/resource-dashboard/react/hooks/useLoadedList.ts#useLoadedList<T>(required: {load: ()… | identical load/reload/refresh effect |
| J36 | EXTRACT SHARED HELPER | cms | 08 | 30 | L | packages/cms/src/core/kernel-outbox.ts#toKernelOutbox(required: KernelOutboxAdapterDeps, _optional: Record<st… | 2 identical adapters + 3 identical deps types |
| J37 | MERGE INTO EXISTING | cms | 08 | 15 | L | @jini-ai/core/records#upsertRecord({records, record, identity: {id: record.id}}) | cms already imports @jini-ai/core/records; media primary save (preserveMediaCreator) stays. #175 #183 KEEP (5-line scoped finds) |
| J38 | EXTRACT SHARED HELPER | integrations | 07 | 22 | L | file-private validateSubscriptionFields(required: {deps: WebhookSubscriptionDeps; input: {label: string; targ… | 2x field validation, 3x find-or-404 |
| J39 | EXTRACT SHARED HELPER | chat | Opus backlog (effect deps change) | 10 | L | packages/chat/src/react/features/chat-pane/hooks/useComposerAnchoredPosition.hooks.ts#useComposerAnchoredPosi… | same resize/scroll tracking effect |
| J40 | EXTRACT SHARED HELPER | cms | 08 | 20 | L | file-private editEmbedHostBody<R extends object>(required: {deps: EmbedServiceDeps; input: {workspaceId: UUID… | 3 embed mutations share authorize+lock+load+guardrails+write |
| J41 | EXTRACT SHARED HELPER | cms | 08 | 22 | L | file-private assertValidWidgetConfig(required: {widgetType: string; config: Record<string, unknown>}, _option… | 3x registration lookup+config validation, 3x deps+onWritten spread |
| J42 | EXTRACT SHARED HELPER | platform+daemon | 09 (platform Phase A; daemon side after H4) | 25 | L | @jini-ai/platform (terminal.ts) interface TerminalSessionState + #terminalSessionState({ session }) | daemon already depends on platform; its identifier lint forbids the platform's grouping-key name, which the neutral base type no longer contains |
| J43 | EXTRACT SHARED HELPER | ui | 06 | 16 | L | packages/ui/src/features/interactive-ui/table-row-activation.ts#clickableRowProps(required: {row: Record<stri… | identical clickable-row wiring |
| J44 | EXTRACT SHARED HELPER | cms | 08 | 30 | L | file-private contentTypeLifecycleHandler(required: {routeDeps: ContentTypesToolDeps; transition: (required: {… | identical handler bodies, only the called function differs |
| J45 | MERGE INTO EXISTING | cms+core | 05 (core aliases 05A; cms file 05B) | 12 | L | @jini-ai/core#ToolPermissionAuthorizationPort + new aliases ToolPermissionAuthorizationRequired/Optional, re-exported by cms as AuthorizationPort/Required/Optional | cms depends on core; cms re-exports all three names via core/index.ts and core/tools/args.ts (d3r2 5) |
| J46 | EXTRACT SHARED HELPER | daemon | 09 Phase B (after H1) | 70 | M | daemon/src/http/body-fields.ts (read* body/path helpers), http/tool-result-api.ts#toolResultToApiResult; private errorMessage copies → @jini-ai/core/primitives#errorMessageOf | per-file copies of the same body/path parsers; messages reproduced exactly. The 22 isRecord copies are J46a (job 10, O2) |
| J46a | EXTRACT SHARED HELPER | daemon | 10 (O2; with JR01, after H6) | ~40 | L | daemon/src/core/is-record.ts re-exporting core isObjectRecord as isRecord (positional) | 22 daemon isRecord copies; a positional guard is the args-rule exception that needs O2 (review 11) |
| J47 | EXTRACT SHARED HELPER | core | 08 | 28 | L | local closure appendPurgeRevision(required: {scope: "user" / "workspace"; principalId: string / null; value: … | 3 identical 15-line revision objects |
| J48 | MERGE INTO EXISTING | ui | Opus backlog | 25 | M | packages/ui/src/browser/useDismissOnOutsideOrEscape.ts (unchanged); the 3 menu hooks delegate to it; the 4 public predicates STAY exported | characterization test pins the pointerdown/mousedown change; removing the predicates = breaking release (O9). #196 disclosure hooks KEEP (2x6 lines). #151 chat ConversationList KEEP (captures the root node on purpose for late unmount events) |
| J49 | EXTRACT SHARED HELPER | cms | 08 | 32 | L | redirects.ts file-private redirectRevision(required: {record: RedirectRecord; input: {actorId: string; plugin… | 3x revision literal, 2x transaction+enqueue, 2x prefix predicate (memory + sql) |
| J50 | EXTRACT SHARED HELPER | ui | 06 | 8 | L | BrandLogo.tsx exported interface ResolveLogoSrcOptions (used by resolveLogoSrc and useResolvedLogoSrc) | identical option type, written twice |
| J51 | EXTRACT SHARED HELPER | ui | 06 | 15 | L | packages/ui/src/utils/fake-latency.ts#fakeLatencyDelay(_required: Record<string, never>, optional: {latencyMs… | 11 identical fake-port delay closures. #242 KEEP (2 fake methods inside one test double); returned function takes `({ value }, _optional = {})` (d3r2 6) |
| J52 | MERGE INTO EXISTING | user-management | 09 | 20 | M | packages/user-management/src/admin/controllers/controller-store.ts#createControllerStore (unchanged; members/… | roles hand-rolls the same store |
| J53 | EXTRACT SHARED HELPER | core+cms+devops+platform+integrations+agent-plugins | 05 (core function 05A; 9 repoints 05B after H1) | 24 | L | packages/core/src/records.ts#parseSchemaV1Document({ raw }) | 9 explicit sites (admin-surfaces descriptor keeps its 64 KiB bound, api-connections keeps its namespace check); mail adapter-descriptors (v1/v2) and lifecycle tools/manifest EXCLUDED |
| J54 | MERGE INTO EXISTING | agent-plugins+platform | 09 | 5 | L | @jini-ai/platform/mail/smtp#SmtpMailPayload (type-only import) | lifecycle already imports @jini-ai/platform; type import is erased |
| J55 | EXTRACT SHARED HELPER | plugins | 09 | 25 | L | file-private notChangedEnableResult(required: {request: SetEnabledRequest; reason: string; note: string}, opt… | 5 not-changed literals + 2 identical console.warn lines |
| J56 | EXTRACT SHARED HELPER | core+mcp+agent-plugins+chat+daemon | 05 (core function 05A; repoints 05B after H1) | 15 | L | packages/core/src/records.ts#withoutUndefined({ source }) | 6 copies; all packages depend on core. chat question-form OmitUndefined and react defined-props differ (KEEP) |
| J57 | EXTRACT SHARED HELPER | user-management | 09 | 45 | L | repo.memory.ts abstract class InMemoryWorkspaceRecords<Row extends {workspaceId: string; id: string}> extends… | repeated generic CRUD + pass-through constructors |
| J58 | EXTRACT SHARED HELPER | agent-runtime | 07 (URL half); timeout half backlog decisions (d3r2 3) | ~5 | L | packages/agent-runtime/src/providers/provider-url.ts#appendVersionedApiPath(required: {baseUrl: string; suffi… | identical bodies |
| J59 | EXTRACT SHARED HELPER | ui | 06 | 8 | L | packages/ui/src/utils/pending-actions.ts (object args); source-config-list's 4 public positional names stay as one-line adapters | resource-dashboard copy deleted; a utils/ module is not a feature, so the no-cross-feature rule still holds (review 11) |
| J60 | BUG FIX then EXTRACT SHARED HELPER | daemon | 09 | 15 | M | step 1: the 4 decorators forward `options` whole (failing test first, own commit); step 2: tool-recovery/decorate-executor.ts#decorateToolExecutor({ inner, execute }) | fixes the MEDIUM confirmation-option bug (review 7), then removes 3 repeated pass-through methods |
| FOLD J02 | FOLD | chat+ui | - | - | - | J02 | part of the A2UI node renderer merge |
| FOLD J11 | FOLD | agent-runtime | - | - | - | J11 | - |
| FOLD J20 | FOLD | user-management | - | - | - | J20 | - |
| FOLD J12 | FOLD | cli | - | - | - | J12 | - |
| FOLD J23 | FOLD | cms | - | - | - | J23 | - |
| FOLD J21 | FOLD | agent-runtime | - | - | - | J21 | - |
| FOLD J09 | FOLD | daemon | - | - | - | J09 | - |
| J61 | KEEP | various | - | 0 | - | - | see md KEEP list |
| JR01 | EXTRACT SHARED HELPER | core + 11 packages | 10 (O2; step 1 Phase A; steps 2–4 after H6) | 80 | L | packages/core/src/records.ts#isObjectRecord(value) (POSITIONAL type guard) | 26 non-null non-array copies replaced; array-permissive and shape-typed guards excluded. OWNER DECISION O2 |
| JR02 | EXTRACT SHARED HELPER | http-kit+daemon | 09 (steps 1–4 http-kit; steps 5–6 daemon after H4) | 18 | L | packages/http-kit/src/origin.ts#passesSameOriginGuard({ req, res, origin }) over structural ports ApiErrorResponseWriter + RequestWithOriginHeaders (no Express type in the signature) | raw SSE/stream routes re-implement the guard-and-answer block; ports keep the Jini contract framework-neutral (review 6) |
| JR03 | MERGE INTO EXISTING | ui | 06 | 24 | L | packages/ui/src/features/connectors/rules.ts#withoutKey({ record, key }) (moved from useConnectorAuthorization; object args, not public) | 8 copies of one identity-preserving delete; memory slice re-exports it; its 'intentionally duplicated per slice' comment is overridden by the dedupe rule (FYI) |
| JR04 | EXTRACT SHARED HELPER | ui | 06 | 16 | L | packages/ui/src/features/connectors/rules.ts#withoutConnectedEntries<T>(required: {record: Record<string, T>;… | 3 copies of the 'drop entries whose connector is now connected' loop |
| JR05 | EXTRACT SHARED HELPER | ui | 06 | 24 | L | useMentionAtomicNavigation.ts file-private registerMentionCaretKey(required: {editor: LexicalEditor; command:… | 4 copies of the composing/plain-key/collapsed-range preamble; `act` takes `({ selection }, _optional = {})` (d3r3 3) |
| JR06 | EXTRACT SHARED HELPER | user-management | 09 | 10 | L | http.ts file-private async sendRolesRequest<T>(required: {transport: RolesHttpTransport; path: string; method… | 4 copies of abort-check + transport.request, 3 of the workspace root |
| JR07 | MERGE INTO EXISTING | ui+core | 05 | 10 | L | @jini-ai/core/contracts/cards#SurfaceCardSecretRun and #SurfaceCardSignInState; ui keeps its names as aliases | ui already aliases SecretCardField/SecretCardForm from the same core contract; these two unions were copied instead |
| JR08 | EXTRACT SHARED HELPER | agent-plugins | 09 | 5 | L | packages/agent-plugins/src/lifecycle/host-tools/skill-tool.ts#readInstalledSkillDetail(required: {plugin: {re… | per-skill read+summarize body copied; search-tool already imports summarizeSkillMarkdown from skill-tool |
| JR09 | KEEP | ui | - | 0 | L | - | renderers/index.ts:66-84 deliberately exports both (StringOnly suffix); shared part is 4 lines per function |
| FOLD J26 | FOLD | cms+agent-plugins+plugins | - | 0 | - | J26 | structural ports by design: domains 'import nothing from features/trash'; plugins/host/ports.ts:80 'STRUCTURAL mirrors of ... contribution-loader' |
| JR10 | KEEP | various | - | 0 | L | - | <10-line pairs in 1-2 places (fingerprint line found in <=2 files; #303 is a 1-line throw x3). #264 posthog vs opentelemetry: provider-plugin copies stay self-contained.… |
| T16J | DROPPED (review d3r 2) | ui | — | 0 (−30 Tovu via Opus T16) | L | none: Tovu composes the existing `useDismissOnOutsideOrEscape` (Escape-only) + `useFocusTrap` | a new Jini Escape listener would reimplement an existing owner |
| T18J | EXTRACT SHARED HELPER | ui | Opus backlog (T18) | +60 (−100 Tovu, Opus) | M | packages/ui/src/features/panel-kit/hooks/use-optimistic-stored-value.hooks.ts#useOptimisticStoredValue | Jini half of T18; effects keyed on the port's identity like the Tovu copies; design-written test |
| T23J | EXTRACT SHARED HELPER | ui | Opus backlog (T23) | +50 (−70 Tovu, Opus) | M | packages/ui/src/features/panel-kit/hooks/use-bounded-status-poll.hooks.ts#useBoundedStatusPoll | Jini half of T23; 'still running' becomes an injected shouldContinue; design-written test |
| X15J | MOVE TYPE | cms | 08 | 0 (enables X15) | L | packages/cms/src/forms/types.ts#FormSubmissionRedirectResult (@jini-ai/cms/forms); /forms/express keeps re-exporting it | framework-neutral home so a host renderer never names an Express subpath (review 6) |

### Tovu ↔ Tovu outside the route preamble (T*, TR*)

| id | decision | area | job | est. lines saved | risk | survivor / helper | reason |
|---|---|---|---|---|---|---|---|
| FOLD T31 | FOLD | cms+diagnostics | - | 0 | - | T31 (@jini-ai/http-kit/verified-origin) | T31 already lists both Jini copies |
| TR01 | EXTRACT SHARED HELPER | website/features/media | 03 | 50 | M | NEW apps/website/src/features/media/persist-assistant-media.ts: #mediaUploadDeps(required: {routeDeps: MediaU… | Two tools copy the whole upload+sniff+record+analytics+projection tail; 6 sites copy the uploadMedia deps block |
| TR02 | MERGE INTO EXISTING | website/server/runtime/composition | 03 | 8 | L | @jini-ai/platform/fs#writeJsonFileAtomic({filePath, data, fs: createNodeAtomicFilesystem({}, {})}, {mode: 0o6… | hand-rolled copy of Jini's atomic writer; explicit mode keeps 'never inherits a wider mode' |
| TR03 | EXTRACT SHARED HELPER | website/assistant | 03 | 12 | L | apps/website/src/assistant/assistant-vault.ts#writeAssistantVault(required: {deps: {repo: object; sealer: Sec… | identical prepare/CAS/hint flow; only scope, provider default, meta and error class differ |
| TR04 | EXTRACT SHARED HELPER | core (Jini) + website | 05A (Jini toMsClock + IsoClock) / 11 (Tovu phase 1; phase 2 needs O5) | 10 | L (phase 1) / M (phase 2) | @jini-ai/core/primitives#toMsClock({ clock: Clock / IsoClock }) | ISO-clock to Clock adapter in 22 places; generic, so Jini core; Tovu adopts after R1. comments/settings imports clone (lines 1-12) is an import header: KEEP |
| TR05 | MOVE-PLAN | website/features | - | 0 | - | - | dossier: strong-twin x7, module-twin jini packages/cms/src/forms/destination-descriptors.ts; lift a generic providers.json descriptor-list parser to Jini beside J53's pa… |
| FOLD T37 | FOLD | website/features | - | 0 | - | T37 | same requireToolPermission+adaptLegacyAuthorize preamble class (152 copies in 71 files); T37 routes it to a registration-kit design |
| TR06 | MOVE-PLAN | website/features/webhooks | - | 0 | - | - | dossier: LEGACY-TWIN jini packages/platform/src/secrets/keyring.env.ts. Interim option if the move slips: `class InMemoryKeyring extends FixedSiteKeyKeyring { constructo… |
| TR07 | EXTRACT SHARED HELPER | website/platform/site-dir | 03 | 10 | L | init-site.ts #SiteCreateProgress (renamed InitProgress, exported) + #externalContentDbDir(required: {target: … | duplicate-site already imports cleanupAndRethrow from init-site; the external-DB-dir test and the two-step cleanup are copied |
| TR08 | KEEP | website | - | 0 | L | - | 4-line body in 2 server places (admin copies are client memos over HTTP data); below threshold |
| TR09 | KEEP | desktop+website | - | 0 | L | - | cross-app: the packaged desktop app ships no apps/website/src, so it cannot import it; a shared home would be a Jini platform/fs workspace-options design, not a dedupe |
| T01 | KEEP | themes | - | 0 | L | - | __original-themes__ = pristine never-discovered reset copies (content/README.md:9,26; development/scripts/theme-tool.ts:5-8 'original stays byte-identical forever'); eac… |
| T02 | KEEP | themes | - | 0 | L | - | same reason as T01; plain browser scripts per theme, no module system to share through |
| T03 | EXTRACT SHARED HELPER | admin | 04 | 88 | L | apps/admin/src/components/line-icon.ts#LINE_ICON (const, same literal + as const) | 12-file manifest; the copies' why-comments move onto the shared doc (review 12). Jini SeoIcons.tsx copy KEEP (another repo's icon set, not a mechanism). Icon artwork stays |
| T04 | MOVE-PLAN | admin+desktop | - | ~45 | M | @jini-ai/ui (both apps already depend on it; add e.g. @jini-ai/ui/panel-kit#startVisibleInterval) | generic browser util duplicated across two separate apps; admin header says 'separate apps, no shared' -> only Jini can host it. Survivor should keep desktop's extra han… |
| T05 | MERGE INTO EXISTING | admin | 04 | 20 | L | apps/admin/src/lib/version-conflict.ts#readVersionConflict(required: { error: unknown; attemptedStatus: "draf… | lib/version-conflict.ts already hosts VERSION_CONFLICT_CODE/isVersionConflict for the same two editors (pages/rules.ts:433-441 says the shared one lives in lib/ so the n… |
| T06 | MERGE INTO EXISTING | admin | 04 | 14 | L | @jini-ai/ui/panel-kit#standingDraftRecoveryMessage (already re-exported by apps/admin/src/lib/standing-draft-… | isAutosaveDraftStale + pageAutosaveBannerMessage/postAutosaveBannerMessage have NO production caller (grep: only rules.ts + __tests__) - dead twins superseded by the Jin… |
| T07 | EXTRACT SHARED HELPER | admin | 04 | 40 | M | apps/admin/src/lib/admin-post-list-sort.ts#{DEFAULT_ADMIN_POST_SORT, compareAdminPostsByTitle/BySlug/ByStatus… | twin screens (pages/rules.ts:24) list-sort block; lib/ keeps the no-cross-feature boundary |
| T08 | KEEP | admin | - | 0 | L | - | row-menu builders bind feature-local i18n catalogs; merging needs a translator param for ~6 lines saved |
| T09 | MERGE INTO EXISTING | admin | 04 | 9 | L | PageEditorPort extends StandingDraftAutosavePort, Pick<PagesPort, "updatePost" / "deletePage"> | identical member signatures in two ports of one feature |
| T10 | MERGE INTO EXISTING | admin | 04 | 42 | L | @jini-ai/ui/admin-widgets#openLightboxDialog / closeLightboxDialog (packages/ui/src/features/admin-widgets/in… | Jini already exports the exact helpers; admin already imports @jini-ai/ui/admin-widgets (App.tsx:30) |
| T11 | MERGE INTO EXISTING | ui-kit (Jini) + admin | Opus backlog (O3) | −75 Tovu | M | @jini-ai/ui-kit `useNativeDialog` (existing native-dialog lifecycle; Tovu hooks become an adapter) | OWNER DECISION O3: the three headers document 'copied rather than imported' on purpose. Generic → Jini (review 5); T10 is safe either way |
| T12 | EXTRACT SHARED HELPER | admin | 04 | 14 | L | file-private OtherCredentialRemoveButton({ row, translate, dialogRef }) in the same file | Remove button + error block identical in OtherCredentialStaticRow and OtherCredentialReplaceableRow; markup unchanged |
| T13 | EXTRACT SHARED HELPER | admin | 04 | 18 | L | file-private makeNumberFieldControl(required: { step: string / undefined }) and makeStringFieldControl(requir… | Integer/Real and Text/Datetime controls differ by one attribute |
| T14 | KEEP | admin | - | 0 | L | - | shared part is 3 one-line field handlers + cancel guard; helper overhead ~= savings |
| T15 | EXTRACT SHARED HELPER | admin | 04 | 22 | L | file-private ContentTypeFieldsSection (props object, JSX) in Collections.tsx | Fields section + Add field + error span identical in NewContentTypeDialog and EditFieldsDialog |
| T16 | EXTRACT SHARED HELPER | admin | 04 (markup) + Opus backlog (hooks) | 35 + 30 | L | apps/admin/src/components/ConfirmActionDialog.tsx (props object, product markup); hook lifecycle → existing Jini `useDismissOnOutsideOrEscape` + `useFocusTrap` (Opus) | plugins and settings are separate features; product markup stays Tovu, Escape + focus-trap lifecycle is generic (review 5) |
| T17 | EXTRACT SHARED HELPER | admin | 04 | 22 | L | file-private type FetchedConfigFieldsProps + one merged switch arm in the dispatcher | 3 identical prop types and 3 identical JSX case arms |
| T18 | EXTRACT SHARED HELPER | admin | Opus backlog | ~100 | M | 3 AssistantDock hooks become wrappers over @jini-ai/ui/panel-kit#useOptimisticStoredValue (T18J) | same optimistic-then-stored state machine x3; port-swap characterization test first; display port memo-adapted on [port] (review 8) |
| T19 | EXTRACT SHARED HELPER | admin | 04 | 13 | L | file-private interface DockerfileEditorState in DockerfileTab.tsx | same 12-field props bag typed twice |
| T20 | EXTRACT SHARED HELPER | admin | 04 | 9 | L | exported interface AccessTokenFormFields (8 shared readonly fields) extended by AccessTokenExistingRowState a… | type-only |
| T21 | EXTRACT SHARED HELPER | admin | 04 | 16 | L | file-private interface MenuItemFieldProps { item; path; onChange; t } | 3 identical inline prop types |
| T22 | EXTRACT SHARED HELPER | admin | 04 | 22 | L | apps/admin/src/lib/credential-submit-error.ts#classifyCredentialSubmitError(required: { error: unknown }, _op… | identical type + classifier in two features that cannot import each other |
| T23 | EXTRACT SHARED HELPER | admin | Opus backlog | ~70 | M | export + publish hooks use @jini-ai/ui/panel-kit#useBoundedStatusPoll (T23J) with an injected shouldContinue | self-scheduling bounded poll loop is a generic mechanism |
| T24 | KEEP | admin | - | 0 | L | - | JSX boilerplate or <10-line twins across features that may not import each other; helper overhead >= savings; visuals already delegate to @jini-ai/ui Icon |
| T25 | KEEP | admin | - | 0 | L | - | test fakes (createFake* autosave port) |
| T26 | MOVE-PLAN | admin+desktop | - | 0 | M | jini:packages/chat/src/react/hooks/assistant-chats.ts (dossier legacy-twins.jsonl, MOUNTED) | separate apps; Jini chat twin exists |
| T27 | EXTRACT SHARED HELPER | desktop | 04 | 40 | L | apps/desktop/src/renderer/icon-frame.tsx#IconFrame({ children }) (NEW module, JSX only at render) | must NOT live in icons.tsx: tool-icons.tsx:1-6 forbids importing icons.tsx's module-level JSX tables |
| T28 | KEEP | desktop | - | 0 | L | - | one-off dev/verification scripts; standalone by design |
| T29 | KEEP | desktop | - | 0 | L | - | glyph paths deliberately redrawn (module-level JSX constraint); <10-line intra-file pairs |
| T30 | MERGE INTO EXISTING | website | 03 | ~260 | L | @jini-ai/core#AgentToolDefinition (31 copies in groups G0–G5: G0 import core's type directly; G1 default alias; G2/G4 required inputSchema; G3/G4 re-export ActorClassRule; G5 publish-content narrowed rule via intersection) | 31 copies of one interface (not 20); Jini core already owns it and says domains tighten via narrower unions (packages/core/src/agent-tools.ts:12-13) |
| T31 | MOVE-PLAN | website | - | ~18 | M | @jini-ai/http-kit/verified-origin (owner of VerifiedOrigin); Jini copies: packages/cms/src/seo/absolute-url.t… | generic VerifiedOrigin->URL join, 7 copies across both repos; Jini doc (absolute-url.ts:33-39) says promoting it is owned by the origin module |
| T32 | MERGE INTO EXISTING | website | 03 | 15 | L | apps/website/src/features/members/tool-registrations.ts#buildMembersWriteServiceDeps({ deps }, _optional = {}) (exported; was file-private toMembersWriteServiceDeps); inbound toMembersWriteServiceDeps(deps) = one-line adapter (d3r3 2) | inbound may import features, not the reverse. COORDINATE with the route-file plan (routes/members/deps.ts) |
| T33 | MERGE INTO EXISTING | website | 03 | 35 | M | apps/website/src/features/newsletter/deps-builders.ts#buildConfirmationDeps / buildSubscriptionsDeps / buildSendPipelineDeps({ deps, isSendingEnabled }, { unsubscribe, sleep }); existing names stay as one-line adapters | both bindings passed explicitly (admin: false + unsubscribe + sleep; tool: newsletterSendingEnabled, neither), so behavior is unchanged; design-written characterization test (review 2). O4 and O8 stay open |
| T34 | MERGE INTO EXISTING | website | 03 | 25 | L | features export toWebhookDeliveryView({ delivery }) and toChangeSetView({ changeSet }); inbound reuses them | only the delivery-detail and change-set projections are identical; the subscription projections are different contracts and stay separate (review 3) |
| T35 | KEEP | website | - | 0 | L | - | kysely selectFrom/where/executeTakeFirst boilerplate (7-13 lines each); idiomatic query code, implements Jini ports; no helper saves lines without hiding SQL |
| T36 | KEEP | website | - | 0 | L | - | in-memory test fakes mirroring the SQL repos |
| T37 | KEEP | website | - | 0 | L | - | handler preambles; a shared wrapper is a cross-cutting registration-kit change, not a dedupe (flag to design-d3 as a separate idea) |
| T38 | KEEP | website | - | 0 | L | - | intra-function branch bodies, import headers, <10-line seams (readPrincipalId 4 lines x2, sse 3 lines x2) - not shared logic |

### Tovu ↔ Jini twins (X*)

| id | decision | area | job | est. lines saved | risk | survivor / helper | reason |
|---|---|---|---|---|---|---|---|
| X01 | REPOINT-NOW | apps/website/src/features/webmcp/genera… | 03 | 165 | - | @jini-ai/agentic/core#createAnnotatedActionsScript | Deliberate generated snapshot; its README says replace with @jini-ai/agentic/core at next release; installed @jini-ai/agentic 0.7.0 now exports it |
| X02 | MOVE-PLAN | apps/admin/src/features/users/hooks/use… | - | 190 | - | @jini-ai/user-management/react/testing#createFakeUsersPort + @jini-ai/user-management/react#UsersPort | Tovu already mounts Jini Users screen through toJiniUsersPort adapter; adopting Jini port shape deletes Tovu port + adapter + test fake (fake lives in a prod file but on… |
| X03 | MOVE-PLAN | apps/admin/src/features/roles/hooks/rol… | - | 120 | - | @jini-ai/user-management/react/testing#createFakeRolesPort + @jini-ai/user-management/react#RolesPort | Fake is a field-for-field port of the Jini fake; needs Tovu RolesPort to adopt Jini shape first |
| X04 | MOVE-PLAN | apps/admin/src/features/members/hooks/m… | - | 50 | - | @jini-ai/user-management/react/testing#createFakeMembersPort + @jini-ai/user-management/react#MembersPort | Same pattern as X02: Tovu mounts Jini Members via adapter |
| X05 | MOVE-PLAN | apps/admin/src/features/media/rules.ts | - | 200 | - | @jini-ai/admin/media#parseMediaHtmlAttributes,isAllowedMediaHtmlAttributeName,MEDIA_HTML_ATTRIBUTE_ALLOWED_NA… | Security boundary (stored-XSS hint) duplicated in admin; keep Tovu i18n describe until Jini takes a locale/translator |
| X06 | REPOINT-NOW | apps/desktop/src/renderer/folder-drop.ts | 03 | 95 | - | @jini-ai/ui/core#folderPathsFromDataTransfer | Whole folder-drop.ts is the Jini rules.ts pre-extraction; @jini-ai/ui is a declared desktop dep |
| X07 | KEEP | apps/website/src/features/navigation/in… | - | 0 | - | @jini-ai/cms/navigation/node (re-export list) | Clone is the export-name list; dossier BOUNDARY-ENTRY (promoted surface, STAY) |
| X08 | MOVE-PLAN | apps/website/src/features/agent-plugins… | - | 60 | - | @jini-ai/agent-plugins/lifecycle#createAgentPluginLifecycle(...).readInstalledMcpServers | Tovu agent-plugins feature is the host copy of Jini lifecycle; part of the agent-plugins lift |
| X09 | KEEP | apps/website/src/features/media/contrac… | - | 0 | - | @jini-ai/plugins/host#RemoveEntity | Tovu RemoveMediaFn/RemoveMenuFn/RemoveTaxonomyFn are deliberately NARROWED (routes/types.ts documents why); RemoveTermFn is the wide one. Structural seam, not logic |
| X10 | REPOINT-NOW | apps/website/src/platform/db/chat-kerne… | 03 | 20 | - | @jini-ai/chat/store/runtime#ChatDatabase | Rewrite Tovu ChatDatabase as Jini ChatDatabase & {tovu table}; exported name unchanged so importers untouched |
| X11 | REPOINT-NOW | apps/website/src/platform/db/sqlite/dat… | 03 | 16 | - | @jini-ai/db/recovery#LedgerAppendPort | Tovu repo implements the Jini port structurally; type the row from the port |
| X12 | MOVE-PLAN | apps/website/src/features/database-tran… | - | 18 | - | @jini-ai/db/tools#DatabaseDestinationStorePort,SavedDatabaseDestination,DatabaseTransferRunSummary | Whole features/database-transfer (copy-engine, postgres-target, sqlite-source, table-catalog, plan-store) mirrors @jini-ai/db/transfer+tools; belongs to that lift, not a… |
| X13 | KEEP | apps/admin/src/features/database/Databa… | - | 0 | - | @jini-ai/admin pages (DataTable/load-more/page header JSX) | Generic JSX boilerplate (DataTable + load-more button, page header/toolbar), not shared logic |
| X14 | MOVE-PLAN | apps/website/src/server/inbound/admin-h… | - | 40 | - | @jini-ai/user-management/server#identityReposFrom | Jini exports it once (input = flat IdentityToolDeps-shaped bag), Tovu deletes 3 copies |
| X15 | REPOINT (after R1) | apps/website/src/server/inbound/public-… | 11 | 12 | - | @jini-ai/cms/forms#FormSubmissionRedirectResult (moved there by X15J) | type-only; waits for X15J and the Jini release so Tovu never names the /forms/express subpath (review 6) |
| X16 | KEEP | apps/website/src/features/post/repo.mem… | - | 0 | - | cms repo.memory upsert/remove | In-memory repo upsert/remove boilerplate across unrelated entities |
| X17 | REPOINT-NOW | apps/website/src/features/identity/dele… | 03 | 14 | - | @jini-ai/user-management/server#principalHoldsOwnerWildcard | Tovu header calls it a private copy; Jini now exports it from the subpath Tovu already imports |
| X18 | MOVE-PLAN | apps/website/src/features/identity/dele… | - | 20 | - | @jini-ai/user-management/server#countActiveOwnerWildcardPrincipals (+assertActiveOwnerFloor) | Jini must export the counter (or an assertActiveOwnerFloor) before Tovu can drop its copy |
| X19 | REPOINT-NOW | apps/website/src/platform/site-dir/acti… | 03 | 30 | - | @jini-ai/platform/fs#upsertEnvLine,readEnvLine | Identical pure text transforms; Tovu site-dir already imports @jini-ai/platform/fs |
| X20 | MOVE-PLAN | apps/website/src/server/inbound/admin-h… | - | 150 | - | @jini-ai/core/settings/express#registerSettingsRoutes | Tovu settings admin routes are a legacy copy of the Jini settings HTTP module; Tovu shared.ts already imports helpers from it |
| X21 | REPOINT-NOW | apps/website/src/server/runtime/boot/re… | 03 | 22 | - | @jini-ai/platform/mail#ResolvedMailer | interface ResolvedMailer extends Omit<Jini ResolvedMailer,"mailer"> { mailer: MailerPort } |
| X22 | MOVE-PLAN | apps/website/src/assistant/mcp-federati… | - | 100 | - | @jini-ai/mcp/federation#attachFederatedMcpTools | Tovu bootstrap.ts is the pre-extraction copy; keep only the Tovu env-name binding |
| X23 | MOVE-PLAN | apps/website/src/server/runtime/composi… | - | 45 | - | @jini-ai/chat/core/ag-ui#reduceAgentWirePayload | Jini must switch its usage reducer to parseUsageEvent first, else repoint loses stopReason |
| X24 | MOVE-PLAN | apps/website/src/features/source-contro… | - | 100 | - | @jini-ai/integrations/credentialed-http/sets#listCredentialSets,describeCredentialSet,... (Host-based) | Dossier module-twin (2.74) + LEGACY-TWIN of devops/source-control; Tovu store becomes a Host binding |
| X25 | REPOINT-NOW | apps/website/src/features/entries/contr… | 03 | 12 | - | @jini-ai/cms/widgets/resolvers#EntryListExcludingTypesPort | Tovu interface is the same single-method port Jini now exports |
| X26 | MOVE-PLAN | apps/admin/src/components/Select/Select… | - | 140 | - | @jini-ai/ui/admin-widgets (Select already mounted from Jini) | Tovu "host-retained" helpers (computePosition, buildOptionId, repositionOrClose, edge/highlight helpers) have NO prod importer - only Select.hooks.unit.test.tsx; delete … |
| X27 | REPOINT-NOW | apps/admin/src/features/auth/hooks/use-… | 03 | 10 | - | @jini-ai/user-management/react#LoginController | interface LoginController extends Jini LoginController { failure? }; hook already wraps Jini useLogin |
| X28 | KEEP | apps/website/src/features/agent-plugins… | - | 0 | - | providers-file parser shape (11 Jini copies e.g. @jini-ai/platform/object-store#parseObjectStoresFile) | Same parse-JSON/schemaVersion/array scaffold for different registries; candidate for a generic helper, not a twin |
| X29 | MOVE-PLAN | apps/admin/src/features/media/hooks/use… | - | 10 | - | @jini-ai/admin/media/react (edit-media controller) | Part of the admin media LEGACY-TWIN lift (dossier); 10-line clone only |
| X30 | REPOINT-NOW | apps/website/src/platform/db/keyset-cur… | 03 | 34 | - | @jini-ai/cms/core#encodeKeysetCursor,decodeKeysetCursor | Whole file identical |
| X31 | REPOINT-NOW (deferred, d3r2 1) | apps/website/src/server/inbound/public-… | backlog decisions | 22 | - | @jini-ai/cms/seo#HeadElement,JsonLd | Jini seo/types.ts copy says it duplicates this file; Jini is canonical now |
| X32 | KEEP | apps/website/src/features/site-backup/p… | - | 0 | - | @jini-ai/db/tools#DatabaseTransferPlanStore (shape) | 8-line single-use plan take(); generic PlanStore<T> candidate only |
| X33 | KEEP | apps/website/src/server/runtime/lifecyc… | - | 0 | - | @jini-ai/sidecar/supervisor/node (child adapter) | 8-line ChildProcess->SidecarDaemonProcess adapter; under threshold |
| X34 | MOVE-PLAN | apps/website/src/features/webhooks/keyr… | - | 300 | - | @jini-ai/platform/secrets#EnvOrFileKeyring,FixedSiteKeyKeyring,parseRootKeyHex,... | Clone is 8 lines but dossier flags the 477-line file as LEGACY-TWIN of Jini keyring.env (14 prod importers) - needs its own move-plan entry |
| X35 | KEEP | apps/website/src/features/skills/tool-r… | - | 0 | - | various | Under 10 lines, not clustered (escapeHtml, clampListLimit, scheduler tick, element walk, restore-point capture, port method lists, catalog map) |
| X36 | KEEP | apps/website/src/features/media-import/… | - | 0 | - | tool-registration handlers | Tool handler boilerplate (requireToolPermission/requireString/comment blocks) across unrelated tools |
