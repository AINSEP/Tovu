# F2 — Jini data (L2) + Jini runtime/infra (L9) fix wave — REPORT (in progress)

## RUN LOG
## 2026-10-25T21:34Z — STARTED
Jini code branch `cloud/fixwave-1025-F2` from origin/cloud/overnight-1024-jini @ 3e2fbae8. Read BRIEF.md, RUN-PROTOCOL.md, COMMON.md, TEST-ANTIPATTERNS.md, L2 + L9 REPORT.md. Plan: protocol (registry.ts, delegated-result.ts) → sidecar (json-ipc stale-socket NOCOV, port, supervisor, daemon-registry) → L2 security/no-coverage (owner-store/service authorize guard, backup INVALID_BACKUP, plugins sql repo, trust-certificates) → L9 top-10 security guards (http-kit loopback, devops every/some, e2b path guard). Setup (Node 24, pnpm install + build) running.

## 2026-10-25T21:50Z — PROGRESS
- Setup OK (Node 24.22, pnpm install + `pnpm -r build`). Stryker 9 + vitest-runner installed out-of-tree at /root/stryker (no lockfile change in Jini).
- protocol: registry.ts 51.9→100 %, delegated-result.ts 74.7→95.4 % (4 equivalents left). run-context absent-key test added.
- sidecar: json-ipc 59.4→88.8, port 78.1→100, supervisor 82.2→91.6, daemon-registry 85.8→95.0 (first re-score; more tests added since).
- **SOURCE BUG** platform `createValidatingLookup` (asset-cache.ts:141): null/undefined entry in an `all:true` DNS answer threw TypeError instead of refusing. Red test 5719b6b2 → fix c65174ad.
- db owner-store: vault authorize guard deny tests + 37-case malformed-backup table.
- plugins `host/sql/repo*.ts` "0 %" in L2 is a Stryker-sandbox artifact: the contract test resolves `../../../../../db/package.json` relatively, which breaks in `.stryker-tmp`. Locally it is 100 % lines/branches (10 tests). Not a test gap.
- http-kit: loopback peer/origin look-alike tables, strict bearer gate tests.

## 2026-10-25T22:09Z — PROGRESS (re-scored so far; Stryker 9, vitest runner, perTest, StringLiteral excluded, ignoreStatic OFF, mutate = touched files only)
| file | before (lane) | after |
|---|---|---|
| protocol/registry.ts | 51.9 | 100.0 |
| protocol/delegated-result.ts | 74.7 | 95.4 (4 equivalent) |
| protocol/run-context.ts | 93.3 | 97.8 |
| sidecar/json-ipc.ts | 59.4 | 92.4 |
| sidecar/port.ts | 78.1 | 100.0 |
| sidecar/supervisor.ts | 82.2 | 92.1 (line 99 conjuncts equivalent: attemptSpawn re-checks the same guard) |
| sidecar/daemon-registry.ts | 85.8 | 95.0 |
| sandbox/node-worker.ts | 85.8 | 97.2 |
| sandbox/e2b/wrap-e2b-sandbox.ts | (10 surv) | 95.8 (path-escape guard fully killed) |
| http-kit/local-daemon-request.ts | 87.8 | 92.6 |
| http-kit/api-security-middleware.ts | 91.0 | 95.5 |
| http-kit/verified-origin/origin.ts | 89.8 | 95.8 |
| http-kit/verified-origin/configured-origin.ts | 87.7 | 96.3 |
| devops/checks/coverage/floors.ts | 79.2 | 100.0 |
| devops/checks/coverage/lcov.ts | 75.8 | 94.9 |
| devops/deploy/node.ts | 75.4 | 77.2 (remaining = equivalent: platform lookup refuses non-string/non-public entries first; dispatcher close flags) |
| devops/dns/node/wire.ts | 87.8 | 94.9 |
| agentic/core/site-guide/topic-schema.ts | 88.6 | 98.3 |
| agentic/skills/install/install-service.ts | 88.4 | 94.8 |
| core/origin-validation.ts | 96.6 | 98.0 |
| core/approval.ts | 91.1 | 92.5 |
| core/settings/write-service.ts | 88.8 | 91.0 (before clear()-partition tests; re-run pending) |
Notes: server/feature.ts 14 "capability flag" survivors are EQUIVALENT — the `true` values are never read (`isCapabilityId` uses hasOwnProperty); pinned the vocabulary anyway. L2 "plugins host/sql 0 %" is a sandbox-path artifact (relative `../db/package.json`), 100 % locally.

## 2026-10-25T22:29Z — PROGRESS
More re-scores: db owner-store/backup 72.7→93.7, owner-store/service 84.6→96.7, tools/database-catalog 57.1→100; plugins host/node/browser-provider-assets 64.5→93.5, host/manifest 87.1→92.5, host/node/install 85.1→89.2, host/sql/repo.ts 0→100 and repo.rows.ts 0→100 (with a sandbox symlink workaround — confirms the L2 0 % was a harness artifact); registry trust-certificates 84.6→86.5 (remaining 6 = equivalent: the hop bound is redundant because `remaining` shrinks every hop; line 36 `return false` unreachable); http-kit verified-origin 89.8→95.8 / 87.7→96.3; agentic topic-schema 88.6→98.3, install-service 88.4→94.8; core origin-validation 96.6→98.0; devops dns wire 87.8→94.9.
- CCN scan (eslint `complexity: 10`, all src of protocol/sidecar/sandbox/http-kit/server/agentic/devops/db/core/plugins/registry): **1 → 0** functions > 10 (agentic `fetchRemoteSkill` 11 → extracted `isProvenanceRecord`, 85b748dc; 304 install tests green before/after).
- INCIDENT (self-caused, fixed): efe68cef overwrote a pre-existing `core/settings/__tests__/write-service.scope-guards.test.ts` (5 tests). Restored verbatim in a later commit; F2 cases moved to `write-service.scope-guards.f2.test.ts`. Verified every other non-new file in the diff is append-only.

## 2026-10-25T22:50Z — PROGRESS
Core re-score (ignoreStatic OFF — stricter than L2's ON): write-service 88.8→93.7, actor-identity 89.5→100, gated-mutations/token 90.0→97.5, repo.memory 85.7→97.4, settings.ts 92.1→94.4, sse 91.1→93.5, tool-exposure 86.4→89.4.
DB re-score (ignoreStatic ON, same as L2 — static mutants each rerun the PGlite suite, ~95 % of wall): sqlite-source 85.1→98.5, table-catalog 90.6→96.9, owner-store/open 86.4→93.2, tools/transfer-tools 85.2→91.4 (12 no-coverage → 0), postgres-target 86.1→89.8, migrate/runner 91.7→93.3, transfer/copy-engine 92.4→93.1.
Remaining batch: plugins (hook-registry, claim-conflicts, source-drafts, package-files, contributions, plugin-format), registry (versioning, static-backend), devops integrity, agentic validation/layout, server, sidecar bootstrap; then per-file coverage.

## 2026-10-25T23:27Z — DONE
Finished within caps (wall ≈ 1 h 53 m of 3 h; ≈0.76M of 1.5M tokens). Final report follows.

---
# FINAL REPORT — F2 (Jini: Stryker lanes L2 data + L9 runtime/infra)

## 1. Headline
- **Jini branch `cloud/fixwave-1025-F2`** (from origin/cloud/overnight-1024-jini @ 3e2fbae8): 63 commits, all pushed. **54 new test files (1,221 tests) + appended cases in 6 existing test files**; 3 source files changed (1 bug fix, 2 behaviour-preserving refactors).
- **Source bugs: 1 found, 1 fixed** (platform `createValidatingLookup` threw TypeError on a null DNS list entry — §2). Plus 2 suspected issues for the owner (not changed, §2b).
- **Coverage: every touched non-UI source file (66 files) is at 100 % lines AND branches** on the final tree. Before → after where it was not already 100: sidecar json-ipc branches (pkg 98.3 → 100), devops `checks/coverage/lcov.ts` branches 97.6 → 100 (unreachable `?? ''` removed), db `owner-store/backup.ts` branches 98.7 → 100. "Before" was not measured for every file (baseline coverage run not taken up front — see §5).
- **CCN > 10 in scope: 1 → 0** (eslint `complexity: 10` over all `src` of protocol, sidecar, sandbox, http-kit, server, agentic, devops, db, core, plugins, registry). agentic `fetchRemoteSkill` 11 → extracted `isProvenanceRecord` (304 install tests green before/after).
- **Stryker before → after** (touched files only; `--force`, vitest runner, perTest, StringLiteral excluded, cwd = package): see §3. Highlights: protocol/registry 51.9 → **100**, plugins/sql repo + rows 0 → **100** (sandbox-path artifact, now measured), db tools/database-catalog 57.1 → **100**, sidecar/port 78.1 → **100**, devops floors 79.2 → **100**, agentic layout 88.6 → **100**, sidecar/json-ipc 59.4 → 92.4, plugins browser-provider-assets 64.5 → 93.5, db owner-store/backup 72.7 → 93.7, protocol delegated-result 74.7 → 95.4.
- Wall ≈ 1 h 53 m (21:34 → 2026-10-25T23:27 UTC). Rough tokens ≈ 0.75M. No subagents.

## 2. Source bugs
| bug | failing test | fix |
|---|---|---|
| `packages/platform/src/asset-cache.ts:141` `createValidatingLookup`: a `null`/`undefined` entry in an `all:true` DNS answer threw `TypeError: Cannot read properties of null (reading 'address')` out of the lookup callback (used by devops reachability probes) instead of failing closed. | 5719b6b2 (`platform/__tests__/validating-lookup.hostile.test.ts`, `devops/deploy/__tests__/reachability-lookup.mixed.test.ts`) — 2+3 red | c65174ad — malformed entries are classified like any non-public address and refused. Platform is outside L2/L9 but was the source of a devops (L9) guard failure; 1-line change. |

### 2b. Suspected issues for the owner (NOT changed — need a decision)
1. **plugins `host/node/source-drafts.ts` `safeFile`**: `c:x` (Windows drive-relative / NTFS alternate-data-stream syntax) is accepted; `path.win32.isAbsolute('c:x')` is false and `:` is not refused. Harmless on POSIX hosts; on a Windows host it may address an ADS or another drive's cwd. Skill paths (`agentic/skills/install/validation.ts`) DO refuse `:` — the two validators disagree.
2. **core `settings/write-service.ts` `assertTargetPrincipalInWorkspace`**: a user-scope write naming ANOTHER principal skips the membership check when `workspaceId` is absent (`if (!input.workspaceId) return;`). Whether that path is reachable from a host route was not traced.
3. Pre-existing RED baseline tests (not mine, left red, need an author decision): db `loads-without-driver.test.ts` (2: platform peer pin `^0.5.6` vs `^0.6.10`; `./owner-store` export missing from the subpath list — adding it needs a decision on owner-store's dependency footprint, it loads `kernel/sqlite`), db `import-isolation.test.ts` (owner-store migration imports `kysely` outside `kernel|migrate`), platform `secrets/__tests__/exports.test.ts` (`@jini-ai/core ^0.6.12` vs pinned `^0.6.11`).

## 3. Per-file table (Stryker score before = lane L2/L9 report → after = this run; coverage = final L/B)
| file | Stryker before → after | cov L/B after |
|---|---|---|
| protocol/registry.ts | 51.9 → 100.0 | 100/100 |
| protocol/delegated-result.ts | 74.7 → 95.4 | 100/100 |
| protocol/run-context.ts | 93.3 → 97.8 | 100/100 |
| sidecar/json-ipc.ts | 59.4 → 92.4 | 100/100 |
| sidecar/port.ts | 78.1 → 100.0 | 100/100 |
| sidecar/supervisor.ts | 82.2 → 92.1 | 100/100 |
| sidecar/daemon-registry.ts | 85.8 → 95.0 | 100/100 |
| sidecar/bootstrap.ts | 88.9 → 97.2 | 100/100 |
| sandbox/node-worker.ts | 85.8 → 97.2 | 100/100 |
| sandbox/e2b/wrap-e2b-sandbox.ts | (10 surv) → 96.7 | 100/100 |
| http-kit/local-daemon-request.ts | 87.8 → 92.6 | 100/100 |
| http-kit/api-security-middleware.ts | 91.0 → 95.5 | 100/100 |
| http-kit/verified-origin/origin.ts | 89.8 → 95.8 | 100/100 |
| http-kit/verified-origin/configured-origin.ts | 87.7 → 96.3 | 100/100 |
| server/builtin-features.ts | 83.3 → 89.9 | 100/100 |
| server/host-bootstrap.ts | 83.9 → 88.5 | 100/100 |
| server/feature.ts | 33.3 → 33.3 (14 equivalent) | 100/100 |
| devops/deploy/node.ts | 75.4 → 77.2 (rest equivalent) | 100/100 |
| devops/checks/coverage/floors.ts | 79.2 → 100.0 | 100/100 |
| devops/checks/coverage/lcov.ts | 75.8 → 94.9 | 100/100 (B was 97.6) |
| devops/checks/coverage/integrity.ts | 88.0 → 94.5 | 100/100 |
| devops/dns/node/wire.ts | 87.8 → 94.9 | 100/100 |
| agentic/core/site-guide/topic-schema.ts | 88.6 → 98.3 | 100/100 |
| agentic/skills/install/install-service.ts | 88.4 → 94.9 | 100/100 |
| agentic/skills/install/validation.ts | 93.0 → 96.8 | 100/100 |
| agentic/skills/install/layout.ts | 88.6 → 100.0 | 100/100 |
| platform/asset-cache.ts (bug fix) | n/a | 100/100 |
| core/approval.ts | 91.1 → 92.5 | 100/100 |
| core/settings/write-service.ts | 88.8 → 93.7 | 100/100 |
| core/origin-validation.ts | 96.6 → 98.0 | 100/100 |
| core/settings/repo.memory.ts | 85.7 → 97.4 | 100/100 |
| core/settings/settings.ts | 92.1 → 94.4 | 100/100 |
| core/primitives/sse.ts | 91.1 → 93.5 | 100/100 |
| core/tool-exposure.ts | 86.4 → 89.4 | 100/100 |
| core/gated-mutations/token.ts | 90.0 → 97.5 | 100/100 |
| core/gated-mutations/actor-identity.ts | 89.5 → 100.0 | 100/100 |
| core/settings/agent-write-denylist.ts | 92.3 → 100.0 | 100/100 |
| core/settings/purge-service.ts | 87.9 → 93.9 | 100/100 |
| core/registration-kit.ts | 96.7 → 96.7 | 100/100 |
| core/tool-registry.ts | 90.7 → 90.7 (remaining survivors outside the guards tested) | 100/100 |
| core/settings/agent-value-write-tools.ts | 93.8 → not re-scored | 100/100 |
| db/owner-store/service.ts | 84.6 → 96.7 | 100/100 |
| db/owner-store/backup.ts | 72.7 → 93.7 | 100/100 (B was 98.7) |
| db/owner-store/open.ts | 86.4 → 93.2 | 100/100 |
| db/tools/database-catalog.ts | 57.1 → 100.0 | 100/100 |
| db/tools/transfer-tools.ts | 85.2 → 91.4 (12 no-cov → 0) | 100/100 |
| db/transfer/sqlite-source.ts | 85.1 → 98.5 | 100/100 |
| db/transfer/table-catalog.ts | 90.6 → 96.9 | 100/100 |
| db/transfer/postgres-target.ts | 86.1 → 89.8 | 100/100 |
| db/transfer/copy-engine.ts | 92.4 → 93.1 | 100/100 |
| db/migrate/runner.ts | 91.7 → 93.3 | 100/100 |
| db/kernel/kernel-core.ts | 93.1 → 97.7 | 100/100 |
| plugins/host/sql/repo.ts, repo.rows.ts | 0 → 100.0 (harness artifact) | 100/100 |
| plugins/host/node/browser-provider-assets.ts | 64.5 → 93.5 | 100/100 |
| plugins/host/manifest.ts | 87.1 → 92.5 | 100/100 |
| plugins/host/node/install.ts | 85.1 → 89.2 | 100/100 |
| plugins/host/hook-registry.ts | 83.8 → 92.3 | 100/100 |
| plugins/host/claim-conflicts.ts | 85.0 → 94.2 | 100/100 |
| plugins/host/node/package-files.ts | 86.7 → 93.0 | 100/100 |
| plugins/host/node/source-drafts.ts | 85.7 → 88.3 | 100/100 |
| plugins/host/contributions.ts | 88.3 → 90.7 | 100/100 |
| plugins/host/plugin-format.ts | 70.0 → 90.0 | 100/100 |
| registry/trust-certificates.ts | 84.6 → 86.5 (rest equivalent) | 100/100 |
| registry/versioning.ts | 90.2 → 93.0 | 100/100 |
| registry/static-backend.ts | 91.5 → 93.7 | 100/100 |


Equivalent / unreachable survivors left on purpose (not test gaps): server `feature.ts` 14 (the `true` values of `CAPABILITY_ID_SET` are never read — `isCapabilityId` uses hasOwnProperty); sidecar `supervisor.ts:99` conjuncts (attemptSpawn re-checks the same guard); registry `trust-certificates.ts` hop bound (redundant: `remaining` shrinks each hop) + unreachable final `return false`; devops `deploy/node.ts` `isLookupAddress` sub-clauses (platform refuses non-string/non-public entries first); protocol `delegated-result.ts` 4 (property access on primitives yields undefined; catch → undefined anyway); http-kit `isLoopbackPeerAddress` `!normalized` and the `'127.0.0.1' ||` clause (covered by `startsWith('127.')`).
Stryker config notes: L2 files in db re-scored with `ignoreStatic: true` (same as L2; static mutants each re-run the PGlite suite, ~95 % of wall). Every other re-score used `ignoreStatic: false` — stricter than L2's ON, so core/plugins/registry "after" numbers are conservative. db/plugins/registry/server needed the L9 symlink workaround (packages symlinked into `<pkg>/.stryker-tmp`, never committed) because their vitest configs/tests resolve `../db` relatively.

## 4. Anti-patterns seen most (feed AI Dev Shop)
1. **AP3 type-blind validators** — the commonest gap: guards (isRecord, typeof, Number.isInteger) only ever saw valid shapes. Fixed with one HOSTILE/one-clause table per validator (protocol, sidecar, sandbox, agentic, core, plugins, db backup).
2. **AP4 happy-string regex** — route grammars, origin/peer loopback, LCOV/DNS parsers, semver/ids: anchors never pinned. Tables with leading/trailing junk, `evil.`/`.evil` variants.
3. **AP7 guard without a negative test** — owner vault authorize, settings scope/principal guards, approval abort, confirmation tokens, cert chain walk, bearer/loopback gates, browser-provider approval pins.
4. **AP9 limits without ±1** — frame bytes, snapshot/package caps, label 63/64, TTL/expiry instant, timeouts, base64 size, description 1024/1025.
5. **New one, worth adding to the guide — "`toEqual` hides undefined keys"**: optional-field spreads (`...(x === undefined ? {} : {x})`) survive because `toEqual({a})` equals `{a, b: undefined}`. Use `toStrictEqual` / `Object.keys` (protocol run-context, registry versioning, server agent projection, db psql env).
6. **New one — "a strict collaborator masks a guard"**: a guard looks tested only because a downstream validator rejects the same input (agentic provenance type guard behind a strict `validateSource`; devops `isLookupAddress` behind platform's lookup). Test the guard with a permissive collaborator.
7. **Process lesson**: writing a test file with `cat >` overwrote an existing file once (§5 incident). Agents must check `git ls-files <path>` before creating a "new" test file.

## 5. NOT done
- Before-coverage was not measured package-wide on the base tree; only the three files above are known to have been < 100 %.
- Not targeted (time/value): core `fetch/cache.ts` (27 surv, UI cache), core `tool-input-normalization.ts` fuzzy matcher, core settings express `cms-adapter`/`http`, devops `checks/hardwiring-node.ts` (TS-program heavy dev check), agentic `core/dom/*`, `page-executor`, `a2ui/*`, server `kernel-base.ts`, `create-local-node-daemon.ts`, http-kit `observability.ts`, plugins `discovery.ts`, `plugin-claims.ts`, `tool-contributions.ts`, registry `database-backend.ts`, db `kernel/*/driver.ts` (Postgres ENV), `pglite/owner.ts`, `kernel/store-copy.ts`.
- Remaining survivors in touched files not triaged individually: plugins `source-drafts.ts` (50), `install.ts` (52), `manifest.ts` (31), `contributions.ts` (23); server `builtin-features.ts` (42, mostly route-registration arrow/object mutants of families not booted here); db `transfer-tools.ts` (25), `copy-engine.ts` (20).
- Tovu owner-decision pins (BRIEF §OWNER DECISIONS) live in Tovu, not Jini — not applicable to F2.
- INCIDENT (fixed): efe68cef overwrote pre-existing `core/settings/__tests__/write-service.scope-guards.test.ts`; restored verbatim (later commit), F2 cases moved to `write-service.scope-guards.f2.test.ts`. Every other modified pre-existing file is append-only (verified with `git diff --numstat`).

## 6. Commits (Jini `cloud/fixwave-1025-F2`, newest first)
- `e9f82ec3` test(sandbox): mount-time echo suppression covers only create/write; remove/rename/other paths still delivered
- `acc8d32e` test(core): HOSTILE table through every tool-input reader; key-only hints; limit clamp; documented array-as-record contract pinned
- `78ee73de` test(core): tool registry policy requirement, scope id ownership, revision accounting, read-only classification
- `e22a82d2` test(core): settings purge authorization and per-workspace/per-principal deletion scope with purge revisions
- `b3a97061` test(db): owner-store export refuses when an inventoried entry cannot be read back (backup.ts branches → 100)
- `ca84be3c` fix(test): type errors in three F2 test files under the packages' strict tsconfig (exactOptionalPropertyTypes, literal widening)
- `d32e1bcb` refactor(devops): drop unreachable basename fallback in isMeasurableSourceFile (split always yields ≥1 part; documented); fix test typing under exactOptionalPropertyTypes
- `01ce6914` test(plugins): source-draft edit validation/exact-once/projected-size bound; isSealedHere built-in and version refusals
- `2901076a` test(plugins): hook failure counts reset per workspace on success and fully on re-attach
- `dc1857cc` test(db): kernel own-transaction counter vs foreign-transaction join (success, failure, concurrency), close delegation
- `eb9615c0` test(db): psql env filter — non-overridden PG* var dropped, undefined keys absent (toStrictEqual)
- `35a36c9e` test(plugins): pin plugin format vocabulary, canonical manifest precedence, hook error shape
- `c42ad6a2` test(sidecar): bootstrap option precedence — explicit base, extraEnv fallback, projectRoot, supplied-env ipc base
- `fa4f929a` test(plugins): plugin route method/path grammar table (anchors, params, wildcards, traversal)
- `eea31de2` test(core): pin agent-write confirmation/deny policy, exact rule matching, host composition
- `7e465679` test(registry): static backend publishes verification identity only when verified; search order/limit
- `197e17fc` test(db): transfer plan left-out disclosure — live row counts, bookkeeping/derived/empty hidden, host partial exclusions
- `e6bce2c6` test(db): owner-store key-file creation race (winner's key used) and other generation failures propagate
- `b5c96d27` test(agentic): skill layout segment grammar and state-file refusals
- `d1de8402` test(agentic): skill path/base64/frontmatter/asset-signature clause tables
- `96bf7732` test(devops): coverage-integrity LCOV anchors, barrel grammar, CLI args
- `8f4b3f59` test(server): connectors/research/xai features register their routes; pin principals and agent projection omissions
- `a80fdc5d` test(db): sqlite snapshot WAL header patch on a copy, virtual-table classifier anchoring
- `64271590` test(plugins): package-file listing containment (sibling prefix, symlinked root) and cap boundaries/omissions
- `a1133c08` test(core): actor reference workspace boundary clauses
- `aa6b3ec2` test(core): confirmation-token TTL validation, inclusive expiry boundary, single-use redemption, non-reversible revocation
- `a66e6e6e` test(plugins): route claim normalisation — trim/case/slashes/param erasure, anchored param regex, method fan-out
- `33963684` fix(test): restore pre-existing write-service.scope-guards.test.ts accidentally overwritten in efe68cef; F2 cases move to .f2.test.ts
- `85b748dc` refactor(agentic): extract isProvenanceRecord so fetchRemoteSkill is CCN ≤ 10 (behaviour-preserving, 304 install tests green before/after)
- `3f53603d` test(core): settings definition owner fence per kind, scopes bitmask bounds, site global-bit, totality
- `9b97e08b` test(registry): specifier split boundaries and optional-field precedence/omission
- `955f9746` test(plugins): source-draft path validator one-clause refusals and dotted look-alikes
- `b3e2cd55` test(plugins): hook-registry declared field type refusals, threshold validation, per-workspace failure counts
- `2736424f` test(db): table-catalog type affinity mapping, literal-default grammar, identity/key order, index & FK shaping
- `e3a0fbed` test(db): migration id grammar, ordering and checksum regex boundaries
- `f70eb0f4` test(db): psql adapter via injected fake — PG* env filtering, argv pins, stdin streaming, stderr classification
- `356f2ca4` test(db): site schema slug — run collapse, edge trim, lossless alphabet, exact 63-byte boundary, hash suffix
- `732bd116` test(plugins): manifest id/semver/integrity grammar tables
- `5f4e8c8f` test(core): tool wire-name determinism, pinned hash, reservation/collision probing within 64 chars
- `ceea95f9` test(core): SSE framing edges — comments, id-only records, split UTF-8/CRLF, EOF flush, buffer limit boundary
- `4a00875b` test(core): in-memory settings repo contract — seeds, multi-version lookup, keyed upserts/deletes, revision paging, rollback
- `aad5ec0a` test(core): clear() revision partition per scope + denied-clear message
- `d3649402` test(db): database agent-tool catalog inline contract (permissions, side effects, actor rule, schemas)
- `44560f0d` test(agentic): skill installer provenance type guard, exclusive 0o600 writes, staging cleanup, queue recovery
- `99f5be8b` test(agentic): site-guide topic schema — one clause per case, limits at max/max+1, UTF-8 size cap
- `aa234afc` test(http-kit): bearer header grammar anchors
- `f1405aa1` test(http-kit): verified-origin candidate refusals, https-only allowlist, configured-origin userinfo/loopback look-alikes
- `a948437b` test(core): origin-validation private-range neighbours, dotted-quad grammar, host header parsing, allow-list splitting
- `29b9f8e6` test(devops): DNS wire label boundary, compression pointers/loop, truncation, flag decoding
- `fc67f100` test(plugins): snapshot safety — hard/sym links, size and entry limits at/over edge, invalid limits
- `07842c94` test(plugins): browser-provider approval mismatch matrix (per-field, order, pin set, digest map)
- `0b8e451f` test(core): resolveApproval abort before/during/racing the answer, listener cleanup
- `efe68cef` test(core): settings write scope guards — auth/target workspace mismatch, global partition forcing, user principal defaulting, membership lookup scope
- `9f206bfd` test(registry): certificate chain-walk rejection cases (empty, broken link, cycle, DN-only, multi-CA) with fake certs
- `cff35c18` test(devops): coverage floor validation + lcov path/anchor grammar tables
- `1e1ffb3e` test(server): closeHttpServer on servers without connection-closing methods; pin capability vocabulary
- `66563c79` test(sandbox): path-escape edge cases (.., a/../.., sibling prefix, in-root look-alikes), worker timeout grammar, malformed render replies, factory isolation options
- `c65174ad` fix(platform): createValidatingLookup refuses null/undefined DNS list entries instead of throwing TypeError
- `5719b6b2` test(platform,devops): RED — null/undefined DNS list entry throws TypeError in createValidatingLookup
- `10047506` test(http-kit,sidecar): loopback peer/origin look-alike refusals, strict bearer exemptions; stale-socket unlink, empty frame, drain trace
- `76c13ebd` test(db): owner vault authorize guard deny-paths + malformed-backup INVALID_BACKUP table
- `4df2e693` test(sidecar,protocol): live-socket stale check, trace contract, port error shapes, registry record validation, supervisor conjuncts
- `dc8f181f` test(protocol): registry schema boundaries + delegated-result hostile inputs (Stryker 51.9→100 / 74.7→95.4)


Verification on the final tree: `tsc --noEmit` clean for every touched package (registry tests via a test-including config; 2 pre-existing registry errors not in F2 files); eslint 0 errors on all changed files; `pnpm guard`: exit 1 with 104 violations, none naming an F2-changed file (pre-existing: `search` package missing from the layer table, chat-pane public surface, agent-runtime module state, db owner-store layer edges); package suites: protocol 191/191, sidecar 298 (+2 skipped), sandbox 169+, http-kit 640/640, server 431 (+1 skipped), devops 1106/1106, agentic 1611/1611, registry 377/377, core 1652/1652, plugins 884/884, platform 2713 (1 pre-existing red), db 869 (3 pre-existing reds) — counts from the coverage runs before the last few test commits.

F2 DONE 2026-10-25T23:27Z — wall 1 h 53 m, ≈0.75M tokens (rough).
