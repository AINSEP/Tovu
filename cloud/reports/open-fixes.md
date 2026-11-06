# open-fixes

Scoped small fixes and requested checks completed within the two-hour cap. **Validation is PARTIAL:** the known ten failures are corrected and compilers pass; separate baseline failures, lint debt and the remaining cache mechanism are listed below. Full suites were not run, as instructed.

## Branches and commits

Both repositories use `cloud/open-fixes`.

| Repository | Base | Implementation/report checkpoint before this final report |
|---|---|---|
| Tovu | `74fedc1320d31431ab4a13d1e38af03a402ca28b` (`origin/cloud/combine`) | `b33c455f7` |
| Jini | `f07ae3d6ff55cf4da480acac44cc6f4b7686966b` (`origin/cloud/combine`) | `a565bdbd9` |

Tovu commit ledger (all on `cloud/open-fixes`):

- `08df97a11` — progress report.
- `afa987c22` — commerce admission, literal desktop prompt interpolation, starter-original parity.
- `15ff9319c` — current export, consent and settlement test contracts.
- `afd21ffb4` — launch lifecycle configuration correction.
- `a73d4ec09` — real test fixture/callback types.
- `b2ff18647` — scoped form delivery/storage fixtures and exporter assertion cleanup.
- `b33c455f7` — themeless catalog fixture point lookup.

The final report commits follow these tips; final full SHAs are supplied in the final response. Jini's [matching report](https://github.com/AINSEP/Jini/blob/cloud/open-fixes/cloud/reports/open-fixes.md) records its exact verification commands. No Jini implementation change was needed.

## Each requested item

| Item | Disposition and reason |
|---|---|
| 1 | FIXED. Commerce admission used case-sensitive comparisons ahead of case-insensitive Express routes. Normalize only comparison paths; IDs/slugs retain their original spelling. Uppercase return/cancel/checkout/products/order routes, including trailing slash variants, now reach the same handlers. |
| 2 | FIXED. Stop title and other-app body use replacement callbacks, preserving literal special sequences in site/app names. Tab-close already used callbacks; delete prompts use template literals; count interpolation is numeric. |
| 3 | ALREADY FIXED. The warning uses the archived `media/` location. Existing isolated sentinel regression passes unchanged. |
| 4 | TESTS/FIXTURES WRONG, CORRECTED. Five exporter failures came from absent consent wiring, an obsolete catalog fixture and retired visitor-specific consent expectations. Cookie test used a retired settings class. Consent refresh test contradicted documented last-good policy delivery. Three settlement tests assumed buyer responses contained an internal id; the fallback PostgreSQL URL also lacked a parseable host. Current exact public fields, durable associations, explicit refresh/read counts and real loader behavior are asserted. No production change or consent mechanism. |
| 5 | FIXED. Exact unchanged base reproduces all 76 test-only type diagnostics. Real port/DTO/callback types, narrowing assertions, complete fixtures, schema-neutral migration kernels and NodeNext import spelling now compile with zero diagnostics. Original behavior assertions retained. |
| 6 | FIXED for starter. `a6582f7f570d1aae453d5601d0c508234cc5d149` added the declared-consent loader to seven shipped starter pages but omitted Reset originals. Shipped pages are correct for the authored consent contract. Regenerated only starter through existing generation: exactly one nonvisual loader line added per original page. Separate other-theme drift is listed, not repaired. |
| 7 | ALREADY FIXED / VERCEL COMPLAINT INCORRECT CURRENTLY. Explicit plugin updates compare version plus digest; bundled selection uses digests. Cloudflare already advances 0.3.1→0.3.2. Its changed payload includes portable form validation/schema evidence and retained pending submissions after provider switches. Vercel 0.1.0 matches all nine published files byte-for-byte, so no bump is needed. |
| 8 | ALREADY FIXED. Large selections append through a loop; 200,000-selection regression passes. |
| 9 | ALREADY FIXED. An environment-key mention requires actual authentication-problem wording. |
| 10 | ALREADY FIXED. Upload, document reads and extraction reuse the inclusive 50 MiB limit and plain refusal. |
| 11 | ALREADY FIXED. Disabled plugin metadata remains discoverable while executable availability remains withdrawn. |
| 12 | PARTIAL EXISTING FIX VERIFIED; STOPPED at new mechanism. ETags and 60-second caching already cover all public rendition URL spellings. Fresh client responses can survive a replacement briefly; previously immutable cached responses cannot be purged by a new server response. URL revision/purge would require a new mechanism. |
| 13 | ALREADY FIXED. Both publishing entrypoints prepare and validate the catalog against exact selected archives and immutable registry versions for skipped distributions; changed agent payloads require increased manifest versions. |

The additional requested lifecycle correction was completed. Details and its individual command paths are intentionally omitted from this public report as requested.

## Exact setup and compiler commands

Commands source `/workspace/.tovu-build/env.sh`; Tovu cwd `/workspace/Tovu`, Jini cwd `/workspace/Jini`. Network/loopback permission was enabled where needed. PostgreSQL was used only for disposable random-schema settlement fixtures.

```sh
# Jini
CI=true pnpm install --frozen-lockfile --store-dir /workspace/work/pnpm-store
pnpm --no-bail -r build
# Tovu
npm --prefix packages/contracts run build
npm --prefix packages/sdk run build
JINI_PACKAGES_DIR=/workspace/Jini/packages npm run link:jini
bash /workspace/.tovu-build/start-postgres.sh
node_modules/.bin/tsc -p tsconfig.json --noEmit
NODE_OPTIONS=--max-old-space-size=6144 node_modules/.bin/tsc -p tsconfig.tests.json --noEmit
# Desktop main compiler, from Tovu
npx tsc -p apps/desktop/tsconfig.main.json --noEmit
# Renderer compiler, from Tovu/apps/desktop
node_modules/.bin/tsc -p tsconfig.renderer.json
```

All passed. The test compiler command against isolated exact base `/workspace/work/open-fixes/tovu-type-baseline` reported **76 diagnostics**; the final tree reports **0**. Root production and test compilers were also rerun after all implementation commits and passed.

## Exact focused commands and results

All website paths below are relative to Tovu. Define the following prefix for the table commands (the expanded commands were run with these flags):

```sh
wtest() {
  TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx \
    --import ./development/test-support/composed-bundle-env.ts \
    --test --experimental-test-module-mocks "$@"
}
```

| Command | Result |
|---|---|
| `wtest apps/website/src/server/runtime/composition/__tests__/commerce-http.unit.test.ts` | 7 passed; new regression first failed with CMS fallthrough. |
| `node --test-isolation=none --import tsx --test src/renderer/use-site-power.hooks.test.ts` (cwd apps/desktop) | 23 passed; literal-name regression failed before fix. |
| `wtest --test-isolation=none apps/website/src/features/theme/__tests__/shipped-theme-original-drift.canary.test.ts` | 4 passed / 1 existing other-theme failure. Starter changed from failing seven mismatches to passing. |
| `wtest --test-isolation=none --test-name-pattern='static/tovu-starter' apps/website/src/features/theme/__tests__/shipped-theme-original-drift.canary.test.ts` | Starter 1 passed. |
| `wtest --test-name-pattern='L3 isolated guard: secret-sentinel' apps/website/src/features/site-backup/__tests__/library-share.integration.test.ts` | 1 passed unchanged. |
| `wtest apps/website/src/server/inbound/public-http/routes/site/__tests__/integration/media-replace-cache.integration.test.ts` | 4 passed unchanged. |

Known-failure reproduction and corrected full affected group:

```sh
wtest --test-concurrency=1 --test-reporter=tap \
  apps/website/src/features/site-export/__tests__/site-exporter.test.ts \
  apps/website/src/server/inbound/public-http/middleware/__tests__/site-cookie-consent.test.ts \
  apps/website/src/server/inbound/public-http/middleware/__tests__/site-consent.test.ts \
  apps/website/src/server/inbound/public-http/routes/commerce/__tests__/settlement.integration.test.ts
```

**Before: 85 passed / 10 failed. After: 95 passed / 0 failed.** After strengthening exact retry/public-field assertions, the same prefix on `site-consent.test.ts` and `settlement.integration.test.ts` passes 25/25. After local assertion-helper cleanup, `wtest --test-name-pattern='live site: a request carrying' --test-reporter=tap apps/website/src/features/site-export/__tests__/site-exporter.test.ts` passes 1/1.

### Type-fixture runtime checks

Each row below was a separate exact invocation of `node --import tsx --import ./development/test-support/composed-bundle-env.ts FILE`, with FILE replaced by the listed path. Combined: **612 passed, 3 unchanged baseline failures, 1 existing skip**. The shared compatibility helper is covered by its consuming plugin suites. Three failures were reproduced with the identical commands on the isolated unchanged base; they were not weakened or repaired.

| File | Pass | Fail | Existing skip |
|---|---:|---:|---:|
| `apps/website/src/assistant/__tests__/external-mcp-connection-source.operator-read-only.test.ts` | 11 | 0 | 0 |
| `apps/website/src/assistant/__tests__/external-mcp-connection-source.test.ts` | 6 | 0 | 0 |
| `apps/website/src/assistant/__tests__/tool-registrations.plugins-set-enabled-families.test.ts` | 28 | 0 | 0 |
| `apps/website/src/features/agent-plugins/__tests__/unit/connect-destination.unit.test.ts` | 7 | 0 | 0 |
| `apps/website/src/features/agent-plugins/__tests__/unit/enable-access.regression.test.ts` | 30 | 0 | 0 |
| `apps/website/src/features/agent-plugins/__tests__/unit/federate-mcp.unit.test.ts` | 34 | 0 | 0 |
| `apps/website/src/features/deployments/__tests__/publish-agent-tools.unit.test.ts` | 106 | 0 | 1 |
| `apps/website/src/features/external-mcp/__tests__/external-mcp-connection-revocation.test.ts` | 15 | 0 | 0 |
| `apps/website/src/features/external-mcp/__tests__/external-mcp-oauth.test.ts` | 78 | 1 | 0 |
| `apps/website/src/features/external-mcp/__tests__/external-mcp-shared-oauth.test.ts` | 11 | 0 | 0 |
| `apps/website/src/features/media/__tests__/library-publish-transport.test.ts` | 4 | 0 | 0 |
| `apps/website/src/features/media/__tests__/library-publish.test.ts` | 1 | 0 | 0 |
| `apps/website/src/features/navigation/__tests__/publish-content.characterization.test.ts` | 5 | 0 | 0 |
| `apps/website/src/features/navigation/__tests__/publish-content.test.ts` | 32 | 0 | 0 |
| `apps/website/src/features/post/__tests__/publish-content.characterization.test.ts` | 5 | 0 | 0 |
| `apps/website/src/features/post/__tests__/publish-content.test.ts` | 42 | 0 | 0 |
| `apps/website/src/features/project-keys/__tests__/site-sealer.unit.test.ts` | 3 | 0 | 0 |
| `apps/website/src/features/publish-content/__tests__/raw-file-contributor.test.ts` | 15 | 0 | 0 |
| `apps/website/src/features/publish-content/__tests__/raw-row-contributor.test.ts` | 8 | 0 | 0 |
| `apps/website/src/features/redirects/__tests__/publish-content.test.ts` | 19 | 0 | 0 |
| `apps/website/src/features/site-backup/__tests__/integration/saved-keys-round-trip.integration.test.ts` | 3 | 0 | 0 |
| `apps/website/src/features/site-backup/__tests__/library-share.integration.test.ts` | 20 | 0 | 0 |
| `apps/website/src/features/theme/__tests__/publish-content.apply.test.ts` | 44 | 0 | 0 |
| `apps/website/src/platform/db/migrations/__tests__/owner-mfa-step.test.ts` | 2 | 0 | 0 |
| `apps/website/src/platform/db/migrations/__tests__/owner-recovery-codes-step.test.ts` | 2 | 0 | 0 |
| `apps/website/src/server/inbound/admin-http/__tests__/dev-auth-failures.unit.test.ts` | 3 | 1 | 0 |
| `apps/website/src/server/inbound/admin-http/routes/agent-plugins/__tests__/integration/agent-plugin-set-enabled.integration.test.ts` | 32 | 0 | 0 |
| `apps/website/src/server/inbound/admin-http/routes/system/__tests__/site-share-password-handler.test.ts` | 1 | 0 | 0 |
| `apps/website/src/server/inbound/admin-http/routes/system/site-imports.integration.test.ts` | 9 | 0 | 0 |
| `apps/website/src/server/inbound/admin-http/routes/system/site-shares.integration.test.ts` | 2 | 0 | 0 |
| `apps/website/src/server/inbound/public-http/routes/site/__tests__/no-theme.route.test.ts` | 6 | 0 | 0 |
| `apps/website/src/server/runtime/composition/__tests__/deps-observability-wiring.integration.test.ts` | 2 | 0 | 0 |
| `apps/website/src/server/runtime/lifecycle/__tests__/assistant-daemon-connection.test.ts` | 11 | 1 | 0 |
| `apps/website/src/server/runtime/lifecycle/__tests__/site-idle-park.unit.test.ts` | 15 | 0 | 0 |


### Form type-fixture checks

Each path below was run separately as `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json timeout 60s node --import tsx --import ./development/test-support/composed-bundle-env.ts --experimental-test-module-mocks FILE`. All paths are under `apps/website/src/`.

| FILE suffix | Passed |
|---|---:|
| `features/forms/__tests__/form-file-maintenance.test.ts` | 11 |
| `features/forms/__tests__/form-file-renditions.test.ts` | 5 |
| `features/forms/__tests__/form-file-storage.test.ts` | 2 |
| `features/forms/__tests__/publish-content.test.ts` | 8 |
| `server/inbound/admin-http/routes/forms/__tests__/forms-route-failures.unit.test.ts` | 50 |
| `server/inbound/admin-http/routes/forms/__tests__/providers.unit.test.ts` | 6 |
| `server/runtime/composition/__tests__/form-delivery-oauth.integration.test.ts` | 11 |
| `server/runtime/composition/__tests__/form-delivery-vertical-slice.integration.test.ts` | 11 |
| `server/runtime/composition/__tests__/form-file-cleanup.integration.test.ts` | 2 |

Total 106 passed. The final vertical-slice delivery-counter case also passed 1/1. Additional lifecycle verification yielded 107 passed and two existing container process-reaping failures; private command details are withheld as requested.

Direct execution / `--test-isolation=none` was used when child isolation produced opaque file-only output. Initial restricted-network listener failures were rerun with permitted loopback; no test or runtime behavior was changed for that environment issue.

## Complexity and review

```sh
node_modules/.bin/eslint --no-inline-config --rule '{"complexity":["error",10],"sonarjs/cognitive-complexity":["error",10]}' apps/website/src/server/runtime/composition/commerce-http.ts
node_modules/.bin/eslint --no-inline-config --rule '{"complexity":["error",9],"sonarjs/cognitive-complexity":["error",9]}' apps/desktop/src/renderer/use-site-power.hooks.ts
```

Both pass. All 35 main type-fixture paths also passed repository ESLint (zero errors, warnings retained). The four item-4 test paths passed strict complexity lint (zero errors, three existing warnings). Strict aggregate source lint retains one unchanged helper at complexity 11; exact-base lint reproduces it, while new logic complies. The form-file-maintenance test retains one unchanged cognitive-complexity 11 finding, also reproduced on exact base. No suppression or rule/configuration change.

Independent combined code inspection and architecture audit: PASS for scoped changes. Exact data assertions retained or strengthened; three new tests, no removed test declarations, no added `any`, ignore directives, skip/only, coverage exclusions or dependency cycles. Coverage percentages/full suites were not run because the job requests affected checks. New production work adds no durable reads/writes, polling, schema, services or network calls; comparison cost is linear in path bytes, and launch configuration snapshots are bounded environment copies.

## Bugs found

- FIXED: capitalized commerce paths bypassed their handlers.
- FIXED: Stop title interpreted replacement sequences in site names.
- FIXED: Stop body interpreted replacement sequences in external app names.
- FIXED: seven starter Reset originals lacked the shipped nonvisual loader.
- FIXED TEST: exporter fixture lacked consent runtime wiring.
- FIXED TEST: obsolete export product adapter lost product coverage.
- FIXED TEST: export cache expectations predated shared consent markup.
- FIXED TEST: managed-consent selector used a retired class.
- FIXED TEST: refresh-failure expectation contradicted last-good policy behavior.
- FIXED TEST: settlement consumed an internal field absent from public buyer data.
- FIXED TEST: PostgreSQL default fixture URL lacked a parseable hostname.
- FIXED TEST: 76 fixture/type diagnostics against current contracts, including union narrowing, missing current port/DTO fields, callback signatures and NodeNext import spelling.
- FIXED TEST: themeless fixture omitted the current catalog point lookup.
- ALREADY FIXED: pending media warning archive location and the Jini items listed above.
- OPEN: separate `tovu-theme` Reset originals still lack the loader on 14 pages; whole canary remains 4/5.
- OPEN: old client media caches require a URL revision/purge mechanism for retroactive invalidation.
- OPEN BASELINE: OAuth reauthorization status case still fails unchanged on exact base.
- OPEN BASELINE: boot-owner refusal fixture expects a detail field absent from its actual response.
- OPEN BASELINE: daemon refusal fixture expects an older explanation.
- ENVIRONMENT LIMIT: two POSIX descendant-PID assertions see terminated zombies retained by container PID 1; process-stop implementation was unchanged.
- OPEN BASELINE: configured desktop test resolver recursively overflows under Node 24.22.1; pure affected checks use the existing plain loader.
- OPEN BASELINE: one unchanged source helper has complexity 11 against ceiling 10; details of the additional private item are withheld.
- OPEN BASELINE: one unchanged form-file-maintenance test has cognitive complexity 11.
- OPEN BASELINE: observability fixture omits a temporary site binding and can write its completion marker at the default site path. Only the confirmed newly generated marker was removed; no default-site database was used by that path.

Private added-item details are omitted from this list at the user's request. All remaining minor findings are listed rather than expanded into new repairs. Raw logs remain outside the repositories in `/workspace/work/open-fixes/`; none contain real owner data or credentials from this work.

Only `cloud/open-fixes` was pushed. The first Tovu push was temporarily rejected by automatic review, then accepted after checking the job's explicit owner authorization for the local pre-push override. Later pushes used the same authorization. No action remains blocked; no deployment, publication or main-branch write was performed.
