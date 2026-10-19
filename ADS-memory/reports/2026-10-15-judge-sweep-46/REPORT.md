# judge-sweep-46 handoff (2026-10-15 ~15:50). Stopped at the 250k context line.

## Done (commits; RED = overnight FAILURES.md rows, GREEN = day-runner)
Tovu: 6de1d348d s02 21 test files | a2c33ed95 s03 10 test files | d4b24821b s04 7 test-only files |
18e0e94d5 s05 sandbox-proxy + http client tests | 523719f8b s06/s07 run-ownership, plugin-host, resolve-mailer, deployment.pins |
bb1550e78 pages.journey:99 (decision below). Jini (general-work, not pushed): 23efcaee j1/j2 test files + reference-web sandbox_proxy.html.
All test-only, so mutation N/A.

## Codex r2 (finished, all exit 0): codex/2026-10-15-sweep-fix-r2/{prompts,out}/
r2a home-fallout (isolated-catalog-home imports in ~25 tests + repair-site realpath, stock-content-dirs tsconfig,
composition-boot-order anchor, booted-request-layouts handler) | r2b catalog (eval fake settings deps, metadata baseline,
install-tool.ts kind type:"string") | r2c security (seal-aad scanner exact exclusions + negative tests, 3 admin tests, pages journey)
| r2d boundaries (vault-kinds.ts moved server/runtime/composition -> platform/secrets, all importers updated; consent/host.ts
structural ConsentRequest instead of express; WAL checkpoint moved to platform/db/kernel/checkpoint-stopped-wal.ts) |
r2e leftovers: no change needed (plugin 0.4.6 matches bundle; "[token removed]" is idempotent); Jini boundHtml maxChars dead
option NOT changed (Codex can't write Jini from Tovu cwd); trivial, low value.

## Remaining (numbered)
1. r2 tests still queued (lock starvation by mutation sweeps): runner `run-shards.sh codex/2026-10-15-sweep-fix-r2/landing-cmds-r2-all.json day-runner/2026-10-15-r2b r2-all`
   is running in the background (one node command over 40 files, then root tsc, then Jini `vitest run scripts/__tests__`). Read
   day-runner/2026-10-15-r2b/FAILS-r2-all.md + logs/r2-all--{1,2,3}.log when results.tsv shows them.
2. Already GREEN in r2b, NOT yet committed (they include source files, so mutation is needed first):
   - s05 rest: apps/website/src/features/webhooks/seal-aad-invariant.ts + __tests__/seal-aad-invariant.test.ts (r2-s05--1 PASS, RED #22);
     apps/admin/src/features/sites/{CreateSiteOnboarding.tsx,Sites.hooks.tsx,hooks/use-sites.hooks.ts} + __tests__/{create-site-admin-password,
     create-site-plugin-tokens,use-sites.hooks}.unit.test.tsx (r2-s05-admin--1 PASS; default-credential-exposure PASS, RED #19).
     Mutate seal-aad-invariant.ts and use-sites.hooks.ts (the .tsx changes are copy strings only) and commit.
   - j2: html-starter + all-fields-demo-fixture GREEN after the Jini CMS dist build (r2-j2--1/2 PASS); nothing to commit (tests unchanged).
3. Waiting on item 1 results, then commit + mutate per shard:
   - s04 rest: contracts/core/tool-metadata/{post,theme,members,sites,site-inspection,deployments}.ts, features/agent-plugins/install-tool.ts,
     tool-metadata.baseline.json, real-tool-catalog.fixture.ts and the 14 s04 test files.
   - s03 rest: development/evals/tool-search-eval-registry.ts (rows #235-246, #251-263).
   - s06: composition/app.ts + deps.ts (boot-work drain), routes/site/pages.ts (nested redirect fallback moved before /:slug; behaviour same
     for single-segment slugs), and the s06 tests. The composition-boot-order anchor follows deps.ts:1031.
   - s07: deploy-ops/registry.ts + agent-tools.ts + registry.test.ts + publish-site-route.test.ts.
   - s02 rest: repair-site, stock-content-dirs, composition-boot-order, storage-move.postgres (it was already failing in sweep #111 for a PG-state reason), sites-config.unit.
   - s08 boundary (#16, #23) + the vault move: the r2d file list (out/r2d-boundaries.md CHANGED FILES), plus s05's uncommitted aad hunks in
     vault-adapter.ts / site-key-recovery.ts / platform/secrets/vault-kinds.ts. Commit these together. Check tsc (r2-all--2) before committing.
   - j1: Jini package.json + vitest.config.ts once r2-all--3 (`vitest run scripts/__tests__`, row #142) passes.
4. Not judged yet: s08 r1 results beyond --8, and s09/s10/s11 (the r1 runner, pid 49708/66654, not mine, is still working through them).
   Expect more home-guard fallout there; use the r2a pattern (import isolated-catalog-home first).
5. Mutation survivors from the s01 handoff are still with the mutation lane.

## Decisions
- j1 infra-retirement.integration (rows #143-146): left RED. The test header says it is "deliberately RED by design" until the
  shim release and the outbox successor are decided. That is a retirement project, not a sweep regression. Excluded from GREEN.
- pages.journey:99: updated the test (bb1550e78). The page HTML is rendered unmodified on purpose (d4896ef3d), and the sandbox is the boundary.
- Create-site copy now reads "admin / the default password" because the default-credential guard (#19) forbids the literal. Accepted.
- vault-kinds.ts moved to platform/secrets (26 platform files already import features, so this matches the codebase pattern).

## Warnings
- Lock starvation: the r2 queue waited more than 1.5 h behind mutate-46/mutjudge-46. Batch node files into one command per acquire.
- Admin vitest rejects --minWorkers; use `--maxWorkers=2` only.
- sites.json md5 changed at 15:12:37 (fd09bce7... -> 07342809...), but entries are still exactly luvira/order-pinch/plannie/tovu-dev and
  site-keys are still 859. No HOME-CHANGED in my runs; no restore was needed.
- No Codex jobs of mine are running.
