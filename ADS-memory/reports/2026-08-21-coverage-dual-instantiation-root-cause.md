# Coverage dual-instantiation root cause — bisect in progress

**Date:** 2026-08-21
**Status:** IN PROGRESS — no cause isolated yet. This is an interim save so eliminated hypotheses survive a stop.

## The bug (as handed off)

A full-repo `node --import tsx --test --experimental-test-coverage` run corrupts per-file coverage for 681/769 (89%) source files: an affected file's `SF:` block in the merged lcov shows esbuild CJS-interop helper names (`__toCommonJS`, `__copyProps`, `__toESM`, `__export`) that never appear in a scoped run, `FN:`/`FNDA:` entries concatenate (function count inflated, hit ratio deflated), and `DA:` line entries merge by line number with a zero-hit shadow entry winning (line-hit count deflated). `src/server` is 97% affected, `src/core` 95%; only `src/cli` (13/13), `apps/site-chat` (6/6), `src/http` (2/2) are fully clean.

Target file for the bisect: `src/media/provider-credential-store.ts` (untouched all session, so source is stable). Confirmed both ends of the repro myself before starting:

- Scoped (`src/media/**/*.test.ts` alone): 0 shim markers, `LH:357 LF:357`.
- Full-repo snapshot (coordinator's `full-repo.lcov`): 6 shim markers, `LH:294 LF:357`, `FNF:43 FNH:29` — matches the handoff numbers exactly.

## Method

Progressively widen the test-file set from the clean `src/media/**/*.test.ts` baseline, re-run with `--experimental-test-coverage`, and grep the regenerated lcov's `provider-credential-store.ts` `SF:` block for the four shim marker strings. `TEST_CONCURRENCY=2` throughout, every run scoped (never `npm run test:cov`).

## Static-analysis lead, investigated and REFUTED (not just untested — actually dead)

Found every non-test production file using `require()`/`createRequire` in `src/`:
`src/assistant/mcp-injection.ts`, `src/features/source-control/commit-site.ts`,
`src/features/deployments/static-publish/adapter.ts`, `src/server/app.ts`, `src/server/deps.ts`,
`src/server/middleware/admin-static.ts`, `src/server/http/site/worker-sandbox.ts`.

Two of these break a genuine import cycle (`server/app.ts -> export/index.ts -> export/site-exporter.ts -> server/app.ts`, documented in `app.ts`'s own `runExportSiteLazily` comment and `deps.ts`'s matching `createSiteAppLazily`) by resolving `../export/index.js` / `./app.js` via `createRequire(import.meta.url)` instead of a static `import`. This looked like an extremely strong candidate: tsx registers separate ESM-loader and CJS-require hooks, and a `.ts` file reached via `require()` gets a fresh esbuild-CJS-format transpilation — independent module instance, esbuild interop helpers and all — from the same file reached via plain `import`. Exactly the shape of the bug.

**Traced every call site and it is a dead end**: `.createSiteApp(` (the method that would trigger `deps.ts`'s lazy `require("./app.js")`) is called in exactly 3 places repo-wide — `routes/types.ts` (the field's own type declaration, not a call), `site-exporter.ts:738` (the real call, inside `exportSite`), and `site-exporter.test.ts`. The test file builds its `routeDeps` via `createRouteDeps()` from `app.js` directly (`site-exporter.test.ts:9,58,...`), which uses `app.ts`'s own **non-lazy** `createSiteApp: () => createApp(routeDeps)` field (`app.ts:674`) — never `deps.ts`'s lazy `createSiteAppLazily`. No test anywhere constructs a `routeDeps` from `createSqliteRouteDeps()` (`deps.ts`'s real, SQLite-backed factory — the only path whose `createSiteApp` field is the lazy `require()` one) and then calls `exportSite`/`.createSiteApp()` on it. **A code path that is never executed cannot produce coverage data, corrupted or otherwise** — confirmed by directly testing it (see below): adding the real export-route integration test to the media baseline stayed clean.

Verdict: this is a real, well-designed cycle-break in the codebase, but it is not what's causing the corruption, because nothing currently exercises it.

## Bisect rounds run so far — ALL CLEAN (0 shim markers on provider-credential-store.ts)

| # | Added to `src/media/**/*.test.ts` | Files added | Wall time | Result |
|---|---|---:|---:|---|
| 0 | (baseline alone) | 0 | ~10s | CLEAN — LH 357/357, confirms repro |
| 1 | `src/export/**/*.test.ts` | 3 | ~15s | CLEAN |
| 2 | `src/server/routes/admin/system/__tests__/integration/export-site.integration.test.ts` (the one route test that actually exercises the real `/export` HTTP path) | 1 | ~10s | CLEAN |
| 3 | `src/server/__tests__/*.test.ts` (top-level only, NOT subdirs) | 32 | 4m41s | CLEAN |
| 4 | `src/core/**/*.test.ts` + `src/assistant/**/*.test.ts` | 101 | 2m54s | CLEAN |

Round 4 refutes "scale alone (many diverse test files) is sufficient" at least up to 134 combined files across 3 areas including two of the highest-corruption-percentage areas by the handoff's own numbers.

## In progress

Round 5: `src/media/**/*.test.ts` + `src/server/**/*.test.ts` (full, all 162 server test files, not just the 32 top-level ones round 3 covered — round 3 missed `__tests__/routes/**`, `__tests__/integration/**`, and every route-colocated `**/__tests__/**` file). `src/server` is the single most-corrupted area in the handoff (97%), and this is the first round to cover it exhaustively rather than a 20% sample. Result not yet in — will update this file when it completes.

## What this already rules out, if the investigation has to stop here

- Not the export/site-exporter require()-cycle mechanism (dead code path, traced exhaustively).
- Not triggered by `src/export`'s own test suite, alone or combined with media.
- Not triggered by the one real export-route integration test.
- Not a top-level-only sample of `src/server/__tests__`.
- Not triggered by `src/core` + `src/assistant` at combined scale (101 files), even though both are individually high-corruption areas.
- The leading alternate suspect from the handoff — a Jini `dist/` CJS bundle (`SF:../Jini/packages/agent-runtime/dist/acp-model-probe.js` as the combined lcov's first entry) pulling Tovu source back in — has NOT yet been tested directly; next if round 5 is also clean.
