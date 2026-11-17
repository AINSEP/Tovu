# INDEX: sheets for the remaining Jini package-to-package imports (2026-11-16)

Planning only. Nothing was built, typechecked or tested by this run; every count comes from `scripts/census.mjs` and `rg` on the bases named in `COMMON.md`. Status: **complete for the lanes listed in §2; nothing PARTIAL.** What was not verified is in §7.

## 1. Re-measure

| | 2026-11-15 census | now (terra + C6 + daemon prerequisites, merged locally) |
|---|---|---|
| import sites that break "own package + core + protocol" | 633 (572 + 61 awaiting owner answers) | **227** in 150 files |
| owner → target package pairs | 69 by imports, 71 with manifest-only pairs | **47** |
| pairs gone | | 22 (`census/merged/CENSUS-pairs-gone.tsv`) |
| stale manifest declarations | — | 19 |
| test files importing a non-base package | ~360 (estimate) | 279 |

- The brief's "78 pairs" could not be reproduced from the 11-15 files (they give 69 or 71). `EDGES.tsv`'s 396 rows are per subpath and kind; that file was not regenerated: `census/merged/CENSUS-sites.tsv` (one row per import, with its 11-15 fix, contract lane and R lane) replaces it.
- Of the 227: **36 are allowed** (`server` 35, `cli` 1: both already carry `jini.kind: "host-preset"` and the gate honours it), **15 are frozen** by Q2 (`sqlite` 11, `infra` 4). **176 sites in 33 pairs still need work.**
- `refactor/terra` alone (without C6 and the daemon prerequisites): 246 sites, 49 pairs (`census/terra/`).

| Lane | Sites now | 11-15 lines | Note |
|---|---|---|---|
| R1 | 3 | 113 | three kit call sites left |
| R2 | 6 | 14 | |
| R3 | 39 | 71 | needs the user-management kit (C9c) |
| R4 | 18 | 57 | covered by GAPS §1 `C-CHAT-DEPS` |
| R5 | **0** | 67 | **lane's edges are gone**; 3 stale `ui` dependencies remain (G-STALE-DEPS) |
| R6 | 2 | 18 | |
| R7 | 42 (http-kit 37, agent-runtime 3, platform 2) | 75 | design `daemon/R7-ROUTES.md` rev 2 |
| R8 | 16 (platform 8, agent-runtime 7, db 1) | 42 | design `daemon/R8-RUNTIME.md` rev 2; C6 removed 18 |
| R9 | 3 | 27 | |
| R10 | 11 | 14 | the analytics half is gone |
| R11 | 17 | 46 | capability-providers, db, http-kit, registry halves are gone |
| R12 | 19 + payload lines | 35 + 6 | `→cms`, `→plugins`, `→agent-runtime` gone |
| R13 | 51 (36 allowed, 15 frozen) | 54 | marking as preset is already done |

**Edges with no lane:** none outside the presets. 7 sites have no 11-15 row; all are in `packages/server` (new route-host and node-bridge wiring from the daemon prerequisites, and `createSystemClock`), allowed by Q1.
**Lanes whose edges are gone:** R5 entirely; `admin→agentic`, `admin→ui-kit`, `chat→agentic`, `ui→agentic`, `ui→ui-kit`, `user-management→agentic`, `analytics→agent-runtime`, `provider-plugins→{agent-runtime,cms,plugins}`, `registry→{db,platform}`, `integrations→db`, `plugins→db`, `http-kit→platform`, `db→platform`, `cms→platform`, `commerce→{agentic,ui}`, `capability-providers→platform`, `cli→platform`, `ui→platform`.

## 2. Sheets

Written by this run (all under `sheets-2026-11-16/`; every sheet inherits `COMMON.md`):

| Sheet | Sub-sheets (one Sonnet run each) | Sonnet estimate |
|---|---|---|
| `G-STALE-DEPS.md` | 1 | 35k |
| `R6-R9-storage-consumers.md` | 1 | 80k |
| `R10-agent-runtime.md` | R10a 45k, R10b 140k | 185k |
| `R11-platform-consumers.md` | R11a 110k, R11b 150k, R11c 60k | 320k |
| `R1-R2-admin.md` | R1c 35k, R2a 150k, R2b 70k | 255k |
| `R3-user-management.md` | C9c 90k, R3a 110k, R3b 80k | 280k |
| `R12-providers.md` | R12a 90k, R12b 70k, R12c 90k, R12d 50k | 300k |
| `R13-hosts.md` | R13a 25k, R13b 120k, R13c 20k, R13d 40k | 205k |
| `G-TESTS.md` | setup 70k; T0 10k, T1 120k, T2 130k, T3 120k, T4 110k | 560k |
| **Total written here** | **24 runs** | **~2.2M** |

Already written elsewhere (not rewritten; use as they are):

| Work | Where | Status |
|---|---|---|
| R4 chat (`C-CHAT-DEPS`, includes the chat kit C9b) | `plan/untangle-gaps-2026-11-16:…/followups/GAPS-2026-11-16.md` §1 | executable; 18 sites still match its file list |
| R7, R8 daemon | `plan/daemon-untangle-design-2026-11-16:…/untangle/daemon/{INDEX,R7-ROUTES,R8-RUNTIME}.md` rev 2 | designs with step pairs; prerequisites C-ORIGIN-PORT, G-HTTP-AUTH, C4-a/b/e, P-NODE-BRIDGE are done on `refactor/daemon-prereqs`; its own estimate ~1.05M for R7+R8 |
| C12-OBS (observability and product-analytics types to core) | `plan/untangle-gaps-2026-11-16:…/sheets/C12-OBS.md` + TSV | written, **not landed**; R12b and R12c need it (90k) |
| G-HTTPKIT-ORIGIN-MW | GAPS §4.5 | optional; removes no edge; no sheet written |

Whole remaining programme, rough: 2.2M (here) + ~1.05M (daemon) + C-CHAT-DEPS (GAPS gives per-step figures; LANES said 340k for R4) + 90k (C12-OBS) ≈ **3.6M Sonnet**, plus one batched Opus review per wave (~40k each).

## 3. Order

Q1, Q2, Q8 are answered (DESIGN §7) and Q1's gate work is already in the code, so nothing below waits on them. OD-3 (below) holds only R13d.

| Wave | Runs (parallel inside the wave) | Needs |
|---|---|---|
| 0 | `G-STALE-DEPS` (alone: it edits 14 `package.json` files other lanes also finish on) | merge of C6 + daemon prerequisites |
| 1 | `G-TESTS` setup · `R6-R9` · `R10a` · `R12a` · `R12d` · `R13a` · `R13c` · `C9c` · C12-OBS | wave 0 |
| 2 | `R11a` · `R11b` · `R11c` · `R10b` · `R1c` · `R2a` · `R2b` · `R3a` · `R3b` · `R12b` · `R12c` · `R13b` · C-CHAT-DEPS · R8a | wave 1 (R11a→fakes from G-TESTS setup; R1c/R2→moved admin fake; R3a/b→C9c; R12b/c→C12-OBS; R13b→R13c; R10b→R10a) |
| 3 | R7 (P0 → G3, serial inside) · R8b · `G-TESTS` T0, T2, T3, T4 | their owners' wave-2 lanes |
| 4 | R7-Z (after `R6-R9` moved `RateLimiter` and cms no longer needs http-kit) · `R13d` (after R8, R11, OD-3) · `G-TESTS` T1 | wave 3 |

Gate between waves: one cloud run (Jini gates, typecheck and tests of touched packages, Tovu typecheck linked to the wave's Jini SHA); UI waves (R1c, R2, R3, C-CHAT-DEPS) also get a browser look at admin and chat. One batched review per wave.

## 4. File-disjointness

**By construction:** `census.mjs` assigns each Jini file to exactly one R lane from its owner package and folder (the `rlane` function, same rule as `scripts/lanes.py`), so two R lanes never share a file that carries an edge. Sub-sheets inside a lane are split by package or folder as listed in each sheet. The exceptions are the files a lane touches **outside its own owner package**; this is the complete list:

| File or folder | Touched by | Resolution |
|---|---|---|
| `packages/*/package.json` (14 files) | G-STALE-DEPS, then each lane's last commit | G-STALE-DEPS runs alone in wave 0 |
| `packages/core/src/contracts/runtime/testing.ts` (new) | G-TESTS setup | wave 1; R11a (wave 2) only imports it |
| `packages/core/src/contracts/server/rate-limit.ts` (new), `core/src/contracts/server.ts` (one export line) | R6-R9 | only lane touching it; R7 reads `contracts/server` but does not edit that line |
| `packages/core/src/text/{redact-urls.ts (new), index.ts}`, `packages/oauth/src/redact.ts` | R10a | only lane |
| `packages/http-kit/src/rate-limit.ts` | R6-R9 (wave 1), R7-Z (wave 4) | serial by wave |
| `packages/commerce/src/payments/**` | R6-R9 (`ledger/migrations/index.ts`), R12a (provider context type, only if the helper field is missing) | different files; if R12a must edit commerce it reports the file and the coordinator lands it after R6-R9 |
| `packages/server/src/adapters/*` (new files) | R11a (`agent-plugin-effects.ts`), R11b/c (only if OD-3 = yes), R8 (terminal), R13d | each adds its own file; `packages/server/package.json` lines are reported, coordinator applies |
| `packages/server/src/{index.ts, owner-store/*}` | R13c (wave 1), R13b (wave 2) | serial by wave |
| `packages/server/src/kernel-base.ts`, `create-local-node-daemon.ts` | R10b's bind call, R8, R7 | **coordinator-serialized** (the daemon index already lists them as shared). **Override to `R10-agent-runtime.md`:** R10b reports its one bind line for the preset; it does not edit these two files. |
| `packages/provider-plugins/package.json` | R12a–c | coordinator edits it once after the last sub-sheet |
| `packages/admin/src/react/__tests__/fake-admin-kit*`, `packages/ui/src/react/__tests__/fake-ui-kit*` | G-TESTS setup (moves them), R1c/R2/R3 (use them) | serial by wave |
| `scripts/injection-{debt,exceptions,test-debt}.json`, `pnpm-lock.yaml`, `packages/core/package.json` | every lane | coordinator-only (COMMON) |

**Tovu:** each run adds its own new file and edits nothing else: `composition/jini-file-ports.ts` (R11a), `jini-runtime-ports.ts` (R11b), `jini-agent-runtime-ports.ts` (R10b), `jini-storage-consumers.ts` (R6-R9), `apps/admin/src/integrations/jini-admin/forms-catalog-ports.ts` (R2a), `…/embed-comment-ports.ts` (R2b). **Override to `R12-providers.md`:** each R12 sub-sheet writes its **own** file (`jini-providers-payments.ts`, `-analytics.ts`, `-observability.ts`) instead of appending to one. The user-management kit binding and every "use" line go to the coordinator (`jini-kits.ts`, `deps.ts`, `app.ts`, `main.tsx`). Paired Tovu call-site edits named in a sheet (R11b `ensure-json-agent-install.ts` and the sidecar/devops adapter callers) belong to that run alone; no other run in this index touches those files, but the size-design lanes might: check `git log` on them at dispatch.

## 5. Owner decisions still needed

| # | Question | Recommendation | Blocks |
|---|---|---|---|
| OD-3 | The brief's rule says runtime adapters live in "opt-in runtime adapter packages that never assemble services"; DESIGN §7 Q8 says the Node adapters move **to the host preset** (`@jini-ai/server`), which is the package that assembles the daemon. Which holds? And may Tovu import adapters from the preset? | A separate small package (for example `@jini-ai/node-adapters`, kind `runtime-adapter`: imports platform + the domain's port types, exports bindings only, assembles nothing); the preset and Tovu both import it. It keeps "I want the Node binding" apart from "I depend on the whole preset". | R13d only. R11b/R11c are written to remove the edges without moving the adapter files, so they do not wait. |
| OD-4 | agent-runtime's ports: on its existing state object with a typed "not bound" error (sheet as written), or threaded through every function signature | state object now; threading is ~+150k and collides with R8 | R10b |
| OD-5 | `agent-plugins/scripts/build-cloudflare.mjs` bundles cms's `readSubmissionEvidence` into a plugin payload at build time | move that pure reader to `core/contracts/forms` (C8 follow-up), then bundle from core | one item of R12d |
| OD-6 | If more than 40% of a package's tests are cross-package integration tests, move them all to `packages/integration-tests` (package coverage drops) or keep `/testing`-entry devDependencies | decide per package when G-TESTS reports the numbers | G-TESTS T1–T4 only in that case |
| OD-7 | search's contribution descriptor types are not in core (verified). Plain data + host registration (sheet), or add the descriptor vocabulary to `core/contracts/plugin-sdk` | plain data now (no core change) | nothing (R11c proceeds) |
| Q-G1, Q-G2 | GAPS §5 (chat devDependency on `db/testing`; chat wrappers kept in frozen `sqlite`) | yes / keep, as GAPS recommends | C-CHAT-DEPS; the same Q-G1 answer is reused by R6-R9 for commerce and cms SQL tests |
| Q1, Q2, Q8 | answered 2026-11-15 | — | Q1 is implemented in the gate; Q2 needs only the exception entries (R13a); Q8's destination is OD-3 |

## 6. How these sheets answer the earlier mistakes

Each sheet names: the full inventory command to run before editing (declarations, exports, importers in both repos, tests, mock sites); the module-level and default-parameter reads that a port would make eager (R2a's four registry-derived constants, R1c's colour table, R10b's proxy default); the argument-shape differences between each port and its implementation (positional platform functions in R11b and R10b, `fs` versus `filesystem`); the security or privacy gate on the path and a test that fails when it is removed (file modes, response-size limit, outbound guard policy, HTML escaping and attribute allow-list, webhook and amount checks, consent purge, telemetry redaction, vault export); tests to write first with the mutation each must catch; per-step "green alone" boundaries with cross-repo pairs; existing owners searched before a new one is proposed (admin kit slots, forms tokens, core ports and `ExecuteCommandFn` were found and reused; a missing owner is stated as such). `COMMON.md` turns the build-run failures (red commits, uninjected hooks, lazy imports, shells, `vi.mock`, lost comments, stale counts) into STOP conditions with a command for each.

## 7. Not verified by this run

- No build, typecheck or test was run; "green alone" boundaries are designed, not proven.
- The merged base is a local merge of three branches, not a pushed SHA; `GUARDS.tsv` blobs are for that state. `integ/merge-b-2026-11-16` exists in Tovu only and was not read.
- Callers in Tovu were searched on `refactor/terra` with `rg` for the names listed in each sheet; callers reached through re-exports or computed names were not traced. Each sheet repeats the search as its first step.
- Whether commerce's provider context already carries `paymentError`/`moneyProblem` (R12a), and how cookie-consent hands storage purge to an adapter (R12b).
- The exact props user-management passes to each kit component, and whether its two `ConfirmDialog` sources share a contract (C9c derives both from the site list).
- Function length and complexity inside the files the lanes edit were not measured (only file line counts: `agent-plugins/lifecycle/activation.ts` 935, `server/builtin-features.ts` 712, `create-local-node-daemon.ts` 524 are already over 500 and are not grown by these sheets).
- The daemon designs' rev 2 estimates (their §9.2) and C-CHAT-DEPS's total were not re-derived.
- Test imports made by relative path, `require.resolve` or source reading are outside the test census.
