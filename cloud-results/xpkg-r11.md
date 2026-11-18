# xpkg-r11 (Tovu half)

Branch `wave3/xpkg-r11`, base `origin/refactor/terra` = Tovu ada11733f; linked to Jini `wave3/xpkg-r11` (`6f06fc5c`). Full report with all gates: Jini `cloud-results/xpkg-r11.md`.

## Done (pairs of R11c)
- `e67aea7e` deployments host-kit: passes platform's `assertSafePublicUrl` and `createValidatingLookup` to `createNodeReachabilityPorts` (Jini `89b416e9`).
- `9aa3713c` search: `search-provider-registry.ts` passes `define: spec => defineProviderContribution(spec)`; `site-search.ts` and the meilisearch test import `contributeProviders` from `@jini-ai/agent-plugins/lifecycle` (Jini `6f06fc5c`).

## Gates
- `npm run typecheck` green (linked) after each commit; base also green.
- check:size, check:complexity, check:hooks, check:why-comments, check:errors: pass. check:boundaries (115 violations) and check:architecture: identical to unmodified base.
- Tests: 10 search-provider test files 158/158; deployments feature 871/874, the 2 failures (publish-run charts-recharts init, no-vendor-in-core census) also fail on the unmodified base = PRE-EXISTING. `check:jini-registry-drift`: ENV (apps/admin not installed).
- Pre-push desktop hook skipped itself (no apps/desktop changes); no `--no-verify` used.

## Not done
R11a Tovu half (`features/agent-plugins/lifecycle.ts` importing `@jini-ai/node-adapters/agent-plugins`) is blocked: node-adapters is not on npm (404) and the Jini lockfile trap (undici 7.30.2 minimumReleaseAge until 2026-11-19) blocks the Jini side. No Tovu change is needed until the Jini relocation lands; then add `@jini-ai/node-adapters` next to each `@jini-ai/platform` line (`package.json`, `apps/*/package.json`, link script). plugins step 2's Tovu caller (`plugin-runtime.ts` host binding `fileLock`) is also pending.
