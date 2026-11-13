# Duplicated-code removal plan (Tovu + Jini)

Design 2026-11-13 (design-d3). DESIGN plus one worked example; Codex Terra executes the `dedupe-NN.terra-prompt.md` jobs in this folder. Every clone group has a decision; nothing is left for Terra to judge.

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

Expected from jobs 01–09: **≈4,900 lines** (≈2,700 Tovu, ≈2,200 Jini). Job 10 (owner-gated) adds ≈160. Agents' estimates are marked `~` in the tables; treat them as ±30%. Re-measure after the jobs (see "After the jobs").

## Job order (by savings ÷ risk; dependencies first)

| job | scope | groups | est. saved | risk | depends on |
|---|---|---|---|---|---|
| dedupe-01 | Tovu route preamble, part 1 (admin-http non-route + routes a–m) + publish-content guard twin + newsletter/widgets helper bodies | RG1, RG2, RG3 | ≈780 | L | worked example (done) |
| dedupe-02 | Tovu route preamble, part 2 (routes n–z, public-http) | RG1, RG2 | ≈760 | L | 01's helpers (already committed) |
| dedupe-05 | Jini core-level helpers | J03 J05 J09 J32 J45 J53 J56 JR07 TR04(Jini half) | ≈260 | L/M | — (run before 06–09) |
| dedupe-03 | Tovu website features + import swaps to Jini | X01 X06 X10 X11 X15 X17 X19 X21 X25 X27 X30 X31 T30 T32 T34 TR01 TR02 TR03 TR07 | ≈780 | L/M | 01–02 landed |
| dedupe-04 | Tovu admin + desktop React | T03 T05 T06 T07 T09 T10 T12 T13 T15–T23 T27 | ≈530 | L/M | — |
| dedupe-06 | Jini chat + ui | J01 J02 J07 J28 J34 J35 J39 J43 J48 J50 J51 J59 JR03 JR04 JR05 | ≈460 | L/M | 05 |
| dedupe-07 | Jini agent-runtime + integrations | J10 J11 J14 J15 J16 J19 J21 J25 J30 J38 J58 | ≈410 | L/M | 05 |
| dedupe-08 | Jini cms | J23 J24 J36 J37 J40 J41 J44 J47 J49 | ≈240 | L/M | 05 |
| dedupe-09 | Jini daemon/cli/platform/mcp/user-management/plugins | J06 J08 J12 J20 J29 J42 J46 J52 J54 J55 J57 J60 JR02 JR06 JR08 | ≈520 | L/M | 05 (J46 uses J09's helpers) |
| dedupe-10 | OWNER-GATED | JR01 T11 T33 | ≈160 | M | owner yes per group |

Tovu jobs (01–04) and Jini jobs (05–09) touch different repos and can run in parallel lanes; inside a repo run them in the order above. Jini jobs type-check only the touched package and never rebuild or publish; the coordinator rebuilds/links Jini after review (owner rule: Jini rebuild only after review).

## Route preamble (Tovu `apps/website/src/server/inbound`, 343 pairs, 4,086 jscpd lines) — designed here

The biggest cluster is not copied logic but the same request preamble in ~190 route files: the workspace 404 (4 lines) and a hand-rolled `deps.authorize()` + 403 (14 lines). After stripping those two blocks, 86 of 217 ≥10-line route pairs fall below 6 real lines (script: classify the A-side range, remove the two block patterns and pure boilerplate lines).

| id | decision | survivor / helper | reason | est. saved | risk |
|---|---|---|---|---|---|
| RG1 | MERGE INTO EXISTING | `server/inbound/shared/route-guards.ts#rejectForeignWorkspace({ req, res, workspaceId }): boolean` and `#readRouteParam({ req, name })` — moved verbatim from `admin-http/routes/media/route-guards.ts` (the args-rule form). The positional twin `routes/publish-content/route-helpers.ts#rejectForeignWorkspace(req, res, workspaceId)` / `routeParam` is deleted and its 7 importers repointed. | Three copies of one guard existed already (inline ×184, media, publish-content); the media one already has the object-args signature and the why-comment. `shared/` because public-http routes use the same block. | ≈525 | L |
| RG2 | MERGE INTO EXISTING | `admin-http/authorize-guard.ts#authorizeDirectOrRespond({ res, authorize, params })` — moved from `routes/media/route-guards.ts#authorizeMediaOrRespond`; it and `authorizeOrRespond` now share one private `writeForbidden` body. | 81 inline blocks write the byte-identical 403 body. They call `deps.authorize` directly, NOT the publish-trust-aware `authorizeOrRespond`; swapping to `authorizeOrRespond` would change who a publishing credential can act as, so the direct variant keeps today's behavior (owner decision O1). | ≈1,000 | L |
| RG3 | MERGE INTO EXISTING | `http/newsletter.ts#requireNewsletterPermissionOrRespond`, `http/widgets.ts#requireWidgetsPermissionOrRespond` keep their signatures; bodies call `authorizeDirectOrRespond`. | Same 403 body copied twice more; both also bypass publish-trust today (kept). | ≈16 | L |
| RG4 | FOLD RG1/RG2 | `system/custom-credentials.ts` + `system/source-control-credentials.ts` `rejectUnlessAuthorized` (24-line twin) | After RG1/RG2 each closure is 4 lines; a cross-file helper would save ~2 lines. Converted in job 01 with `return true`. | (in RG1/RG2) | L |
| RG5 | FOLD T33 | `routes/newsletter/deps.ts#toConfirmationDeps` ↔ `public-http/routes/site/newsletter-deps.ts#toPublicConfirmationDeps` | Same newsletter deps-bundle family as T33, which is owner-gated on the `isSendingEnabled` divergence; one design, one job. | (in T33) | — |
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

## Owner decisions needed
- **O1 — publishing credentials on ~85 admin routes.** These routes (plus newsletter, widgets, media) call `deps.authorize` directly; only the ~70 call sites using `authorizeOrRespond` apply the publishing-grant capability set. The plan keeps today's behavior (`authorizeDirectOrRespond`). Switching them is a one-word change per site after jobs 01–02 if the owner wants every route to honor publishing grants.
- **O2 — JR01** `isRecord` copies in 11 Jini packages → one core guard: the copies are positional `(value)` (TypeScript narrows only the named argument); the args rule wants objects. Approve a positional exception for type guards, or keep the copies.
- **O3 — T11** `useNativeModalDialog` for three admin modal hooks: changes three components' hook wiring (visual output identical, focus/escape timing could shift).
- **O4 — T33/RG5** newsletter send pipeline: the admin route hard-wires `isSendingEnabled: async () => false` (`routes/newsletter/deps.ts:153`, documented as deliberate) while the agent-tool twin honors `deps.newsletterSendingEnabled` (`features/newsletter/tool-registrations.ts:175`). Which launch-gate wins?
- **O5 — TR04 phase 2**: 16 Tovu sites wrap `{ nowMs: () => Date.parse(x.nowIso()) }`; converting them to Jini `toMsClock` would prefer `nowMs` when a clock has both (only test fakes do).
- **O6 — X05** media hint attribute: Tovu allows attribute name `value`, Jini does not; pick one before the move converges them.
- **O7 — AG-UI `stopReason`** (J61 #129, X23): Jini's `@jini-ai/chat/core/ag-ui` reduces usage inline and drops `stopReason`; Tovu's copy keeps it. Fix Jini before the move repoints X23.

## Bugs found while designing (not fixed here; for `development/open-bugs.md`)
- **MEDIUM (verified):** Jini `packages/daemon/src/tool-recovery/{analytics,observability,federated-refusal,redaction}.ts` decorators destructure only `{ signal, emitSurface }` and forward only those (`analytics.ts:42-46`), so a host's per-call `requireConfirmation: true` (`tool-executor.ts:183`, checked at `:745`) is dropped whenever the executor is wrapped — the call runs without the confirmation the host asked for. Fix: forward `options` whole; red test first. Job 09 (J60) dedupes the wrappers but does not fix this.
- **LOW:** Tovu `reduceAgentWirePayload` (`apps/website/src/server/runtime/composition/modules/assistant-ag-ui.ts:183`) indexes `WIRE_PAYLOAD_REDUCERS[payload.type]` without `Object.hasOwn`; a payload type `"toString"`/`"constructor"` hits `Object.prototype`. Jini's copy has the guard.
- **LOW:** Jini `packages/artifacts/src/text-suppression.ts` `TOOL_CALL_OPEN_RE = /(?:<\s*tool_call\b[^>]*>|<\s*edit\s*>)/i` also matches prose like `x < tool_call.count && y > 0` and hides it; agent-runtime has the hardened regex. J05 keeps the regexes per package (no behavior change).
- **Dead code:** Tovu `apps/admin/src/components/Select/Select.hooks.tsx` helpers have no production importer (only `components/__tests__/Select.hooks.unit.test.tsx`); production uses the Jini Select (X26, move plan).
- **Owner-rule hits:** cms comments memory/SQL repos use non-null `!` (J61 note).
- **Type duplicates (not jscpd hits):** four separate `AuthorizeFn` types in Jini (`cms/src/core/commands/command.ts:99`, `cms/src/taxonomy/write-service.ts:52`, `core/src/gated-mutations/ports.ts:8`, `core/src/settings/write-service.ts:46`). Candidate for the next pass.

## After the jobs
1. Re-run `development/cloud/quality-1111/static/scripts/run-jscpd.sh` (same flags) and diff against this TSV; any new ≥10-line clone created by the jobs is a defect in the job.
2. Design RG7 residuals and anything a job reported STALE.
3. The coordinator rebuilds/links Jini once, after review of jobs 05–09, then runs the Tovu half of TR04 and the X groups that wait on new Jini exports.

## Review focus for the Codex reviewer
- Four design agents wrote the J/T/X recipes from the TSV, reading only clone ranges. Check the M-risk groups first: J02, J03, J05, J25, J46, J48, J52, J60, T04, T07, T11, T16, T18, T23, TR04, X groups with `behavior_divergence` other than none.
- Every EXTRACT target package is one both sides already depend on (no new package, no upward import) — spot-check J05 (`@jini-ai/core/text`), J09/J32/J53/J56/JR01 (`@jini-ai/core`), J42 (platform helper used by daemon: confirm daemon already depends on platform).
- Raw per-group data (files, signatures, divergence, tests) is in the job prompts; the tables below are the index.

## All groups

### Jini ↔ Jini (J*, JR*)

| id | decision | area | job | est. lines saved | risk | survivor / helper | reason |
|---|---|---|---|---|---|---|---|
| J01 | EXTRACT SHARED HELPER | chat | 06 | 90 | L | packages/chat/src/react/components/ToolCard.tsx#FamilyCard (file-private React component; single props object… | 10 family cards repeat ExpandableCard+ResultBadge+title+ToolCallDetail |
| J02 | MERGE INTO EXISTING | chat+ui | 06 | 100 | M | packages/ui/src/features/a2ui/renderer.tsx#A2uiComponentNode (rename RenderNode, export via @jini-ai/ui/a2ui … | chat already depends on ui; ui renderer is a superset |
| J03 | MERGE INTO EXISTING | agent-runtime+integrations | 05 | 12 | M | @jini-ai/core#isIpLiteralHostname({ hostname }) (packages/core/src/origin-validation.ts:197, exported from co… | jscpd 48-line span is mostly doc comment; only the 5-line looksLikeIpLiteral is shared; the two validators intentionally differ (loopback allowed vs blocked) |
| J04 | KEEP | chat | - | 0 | L | - | public barrel lists; index.ts carries the @deprecated alias block and scripts/check-chatpane-public-surface.ts reads these barrels textually |
| J05 | EXTRACT SHARED HELPER | core+artifacts+agent-runtime | 05 | 95 | M | packages/core/src/text/tagged-text-suppression.ts#createTaggedTextSuppressor(required: {openRe: RegExp; close… | agent-runtime does not depend on artifacts; both depend on core; pure string code |
| J06 | MERGE INTO EXISTING | mcp | 09 | 32 | L | packages/mcp/src/core/config.ts#defaultMcpSecretFilesystem (rename+export the existing const defaultFilesyste… | tokens.ts already imports McpConfigFilesystemPort from config.ts |
| J07 | MERGE INTO EXISTING | chat+ui | 06 | 48 | L | @jini-ai/ui/renderers types ArtifactKind, ArtifactRendererId, ArtifactExportKind, ArtifactStatus, ArtifactMan… | chat depends on ui; ui doc says "keep in sync by hand" - remove that need |
| J08 | EXTRACT SHARED HELPER | daemon | 09 | 33 | L | packages/daemon/src/http/catalog-route-input.ts#parseCatalogSearchInput(required: {input: RouteInputContext},… | same package; import-line clones (#223 #269 #272) and mcp catalog-tool clone (#289) are import/arg boilerplate -> KEEP |
| J09 | EXTRACT SHARED HELPER | core+platform+sidecar | 05 | 35 | L | packages/core/src/primitives/errors.ts#errorCodeOf(required: {error: unknown}, _optional: Record<string, neve… | COORDINATE with design-jini-errors (it owns Jini error helpers); ~20 more errorMessage copies exist repo-wide (daemon, chat, ui, agent-runtime) that the same helper can … |
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
| J25 | MERGE INTO EXISTING | integrations+agent-runtime | 07 | 110 | M | packages/integrations/src/media-providers/dispatch/providers/aihubmix-shared.ts (survivor, converted to agent… | agent-runtime depends on integrations, not the reverse; integrations positional args violate (required, optional) rule |
| J26 | KEEP | cms+plugins | - | 0 | L | - | structural port copy "without a CMS dependency edge" (plugins does not depend on cms) (#36 #219 #290) |
| J27 | KEEP | ui | - | 0 | L | - | import lists + 3-line app/lang/tokens spread; below value threshold (#38 #50 #93) |
| J28 | EXTRACT SHARED HELPER | ui | 06 | 7 | L | packages/ui/src/features/i18n/interpolate.ts#interpolateTranslation(required: {template: string}, optional: {… | renderers moved into @jini-ai/ui so the old "no @jini-ai/ui dependency" reason is obsolete for a pure function |
| J29 | EXTRACT SHARED HELPER | plugins | 09 | 10 | L | packages/plugins/src/glue/manifest-keys.ts#collectManifestKeyErrors<E>(required: {raw: Readonly<Record<string… | glue stays import-free; host may import from ../glue (host already above glue). #244 capabilities check left as is (different error code objects) |
| J30 | EXTRACT SHARED HELPER | integrations | 07 | 60 | L | packages/integrations/src/media-providers/dispatch/openai-compatible.ts#jsonPostInit(required: {ctx: Pick<Ren… | registerVendorAdapters x12 (#169-173 #178-181) KEEP: explicit per-module composition is the documented pattern |
| J31 | KEEP | daemon+integrations | - | 0 | L | - | daemon has no integrations dependency and its module doc says the route pack deliberately owns narrow transport ports (#45 #82 #116 #148) |
| J32 | EXTRACT SHARED HELPER | core+admin+agent-runtime+agentic+daemon… | 05 | 44 | L | packages/core/src/records.ts#omitKeys<T extends object, K extends keyof T>(required: {source: T; keys: readon… | all five packages depend on core; 16 call sites switch to object args |
| J33 | GONE | daemon+cms | - | 0 | - | - | clone no longer present at or near the recorded lines |
| J34 | MERGE INTO EXISTING | ui | 06 | 27 | L | ResourceBoardToolbar.tsx#ResourceBoardToolbarProps; View props become `extends Omit<ResourceBoardToolbarProps… | View re-declares 25 toolbar props verbatim |
| J35 | EXTRACT SHARED HELPER | ui | 06 | 14 | L | packages/ui/src/features/resource-dashboard/react/hooks/useLoadedList.ts#useLoadedList<T>(required: {load: ()… | identical load/reload/refresh effect |
| J36 | EXTRACT SHARED HELPER | cms | 08 | 30 | L | packages/cms/src/core/kernel-outbox.ts#toKernelOutbox(required: KernelOutboxAdapterDeps, _optional: Record<st… | 2 identical adapters + 3 identical deps types |
| J37 | MERGE INTO EXISTING | cms | 08 | 15 | L | @jini-ai/core/records#upsertRecord({records, record, identity: {id: record.id}}) | cms already imports @jini-ai/core/records; media primary save (preserveMediaCreator) stays. #175 #183 KEEP (5-line scoped finds) |
| J38 | EXTRACT SHARED HELPER | integrations | 07 | 22 | L | file-private validateSubscriptionFields(required: {deps: WebhookSubscriptionDeps; input: {label: string; targ… | 2x field validation, 3x find-or-404 |
| J39 | EXTRACT SHARED HELPER | chat | 06 | 10 | L | packages/chat/src/react/features/chat-pane/hooks/useComposerAnchoredPosition.hooks.ts#useComposerAnchoredPosi… | same resize/scroll tracking effect |
| J40 | EXTRACT SHARED HELPER | cms | 08 | 20 | L | file-private editEmbedHostBody<R extends object>(required: {deps: EmbedServiceDeps; input: {workspaceId: UUID… | 3 embed mutations share authorize+lock+load+guardrails+write |
| J41 | EXTRACT SHARED HELPER | cms | 08 | 22 | L | file-private assertValidWidgetConfig(required: {widgetType: string; config: Record<string, unknown>}, _option… | 3x registration lookup+config validation, 3x deps+onWritten spread |
| J42 | EXTRACT SHARED HELPER | platform+daemon | 09 | 25 | L | @jini-ai/platform (terminal.ts) interface TerminalSessionState + #terminalSessionState(required: {session: Te… | daemon already depends on platform; its identifier lint forbids the platform's grouping-key name, which the neutral base type no longer contains |
| J43 | EXTRACT SHARED HELPER | ui | 06 | 16 | L | packages/ui/src/features/interactive-ui/table-row-activation.ts#clickableRowProps(required: {row: Record<stri… | identical clickable-row wiring |
| J44 | EXTRACT SHARED HELPER | cms | 08 | 30 | L | file-private contentTypeLifecycleHandler(required: {routeDeps: ContentTypesToolDeps; transition: (required: {… | identical handler bodies, only the called function differs |
| J45 | MERGE INTO EXISTING | cms+core | 05 | 12 | L | @jini-ai/core#ToolPermissionAuthorizationPort (already exported from the core root) | cms depends on core; only AuthorizationPort is imported from the cms file |
| J46 | EXTRACT SHARED HELPER | daemon | 09 | 110 | M | packages/daemon/src/core/is-record.ts#isRecord (positional type-guard adapter over @jini-ai/core/records#isNo… | 19 isRecord copies + per-file copies of the same body/path parsers |
| J47 | EXTRACT SHARED HELPER | core | 08 | 28 | L | local closure appendPurgeRevision(required: {scope: "user" / "workspace"; principalId: string / null; value: … | 3 identical 15-line revision objects |
| J48 | MERGE INTO EXISTING | ui | 06 | 40 | M | packages/ui/src/browser/useDismissOnOutsideOrEscape.ts#useDismissOnOutsideOrEscape (unchanged); the 3 exporte… | #196 disclosure hooks KEEP (2x6 lines). #151 chat ConversationList KEEP (captures the root node on purpose for late unmount events) |
| J49 | EXTRACT SHARED HELPER | cms | 08 | 32 | L | redirects.ts file-private redirectRevision(required: {record: RedirectRecord; input: {actorId: string; plugin… | 3x revision literal, 2x transaction+enqueue, 2x prefix predicate (memory + sql) |
| J50 | EXTRACT SHARED HELPER | ui | 06 | 8 | L | BrandLogo.tsx exported interface ResolveLogoSrcOptions (used by resolveLogoSrc and useResolvedLogoSrc) | identical option type, written twice |
| J51 | EXTRACT SHARED HELPER | ui | 06 | 15 | L | packages/ui/src/utils/fake-latency.ts#fakeLatencyDelay(_required: Record<string, never>, optional: {latencyMs… | 11 identical fake-port delay closures. #242 KEEP (2 fake methods inside one test double) |
| J52 | MERGE INTO EXISTING | user-management | 09 | 20 | M | packages/user-management/src/admin/controllers/controller-store.ts#createControllerStore (unchanged; members/… | roles hand-rolls the same store |
| J53 | EXTRACT SHARED HELPER | core+cms+devops+platform+integrations | 05 | 24 | L | packages/core/src/records.ts#parseSchemaV1Document(required: {raw: string}, _optional: Record<string, never> … | 6 contribution-file parsers repeat JSON.parse + schemaVersion check; all 4 packages depend on core |
| J54 | MERGE INTO EXISTING | agent-plugins+platform | 09 | 5 | L | @jini-ai/platform/mail/smtp#SmtpMailPayload (type-only import) | lifecycle already imports @jini-ai/platform; type import is erased |
| J55 | EXTRACT SHARED HELPER | plugins | 09 | 25 | L | file-private notChangedEnableResult(required: {request: SetEnabledRequest; reason: string; note: string}, opt… | 5 not-changed literals + 2 identical console.warn lines |
| J56 | EXTRACT SHARED HELPER | core+mcp+agent-plugins+chat+daemon | 05 | 15 | L | packages/core/src/records.ts#withoutUndefined<T extends object>(required: {source: T}, _optional: Record<stri… | 6 copies; all packages depend on core. chat question-form OmitUndefined and react defined-props differ (KEEP) |
| J57 | EXTRACT SHARED HELPER | user-management | 09 | 45 | L | repo.memory.ts abstract class InMemoryWorkspaceRecords<Row extends {workspaceId: string; id: string}> extends… | repeated generic CRUD + pass-through constructors |
| J58 | EXTRACT SHARED HELPER | agent-runtime | 07 | 12 | L | packages/agent-runtime/src/providers/provider-url.ts#appendVersionedApiPath(required: {baseUrl: string; suffi… | identical bodies |
| J59 | EXTRACT SHARED HELPER | ui | 06 | 20 | L | packages/ui/src/utils/pending-actions.ts (move pendingActionKey/isActionPending/withPendingAction/withoutPend… | both copies' docs say "re-derived on purpose, no cross-feature import". A utils/ module is not a feature, so that rule still holds; owner dedupe rule supersedes "share o… |
| J60 | EXTRACT SHARED HELPER | daemon | 09 | 15 | M | packages/daemon/src/tool-recovery/decorate-executor.ts#decorateToolExecutor(required: {inner: ToolExecutor; e… | 4 decorators repeat 3 pass-through methods + execute option plumbing |
| FOLD J02 | FOLD | chat+ui | - | - | - | J02 | part of the A2UI node renderer merge |
| FOLD J11 | FOLD | agent-runtime | - | - | - | J11 | - |
| FOLD J20 | FOLD | user-management | - | - | - | J20 | - |
| FOLD J12 | FOLD | cli | - | - | - | J12 | - |
| FOLD J23 | FOLD | cms | - | - | - | J23 | - |
| FOLD J21 | FOLD | agent-runtime | - | - | - | J21 | - |
| FOLD J09 | FOLD | daemon | - | - | - | J09 | - |
| J61 | KEEP | various | - | 0 | - | - | see md KEEP list |
| JR01 | EXTRACT SHARED HELPER | core+agent-plugins+agent-runtime+agenti… | 10 | 80 | L | packages/core/src/records.ts#isObjectRecord(value: unknown): value is Record<string, unknown> (POSITIONAL typ… | 39 non-daemon isRecord copies; core's object-arg isNonArrayRecord cannot narrow a caller's variable, which is why every package re-declared one. OWNER DECISION: position… |
| JR02 | EXTRACT SHARED HELPER | http-kit+daemon | 09 | 18 | L | packages/http-kit/src/origin.ts#passesSameOriginGuard(required: {req: Request; res: Response; origin: OriginC… | Raw SSE/stream routes re-implement the guard-and-answer block mountJsonRoute already owns privately |
| JR03 | MERGE INTO EXISTING | ui | 06 | 28 | L | packages/ui/src/features/connectors/rules.ts#withoutKey<T>(record, key) (MOVED unchanged from useConnectorAut… | 8 copies of one 4-line identity-preserving delete; memory slice already imports connectors/rules.js. OWNER DECISION (small): the memory copy's comment says 'intentionall… |
| JR04 | EXTRACT SHARED HELPER | ui | 06 | 16 | L | packages/ui/src/features/connectors/rules.ts#withoutConnectedEntries<T>(required: {record: Record<string, T>;… | 3 copies of the 'drop entries whose connector is now connected' loop |
| JR05 | EXTRACT SHARED HELPER | ui | 06 | 24 | L | useMentionAtomicNavigation.ts file-private registerMentionCaretKey(required: {editor: LexicalEditor; command:… | 4 copies of the composing/plain-key/collapsed-range preamble |
| JR06 | EXTRACT SHARED HELPER | user-management | 09 | 10 | L | http.ts file-private async sendRolesRequest<T>(required: {transport: RolesHttpTransport; path: string; method… | 4 copies of abort-check + transport.request, 3 of the workspace root |
| JR07 | MERGE INTO EXISTING | ui+core | 05 | 10 | L | @jini-ai/core/contracts/cards#SurfaceCardSecretRun and #SurfaceCardSignInState; ui keeps its names as aliases | ui already aliases SecretCardField/SecretCardForm from the same core contract; these two unions were copied instead |
| JR08 | EXTRACT SHARED HELPER | agent-plugins | 09 | 5 | L | packages/agent-plugins/src/lifecycle/host-tools/skill-tool.ts#readInstalledSkillDetail(required: {plugin: {re… | per-skill read+summarize body copied; search-tool already imports summarizeSkillMarkdown from skill-tool |
| JR09 | KEEP | ui | - | 0 | L | - | renderers/index.ts:66-84 deliberately exports both (StringOnly suffix); shared part is 4 lines per function |
| FOLD J26 | FOLD | cms+agent-plugins+plugins | - | 0 | - | J26 | structural ports by design: domains 'import nothing from features/trash'; plugins/host/ports.ts:80 'STRUCTURAL mirrors of ... contribution-loader' |
| JR10 | KEEP | various | - | 0 | L | - | <10-line pairs in 1-2 places (fingerprint line found in <=2 files; #303 is a 1-line throw x3). #264 posthog vs opentelemetry: provider-plugin copies stay self-contained.… |

### Tovu ↔ Tovu outside the route preamble (T*, TR*)

| id | decision | area | job | est. lines saved | risk | survivor / helper | reason |
|---|---|---|---|---|---|---|---|
| FOLD T31 | FOLD | cms+diagnostics | - | 0 | - | T31 (@jini-ai/http-kit/verified-origin) | T31 already lists both Jini copies |
| TR01 | EXTRACT SHARED HELPER | website/features/media | 03 | 50 | M | NEW apps/website/src/features/media/persist-assistant-media.ts: #mediaUploadDeps(required: {routeDeps: MediaU… | Two tools copy the whole upload+sniff+record+analytics+projection tail; 6 sites copy the uploadMedia deps block |
| TR02 | MERGE INTO EXISTING | website/server/runtime/composition | 03 | 8 | L | @jini-ai/platform/fs#writeJsonFileAtomic({filePath, data, fs: createNodeAtomicFilesystem({}, {})}, {mode: 0o6… | hand-rolled copy of Jini's atomic writer; explicit mode keeps 'never inherits a wider mode' |
| TR03 | EXTRACT SHARED HELPER | website/assistant | 03 | 12 | L | apps/website/src/assistant/assistant-vault.ts#writeAssistantVault(required: {deps: {repo: object; sealer: Sec… | identical prepare/CAS/hint flow; only scope, provider default, meta and error class differ |
| TR04 | EXTRACT SHARED HELPER | core (Jini) + website | 05 | 10 | L (phase 1) / M (phase 2) | @jini-ai/core/primitives#toMsClock(required: {clock: Clock / IsoClock}, _optional: Record<string, never> = {}… | ISO-clock to Clock adapter in 22 places; generic, so it goes to Jini core. comments/settings imports clone (lines 1-12) is an import header: KEEP |
| TR05 | MOVE-PLAN | website/features | - | 0 | - | - | dossier: strong-twin x7, module-twin jini packages/cms/src/forms/destination-descriptors.ts; lift a generic providers.json descriptor-list parser to Jini beside J53's pa… |
| FOLD T37 | FOLD | website/features | - | 0 | - | T37 | same requireToolPermission+adaptLegacyAuthorize preamble class (152 copies in 71 files); T37 routes it to a registration-kit design |
| TR06 | MOVE-PLAN | website/features/webhooks | - | 0 | - | - | dossier: LEGACY-TWIN jini packages/platform/src/secrets/keyring.env.ts. Interim option if the move slips: `class InMemoryKeyring extends FixedSiteKeyKeyring { constructo… |
| TR07 | EXTRACT SHARED HELPER | website/platform/site-dir | 03 | 10 | L | init-site.ts #SiteCreateProgress (renamed InitProgress, exported) + #externalContentDbDir(required: {target: … | duplicate-site already imports cleanupAndRethrow from init-site; the external-DB-dir test and the two-step cleanup are copied |
| TR08 | KEEP | website | - | 0 | L | - | 4-line body in 2 server places (admin copies are client memos over HTTP data); below threshold |
| TR09 | KEEP | desktop+website | - | 0 | L | - | cross-app: the packaged desktop app ships no apps/website/src, so it cannot import it; a shared home would be a Jini platform/fs workspace-options design, not a dedupe |
| T01 | KEEP | themes | - | 0 | L | - | __original-themes__ = pristine never-discovered reset copies (content/README.md:9,26; development/scripts/theme-tool.ts:5-8 'original stays byte-identical forever'); eac… |
| T02 | KEEP | themes | - | 0 | L | - | same reason as T01; plain browser scripts per theme, no module system to share through |
| T03 | EXTRACT SHARED HELPER | admin | 04 | 88 | L | apps/admin/src/components/line-icon.ts#LINE_ICON (const, same literal + as const) | jscpd 60-line visuals pairs are this constant + svg scaffolding; icon artwork itself is distinct and stays. components/ is the shared admin layer (features may import it… |
| T04 | MOVE-PLAN | admin+desktop | - | ~45 | M | @jini-ai/ui (both apps already depend on it; add e.g. @jini-ai/ui/panel-kit#startVisibleInterval) | generic browser util duplicated across two separate apps; admin header says 'separate apps, no shared' -> only Jini can host it. Survivor should keep desktop's extra han… |
| T05 | MERGE INTO EXISTING | admin | 04 | 20 | L | apps/admin/src/lib/version-conflict.ts#readVersionConflict(required: { error: unknown; attemptedStatus: "draf… | lib/version-conflict.ts already hosts VERSION_CONFLICT_CODE/isVersionConflict for the same two editors (pages/rules.ts:433-441 says the shared one lives in lib/ so the n… |
| T06 | MERGE INTO EXISTING | admin | 04 | 14 | L | @jini-ai/ui/panel-kit#standingDraftRecoveryMessage (already re-exported by apps/admin/src/lib/standing-draft-… | isAutosaveDraftStale + pageAutosaveBannerMessage/postAutosaveBannerMessage have NO production caller (grep: only rules.ts + __tests__) - dead twins superseded by the Jin… |
| T07 | EXTRACT SHARED HELPER | admin | 04 | 40 | M | apps/admin/src/lib/admin-post-list-sort.ts#{DEFAULT_ADMIN_POST_SORT, compareAdminPostsByTitle/BySlug/ByStatus… | twin screens (pages/rules.ts:24) list-sort block; lib/ keeps the no-cross-feature boundary |
| T08 | KEEP | admin | - | 0 | L | - | row-menu builders bind feature-local i18n catalogs; merging needs a translator param for ~6 lines saved |
| T09 | MERGE INTO EXISTING | admin | 04 | 9 | L | PageEditorPort extends StandingDraftAutosavePort, Pick<PagesPort, "updatePost" / "deletePage"> | identical member signatures in two ports of one feature |
| T10 | MERGE INTO EXISTING | admin | 04 | 42 | L | @jini-ai/ui/admin-widgets#openLightboxDialog / closeLightboxDialog (packages/ui/src/features/admin-widgets/in… | Jini already exports the exact helpers; admin already imports @jini-ai/ui/admin-widgets (App.tsx:30) |
| T11 | EXTRACT SHARED HELPER | admin | 10 | 35 | M | apps/admin/src/hooks/use-native-modal-dialog.hooks.ts#useNativeModalDialog(required: { open: boolean; onClose… | OWNER DECISION: all three headers document 'copied rather than imported' on purpose (future per-modal tweak). Run only if owner approves; T10 is safe either way. Generic… |
| T12 | EXTRACT SHARED HELPER | admin | 04 | 14 | L | file-private OtherCredentialRemoveButton({ row, translate, dialogRef }) in the same file | Remove button + error block identical in OtherCredentialStaticRow and OtherCredentialReplaceableRow; markup unchanged |
| T13 | EXTRACT SHARED HELPER | admin | 04 | 18 | L | file-private makeNumberFieldControl(required: { step: string / undefined }) and makeStringFieldControl(requir… | Integer/Real and Text/Datetime controls differ by one attribute |
| T14 | KEEP | admin | - | 0 | L | - | shared part is 3 one-line field handlers + cancel guard; helper overhead ~= savings |
| T15 | EXTRACT SHARED HELPER | admin | 04 | 22 | L | file-private ContentTypeFieldsSection (props object, JSX) in Collections.tsx | Fields section + Add field + error span identical in NewContentTypeDialog and EditFieldsDialog |
| T16 | EXTRACT SHARED HELPER | admin | 04 | 60 | M | apps/admin/src/components/ConfirmActionDialog.tsx#ConfirmActionDialog (props object) + apps/admin/src/hooks/u… | plugins and settings are separate features (cannot import each other) -> shared admin components/ + hooks/. Keep per-feature copy hooks (they build copy); move each 'Can… |
| T17 | EXTRACT SHARED HELPER | admin | 04 | 22 | L | file-private type FetchedConfigFieldsProps + one merged switch arm in the dispatcher | 3 identical prop types and 3 identical JSX case arms |
| T18 | EXTRACT SHARED HELPER | admin | 04 | 45 | M | apps/admin/src/components/AssistantDock/hooks/use-optimistic-stored-value.hooks.ts#useOptimisticStoredValue<T… | same optimistic-then-stored state machine x3 |
| T19 | EXTRACT SHARED HELPER | admin | 04 | 13 | L | file-private interface DockerfileEditorState in DockerfileTab.tsx | same 12-field props bag typed twice |
| T20 | EXTRACT SHARED HELPER | admin | 04 | 9 | L | exported interface AccessTokenFormFields (8 shared readonly fields) extended by AccessTokenExistingRowState a… | type-only |
| T21 | EXTRACT SHARED HELPER | admin | 04 | 16 | L | file-private interface MenuItemFieldProps { item; path; onChange; t } | 3 identical inline prop types |
| T22 | EXTRACT SHARED HELPER | admin | 04 | 22 | L | apps/admin/src/lib/credential-submit-error.ts#classifyCredentialSubmitError(required: { error: unknown }, _op… | identical type + classifier in two features that cannot import each other |
| T23 | EXTRACT SHARED HELPER | admin | 04 | 35 | M | apps/admin/src/features/deployment/hooks/use-bounded-status-poll.hooks.ts#useBoundedStatusPoll<TRun extends {… | self-scheduling bounded poll loop duplicated in one feature |
| T24 | KEEP | admin | - | 0 | L | - | JSX boilerplate or <10-line twins across features that may not import each other; helper overhead >= savings; visuals already delegate to @jini-ai/ui Icon |
| T25 | KEEP | admin | - | 0 | L | - | test fakes (createFake* autosave port) |
| T26 | MOVE-PLAN | admin+desktop | - | 0 | M | jini:packages/chat/src/react/hooks/assistant-chats.ts (dossier legacy-twins.jsonl, MOUNTED) | separate apps; Jini chat twin exists |
| T27 | EXTRACT SHARED HELPER | desktop | 04 | 40 | L | apps/desktop/src/renderer/icon-frame.tsx#IconFrame({ children }) (NEW module, JSX only at render) | must NOT live in icons.tsx: tool-icons.tsx:1-6 forbids importing icons.tsx's module-level JSX tables |
| T28 | KEEP | desktop | - | 0 | L | - | one-off dev/verification scripts; standalone by design |
| T29 | KEEP | desktop | - | 0 | L | - | glyph paths deliberately redrawn (module-level JSX constraint); <10-line intra-file pairs |
| T30 | MERGE INTO EXISTING | website | 03 | ~190 | L | @jini-ai/core#AgentToolDefinition via the established alias: export type AgentToolDefinition = SharedAgentToo… | 20 copies of one interface; Jini core already owns it and says domains tighten via narrower unions (packages/core/src/agent-tools.ts:12-13) |
| T31 | MOVE-PLAN | website | - | ~18 | M | @jini-ai/http-kit/verified-origin (owner of VerifiedOrigin); Jini copies: packages/cms/src/seo/absolute-url.t… | generic VerifiedOrigin->URL join, 7 copies across both repos; Jini doc (absolute-url.ts:33-39) says promoting it is owned by the origin module |
| T32 | MERGE INTO EXISTING | website | 03 | 15 | L | apps/website/src/features/members/tool-registrations.ts#toMembersWriteServiceDeps (export it; param typed as … | inbound may import features, not the reverse. COORDINATE with the route-file plan (routes/members/deps.ts) |
| T33 | MERGE INTO EXISTING | website | 10 | 45 | H | apps/website/src/features/newsletter/tool-registrations.ts#{toConfirmationDeps,toSubscriptionsDeps,toNewslett… | OWNER DECISION on which launch-gate behavior wins before merging; merged fn must keep route behavior (route deps lack newsletterSendingEnabled -> false). COORDINATE with… |
| T34 | MERGE INTO EXISTING | website | 03 | 40 | M | feature side exports the view mappers (toWebhookDeliveryView, toWebhookSubscriptionView, toChangeSetView); in… | identical record->view mappers in feature and admin HTTP; COORDINATE with route-file plan |
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
| X15 | REPOINT-NOW | apps/website/src/server/inbound/public-… | 03 | 12 | - | @jini-ai/cms/forms/express#FormSubmissionRedirectResult | Type-only re-export; Tovu already imports @jini-ai/cms/forms/express in forms-submit.ts |
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
| X31 | REPOINT-NOW | apps/website/src/server/inbound/public-… | 03 | 22 | - | @jini-ai/cms/seo#HeadElement,JsonLd | Jini seo/types.ts copy says it duplicates this file; Jini is canonical now |
| X32 | KEEP | apps/website/src/features/site-backup/p… | - | 0 | - | @jini-ai/db/tools#DatabaseTransferPlanStore (shape) | 8-line single-use plan take(); generic PlanStore<T> candidate only |
| X33 | KEEP | apps/website/src/server/runtime/lifecyc… | - | 0 | - | @jini-ai/sidecar/supervisor/node (child adapter) | 8-line ChildProcess->SidecarDaemonProcess adapter; under threshold |
| X34 | MOVE-PLAN | apps/website/src/features/webhooks/keyr… | - | 300 | - | @jini-ai/platform/secrets#EnvOrFileKeyring,FixedSiteKeyKeyring,parseRootKeyHex,... | Clone is 8 lines but dossier flags the 477-line file as LEGACY-TWIN of Jini keyring.env (14 prod importers) - needs its own move-plan entry |
| X35 | KEEP | apps/website/src/features/skills/tool-r… | - | 0 | - | various | Under 10 lines, not clustered (escapeHtml, clampListLimit, scheduler tick, element walk, restore-point capture, port method lists, catalog map) |
| X36 | KEEP | apps/website/src/features/media-import/… | - | 0 | - | tool-registration handlers | Tool handler boilerplate (requireToolPermission/requireString/comment blocks) across unrelated tools |
