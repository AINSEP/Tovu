# INDEX: sheets for the remaining Jini package-to-package imports (revision 2, 2026-11-17)

Planning only. Nothing was built, typechecked or tested by this run; counts come from `scripts/census.mjs` and `rg`. **Status: revision 2 complete for every sheet listed in §2; nothing PARTIAL.** Every finding of `CODEX-JUDGE.md` is answered in the last section. What was not verified is in §7.

**Code read for this revision:** Jini `integ/merge-a-2026-11-16` @ `dde69a6d` and `integ/merge-b-2026-11-16` @ `9c982fd9`; Tovu merge-a @ `e801e9ae` and merge-b @ `450ac748`. `integ/merge-final-2026-11-16` did not exist (2026-11-17 02:10 UTC). The census ran on a local scratch merge of a+b (Jini: 3 conflicted files: `packages/devops/src/checks/hardwiring.ts`, `packages/server/src/kernel-base.ts`, `scripts/size-debt.json`; Tovu: 37 conflicted files, so Tovu facts were read on merge-a and cross-checked on merge-b). `census/terra/` (the superseded `refactor/terra` census) was removed from the tree; it is in git history.

## 1. Re-measure (re-run 2026-11-17)

| | round 1 (terra + C6 + daemon prereqs) | now (merge-a + merge-b) |
|---|---|---|
| raw sites outside "own package + core + protocol" | 227 in 150 files | **227 in 149 files** |
| owner → target pairs (raw) | 47 | **46** |
| **cleanup work** (class `work`; exceptions applied first) | 176 claimed | **150 sites in 32 pairs** |
| allowed: host presets (`server` 38, `cli` 1) | 36 | 39 |
| allowed: option C (`@jini-ai/ui-kit/react` from React files) | counted as work (wrong) | **23** |
| frozen (`sqlite` 11, `infra` 4) | 15 | 15 |
| stale manifest declarations | 19 | 20 |
| test files importing a non-base package | 279 | 283 |
| test files with `vi.mock` of another package (**core included**) | 34 | 35 files, 40 sites |

Per lane, cleanup work only (`census.mjs` prints this line): R1 3 · R2 6 · R3 **16** (was 39) · R4 18 · R6 2 · R7 42 · R8 **13** (was 16) · R9 3 · R10 11 · R11 17 · R12 19 (+ payload lines) · R13 **0** (54 rows, all allowed or frozen). `census/merged/CENSUS-sites.tsv` column 12 is the class; `sites/<LANE>.sites.tsv` and `GUARDS.tsv` (blob per file at merge-a and merge-b; 25 files differ between the two) were regenerated.

## 2. Sheets (every sheet inherits `COMMON.md`; each row is one Sonnet run)

| Sheet | Runs | Sonnet estimate |
|---|---|---|
| `N1-node-adapters.md` (**new**, OD-3) | 1 | 70k |
| `G-STALE-DEPS.md` | 1 | 35k |
| `R6-R9-storage-consumers.md` | 1 | 95k |
| `R10-agent-runtime.md` | R10a 45k, R10b-1 150k, R10b-2 90k | 285k |
| `R11-platform-consumers.md` | R11a 120k, R11b-1 120k, R11b-2 80k, R11b-3 80k, R11c 70k | 470k |
| `R1-R2-admin.md` | R1c 35k, R2a 150k, R2b 70k | 255k |
| `R3-user-management.md` | C9c 70k, R3b 90k (R3a deleted) | 160k |
| `R12-providers.md` | R12a 100k, R12c 100k, R12b 90k, R12d 50k | 340k |
| `R13-hosts.md` | R13a 25k, R13b 120k, R13c 20k, R13d 30k | 195k |
| `G-TESTS.md` | setup 70k; T0 10k, T1 120k, T2 130k, T3 120k, T4 110k | 560k |
| **Total written here** | **30 runs** | **~2.47M** (round 1 said 24 runs / 2.2M; it listed 27) |

Not rewritten here, with their real status from the execution reports (judge finding 14):

| Work | Where | Status on merge-a |
|---|---|---|
| R4 chat (`C-CHAT-DEPS`) | `plan/untangle-gaps-2026-11-16` GAPS §1 | executable; 18 sites match its list. Needs Q-G1/Q-G2. |
| R8 daemon runtime | `plan/daemon-untangle-design-2026-11-16` R8-RUNTIME rev 2 | R8a steps 0–3 **done** (`cloud-results/daemon-r8a.md`); step 4 **partial** (attempt kept as a patch; fold into step 5); steps 5–6 (launcher consumes `AgentRuntimePort`) **not started**. C6 is **PARTIAL** (`cloud-results/c6.md:6`): HTTP sub-ports `ProviderToolTurnPort` / `XaiOAuthPort` have no signatures (`:67`). R8b = steps 4+5+6. R10b-1 waits for it. |
| R7 daemon routes | same branch, R7-ROUTES rev 2 | prerequisites C-ORIGIN-PORT, G-HTTP-AUTH, C4-a/b/e, P-NODE-BRIDGE **done**; **route conversion (G1) is HELD**: `cloud-results/daemon-prereqs.md` §4 needs three decisions (strict path matching O-12; OPTIONS answers; `Content-Length`/ETag/304) and still owes P0 characterization (`:310-316`: the other 81 JSON routes, the 17 `listen` tests, §11.15 rows, repeated query values). **Do not dispatch R7 "as designed".** First: owner answers OD-9, then one P0b characterization run (~120k, sheet not written), then G1. |
| C12-OBS | `plan/untangle-gaps-2026-11-16` sheets/C12-OBS.md | written, not landed; R12b, R12c need it (90k) |

Whole remaining programme, rough: 2.47M (here) + ~1.05M (daemon, its own estimate, plus ~120k P0b) + C-CHAT-DEPS (~340k) + 90k (C12-OBS) ≈ **4.1M Sonnet**, plus one batched Opus review per wave (~40k each).

## 3. Order

| Wave | Runs (parallel inside the wave) | Needs |
|---|---|---|
| 0a | `G-STALE-DEPS` (alone: 14 manifests) | a branch pair that passes COMMON's base check |
| 0b | `N1` (alone: gate file, platform manifest) | 0a |
| 1 | `G-TESTS` setup · `R6-R9` · `R10a` · `R12a` · `R12d` · `R13a` · `R13c` · `C9c` · C12-OBS | 0b |
| 2 | `R11a` · `R11c` · `R1c` · `R2a` · `R3b` · `R12c` · `R13b` · C-CHAT-DEPS · R8b | wave 1 (R11a: fakes from G-TESTS setup + N1; R1c/R2a: moved admin fake; R3b: C9c; R12c: R12a + C12-OBS; R13b: R13c) |
| 3 | `R11b-1` · `R11b-3` · `R2b` · `R12b` · `G-TESTS` T0, T3, T4 · (R7 P0b, only after OD-9) | wave 2 (R11b-*: R11a put `@jini-ai/node-adapters` in Tovu's manifests; R2b: R1c; R12b: R12c) |
| 4 | `R11b-2` · `R10b-1` · (R7 G1…G3, serial) | R11b-1 (mcp manifest); R8b + N1 + R10a |
| 5 | `R10b-2` · `R13d` · R7-Z · `G-TESTS` T1, T2 | wave 4 |

Gate between waves: one cloud run (Jini gates, typecheck and tests of touched packages, Tovu typecheck linked to the wave's Jini SHA); UI waves (R1c, R2, R3b, C9c, C-CHAT-DEPS) also get a browser look. One batched review per wave.

## 4. Write sets (complete: edge files, callers, manifests, host files)

Census ownership covers only the files that carry an edge. The table below adds every caller, manifest and host file a sheet names; a file listed for two runs is serialized by wave. **No file is left for a coordinator.**

| File or folder | Touched by (wave) | Why it cannot collide |
|---|---|---|
| `scripts/injection-debt.json`, `pnpm-lock.yaml` | every run | each run deletes only its own keys / re-runs `pnpm install`; conflicts resolve by keeping both deletions (COMMON); the lockfile is regenerated after a rebase |
| `scripts/lib/injection-edges.ts` + its test | N1 (0b) only | — |
| `scripts/injection-exceptions.json` | R13a (1) only | — |
| `packages/platform/package.json` | N1 (0b) only | — |
| `packages/node-adapters/package.json` | N1 (0b), R11a (2), R11b-3 (3), R10b-1 (4) | one per wave |
| `packages/core/src/contracts/runtime/testing.ts`, core manifest/README | G-TESTS setup (1); R6-R9 (1) adds `contracts/server/rate-limit.ts` | different core files; both edit `packages/core/package.json` **only if** a new export entry is needed: R6-R9 adds a file under an existing entry (no manifest edit); if it finds it needs one, it runs after G-TESTS setup |
| `packages/core/src/text/*`, `packages/oauth/src/redact.ts` | R10a (1) only | — |
| `packages/http-kit/src/rate-limit.ts` | R6-R9 (1), R7-Z (5) | by wave |
| `packages/commerce/src/payments/**` | R6-R9 (1: `ledger/**`), R12a (1: the provider contract's `context` in `payments/kernel`) | different folders |
| `packages/provider-plugins/**` incl. `package.json`, `telemetry-reporter.ts` | R12a (1) → R12c (2) → R12b (3) | serial |
| `packages/cookie-consent/src/{contract,client/runtime}.ts` | R12b (3) only | — |
| `packages/admin/package.json` | R1c (2), R2b (3) | by wave |
| `packages/admin/src/react/__tests__/fake-admin-kit*`, `packages/ui/src/react/__tests__/fake-ui-kit*` | G-TESTS setup (1), users R1c/R2 (2+) | by wave |
| `packages/user-management/**` | C9c (1), R3b (2) | by wave |
| `packages/agent-plugins/src/lifecycle/**`, `packages/plugins/src/host/node/source-drafts.ts` | R11a (2) only | — |
| `packages/mcp/**` | R11b-1 (3: `agent-install`, `federation`), R11b-2 (4: `core`) | by wave |
| `packages/sidecar/**` | R11b-1 (3) only | — |
| `packages/integrations/src/{media-providers/dispatch,saved-requests}/**` | R11b-3 (3); G-TESTS T2 (5) | by wave |
| `packages/devops/src/deploy/node.ts`, `packages/search/src/contribution.ts` | R11c (2) only | — |
| `packages/agent-runtime/**` | R10a (1), R10b-1 (4), R10b-2 (5); R8b (2) edits `runtime-port-bindings.ts` | by wave |
| `packages/server/src/kernel-base.ts`, `create-local-node-daemon.ts` | R8b (2), R10b-1 (4), R7 (4, serial after R10b-1 in that wave) | by wave; R7 and R10b-1 are **not** parallel: R10b-1 first |
| `packages/server/src/{index.ts, owner-store/*}` | R13c (1), R13b (2) | by wave |
| `examples/neutral-host/**` | R11a (2: `support/host.ts`), R11c (2: `contribution-contracts.test.ts`), R12 drift file (1–3) | different files |
| Tovu `apps/admin/src/integrations/jini-kits.ts`, `main.tsx` | C9c (1), R1c (2), R2a (2: its own `forms-catalog-ports.ts` + one line in `jini-kits.ts`), R2b (3) | R1c and R2a both add a line in wave 2: **R2a's Tovu commit rebases on R1c's** (`git pull --rebase`; additive lines) |
| Tovu `composition/commerce.ts`, `features/forms/repo.sqlite.ts` | R6-R9 (1) only | — |
| Tovu `features/agent-plugins/lifecycle.ts`, Tovu manifests (first `node-adapters` import) | R11a (2) only | — |
| Tovu assistant daemon files (4 sidecar importers, `ensure-json-agent-install.ts`) | R11b-1 (3); R8b (2) may edit `agent-daemon-scope.ts` | by wave |
| Tovu `composition/provider-plugins.ts` | R12a (1, only if needed), R12c (2) | by wave |
| Tovu `composition/{app,deps}.ts`, `assistant/agents.ts`, `agent-daemon-scope.ts`, desktop `main/index.ts` | R10b-1 (4) only among these sheets; the size-design lanes also edit `app.ts`/`deps.ts`: check `git log` on them at dispatch | by wave |

## 5. Owner decisions

| # | Question | State |
|---|---|---|
| OD-3 | where the Node runtime adapters live | **Answered 2026-11-16:** new package `@jini-ai/node-adapters`, kind `runtime-adapter` (sheet N1; R11, R10b, R13d rewritten). Supersedes Q8. |
| OD-4 | how agent-runtime's ports reach its functions | **Closed by the owner rule "DI via typed ports from the host"** (R10b rev 2: required on `createNativeAgentRuntime`, explicit field on stateless functions, no shared instance). Raises R10b from 140k to 240k and makes it wait for R8b. Tell us only if you want the cheaper shared-state variant back. |
| OD-5 | `agent-plugins/scripts/build-cloudflare.mjs` bundles cms's `readSubmissionEvidence` into a payload | open; recommendation: move the pure reader to `core/contracts/forms`. Holds one item of R12d. |
| OD-6 | >40% cross-package tests in a package: move all to `packages/integration-tests` or keep `/testing` devDependencies | open; decide per package from G-TESTS T0's numbers. |
| OD-7 | search's contribution descriptor types | **Closed:** search keeps its parser, validator and id check and takes the host's `define` function (R11c §3); no core change. |
| OD-8 (new) | `packages/server/src/adapters/node-pty.ts` (native dependency) stays in the preset, not in `@jini-ai/node-adapters` | recommendation: stay. Nothing waits on it. |
| OD-9 (new) | R7 route conversion: (1) strict path matching vs matching Express first (O-12), (2) who answers OPTIONS, (3) `Content-Length` / ETag / 304 parity | open (`cloud-results/daemon-prereqs.md` §4). **Blocks all of R7.** |
| Q-G1, Q-G2 | GAPS §5 (chat devDependency on `db/testing`; chat wrappers kept in frozen `sqlite`) | open; recommendation yes / keep. Blocks C-CHAT-DEPS. R6-R9 no longer depends on Q-G1 (its SQL tests keep their existing db import). |

## 6. How the sheets answer the earlier mistakes
As in round 1 (inventory command first; eager-read traps named; port argument shapes pinned by recording fakes; security gate + a test that fails without it; tests first with the mutation each catches; per-step green boundaries with cross-repo pairs; existing owners searched first), plus, from lessons 27–39: exceptions are applied before work is planned (census column 12); a browser-delivered module gets a browser-side injection point (R12b); sheet + COMMON are one contract with no deferred edits; sub-sheets compile alone (R11a one commit; R10b hosts bind all ports in one pair); security paths are characterized, not re-invented (R6 ledger table, R11b-2 secret-write options, R11c search validation, R12a provider host).

## 7. Not verified by this run
- No build, typecheck or test was run. No merged a+b branch exists yet; facts in files that conflict between merge-a and merge-b (`packages/server/src/kernel-base.ts`) must be re-read on the real merge.
- N1: whether `pnpm guard` accepts a package without a `"."` export, and which platform entries export the five functions the moved files need (the sheet has a STOP with a command for each).
- R10b: the exact call chain from `providers/oauth-provider.ts` to a function that holds a state (STOP if it ends in a module constant); whether a static catalog import has import-time side effects in Tovu.
- R12a/R12c: whether commerce's and diagnostics' provider contracts already define a `context` (the sheet treats adding it as the domain change); the name of the existing packed-artifact test suite.
- R12b: every `onState` call site in cookie-consent's browser runtime.
- R3: the exact props user-management passes to each of the four slots.
- R1-R2, G-TESTS, R13b, R12d: only the judge's findings and the coordinator rule were revised; their other round-1 content was not re-read line by line.
- Function length and complexity inside the files the lanes edit were not measured (COMMON now gives the eslint command that does).

## Revision 2 - judge response

All 16 findings (6 blockers, 9 majors, 1 minor with 4 parts) were checked against the code; **16 accepted, 0 rebutted**.

| # | Severity | Verdict | What changed (file) | Evidence |
|---|---|---|---|---|
| 1 | Blocker | ACCEPT | `COMMON.md` "There are no coordinator-only files": every commit carries its debt keys, core manifest lines, lockfile and host lines; every sheet's "coordinator" line replaced (`R10`, `R11`, `R12`, `R13`, `R1-R2`, `R3`, `G-STALE-DEPS`, `G-TESTS`); INDEX §4 orders shared files by wave | `scripts/lib/injection-debt.ts` `staleViolations` returns rule `injection-debt-stale` and `applyDebt` includes it |
| 2 | Blocker | ACCEPT | `COMMON.md` §Base: both repos must contain merge-a and merge-b; four commands; red Tovu typecheck on the unmodified pair is a STOP | Tovu merge-b still imports `@jini-ai/agent-runtime/ai-trace` (5 files, e.g. `agent-daemon-core-client.ts:9`) and `apps/desktop/src/desktop-agent-inventory.ts:12` imports the old root; Tovu merge-a has neither |
| 3 | Blocker | ACCEPT | `R6-R9` §1 rewritten: wrapper stays in commerce and keeps `ledgerTable` forced; db's function injected with its real 3 positional arguments; tests T1–T5 (ledger identity, option forwarding, rerun, coexistence); Tovu edit in the existing owner `composition/commerce.ts:110` | `db/src/migrate/runner.ts:217`; `commerce/src/payments/ledger/migrations/index.ts:47-52` |
| 4 | Blocker | ACCEPT | `R10` R10b rewritten and split (R10b-1, R10b-2): `ports` required on `createNativeAgentRuntime`; explicit required field on `spawnEnvForAgent` and `validateFilesystemLaunch`; Claude builder bound like Codex; pkce becomes a factory (no module-load guard); default state never holds ports; two-host isolation test T9; waits for R8b | `env.ts:95`, `claude-filesystem-policy.ts:12`, `providers/pkce.ts:135`, `runtime-state.ts:41`, `runtime-port-bindings.ts:68`, `runtime-def-binding.ts:18` |
| 5 | Blocker | ACCEPT | `R11` R11c §3: search keeps `parseSearchProviderManifest`, `validateContributedSearchProvider` (restricted-vendor refusal) and the post-load id check; only agent-plugins' function is injected as `define`; recovery options bound by the host inside `define`; existing refusal tests unchanged | `agent-plugins/src/lifecycle/provider-contribution.ts:44-52`; `search/src/contribution.ts:91-126` |
| 6 | Blocker | ACCEPT | `R12` header + R12a + R12c: helpers arrive as `optional.context` from the domain's provider contract through the existing `host.initialize` path; entry updates named; packed-artifact tests; no Tovu `satisfies` assembly file | `plugins/src/host/provider-host.ts:16,226`; `payments-stripe/index.ts:13`; Tovu `composition/provider-plugins.ts:383` |
| 7 | Major | ACCEPT | `R12` R12b: injection at cookie-consent's browser runtime (`onState({ state, storage })`); tests on the built browser artifact for off-mode init, full→anonymous, revocation | `consent-adapter.ts:159,202`; `cookie-consent/src/client/runtime.ts:55,180` |
| 8 | Major | ACCEPT | `R11` R11a decision 4 + step 1: required ports, adapter change and every constructor in ONE commit; Tovu consumer named (round 1 said there was none) | `agent-plugins/src/lifecycle/node.ts:13-17`; Tovu `features/agent-plugins/lifecycle.ts` imports `createNodeAgentPluginEffects` |
| 9 | Major | ACCEPT | INDEX §4 rebuilt from full write sets; R11 has no shared Tovu wiring file (bindings come from `@jini-ai/node-adapters`); R1c wave 2 / R2b wave 3; R12a → R12c → R12b serial, R12c owns all three `telemetry-reporter` callers | `provider-plugins/src/analytics-posthog/posthog.ts:24` |
| 10 | Major | ACCEPT | `scripts/census.mjs` column `class`; `COMMON.md` compliance classes; `R3` rewritten (R3a deleted, kit re-scoped to 4 components + 5 hooks, a STOP if an option-C import disappears) | census: 23 `allowed-optionC` rows. The judge's 153 is **150** on merge-a+b (R8 dropped 3 sites; 3 more preset rows) |
| 11 | Major | ACCEPT | `R11` R11b-2 (own run): `McpConfigFilesPort` with a `writer`; `MCP_SECRET_WRITE_OPTIONS` stays in mcp; recording test T2 **and** the existing real-permission cases T2b | `mcp/src/core/config.ts:62-65,94-97` |
| 12 | Major | ACCEPT | `R3` C9c item 3: a dedicated `KitProbe` consumer; page/slot coverage with loading and error states moved to each R3b commit; C9c is a pair that mounts the Tovu provider first | `user-management/src/admin/react/pages/UsersPage.tsx:2`, `src/react/users/Users.tsx:3` |
| 13 | Major | ACCEPT | `R6-R9` §2: `ColumnCatalogPort` defined; handle type kept through `StorageKernel`'s type argument; Tovu `features/forms/repo.sqlite.ts` + tests in the same pair | `cms/src/forms/sql/submission-ip-retention-repo.ts:2,21`; Tovu `repo.sqlite.ts:6,34` |
| 14 | Major | ACCEPT | INDEX §2 status table + OD-9: R7 held on three decisions and owed characterization; R8a/R8b/C6 real status; R10b-1 waits for R8b | `cloud-results/daemon-prereqs.md` §4 (`:291-296`), `:310-316`; `c6.md:6,67`; `daemon-r8a.md` (step 4 partial, step 5 not started) |
| 15 | Major | ACCEPT | `COMMON.md` STOP table: one command per rule and a "does not prove" column with the review obligation (relative shells and forwarders, lazy imports, hooks, mocks incl. core, vanished comment lines, eslint at 50/10/500) | `scripts/check-size.mjs:15` gates functions at 80; census now writes `CENSUS-test-mocks.tsv` with core (2 sites) |
| 16a | Minor | ACCEPT | `R1-R2` §comments: 4 importing files (24 call sites), not 84 | `rg -c createMemoryCommentsApi packages/admin/src` |
| 16b | Minor | ACCEPT | `R12` §Manifest: the five packages are `devDependencies` | `provider-plugins/package.json:95-106` |
| 16c | Minor | ACCEPT | INDEX §2: 30 runs listed and counted | — |
| 16d | Minor | ACCEPT | mcp config is its own run (R11b-2) | 7 production + 14 test call sites |
