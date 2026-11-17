# INDEX: sheets for the remaining Jini package-to-package imports (revision 3, 2026-11-16 PT)

Planning only. Nothing was built, typechecked or tested by this run; counts come from `scripts/census.mjs` and `rg`. **Status: revision 2 complete for every sheet listed in §2; nothing PARTIAL.** Every finding of `CODEX-JUDGE.md` is answered in "Revision 2"; every item of the Opus review is answered in "Revision 3" (last section). What was not verified is in §7.

**Base from revision 3: `integ/merge-final-2026-11-16`, Jini `65d73b0d`, Tovu `a28cb1bf`** (COMMON §Base). Revision 3 re-read on that base every fact it changed; the census below is still the a+b scratch-merge census (each lane re-runs it first). **Code read for revision 2:** Jini `integ/merge-a-2026-11-16` @ `dde69a6d` and `integ/merge-b-2026-11-16` @ `9c982fd9`; Tovu merge-a @ `e801e9ae` and merge-b @ `450ac748`. `integ/merge-final-2026-11-16` did not exist (2026-11-17 02:10 UTC). The census ran on a local scratch merge of a+b (Jini: 3 conflicted files: `packages/devops/src/checks/hardwiring.ts`, `packages/server/src/kernel-base.ts`, `scripts/size-debt.json`; Tovu: 37 conflicted files, so Tovu facts were read on merge-a and cross-checked on merge-b). `census/terra/` (the superseded `refactor/terra` census) was removed from the tree; it is in git history.

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
| R8 daemon runtime | `plan/daemon-untangle-design-2026-11-16` R8-RUNTIME rev 2 | R8a steps 0–3 **done** (`cloud-results/daemon-r8a.md`); step 4 **partial** (attempt kept as a patch; fold into step 5); step 5 **not started**. C6 is **PARTIAL** (`cloud-results/c6.md:6`): HTTP sub-ports `ProviderToolTurnPort` / `XaiOAuthPort` have no signatures (`:67`). **Revision 3 (Opus review B8) uses the design's own split (`R8-RUNTIME.md` §12.5: "R8a = steps 0–5, R8b = steps 6–9"):** **R8a-rest** = finish step 4 + step 5 (needs only C5 + step 1, both landed; wave 1). **R8b** = steps 6 (agent runtime port, 6a `launch.ts` + hosts, 6b `events.ts`, plus §12.8 runtime-state helpers), 7 (AI trace from `core/contracts/ai-trace`) and 8 (type repoints); all three need C6 complete; wave 2. **R8b-9** = step 9 (manifests and debt keys, incl. `daemon → db`, skipped by G-STALE-DEPS) needs R7's four pairs, so it runs in wave 5 after R7-Z and is held with R7. **R8b acceptance** (R10b-1's precondition): `rg -n "validateFilesystemLaunch|spawnEnvForAgent|defaultRuntimeState" packages/daemon/src -g '!**/__tests__/**'` prints nothing; on merge-final it prints `launch.ts:218` (`selectAgentExecutorHostEnv`, §12.8), `:274` (`bindRuntimeAgentDef` state fallback, step 6a) and `:1135,1159,1164` (step 6a). R10b-1 waits for R8b. |
| R7 daemon routes | same branch, R7-ROUTES rev 2 | prerequisites C-ORIGIN-PORT, G-HTTP-AUTH, C4-a/b/e, P-NODE-BRIDGE **done**; **route conversion (G1) is HELD**: `cloud-results/daemon-prereqs.md` §4 needs three decisions (strict path matching O-12; OPTIONS answers; `Content-Length`/ETag/304) and still owes P0 characterization (`:310-316`: the other 81 JSON routes, the 17 `listen` tests, §11.15 rows, repeated query values). **Do not dispatch R7 "as designed".** First: owner answers OD-9, then one P0b characterization run (~120k, sheet not written), then G1. |
| C12-OBS | `plan/untangle-gaps-2026-11-16` sheets/C12-OBS.md | written, not landed; R12b, R12c need it (90k) |

Whole remaining programme, rough: 2.47M (here) + ~1.05M (daemon, its own estimate, plus ~120k P0b) + C-CHAT-DEPS (~340k) + 90k (C12-OBS) ≈ **4.1M Sonnet**, plus one batched Opus review per wave (~40k each).

## 3. Order

| Wave | Runs (parallel inside the wave) | Needs |
|---|---|---|
| 0a | `G-STALE-DEPS` (alone: 14 manifests) | a branch pair that passes COMMON's base check |
| 0b | `N1` (alone: gate file, platform manifest) | 0a |
| 1 | `G-TESTS` setup · `R6-R9` · `R10a` · `R12a` · `R12d` · `R13a` · `R13c` · `C9c` · C12-OBS · R8a-rest (steps 4–5) | 0b |
| 2 | `R11a` · `R11c` · `R1c` · `R2a` · `R3b` · `R12c` · `R13b` · C-CHAT-DEPS · R8b (steps 6–8; needs C6 complete) | wave 1 (R11a: fakes from G-TESTS setup + N1; R1c/R2a: moved admin fake; R3b: C9c; R12c: R12a + C12-OBS; R13b: R13c) |
| 3 | `R11b-1` · `R11b-3` · `R2b` · `R12b` · `G-TESTS` T0, T3, T4 · (R7 P0b, only after OD-9) | wave 2 (R11b-*: R11a put `@jini-ai/node-adapters` in Tovu's manifests; R2b: R1c; R12b: R12c) |
| 4 | `R11b-2` · `R10b-1` · (R7 G1…G3, serial) | R11b-1 (mcp manifest); R8b + N1 + R10a |
| 5 | `R10b-2` · `R13d` · R7-Z · `G-TESTS` T1, T2 · R8b-9 (step 9, after R7-Z; held with R7) | wave 4 |

Gate between waves: one cloud run (Jini gates, typecheck and tests of touched packages, Tovu typecheck linked to the wave's Jini SHA); UI waves (R1c, R2, R3b, C9c, C-CHAT-DEPS) also get a browser look. One batched review per wave.

## 4. Write sets (complete: edge files, callers, manifests, host files)

Census ownership covers only the files that carry an edge. The table below adds every caller, manifest and host file a sheet names; a file listed for two runs is serialized by wave. **No file is left for a coordinator.**

| File or folder | Touched by (wave) | Why it cannot collide |
|---|---|---|
| `api-baseline/jini-ai__<pkg>.json` (generated by `pnpm api:update`) | every run that changes a public surface. **Parallel writers in one wave:** `jini-ai__core.json` in wave 1 (G-TESTS setup, R6-R9 §3, R10a step 2); `jini-ai__commerce.json` in wave 1 (R6-R9 §1; R12a only if it changes a commerce export, which revision 3 says it does not) | generated, never hand-merged: the later lane runs `git pull --rebase`, then `pnpm api:update`, and commits the regenerated file (COMMON "There are no coordinator-only files") |
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
| `packages/daemon/**` | R8a-rest (1), R8b (2), R7 G1–G3 (4), R7-Z + R8b-9 (5, R8b-9 last) | by wave; G-STALE-DEPS skips `daemon → db` |
| `packages/integration-tests/**` | G-TESTS setup (1, creates it); R12c (2), R12b (3), G-TESTS T0/T3/T4 (3), R10b-2 (5: `src/agent-runtime/pkce-oauth.test.ts`) | different files; by wave |
| `packages/server/src/kernel-base.ts`, `create-local-node-daemon.ts` | R8b (2), R10b-1 (4), R7 (4, serial after R10b-1 in that wave) | by wave; R7 and R10b-1 are **not** parallel: R10b-1 first |
| `packages/server/src/{index.ts, owner-store/*}` | R13c (1), R13b (2) | by wave |
| `examples/neutral-host/**` | R11a (2: `support/host.ts`), R11c (2: `contribution-contracts.test.ts`), R12a (1: `src/provider-contracts.typecheck.ts`, moved out by R12c in wave 2) | different files |
| Tovu `apps/admin/src/integrations/jini-kits.ts`, `main.tsx` | C9c (1), R1c (2), R2a (2: its own `forms-catalog-ports.ts` + one line in `jini-kits.ts`), R2b (3) | R1c and R2a both add a line in wave 2: **R2a's Tovu commit rebases on R1c's** (`git pull --rebase`; additive lines) |
| Tovu `composition/commerce.ts`, `features/forms/repo.sqlite.ts` | R6-R9 (1) only | — |
| Tovu `features/agent-plugins/lifecycle.ts`, Tovu manifests (first `node-adapters` import) | R11a (2) only | — |
| Tovu assistant daemon files (4 sidecar importers, `ensure-json-agent-install.ts`) | R11b-1 (3); R8b (2) may edit `agent-daemon-scope.ts` | by wave |
| Tovu `composition/provider-plugins.ts` | R12a (1, only if needed), R12c (2) | by wave |
| Tovu `composition/provider-contracts.ts` | R12c (2) only: the inline observability entry becomes `observabilityProviderContract` (R12 §R12c) | — |
| Tovu `composition/{app,deps}.ts`, `assistant/agents.ts`, `agent-daemon-scope.ts`, desktop `main/index.ts` | R10b-1 (4) only among these sheets; the size-design lanes also edit `app.ts`/`deps.ts`: check `git log` on them at dispatch | by wave |

## 5. Owner decisions

| # | Question | State |
|---|---|---|
| OD-3 | where the Node runtime adapters live | **Answered 2026-11-16:** new package `@jini-ai/node-adapters`, kind `runtime-adapter` (sheet N1; R11, R10b, R13d rewritten). Supersedes Q8. **To confirm with the owner (one line, Opus review B17):** the owner said "bindings only, assembles nothing"; the sheets read that as "may import `platform` and domain port **types**, never a domain value" (COMMON `allowed-adapter`, N1 gate rule). Nothing waits on the answer unless the owner narrows it. |
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
- No build, typecheck or test was run (revision 3 ran only the S8 eslint command on two files, read-only, to prove it works). `integ/merge-final-2026-11-16` now exists and is the base; revision 3 re-read on it only the facts it changed (§Revision 3 evidence). The census was **not** re-run on merge-final, and `packages/server/src/kernel-base.ts` (conflicted between a and b) was not re-read: each lane's first census diff covers it.
- N1: whether `pnpm guard` accepts a package without a `"."` export, and which platform entries export the five functions the moved files need (the sheet has a STOP with a command for each).
- R10b: the exact call chain from `providers/oauth-provider.ts` to a function that holds a state (STOP if it ends in a module constant); whether a static catalog import has import-time side effects in Tovu.
- R12a/R12c: **answered in revision 3** (both contracts already carry a flat `context`; Tovu registers commerce's but not diagnostics'). The packed-artifact suite is `provider-plugins/src/__tests__/artifact.integration.test.ts`.
- R12b: **answered in revision 3** (three `onState?.` sites and one `grant` site in `runtime.ts`, plus the adapter's own `grant → onState`).
- R3: the exact props user-management passes to each of the four slots.
- R1-R2, G-TESTS, R13b, R12d: only the judge's findings and the coordinator rule were revised; their other round-1 content was not re-read line by line.
- Function length and complexity inside the files the lanes edit were not measured (COMMON S8 gives the eslint command that does, compared against `BASE`).
- R6-R9 §1: the revision-3 type sketch was reasoned from the declarations (`migration.ts:21`, `port.ts:18`, `runner.ts:217`, step factories), not compiled; the STOP on `pnpm --filter @jini-ai/commerce build` stays.
- R3 C9c: that a `forwardRef` slot reading `useContext` is not counted by `check:hooks` was read from `scripts/check-hook-injection-lib.mjs:2-4` (built-ins exempt), not run.

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

## Revision 3 - Opus review response

Source: Opus review of revision 2 (verdict READY WITH FIXES; section B: 3 Major, 7 Medium, 7 Low; plus leftovers in A and C) and the coordinator's list. Every item was checked on `integ/merge-final-2026-11-16` (Jini `65d73b0d`, Tovu `a28cb1bf`/`f70017dc`). **All accepted, 0 rebutted**; one item (B1) was fixed differently from the reviewer's two options, because merge-final already has the domain descriptor. Line numbers below are on merge-final.

| Item | ACCEPT/REBUT | Change | Evidence |
|---|---|---|---|
| C / base re-pin | ACCEPT | COMMON §Base pinned to merge-final (Jini `65d73b0d`, Tovu `a28cb1bf`), one ancestor check per repo; INDEX header | both refs exist; Tovu tip `f70017dc` contains `a28cb1bf`; `rg agent-runtime/ai-trace` and the desktop-inventory check print nothing on Tovu merge-final |
| B1 R12c contract owner (Major) | ACCEPT (fixed via existing descriptor) | R12 header "State on merge-final"; R12c: no diagnostics edit, the paired Tovu commit swaps the inline observability entry in `provider-contracts.ts` for `observabilityProviderContract` (exact shape written out); R12c write set; INDEX §4 row; pattern step 3(a) no longer names a Tovu `satisfies` line | Jini `diagnostics/src/observability/provider-contract.ts:17-32` (flat `context`), `observability/index.ts:11`; Tovu `composition/provider-contracts.ts:13` inline `{ contract: "observability", validate }` with no `context`; `plugins/src/host/provider-host.ts:16,226` |
| B1 follow-on, R12a context shape | ACCEPT | R12a: commerce context is **flat** `{ paymentError, moneyProblem }` and already present; no commerce edit; local `StripeProviderContext` flat | `commerce/src/payments/provider-contract.ts:11,15` |
| B2 R3b hook rule (Major) | ACCEPT | C9c exports same-name slot components whose body reads React's built-in `useContext` (not `useUserManagementKit`, so not even admin's `Slot::useAdminKit` debt key repeats); R3b only changes import lines; a component calling a hook wrapper takes it as a defaulted prop; STOP on any new `check:hooks` key | `scripts/check-hook-injection-lib.mjs:2-4,88-93`; admin precedent `admin/src/react/kit.tsx:219-245`; `scripts/hook-injection-debt.json:2843` `Slot::useAdminKit` |
| B3 R11 waves | ACCEPT | R11 line 15 now matches INDEX §3: R11a + R11c wave 2, R11b-1 + R11b-3 wave 3, R11b-2 wave 4 | INDEX §3 rows 2–4; INDEX §4 `packages/mcp/**` row |
| B4 R6-R9 generic constraint | ACCEPT | §1 sketch: `PaymentsMigrationKernel = StorageKernel<Kysely<unknown>, unknown>`; list typed with it (not the open `Kernel`); runner generic `Kernel extends PaymentsMigrationKernel`; why db's `runMigrations` fits written out | step factories return `MigrationStep<StorageKernel<Kysely<unknown>, unknown>>` (`0001…:197`, `0002…:55`, `0004…:29`, `0005…:15`); `migrations/index.ts:34`; `db/src/kernel/port.ts:18`; `runner.ts:217`; `core/.../migration.ts:21-29` (method params) |
| B5 R12b onState paths | ACCEPT | field renamed `purge`; added to `onState?` **and** `GrantInput`; the four runtime sites named (`:57,:59,:83,:135`) with an `rg` that matches `?.(`; adapter `grant → onState` passes it; test (4) for the grant path | `cookie-consent/src/client/runtime.ts:57,59,83,135,255`; `contract.ts:119,121`; `consent-adapter.ts:159-169` |
| B6 api-baseline write sets | ACCEPT | COMMON rule "generated, never hand-merged" (rebase, regenerate, commit); INDEX §4 row naming the wave-1 co-writers; files added to R6-R9, R10, G-TESTS write sets | `api-baseline/jini-ai__{core,commerce,cms,http-kit,oauth}.json` exist on merge-final |
| B7 `AgentRuntimeConfigError` | ACCEPT | R10b-1 creates it in `runtime-state.ts` (shape, `code`, `details`, both plain-words messages); exported through the existing `export *` (no new export line) | `rg ConfigError packages/agent-runtime/src` finds none; `agent-runtime/src/index.ts:115` `export * from './runtime-state.js'` |
| B8 R8b scope | ACCEPT | INDEX §2: R8a-rest = steps 4–5 (wave 1), R8b = 6–8 (wave 2), R8b-9 = step 9 (wave 5, after R7-Z); R8b acceptance = the R10b-1 precondition command, naming `launch.ts:218,274,1135,1159,1164`; R10 precondition rewritten | `R8-RUNTIME.md` §12.5 ("R8a = steps 0–5. R8b = steps 6–9"), §12.8; daemon `launch.ts:218,274,1135,1159,1164` |
| B9 R6-R9 §2 cast | ACCEPT | the edited cast at `:11` is named as this sheet's one allowed edited cast, with its new target; COMMON S10 says how to report it | `cms/src/forms/sql/submission-ip-retention-repo.ts:11` |
| B10 Windows ComSpec (Major) | ACCEPT | R10a: every site passes `fallbackComSpec` via one local `ambientCommandShell` helper; T1 case (b) with no `ComSpec` in the passed env; the "does more than the planner" STOP now names the fallback as known. R11b-1 decision 4: `fallbackComSpec: process.env.ComSpec` (injectable `ambientEnv`); T4 case | `platform/src/command.ts:27-33`; `core/src/contracts/runtime/command.ts:60-65,75-80`; `sidecar/src/supervision/supervisor-node.ts:104` |
| B11 G-STALE `daemon → db` | ACCEPT | row 20 "skip (R8b step 9 owns it)" | `census/merged/CENSUS-manifest.tsv` STALE row `daemon db dependencies` |
| B12 R6-R9 separate manifest commit | ACCEPT | step 5 removed; each manifest move goes in the commit that removes the last production import | COMMON "What a lane may edit" |
| B13 T8 test edge | ACCEPT | T8's real-oauth half lives in `packages/integration-tests/src/agent-runtime/pkce-oauth.test.ts`; agent-runtime gains no oauth test import | G-TESTS-0 creates the ratchet and the package in wave 1; R10b-2 is wave 5 |
| B14 integration-tests wave | ACCEPT | R12 step 4: package exists from G-TESTS setup (wave 1); only R12a (parallel in wave 1) uses `examples/neutral-host`, moved by R12c | `G-TESTS.md` G-TESTS-0 block (NEW `packages/integration-tests/…`) |
| B15 stale numbers | ACCEPT | R13 header 54 = 39 preset (server 38 in 13 files, cli 1) + 15 frozen; R12 sub-sheet estimates = INDEX (100/90/100/50k); N1 `manifest()` at `:19` | `sites/R13.sites.tsv` (54 rows); `scripts/__tests__/check-package-layers.injection.test.ts:19` |
| B16 N1 three names + SiteKind | ACCEPT | N1-c checks all seven functions on the **built** entries (platform `./fs` re-exports with `export *`, so text search cannot prove it); gate treats all three type-only `SiteKind`s; T1b per kind | `platform/src/fs/index.ts:2-17`; `process.ts:292,359,570`; `scripts/lib/import-sites.ts:13` |
| B17 OD-3 scope | ACCEPT | one-line owner confirmation added to INDEX §5 OD-3 | owner memory "bindings only, assembles nothing" vs COMMON `allowed-adapter` |
| A2 evidence slip ("5 files") | ACCEPT | recorded here: Tovu merge-b imports `agent-runtime/ai-trace` in **10** files, not 5 (revision-2 table row 2) | reviewer's `git grep -l` on merge-b |
| A11 CR-006 comment | ACCEPT | R11b-2: the CR-006 / SEC-RB-002 block (`config.ts:68-92`) moves with the `:61` line onto `MCP_SECRET_WRITE_OPTIONS` | `mcp/src/core/config.ts:61,68-92` |
| A15 guard capture | ACCEPT | baseline and check both `pnpm guard > file 2>&1` (COMMON §Base, S14, N1 STOP) | — |
| A15 cognitive complexity | ACCEPT | S8 adds `sonarjs/cognitive-complexity` 10 (both repos load the plugin) | Jini `complexity:strict` script; Jini `eslint.config.mjs:2,45`, Tovu `eslint.config.mjs:2,55` |
| A16a R1-R2 "84" | ACCEPT | R1-R2 STOP line now says 4 files / 24 call sites | `R1-R2-admin.md` §comments |
| Coordinator: STOP commands in tables | ACCEPT | COMMON's STOP table now holds rules only; every command is in a fenced block (S1–S14). N1's two table commands moved to blocks N1-a/b. **Also found:** five `rg` patterns outside tables used `\|`, which ripgrep reads as a **literal** pipe, so they could never match (N1 ×4, R6-R9 ×1): all rewritten with single-quoted `|` | `grep -n '\\|'` over the sheets now finds only the explanatory sentences |
| Coordinator: 50/10 enforcing command | ACCEPT | COMMON S8: eslint `max-lines-per-function` 50, `complexity` 10, `sonarjs/cognitive-complexity` 10, `max-lines` 500 on the changed source files, compared with the same file at `BASE` (JSON formatter: eslint 10 has no line formatter) | ran read-only on `mcp/src/federation/adapter.http.ts` at merge-final with low limits: all four rules fire |

**Opus fixes - remaining:** none from the review. Still open (unchanged, not review items): OD-5, OD-6, OD-9, Q-G1/Q-G2; R7 P0b sheet not written; C12-OBS not landed; census not re-run on merge-final.
