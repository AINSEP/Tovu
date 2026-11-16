# Untangle lanes (2026-11-15, planning only, nothing executed)

There are two tiers:
- **C lanes** create the contracts. They land in core or protocol, plus the kits and ports. The old entries re-export the moved code, so nothing breaks.
- **R lanes** repoint and inject inside one owner package each, plus that lane's own new Tovu wiring file.

R lanes are file-disjoint by construction: each Jini file belongs to exactly one lane (`LANES-files.tsv`, made by `scripts/lanes.py`). Each R lane starts only after every C lane in its `needs` has landed.

Shared files:
- `packages/core/package.json` `exports`, `packages/core/README.md`, Tovu `composition/deps.ts`/`app.ts`, and `apps/admin/src/main.tsx` are the only files more than one lane touches.
- Lanes do not edit them. Each lane's report gives the exact lines, and the coordinator applies them at landing.

Every brief starts with the context-budget clause. Every brief also carries these rules:
- Commit by explicit paths (`git commit -F msg -- <paths>`).
- Run no tests. Leave no processes running.
- Move "why" comments; never delete them.
- Use `(required, optional)` args.
- Run the T-MOVE re-export check.
- **STOP** if a file's blob differs from the sheet's guard.

## C lanes: contracts (Opus designs first where marked)

| Lane | What lands | Design | Sonnet executes | Touches (Jini) | Unblocks |
|---|---|---|---|---|---|
| **C0** | **Gate:**<br>• `L5-injected-edge`, `L6-base-purity` and `L7-css-tokens`<br>• `injection-debt.json` baseline (633 lines + 6 payload) and an empty `injection-exceptions.json`<br>• payload scan and test advisory<br>• fixture tests<br>• `HOST-PORTS.md` generator<br>• delete the stale `memory→integrations` leaf and the unused `integrations→oauth` peer<br>Replaces KIT P1. | DESIGN §5 (done); Opus 15k review | 100k | `scripts/check-package-layers.ts`, `scripts/lib/package-sources.ts`, `scripts/injection-*.json`, `scripts/__tests__/`, `packages/integrations/package.json` | Everything. **It must land before any move wave or R lane.** |
| **C1** | `core/text` helpers (KIT P2) | KIT §2.6 (done) | 105k | `core/src/text/*`, `ui/src/features/i18n/*`, `ui` panel-kit re-exports | R1, R2, R3, R6 (22 lines) |
| **C2** | `core/agent-handles` (agentic `handle.ts`, `list-handles.ts`, `element-handles.ts`: ~380 pure lines) and `protocol/mcp-ui` (the JSON-RPC/MCP-UI constants from `agentic/core/mcp-ui-apps.ts`); agentic re-exports | Sonnet + Opus review 15k | 60k | `core/src/agent-handles/*`, `protocol/src/mcp-ui.ts`, `agentic/src/core/{handle,list-handles,element-handles,mcp-ui-apps}.ts` | R1, R3, R4, R5, R6 (103 lines) |
| **C3** | `core/contracts/storage` (kernel/dialect/transport, `DbRow`, row helpers, `toBool`, `listColumns`, `isUniqueViolation`, SQLite connection *types*, migration-step types, restore/ops types) and `core/contracts/events` (cms command/event/outbox vocabulary used by cms-forms) | **Opus 40k** | 90k | `core/src/contracts/{storage,events}/*`, `db/src/{kernel,core,migrate}/index.ts` (type re-exports), `cms/src/core/index.ts` | R4, R6, R8, R9, R11 |
| **C4** | `core/contracts/server` route vocabulary: `Result`/`ok`/`err`, `validationError`, `statusForError`, `jsonRoute(spec, deps) → ServerRoute`, the web-stream SSE helper, and the origin checks from `http-kit/verified-origin`. http-kit keeps the Express `Server` adapter and the Node `req` guards. | **Opus 40k**, built on PLAN's server port (T-SERVER form B, O1–O7, design d2). One design, not two. | 100k | `core/src/contracts/server/*`, `http-kit/src/{adapter,result,origin,sse}.ts` (re-exports + Express adapter) | R7, R9, PLAN's 9 server-port features |
| **C5** | `core/net` (loopback/blocked-host checks, `FETCH_TIMEOUT_MS`) and `core/contracts/{vault,mail,blob,runtime}`. Runtime holds the port types `FileLockPort`, `AtomicFileWriterPort`, `ProcessControlPort`, `CommandInvocationPort`, `HttpClientPort`, `PtyPort` and `GuardedReaderPort`. Platform implementations `satisfies` them. The chat `redactSecretShapes` duplicate is merged into `core/redact`. | **Opus 50k** (also decides whether `createCommandInvocation`, `omitEnvironmentKeys` and `wellKnownUserToolchainBins` can be made pure by passing `platform`/`env` as args) | 120k | `core/src/{net,contracts/vault,contracts/mail,contracts/blob,contracts/runtime}/*`, `platform/src/{net,secrets/credential-sets/contracts,mail/senders,blob-storage}.ts` | R4, R7–R11 |
| **C6** | `core/contracts/agents` (`RuntimeAgentDef`, `NativeCapabilities`, model-catalog snapshot, launch-state types) and `core/contracts/ai-trace`, plus the **daemon `AgentRuntimePort`** design (13 value sites: launch planning, ACP/PI sessions, stream handlers, provider tool turns, xAI OAuth) and chat's `agents` port (model-selection and native-tool-policy helpers) | **Opus 80k** (the largest design; it decides vocabulary vs runtime for agent definitions) | 100k | `core/src/contracts/{agents,ai-trace}/*`, `agent-runtime/src/{index,ai-trace,model-selection}.ts` (re-exports) | R4, R7, R8, R10, R12 |
| **C7** | `core/contracts/admin-module` (`AdminModule`/`AdminTab`/`AdminPage` types, `adminPort` and `defineAdminModule`, all pure). Decide whether `adminPort` becomes core's existing `token<T>()`. `createAdmin` stays in admin. | Sonnet + Opus review 15k | 50k | `core/src/contracts/admin-module/*`, `admin/src/core/module/{types,token,define-admin-module,index}.ts` | R3 (12 lines) |
| **C8** | `core/contracts/{forms,charts,plugin-sdk}`, the provider pattern (DESIGN §2.5) worked on one provider per kind, admin's `formsCatalog`/`commentRepo`/`embedPolicy` ports, and a decision on `createOtelObservabilityPort` (vendor code into its provider?) | **Opus 60k** | 100k | `core/src/contracts/{forms,charts,plugin-sdk}/*`, `cms/src/forms/index.ts`, `ui/src/charts/index.ts`, `plugins/src/host/index.ts` (re-exports) | R1, R2, R11, R12 |
| **C9a/b/c** | Kits: admin, chat, user-management (KIT P3a/b/c, unchanged) | KIT: Opus 90k | 280k | `admin|chat|user-management/src/react/kit.tsx` + fakes | R1, R2, R3, R4 |
| **C10** | `surfaces` port: chat kit plus `UiSurfacesProvider` (KIT "surfaces", plus ui's one a2ui use) | **Opus 60k** (KIT) | 60k | `chat/src/react/kit.tsx` (surfaces group), `ui/src/surfaces/*` | R4, R5 |

**Opus designs first:** C3, C4, C5, C6, C8, C9a, C10 (7 designs). C2 and C7 are Sonnet sheets with an Opus review. C0 and C1 are already designed. All 7 designs are read-only and can run in parallel now. Each one writes a sheet in the T-MOVE format with:
- the exact names;
- the new core files;
- the re-export lines;
- the ports with their `required`/`optional` shapes;
- one worked Tovu `satisfies` binding.

## R lanes: repoint and inject (file-disjoint, Sonnet)

Counts come from `LANES-files.tsv`: production files and import lines per lane, and the total size of the touched files.

| Lane | Owner(s) | Files | Lines | LOC | Needs | Work | Split | Sonnet |
|---|---|---|---|---|---|---|---|---|
| R1 | admin `react/` and `.tsx` | 89 | 113 | 8.4k | C1, C2, C8, C9a | Mostly script repoints (handles 33, kit 72); forms types → core | 4 sub-lanes by top folder (≤25 files) | 360k |
| R2 | admin non-React | 11 | 14 | 2.1k | C1, C8, C9a | `forms`/`comments`/`media` adapters take the cms catalog/repo/embed ports | — | 130k |
| R3 | user-management | 51 | 71 | 3.8k | C1, C2, C7, C9c | Repoints + kit; removes `hasReactPeer`/`isAdminIntegration` and the admin/ui/ui-kit peers | 2 (`admin/`, `react/`) | 200k |
| R4 | chat | 42 | 57 | 9.5k | C2, C3, C5, C6, C9b, C10 | Kit, surfaces, storage contract; the store gets its kernel injected instead of calling `sqliteKernel` itself | 2 (`react`+`embed-widget` / `store`+`server`) | 340k |
| R5 | ui | 62 | 67 | 9.7k | C2, C5, C10, Q4 | Handles repoint (58 lines, script), `core/net`, a2ui via surfaces | 3 (script + check) | 190k |
| R6 | commerce | 13 | 18 | 1.6k | C1, C2, C3 | Storage types; `commerceMigrations` export (host runs them) | — | 65k |
| R7 | daemon `src/http/` | 30 | 75 | 9.6k | C4, C5, C6 | 83 `mountJsonRoute(app)` calls → `*Routes(): ServerRoute[]`; Tovu `jini-routes.ts` mounts them | 3 by route group | 450k |
| R8 | daemon runtime (`agent-executor`, store, terminal, ai-trace) | 26 | 42 | 6.9k | C3, C5, C6, Q8 | `AgentRuntimePort`, process/command/fs ports, SQLite opener injected; `terminal.adapter.ts` leaves (Q8) | 2 | 310k |
| R9 | cms + cms-forms | 19 | 27 | 4.0k | C3, C4, C5 | Storage/events/server vocabulary; mail types → `core/contracts/mail` | — | 150k |
| R10 | agent-runtime + analytics | 11 | 14 | 2.7k | C5, C6 | oauth client port, vendor base-URL catalog port, platform ports; ai-trace types | — | 130k |
| R11 | agent-plugins, capability-providers, db, devops, http-kit, integrations, mcp, plugins, registry, search, sidecar | 37 | 46 | 6.4k | C3, C5, C8, Q8 | Small ports; `*/node.ts` adapters leave (Q8); the search contribution becomes a descriptor | 2 | 370k |
| R12 | provider-plugins + agent-plugins payloads (6) | 29 + 6 | 35 + 6 | 2.3k | C6, C8, Q6 | Structural contracts, helpers via ctx, conformance; drop the `agent-plugins→commerce` payload peer | — | 230k |
| R13 | server, cli, sqlite, infra | 16 | 54 | 3.3k | Q1, Q2 | Q1 yes: mark as `host-preset`, move logic down, receive the Q8 adapters. Q1 no: dissolve into Tovu. Q2: freeze, delete at next major | — | 50k–300k |

Each R lane commits in Jini first and then in Tovu:
- **Jini commit:** the lane's files, plus its `injection-debt.json` entries removed (the ratchet proves it).
- **Tovu commit:** one new wiring file (`apps/website/src/server/runtime/composition/jini-<lane>.ts`, or `apps/admin/src/integrations/jini-<lane>.ts`) with `satisfies` lines. The coordinator adds the one-line use.

**Verification:** one batched cloud run per wave (single-runner rule): Jini gates, typecheck of the touched packages, the touched packages' tests, and Tovu typecheck linked to `jini-terra-base`. UI lanes (R1, R3, R4, R5) also need a Chrome look at admin, chat and site-chat.

**Review:** one batched Opus reviewer per wave, never one per lane. It checks for excess code, deleted "why" comments, and cost on hot paths.

## Order

| Wave | Lanes (parallel inside a wave) | Gate before the next wave |
|---|---|---|
| A | C0, C1, C2 (Sonnet); the 7 Opus designs (C3, C4, C5, C6, C8, C9a, C10, read-only) | C0 landed; designs reviewed |
| B | C3, C4, C5, C7, C8, C9a, C10 (Sonnet, each in its own core subpath; core `exports` lines applied by the coordinator) | One cloud run; debt unchanged (re-exports only) |
| C | C6, C9b, C9c; R5, R6, R9, R12 (needs met) | Cloud run; debt down |
| D | R1, R2, R3, R10, R11 | Cloud run + Chrome look |
| E | R4, R7, R8, R13 (after Q1/Q2/Q8) | Cloud run + Chrome look; retire the sanctioned-edge helpers (DESIGN §5); debt = 0 except owner-approved exceptions |

Owner questions Q1, Q2, Q4, Q5, Q6 and Q8 block only R5, R8, R11, R12 and R13. All other lanes can run now.

## How this meets the Tovu→Jini move plan (`../move-templates/PLAN.md`)

1. **C0 lands before any move wave** (W1+). After that, a moved file that imports `@jini-ai/<non-base>` has no debt key, so the gate fails it. Moves can never create an edge.
2. **COMMON.md rule (patch):** a moved Jini file may import only its own package, `@jini-ai/core` and `@jini-ai/protocol`.
   - If it needs another package's *name*, and that name already sits in core (its C lane has landed), it uses the core path.
   - If the name is an implementation, the file declares or uses the target package's port, and the Tovu side passes the implementation. A port that does not exist yet means **STOP**, because a contract change is its own slice.
   - This replaces KIT's T-UI-only check with one rule for every template.
3. **One design per seam:**
   - C4 *is* PLAN's server port (O1–O7), so T-SERVER form B targets `core/contracts/server`.
   - C9 *is* KIT P3.
   - C1 *is* KIT P2 (D2).
   - KIT's K1–K3 cleanup is R1 + R2 (admin), R3 (user-management) and R4 (chat). Do not count it twice.
4. **Re-classify:**
   - Add a `foreign_jini_imports` signal to `move-templates/scripts/signals.py`: the non-base Jini packages a file would import from its target.
   - A MOVE or UI row with any such import becomes SPLIT: the logic goes into the package, the wiring stays in Tovu's composition root.
   - A row that is only wiring becomes STAY.
   - Re-run `classify.py` and `judge.py` after C0. The shift is unknown until then, and it will raise the SPLIT count.
5. **Tovu files:** move slices edit existing Tovu files, while R lanes only add new `jini-*.ts` wiring files, so the two never collide. The coordinator serializes edits to `deps.ts`, `app.ts` and `main.tsx`.
6. **Arg-convention lanes** still committing in the Jini/Tovu clones: R lanes guard by blob and SKIP on a mismatch. Run R lanes after the arg lanes have landed on daemon, admin and chat.

## Cost

| Item | Opus | Sonnet |
|---|---|---|
| Designs: C3 40k, C4 40k, C5 50k, C6 80k, C8 60k, C10 60k, C9 (KIT) 90k | 0.42M | — |
| Reviews: C0, C2, C7 sheets (45k) + one batched reviewer per wave × 5 (~40k each) | 0.25M | — |
| C-lane execution (C0–C10) | — | 1.17M |
| R-lane execution (R1–R13; R13 at its upper bound) | — | 3.1M |
| **Total** | **~0.7M** | **~4.3M** |

- **Already inside these numbers, not on top:** KIT-INJECTION's 0.15M Opus + 0.9M Sonnet. Its prerequisites are C0, C1 and C9; its cleanup is R1, R3 and R4.
- **Rates:**
  - A script repoint plus a Sonnet check costs about 3–4k per file.
  - A port or registration change costs about 12–15k per file, including its Tovu wiring.
  - A core move costs about 90–120k per contract.
  - Calibrate on the first lane of each kind: R6 (smallest repoint+storage), R10 (ports), R7's first route group (routes).
- **Not included:** the cloud verification runs (credit), the Chrome looks, and any rise in PLAN's SPLIT sheets after the re-classify.

## Wave B final (sheets-fix3, 2026-11-15) — supersedes the "Order" row B and the C-lane Sonnet column where they differ

Clones: Jini `465122282`, Tovu `311d5d7ae` (re-census base). Every lane is **move + delete, no shells** (owner 2026-11-15): importers are repointed by the lane's `*.repoint.tsv`, applied by the **serial applier** (`scripts/apply-repoint.mjs`), never by the lane.

### Lanes

| Step | Lane | Sheet(s) | TSV(s) (rows) | Lane-owned paths (hand edits; full list in the sheet's "Files touched") | Tier | Sonnet |
|---|---|---|---|---|---|---|
| 0 | **P-APPLY2** (applier v2: in-place rename, type-arg templates, inline `import('x').Old`) | `handoffs/sheets-fix2.md` Remaining 1 | — | `scripts/apply-repoint.mjs` + its tests (untangle dir, not a clone) | tool | 30k (another agent, in flight) |
| 1 | **C2** + C2-addendum + C1-plus | `C2.md`, `C2-addendum.md`, `C1-plus.md` | `C2` (266), `C2-addendum` (6), `C1-plus` (20) | `core/src/agent-handles/*`, `protocol/src/mcp-ui.ts`, agentic `core/{handle,list-handles,element-handles,mcp-ui-apps,index}.ts`; `core/src/text/mime.ts`, `core/src/primitives/node-shape.ts`; ui-kit `attrs.ts` | C | 60k + 10k + 15k = 85k |
| 1p | applier pass B0 | — | `C2`, `C2-addendum`, `C1-plus` | scripted rows + 1 + 9 MANUAL | pass | ~25k |
| 2 | **C3a** storage-Jini | `C3.md` (B1 ruling, D5/D7) | `C3` (496; phases `wave` + `c3-rewrite`) | `core/src/contracts/storage/*`, `db/src/{kernel,core,migrate}/*` (deletes), `.changeset/core-storage-contract.md` | C | 210k |
| 2 | **C3b** events-Jini | `C3.md` | (inside `C3`) | `core/src/contracts/events/*`, deleted `cms/src/core/{ports,commands/change-set}.ts`, edited `cms/src/core/{index,commands/command}.ts` | C | 90k |
| 2 | **C3t** Tovu | `C3.md` §C3t | `C3t` (298) | Tovu `platform/db/{kernel/port,kernel/dialect,migrations/step}.ts` (deleted), `migrations/source-digests.ts` (new), `legacy-sqlite.ts` | C | ~135k (110k + the 54 `#src/` files) |
| 2 | **C4** | `C4.md` (§10–§12), `C4-server-port-fold.md` | `C4` (267; `route-conversion` rows are NOT in the wave pass) | `core/src/contracts/server/**`, http-kit `{types,request,response,adapter,origin,sse}.ts`, http-kit `verified-origin*` (deleted) + 8 moved tests | C | 100k |
| 2 | **C5** | `C5.md` (no-shells revision) | `C5` (383) | `core/src/{net,contracts/vault,contracts/mail,contracts/blob,contracts/runtime}/*`, platform `net/endpoint-policy.ts`, `http/guarded/{ports,types}.ts`, `mail/email-sender.ts` (deleted), platform `fs/file-lock.ts`, `net/address.ts`, `secrets/credential-sets/vault.types.ts` (edits) | C | 120k |
| 2 | **C7** | `C7.md` | `C7` (53) | `core/src/contracts/admin-module/*`, `admin/src/core/module/{types,token,define-admin-module,index}.ts` | C | 50k |
| 2 | **C8** | `C8.md` (§9, §10) | `C8` (159) | `core/src/contracts/{forms,charts,plugin-sdk}/*`, admin `core/ports/{forms-catalog,embed-policy,comment-repo}.ts`, cms `core/form-collection.ts`, `forms/types.ts`…, diagnostics `observability/{otel,index}.ts`, provider-plugins `observability-opentelemetry/*` | C | 100k |
| 2 | **C9a** | `C9a.md` | `C9a` (132; 45 MANUAL go to R1 per their notes) | admin `react/kit.tsx`, `react/kit-media-providers.ts`, `react/__tests__/{fake-admin-kit,kit.unit.test}.tsx` | C/KIT | ~120k (C9a share of 280k) |
| 2 | **C9-ui** | `C9-ui.md` (+ sheets-fix3 note) | `C9-ui` (9) | ui `react/kit.tsx` (new), `react/__tests__/{fake-ui-kit,kit.unit.test}.tsx`, `react/components/SecretInput.hooks.ts` (deleted) | C/KIT | 30k |
| 2 | **C11a** | `C11.md` §2 | `C11` (2 DROP rows) | core `approval.ts`, `fetch/cache.ts`, `records.ts`, `model-facing-tool-errors.ts`, `settings/settings.ts`; ui `panel-kit/fetch-query/{browser-timing.ts,adapter.react.tsx,adapter.tanstack.tsx}`; cms `widgets/resolvers/contact-form.ts`, `forms/{submission-evidence,stale-form}.ts`; Tovu `assistant/site/visitor-confirmation-gate.ts` | C | 70k |
| 2 | **C11-ids** | `C11.md` §1, §3 | `C11` (239) | platform `system.ts` (new) + moved test; core `primitives/{ids,time}.ts`; the 9 §3 sites and their callers (agent-runtime `providers/elevenlabs.ts`, chat `store/sql/store.ts`, `react/components/A2uiSurfaceCard*.ts(x)`, cms `media/media-service.ts`, daemon `store/{agent-sessions/sql,event-log/sqlite-kernel,event-log/sqlite}.ts`, mcp `core/tokens.ts`, user-management `server/seed.ts`) | C | 110k |
| 2p | applier pass B1 (serial, after every step-2 lane has landed **and** P-APPLY2 has landed) | — | in order: `C3 --phase wave,c3-rewrite`, `C3t`, `C4 --phase wave`, `C5`, `C7`, `C8`, `C9a`, `C9-ui`, `C11` | scripted rows; then one Sonnet for the wave's MANUAL rows (C3t 3, C4 2, C5 64, C8 16, C11 6 (the 9 §3 sites are lane-owned); C9a's go to R1) | pass | ~200k (split in 2 at the 300k cap if needed) |
| 3 | **C10** (strictly after C2 and C9-ui) | `C10.md` | `C10` (154), `C10-shell` (30) | `protocol/src/a2ui/*` (+12 moved tests), `ui/src/surfaces/*`, chat `react/kit.tsx` (surfaces group), agentic/ui a2ui + mcp-ui sources | C/KIT | 60k |
| 3p | applier pass B2 | — | `C10`, `C10-shell` | 20 MANUAL | pass | ~40k |

**Wave B total: ~1.3M Sonnet.** That is 85k (step 1) + 1,135k (step 2) + 60k (C10), plus ~265k for the applier passes and 30k for P-APPLY2.

### Coordinator-only steps (no lane edits these files)
- `core/package.json` `exports` + `jini` entries for each new core subpath (C3 storage/events, C4 server, C5 net/vault/mail/blob/runtime, C7 admin-module, C8 forms/charts/plugin-sdk, C2 agent-handles); `core/README.md` rows.
- `protocol/package.json` (C2 `./mcp-ui`, C10 `./a2ui`); `ui/package.json`: C9-ui owns it in step 2, the coordinator adds C10's `"@jini-ai/protocol": "workspace:^"` after C9-ui.
- `platform/package.json`: C5's deleted exports (`./net/endpoint-policy`…), C11's new `./system` (universal). `http-kit/package.json`: C4's `./verified-origin` export + `jini.entries` line.
- `examples/notes-app/package.json`: `@jini-ai/platform` (C11-ids).
- `scripts/injection-debt.json`: each lane reports the entries it retires; the coordinator removes them at landing (C11a/C11-ids retire 7 of the 12 L6 keys).
- `pnpm-lock.yaml`: one `pnpm install` per landing batch, after the package.json edits.

### File-overlap check (`scripts/recensus/overlap.py`)
Lane-owned paths come from each sheet's files section and its TSV's MANUAL/C-lane rows. Scripted rows are applied serially afterwards.
- **Lane-owned × lane-owned between parallel step-2 lanes: zero real overlaps.** The script flags 4 pairs, all false positives from sheet prose:
  - C3×C8 `cms/src/core/index.ts`: C8's text says "C3 touches it, not C8".
  - C4×C5 `core/src/contracts/server/*`: C5's disjointness sentence.
  - C7×C9a `admin/src/core/module/*`, `admin/src/react/kit.tsx`: each sheet names the other's file to say it does not touch it.
  - C4×C5 and C5×C11 shared test files: these are MANUAL rows on **different** statements of the same test, done in one serial MANUAL pass.
- **Lane-owned files that also carry another lane's scripted rows.** Safe, because the lane lands first and the applier then re-resolves by statement. Named serialisations:
  - C11-ids edits the signatures of `createSqlChatStore`, `createSqlAgentSessionStore`, `createKernelSqliteEventLog` and `openSqliteEventLog`. C3's `c3-rewrite` rows retype `StorageKernel<DB>` on those same signature lines, so **C11-ids lands before applier pass B1**.
  - C11-ids edits `elevenlabs.ts`, and C5 owns `platform/src/fs/file-lock.ts`. C5 and C11 rows in them apply in pass B1 in TSV order (C5 before C11).
  - C3b edits `cms/src/core/index.ts`, and C3's own DROP rows apply there in pass B1.
  - C9a owns admin `core/module/*` neighbours, and C7's rows in `admin/src/core/module/__tests__/*` and `create-admin.ts` apply in pass B1.
  - The new C9-ui row in chat `AgentRuntimePicker.tsx:5` is a different statement from C2's row 58 (applied in B0) and from C6's row (wave C).
  - C4 owns `http-kit/src/index.ts`, and C5's row there is applied after C4 in pass B1.
- **C10 vs step 2:** C10 runs after C9-ui (ui `package.json`, ui kit) and C2 (the 4 C2-owned files are guarded by C2's expected content).

### Wave C (after the wave-B cloud run)

| Lane | Sheet | Sonnet | Notes |
|---|---|---|---|
| **C6** | `C6.md` (§11–§13; ruling (c) done, ruling (e) `ProviderModelsQuery` folded in §13) | 100k (+15k Opus copy-order already done) | `C6.repoint.tsv` (254) |
| **C11b** | `C11.md` §4 | 90k | after C4's `jsonRoute`; produce `C11b.repoint.tsv` at dispatch |
| **P-ZOD** | `handoffs/sheets-fix.md` item 6 | 40k | protocol root 18 `*Schema` + 18 `z.infer`, a2ui 33 aliases → parse functions + written types; before R11; configs `scripts/census/{protocol-zod,a2ui-zod}.json` |
| **R-BARRELS** | to write (ruling (d)) | ~150k | One scripted Tovu lane. 211 Tovu non-test files carry 382 `export … from "@jini-ai/…"` statements (`contracts/core/*`, `features/settings/index.ts`, `packages/sdk/src/index.ts`, …). Census = `repoint-census.cjs` with each barrel's Jini re-exports as "moves" to their Jini spec; applier repoints importers to the Jini spec, then the re-export lines are DROPped. Owner question on `packages/sdk` below. |
| C9b, C9c | `C9a.md` pattern (KIT P3b/c) | ~160k | unchanged |

### Re-census (sheets-fix3)
Every lane not yet re-censused was re-run with the `#src/`-fixed census (`scripts/recensus/run.sh`, `diff.py`; raws in `scripts/recensus/`):
- C1-plus, C2-addendum, C5, C7, C8, C9a, C10: +0 rows.
  - C10's 18 `#src/assistant/index` importers are already in `C10-shell`.
  - The census rows inside the source package are lane hand edits by design: C2 (agentic), C5 (core-internal), C6 (§3 table) and C7 (step 3).
  - The `await import('@jini-ai/core')`, `vi.mock` and namespace hits reach names that do not change spec.
- C4: +1 row (`published-page.ts`) and row 240 updated, both from Tovu `fd90d9c72` (delete-routing).
- C9-ui: +3 rows (`rg` census of the 2 deleted re-exports).
- C6 (wave C): +0 outside agent-runtime.
