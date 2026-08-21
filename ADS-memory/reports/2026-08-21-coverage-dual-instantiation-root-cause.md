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

## ROUND 5 — FIRST POSITIVE REPRODUCTION

`src/media/**/*.test.ts` + `src/server/**/*.test.ts` (full, all 162 server test files):

```
6 shim markers, LH:294 LF:357, FNF:43 FNH:29
```

**Exact match to the full-repo/handoff numbers.** This is the first scoped combination that reproduces the corruption. Wall time ~18 minutes (started 21:01, finished ~21:19).

Since round 3 (`src/server/__tests__/*.test.ts`, the 32 TOP-LEVEL files only) was clean, the trigger is confirmed to live in the other 130 files this round added: `src/server/__tests__/routes/**` (63), `src/server/__tests__/integration/**` (5), `src/server/__tests__/unit/**` (6), or one of ~20 smaller `**/__tests__/**` buckets scattered under `src/server/routes/**`, `src/server/http/**`, `src/server/agent-daemon/**`, `src/server/boot/**`, `src/server/middleware/**`.

## Eliminations from the team lead (rounds A/B), recorded here for the audit trail

**Round A** — the two `test:cov` glob terms no round 0-4 covered (`packages/*/src/**/*.test.ts` = 1 file, `apps/site-chat/src/**/*.test.ts` = 6 files), combined with `src/media/**`, run WITH `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json` set (matching the real script exactly, not just cleared in isolation as the original elimination tested): CLEAN — 0 shim markers, `LH:357 LF:357`.

**Round B** — same run pulled in 51 `SF:../Jini/...dist/...` entries, and `provider-credential-store.ts` stayed clean anyway. **This directly refutes the handoff's leading suspect** ("a Jini `dist/` bundle is CJS and pulls Tovu source back in") — merely having Jini `dist/` CJS bundles loaded in the same process is not sufficient. Something must actively re-enter Tovu source through a second resolved identity; CJS bundles being present alone does nothing.

## New lead from a sibling agent's `src/http` measurement (not yet tested by this bisect)

`src/http/client.ts`'s only importer repo-wide is its own test file; every real consumer imports only the `HttpClientPort` type (erased at compile time), and `createHttpClient` is never called under `src/server`. `src/http`'s scoped and full-repo numbers match exactly (89.87 both times) — consistent with "single resolved import path -> immune." Reframes the three known-clean areas (`src/cli`, `apps/site-chat`, `src/http`) as possibly clean for a STRUCTURAL reason (few/single entry paths) rather than anything about their content — not yet confirmed for `src/cli`/`apps/site-chat` specifically.

Sharpened mechanism candidates for "two distinct resolved identities of one file": (a) ESM `import` + CJS `require()` of the same file (the mechanism this report already tested and refuted for the `app.ts`<->`deps.ts`/`export/index.ts` cycle specifically), or (b) two different resolved URLs entirely — e.g. a `file:` dependency (this repo has ~22 on Jini packages, installed as `node_modules` symlinks) reached both via the symlink path and some other path.

Still untraced from the original 7-file `require()`/`createRequire` list: `src/assistant/mcp-injection.ts`, `src/features/source-control/commit-site.ts`, `src/features/deployments/static-publish/adapter.ts`, `src/server/middleware/admin-static.ts`, `src/server/http/site/worker-sandbox.ts`. `worker-sandbox.ts` is the priority — it spawns a worker thread with its own `require()` bootstrap, which is a plausible second-instantiation mechanism by construction (see its own code: `require(tsxApiPath).register(); require(workerFile);` run inside a freshly-created worker context).

## Round 6 (in progress)

`src/media/**/*.test.ts` + `src/server/__tests__/routes/*.test.ts` (63 files, the single largest untested bucket within `src/server`) — narrowing round 5's positive result. Launched, not yet complete.

## Single-import-path hypothesis — tested against `src/cli`/`apps/site-chat`, and two new static leads (from the `src/http` finding's author, redirected off measurement mid-task per the team lead's resource call — everything below is `grep`/read-only, no coverage runs)

**Task:** prove or kill "few/single import paths ⇒ immune" against `src/cli` (13/13 clean) and
`apps/site-chat` (6/6 clean), sharpened per ESM semantics (module identity is keyed by *resolved URL*,
not import count).

### 1. Naive framing ("few importers ⇒ immune") — REFUTED

- `apps/site-chat/src/client-directives.ts` — imported by `highlight.ts`, `main.tsx`,
  `SiteAssistantWidget.tsx`, `site-assistant-transport.ts` (4 production importers). Siblings
  `session-store.ts` and `highlight.ts` are the same shape (3 importers each).
- `src/cli/errors.ts` — imported by **dozens** of files across unrelated areas repo-wide (`comments/`,
  `forms/`, `features/commerce/`, `server/routes/admin/connectors/`, `site-dir/`, `newsletter/`, `seo/`,
  `widgets/`, `cli/` itself).

Both stay 100% clean despite import counts an order of magnitude past `http/client.ts`'s one. Import
*count* is not the variable — consistent with ESM identity being keyed by resolved URL, not reference
count. The `http/client.ts` "one importer" fact is real but was never shown causal on its own.

### 2. Two concrete "second resolved URL" candidates, both REFUTED as *sufficient* causes on their own

**(a) Symlinked `file:` dependency (Jini packages, confirmed real symlinks —
`node_modules/@jini-ai/agentic -> ../../../Jini/packages/agentic`, ~22 such deps):** all 6 of
`apps/site-chat`'s clean files import `@jini-ai/*` directly. If merely importing a symlinked package
were sufficient, these would be first to show it; they don't. (Independently corroborates Round B above
— Jini `dist/` CJS bundles present in-process, alone, don't taint anything.)

**(b) A `dist/` copy beside `src/` for Tovu's own files:** `dist/` exists and is built (817 `.js`
files), but **nothing under `src/` or `apps/` imports from it** — confirmed by grep, zero matches. Not a
live candidate for the test-run corruption at all; nothing in a `node --test` run ever touches `dist/`.

**(c) A relative import reaching directly into `../Jini/` (bypassing the `node_modules` symlink) run
alongside the normal `@jini-ai/*` specifier for the same package:** the only repo-wide matches are all
in `apps/admin/src/features/plugins/agent-plugin-source-catalog.ts` — Vite `?raw` asset imports (json/md/
tsx text, not TS modules; a different bundler, different runtime, off-limits area per this session's
own exclusion list). Zero matches inside the `node --import tsx --test` reachable graph.

### 3. Two new static leads for this bisect's own "still untraced" list — not confirmed, offered for the queue

**(i) `commit-site.ts`/`static-publish/adapter.ts`'s `require("#src/export/index")` is a live,
unconditional require path — distinct from the `app.ts`/`deps.ts` one already proven dead.** Both files
define `firstExportFailureLazily()`, which does `require("#src/export/index")` and calls
`.firstExportFailure(report)`. Read the call sites (`commit-site.ts:373`, `adapter.ts:453`): this call is
**not** behind an `if (failed)` guard — it runs on **every** invocation of
`commitSiteToSourceControl`/`publishStaticSite`, success or failure. `commit-site.unit.test.ts` calls
`commitSiteToSourceControl` with the real (unmocked) `exportSiteBound` at 7+ call sites. `export/index.ts`
(and everything it re-exports — `route-manifest.ts`, `site-exporter.ts`) is also reached via plain
`import` from many other files in the same run (e.g. `site-exporter.test.ts` itself). This is a genuine,
frequently-exercised **ESM import + CJS require() of the same file** pair — exactly candidate (a) from
the sharpened mechanism list, and unlike the `app.ts`/`deps.ts` path, not provably dead. Not tested
against coverage (no runs, per the resource hold) — flagging as the most promising of the two remaining
untraced files on the original 7-file list, ahead of `mcp-injection.ts`/`admin-static.ts`.

**(ii) Supporting detail for `worker-sandbox.ts` (already this report's own stated priority):**
`liquid-worker.ts` and `handlebars-worker.ts` (the two files `spawnSandboxWorker` requires inside a
fresh worker isolate via the `require(tsxApiPath).register(); require(workerFile);` bootstrap) each
import `#src/features/theme/index` and `./render.js` — both large, broadly-shared modules also reached
by plain `import` from many main-thread files. `worker-sandbox.test.ts`/`liquid-sandbox.test.ts` never
import these worker files directly (only through `renderInWorkerSandbox`, which spawns the real worker),
so the worker files themselves have exactly one path in — but everything *they* transitively require
inside the worker's CJS-registered isolate would get a second, esbuild-CJS-shaped instantiation
alongside its normal main-thread ESM one, if Node's coverage collector merges per-worker-thread coverage
into the same lcov by file path. Confirmed `src/server`'s 162 `__tests__` files (round 5's exact count)
include `worker-sandbox.test.ts`, `liquid-sandbox.test.ts`, and `handlebars-sandbox.test.ts` — all three
spawn real workers.

**Open tension worth flagging rather than glossing over:** grepped `features/theme/index.ts` and
`render.ts` for any reference to `media/provider-credential-store` (this bisect's own chosen target) —
**zero matches.** If the worker-thread mechanism is real, it should explain corruption in files
transitively reachable from the worker's own import graph; `provider-credential-store.ts` doesn't appear
to be one of them by direct grep. Two readings, not resolved here: either (a) there's an indirect path
this grep missed, or (b) whatever Round 5 triggers is a more *global* disruption to the coverage
collection mechanism itself (e.g. how worker-thread coverage gets merged process-wide) rather than a
per-file "this file has two identities" property — which would fit the data better, since Round 4 (101
files, no worker threads spawned) stayed clean while Round 5 (spawns 3 real workers) broke broadly rather
than narrowly.

### Conclusion: STILL OPEN, search space narrowed

**Refuted, with direct evidence:** import count as the variable; symlinked-package-touching as
sufficient; `dist/`-vs-`src/` duplication (not reachable at all in a test run); a relative path into
`../Jini/` bypassing the symlink (doesn't exist in the reachable graph).

**Not yet settled:** which of (i) the `commit-site.ts`/`adapter.ts` live require(), or (ii) the
worker-thread require bootstrap — or something upstream of both — actually produces Round 5's positive
repro. Handing both back to this bisect's own queue rather than testing them myself (no coverage runs
per the resource hold); (i) looks cheapest to test next given it doesn't need a worker thread at all,
just a scoped run of `src/media/**` + `commit-site.unit.test.ts` alone.

— from the `src/http` immunity finding's original author. Read/tool-call counts in the sibling reports;
stopped all coverage runs mid-task per the team lead's memory-pressure redirect, this section is
grep/read-only from that point forward.
