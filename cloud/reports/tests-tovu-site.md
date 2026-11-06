# tests-tovu-site

Status: in progress. Started 2026-11-06 19:48 UTC; hard stop 21:48 UTC.

Branch: `cloud/tests-tovu-site` in both repositories. Bases: Tovu `b34b9cb7a`, Jini `3a41ec5b6` from `origin/cloud/combine`.
Loaded COMMON, job instructions, Software Architect, Programmer and TDD personas.

Rebuilding Jini and relinking Tovu before the full root/website test suite. Logs are under `/workspace/work/tests-tovu-site/`.
Assigned suites: `TEST_CONCURRENCY=2 npm run test:ci`, `npm run typecheck`, `npm run typecheck:tests`, `npm run complexity` in Tovu.

Investigating known metadata fixture drift, asset-only CLI export failures and mail descriptor/provider ID validation mismatch. No tests or quality checks will be skipped, weakened or disabled.

## Bugs found

Pending investigation.

## Progress

- Jini `pnpm -r build` passed after refreshing dependencies with `CI=true pnpm install --frozen-lockfile --store-dir /workspace/work/pnpm-store`; initial cache location was read-only and installed links were stale. Tovu relinked using `JINI_PACKAGES_DIR=/workspace/Jini/packages npm run link:jini`.
- Export asset-only failure regression: RED 4 pass/1 fail, GREEN 37 pass/0 fail. CLI now returns incomplete outcome/exit 6 for failed assets and closes the boot. Added one test; existing tests retained.
- v1 mail descriptor/provider grammar regression: RED 0 pass/2 fail; GREEN affected tests34 pass/0 fail. Reuses canonical shared ID pattern; valid underscore IDs accepted, unusable hyphen/digit-leading IDs refused early. Four fixture files adjusted to use registerable IDs without changing plugin IDs or trust assertions.
- Metadata fixture refreshed against domain declarations; exact projections and callback checks now4 pass/0 fail. Pins forms provider search/approval, newsletter query, and commerce approval/confirmation/callback membership. Assertions unchanged.
- Root production typecheck passed. Test typecheck identified one missing required field in the new export report fixture; correction underway before final rerun.
- Full `TEST_CONCURRENCY=2 npm run test:ci` remains in progress. Root complexity initially84 errors/2805 warnings; independent groups addressing existing admin complexity and test-fixture lint findings with behavior-preserving edits.

Further progress: navigation import now buffers existing events until all menu/binding writes succeed within the existing transaction. New first/later displacement regressions failed before the fix; focused navigation42/42. No new I/O; temporary event storage at most1+2k for bounded claimed locations, same successful event order.

Website/development lint group final302 pass/0 fail/0 skipped; targeted lint0 errors/24 unchanged warnings. Forms provider authorization fixtures now60/60; error-response helper plus routes31/31; desktop fixture lint fixes65/65 and desktop typecheck passed. Approval group96/96; allowlist scanner10/10; catalog groups36/36 and36/36. Exact commands/logs being collected for final report.

Admin complexity changes preserve conditions, error precedence, hook order and DOM while splitting local responsibilities. Independent static review covered45 production files and3 tests; documentation placements and one defensive fallback were corrected. B group1318/1318 tests plus typecheck passed. A group612 pass/1 lazy-route wait failure, isolated27 pass/1 fail; stopped after repeat without extending timeouts. A separate automatic-agent-handle fixture drift is being corrected against the shared UI contract. One generic-provider import rule conflicts with an intentional offline-gate regression; both rule and regression retained, unresolved lint finding will be reported.
