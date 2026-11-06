# admin-speed — 2026-11-05

Static job scope completed; browser latency remains unmeasured. Loaded the Software Architect,
Programmer and TDD personas from `/workspace/cloud/ai-dev-shop`, and read COMMON.md,
admin-speed.md, TRIM.md and P18-admin-speed-result.md from Jini's plans branch.

## Branches and changes

- Tovu: `cloud/admin-speed`, based on the specified `e327c07c8` (not the subsequently advanced remote tip).
- Pushed `4308ede35e1cdec1d4ecc2a41dec457b94da09a7` — extend navigation coverage beyond ordinary query freshness.
- Pushed `bd3468eda7cd141a683dd80358c54c57c4067ad9` — isolate cache age from scheduled daemon health probes.
- This report is committed and pushed separately on the same branch; the final response records its SHA.
- Jini: checked out the specified `6f507852d` on local `cloud/admin-speed` for dependency builds. No tracked changes or push.

The requested production fixes are already in the pinned Tovu base (also documented in
`cloud/night-1104b/B18-admin-result.md`): Comments, Redirects, SEO and Widgets have synchronous
host adapters in `panel-pages.ts`; Jini retains the actual lazy page/tab loaders. The assistant
alias is already implemented. Shell language, interface and appearance reads already use
principal-scoped caching with infinite freshness and explicit settings invalidation.

The only executable change here adds four lines to `app-boot-request-volume.test.tsx`:
advance wall-clock time by 11 seconds before repeated SPA navigation, preserving every original
request-count and shell/dock identity assertion. Ordinary cache freshness must not conceal
repeated bootstrap/settings reads. `setSystemTime` leaves the independent five-second daemon
health-poll schedule unchanged. No production code, routes, transport, schema or options changed.
Added production reads/writes/polls: **0 × 0 bytes**.

## Verification

Commands below run from `/workspace/Tovu` after sourcing `/workspace/.tovu-build/env.sh`.
The prescribed `/workspace/shared/dev-env.sh` and `/workspace/shared/start-postgres.sh` are absent;
the installed equivalents under `/workspace/.tovu-build/` provided Node 24 and PostgreSQL.
PostgreSQL started successfully and `select 1` returned 1. Local dependencies were relinked with
`JINI_PACKAGES_DIR=/workspace/Jini/packages npm run link:jini` (zero links changed).

**PASS — 67 tests, four files:**

```sh
npm --prefix apps/admin test -- --maxWorkers=1 --testTimeout=60000 src/__tests__/unit/admin-route-lazy-loading.unit.test.tsx src/integrations/jini-admin/__tests__/comments-swap.unit.test.tsx src/__tests__/app-boot-request-volume.test.tsx src/__tests__/unit/app-assistant-alias.unit.test.tsx
```

**PASS — 33 settings tests, three files:**

```sh
npm --prefix apps/admin test -- src/hooks/__tests__/use-admin-locale.hooks.test.ts src/hooks/__tests__/use-interface-preferences.hooks.test.ts src/hooks/__tests__/use-admin-appearance.unit.test.ts
```

**Lint — zero errors, three existing fixture warnings** (static property readonly, fixture
complexity 17, nested ternary). No additional branches or complexity; no disables added.

```sh
./node_modules/.bin/eslint apps/admin/src/panel-pages.ts apps/admin/src/__tests__/unit/admin-route-lazy-loading.unit.test.tsx apps/admin/src/__tests__/app-boot-request-volume.test.tsx apps/admin/src/__tests__/unit/app-assistant-alias.unit.test.tsx
```

**Typecheck — FAIL, four existing errors outside the changed test:**

```sh
npm --prefix apps/admin run typecheck
```

BUG: `apps/admin/src/features/security/Security.tsx:183` calls the object-shaped translator with two arguments (TS2554).

BUG: `apps/admin/src/lib/__tests__/api-user-facing-fallback.unit.test.ts:24` and `:25` access an `unknown` error (two TS18046 errors).

SETUP: `apps/admin/dev-jini-deps.ts:4` cannot see `sourceTreeStamp` in the existing devops build. The pinned Jini source exports it; the workspace rebuild stopped before rebuilding devops.

**Build setup — partial, not a green workspace build:**

```sh
# From /workspace/Jini
pnpm -r build
npm --prefix packages/provider-plugins run typecheck
npm --prefix packages/chat run build
# From /workspace/Tovu
npm --prefix packages/contracts run build
```

Jini's admin/UI and their earlier dependencies built. The workspace command stopped in
provider-plugins; its isolated typecheck reports missing `jsdom` at
`src/__tests__/browser-provider-dom.ts:3` (TS2307). The explicit chat and Tovu contracts builds
passed and resolved the initial stale-build import failures. Unrelated build/type errors were
listed without expanding this job.

Earlier parallel test runs hit five-second timeouts and intermittent Comments render deadlines.
The Comments file passed independently (five tests), then all 67 tests passed together with one
worker. No assertion, test, rule or supported behavior was disabled, skipped, deleted or weakened.
The 60-second test budget was already specified in the prior B18 report. The first test extension
advanced timers and correctly observed two scheduled health probes; the follow-up commit uses
wall-clock aging to test navigation independently of those legitimate polls.

`git diff --check e327c07c8...HEAD` passed. No full test suite was run.

## Open measurement work

The reported repeated 8–20 second delays still require a browser trace; no latency or emitted-byte
savings are claimed. On an isolated, quiet setup with one admin tab, record first and repeated
visits separately for development and production. Repeat the same route sequence five times;
capture click-to-useful-paint, loading-notice duration, transferred bytes, initiators, protocol,
queueing, TTFB and script evaluation. Confirm navigation adds no Document or auth-bootstrap
request, and export Performance traces with screenshots and a sanitized HAR.

Route splitting, prefetch and HTTP/2 changes remain measurement-dependent. No deployment,
publish, force-push or push to main was performed. Work completed within the two-hour cap.
