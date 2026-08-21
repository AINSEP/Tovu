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

### Resolution (confirmed by the external auditor + team lead, below in this file)

The literal hypothesis ("single import path ⇒ immune, keyed by resolved URL within one process") is
**refuted** — the actual mechanism is cross-**process** V8 coverage-profile merging:
`export-command.integration.test.ts` spawns a CLI child via `spawnSync` with no `env` override, the
child inherits `NODE_V8_COVERAGE`, and the child's own `require("./app.js")` (via
`deps.ts`'s `createSiteAppLazily`) sends `app.ts`'s whole import graph — including
`provider-credential-store.ts` — through tsx's CJS hook in that child, while the parent's `src/media/**`
tests load the same file as ESM. Two profiles, one `SF:` path, unioned at merge time. Not a per-file
"two resolved identities within one process" story at all.

But the **instinct** behind the "open tension" flag above was right: I noticed `provider-credential-store.ts`
wasn't reachable from the worker-thread subgraph and guessed the mechanism was probably a *global*
coverage-collection disruption rather than a per-file property. That's the correct shape of the answer —
just a different concrete carrier (a spawned child process's inherited `NODE_V8_COVERAGE`, not a spawned
worker thread's isolate). Worth naming precisely: "two resolved URLs for one file, within one process"
was the wrong frame; "the same file loaded in two separate *coverage-emitting contexts* that get merged
into one profile" is the right one — a process boundary is just as capable of producing that as an
in-process ESM/CJS split is, and I was only checking for the latter. The immune-set explanation this
gives (`src/cli` loaded ESM-only inside the child, never independently touched by the parent's media
tests — one image, nothing to merge) is also the one that actually holds, unlike my own untested worker-
thread guess for (ii) above, which turned out not to be the carrier.

## Round 6a result: CLEAN

`src/media/**/*.test.ts` + `src/server/__tests__/routes/*.test.ts` (63 files, the largest untested bucket from round 5): 0 shim markers, `LH:357 LF:357`. Includes `publish-site-route.test.ts`, which I had flagged mid-investigation as a live candidate for exercising `app.ts`'s `exportSiteBound` (`require("../export/index.js")`) — staying clean here confirms that IN-PROCESS path really is harmless, consistent with the finding below rather than contradicting it (that route test builds its `routeDeps` via `app.ts`'s own `createRouteDeps()`, whose `exportSiteBound`/`createSiteApp` fields are NOT the lazy ones — see `app.ts:674`).

## SUPERSEDED — the "no test constructs SQLite deps and then exports" claim (kept below for the record, wrong for an instructive reason)

The claim from earlier in this report — "no test anywhere constructs a `routeDeps` from `createSqliteRouteDeps()` and then calls `exportSite`/`.createSiteApp()` on it" — **is false**, and it is wrong for a reason worth recording rather than just fixing quietly: **a repo-wide grep/trace of `.createSiteApp(` call sites, restricted to "which TEST FILES call this," cannot see a call made by production code that only runs inside a CHILD PROCESS spawned by a test.** My trace found `site-exporter.ts:738` as a real (non-test) call site, correctly identified it as live, and then incorrectly concluded its only in-process test caller (`site-exporter.test.ts`) was the only way to reach it — never checking whether other production code called `exportSite` with a *different* `routeDeps` from a process my grep never executed inside.

**Root cause, found by an external auditor (`gpt-5.6-sol`) and independently verified hop-by-hop by both the coordinator and me, reading the code directly rather than trusting the report:**

```
src/cli/__tests__/integration/export-command.integration.test.ts
  runCli() -> spawnSync(process.execPath, ["--import", TSX_LOADER, CLI_MAIN, ...args], { encoding, timeout })
                                                    ^ no `env` override -> child INHERITS NODE_V8_COVERAGE
  -> src/cli/commands/export.ts:104   createSqliteRouteDeps(dbPath, {...})       [SQLite-backed, real factory]
  -> src/cli/commands/export.ts:112   await exportSite({ routeDeps, ... })
  -> src/export/site-exporter.ts:738  createServer(routeDeps.createSiteApp())
  -> src/server/deps.ts:926           createSiteApp: () => createSiteAppLazily(routeDeps)
  -> src/server/deps.ts:1048-1050     (require("./app.js") as ...).createApp(routeDeps)
```

I verified every hop myself directly against the source (not just the auditor's claim): `export-command.integration.test.ts:36`'s `runCli()` calls `spawnSync` with `{ encoding: "utf8", timeout: timeoutMs }` — no `env` key at all, so the child inherits the full parent environment. `src/cli/commands/export.ts:3` imports `createSqliteRouteDeps` from `../../server/deps.js` (NOT `app.ts`'s in-memory `createRouteDeps`) and calls `exportSite({ routeDeps, ... })` at line 112. The remaining three hops were already independently confirmed earlier in this same report (`site-exporter.ts:738`, `deps.ts:926`, `deps.ts:1048-1050` — the exact `createSiteAppLazily`/`require("./app.js")` code I read and quoted above while tracing the "5 untraced require() files").

**Mechanism** (not a per-file "two identities" story — cross-PROCESS coverage-profile merging): the child process inherits `NODE_V8_COVERAGE` and writes its own V8 coverage profile into the same directory the parent's `--experimental-test-coverage` collector reads from. Inside the child, `CLI_MAIN` loads as ESM via `--import tsx`, but the child's own `require("./app.js")` sends `app.ts` and its entire import graph (including the media adapter, including `provider-credential-store.ts`) through tsx's CJS transpilation hook — never exercised in the child (the export command doesn't call routes that read media credentials). The PARENT's own `src/media/**` tests separately load the same file as ESM, real and exercised. The final merge unions both images under one `SF:` path: `FN:` entries concatenate, `DA:` line hits get partly clobbered by the never-exercised CJS image's zero-hit shadow entries, and esbuild's `__toCommonJS`/`__copyProps` helpers — present only in the CJS image — leak into the merged block.

This also explains the immune set structurally rather than by coincidence: `src/cli/**` source is loaded ESM-only inside the child and is not independently loaded by the parent's media tests at all — one image, nothing to merge, clean. `apps/site-chat` and `src/http` fit the same "single resolved image" shape for other reasons (`src/http/client.ts`'s only importer repo-wide is its own test file, per the sibling agent's finding above).

**The generalizable lesson**: an in-process call-site trace — even a correct, exhaustive one — cannot see a call made inside a spawned child process. "No test calls X" needs to be "no test calls X, AND no test spawns a child process whose own code calls X" before it can be trusted as an elimination.

## Sol's discriminator — RUN, CONFIRMS the CLI-child path as an independently sufficient trigger

`src/media/**/*.test.ts` + **only** `src/cli/__tests__/integration/export-command.integration.test.ts` (2 test files, `TEST_CONCURRENCY=2`, `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json` set to match the real `test:cov` script exactly):

```
6 shim markers, LH:294 LF:357, FNF:43 FNH:29
```

**Exact match to the full-repo/round-5 numbers, from just 2 test files.** This empirically confirms Sol's traced mechanism (child process spawned by `export-command.integration.test.ts` inherits `NODE_V8_COVERAGE`, its own `require("./app.js")` pushes `provider-credential-store.ts` through tsx's CJS hook, merges with the parent's ESM image of the same file) is a real, independently sufficient trigger — not just a correct-looking code trace.

**This does NOT explain round 5** (media + full `src/server/**`, which does not include `src/cli/**` at all) — that reproduction needs its own trigger within `src/server`. Two separate confirmed-or-suspected triggers now, consistent with hypothesis (a) "multiple triggers" from the team lead's tension flag, though (b) "broader in-process-or-child mechanism" is still the better frame for unifying them once the `src/server` trigger is found — see below.

## Bisecting the remaining ~67 `src/server` files (round 5 minus round 3 minus round 6a)

Static pass before spending wall-clock on this (no coverage runs, just grep/read): the 67-file bucket splits into `__tests__/integration` (5), `__tests__/unit` (6), and 56 truly-colocated files under `src/server/{routes,http,middleware,agent-daemon,boot}/**/__tests__/`.

- All 5 `__tests__/integration` files call `createSqliteRouteDeps*`, but none literally call `.createSiteApp(` in their own source — the known lazy-require field isn't obviously invoked there by a static read, though a static read is exactly the kind of check that already proved insufficient once this session (see the SUPERSEDED section above) — not ruled out, just not a confirmed static hit.
- `worker-sandbox.test.ts`/`liquid-sandbox.test.ts`/`handlebars-sandbox.test.ts` (the worker-thread require bootstrap flagged as a lead in the previous section): re-confirmed zero grep matches for `provider-credential-store` anywhere in their transitive import graph. Still not a candidate for THIS target file specifically, though it could taint some other file — out of scope for this bisect, which is anchored to `provider-credential-store.ts` throughout.
- `daemon-boots.integration.test.ts` (in the 56-colocated bucket) spawns a real child via `spawn(process.execPath, [...], { env: { ...process.env, ... } })` — full env inherited, structurally identical shape to Sol's confirmed mechanism. But its boot path (`agent-daemon-server.ts`, with the test's own `TOVU_DB: "memory"`) takes the `createRouteDeps()` branch, which constructs `InMemoryMediaProviderCredentialRepo` (the `.memory.ts` variant) rather than importing `provider-credential-store.ts` itself. Looks clean for this target by static trace; not run empirically yet.

## Round 7: media + `__tests__/integration`+`__tests__/unit` (11 files) — CLEAN

0 shim markers, `LH:357 LF:357`, `FNF:20 FNH:20`. The lazy-require trigger is not in this 11-file block (rules out the `createSqliteRouteDeps*`-calling integration files as sufficient on their own, at least under this file combination).

## Round 8: media + the 56-file colocated bucket — PARTIAL reproduction (new signature)

`FNF:43 FNH:29` (exact match to the canonical FN corruption) but `LH:357 LF:357` — **lines are fully clean**, unlike the canonical `LH:294`. 6 shim markers present. This is a **different, weaker corruption shape** than round 5/Sol's discriminator: the function-table concatenates (same 43/29 as everywhere else this reproduces), but the DA line-merge that normally deflates `LH` did not happen here.

## Round 9: media + agent-daemon (3) + boot (2) = 5 files — CLEAN

Targeted the daemon-boots child-process lead (`daemon-boots.integration.test.ts` spawns a real child with full inherited env, structurally identical to Sol's mechanism) plus the rest of the spawn/worker-flavored cluster. 0 shim markers, `LH:357 LF:357`, `FNF:20 FNH:20`. Confirms the static read: this test's boot path takes the in-memory route-deps branch and never touches `provider-credential-store.ts`.

## Round 10: media + `src/server/http/**/__tests__/*.test.ts` (12 files, the untested remainder after rounds 7/9 within the 56) — FULL reproduction

`6 shim markers, LH:294 LF:357, FNF:43 FNH:29` — **exact match to the canonical full-repo numbers**, from 12 files. This is the narrowest set found yet.

**Static trace of all 12 files came up empty**: only `worker-sandbox.test.ts` contains a literal `require(` and it's inside a comment, not code. Grepped all 12 files and their direct 1-hop imports (`render.js`, `#src/features/post/index`, `#src/features/theme/index`, `#src/widgets/*`, `worker-sandbox.js`/`liquid-sandbox.js`/`handlebars-sandbox.js`) for `provider-credential-store` and `media/index` — zero matches anywhere. `render.ts`'s own import list (read directly) does not reach media at all. No static call-site story explains why this file's coverage gets touched by this cluster.

## Rounds 11/12: splitting the 12 into worker-spawning (3) vs non-worker (9) — BOTH give the partial (FN-only) signature independently

- Round 11, media + `worker-sandbox.test.ts`+`liquid-sandbox.test.ts`+`handlebars-sandbox.test.ts` (3 files, the ones that spawn real worker threads with a `require()` bootstrap): 6 markers, `FNF:43 FNH:29`, **`LH:357`** (clean lines).
- Round 12, media + the other 9 non-worker files in the same directory (`range.test.ts`, `headless-contracts.test.ts`, `render-products.unit.test.ts`, `page-head.test.ts`, `sandbox-timeout-resolution.test.ts`, `tiptap-render-contract.test.ts`, `render-handlebars.test.ts`, `render.test.ts`, `plugins-dto.unit.test.ts` — none of which spawn a worker or child process): 6 markers, `FNF:43 FNH:29`, **`LH:357`** (clean lines).

Both halves independently reproduce the exact same partial (FN-only) signature as round 8's full 56-file superset. Neither half alone reproduces the full (LH-deflated) signature that the complete 12-file union gave in round 10.

## Round 10b: exact repeat of round 10 (same 12 files, same command, same env) — PARTIAL this time

Re-ran the identical `media + 12-file http cluster` command with nothing changed. Result: 6 markers, `FNF:43 FNH:29`, **`LH:357`** — the partial signature, not round 10's full one.

**This is the key finding of this bisection round: the FULL vs. partial split is not a deterministic function of file membership.** The same 12 files, same flags, same env, back-to-back, gave the full canonical corruption once and the partial one once. `NODE_V8_COVERAGE` was confirmed unset in the invoking shell for every run in this session (checked directly — each `node --experimental-test-coverage` invocation manages its own temp profile directory internally when the var isn't pre-set), so this isn't leftover-directory pollution across my own sequential runs; it looks like genuine run-to-run non-determinism in whatever merge step produces the `LH`/`DA` deflation, most plausibly tied to `TEST_CONCURRENCY=2` scheduling/interleaving rather than to which files are in the set.

## Working picture after rounds 7-10b (superseding the single-cause framing)

Two layers, not one:

1. **A robust, reproducible layer**: something broadly present across `src/server/http/**`'s test cluster (both the worker-spawning files AND plain non-worker files, independently) causes `provider-credential-store.ts`'s `FN:`/`FNDA:` table to concatenate with a phantom 43/29-shaped CJS shadow, with zero static call-site evidence of why — no `require()`, no direct or 1-hop import of `media/`. This reproduced in every single run that included any part of the 12-file cluster (rounds 8, 10, 10b, 11, 12 — 5 for 5).
2. **A rarer, order-sensitive escalation** on top of layer 1: the `DA:`/`LH:` line-count deflation (the part that actually drops measured coverage, `294` vs `357`) only showed up in round 10's first run, round 5 (full 162-file server set), and Sol's 2-file CLI-child discriminator — and the CLI-child case is the only one with a clean, verified, deterministic causal chain (cross-process `NODE_V8_COVERAGE` inheritance). The http-cluster case reproduced layer 2 once out of two identical attempts.

## Team-lead's two follow-up leads, both checked and both come back negative for THIS target file

**Lead 1 — grep the full 67 for child-process spawns without a `NODE_V8_COVERAGE` redirect, and for indirect reach-points into the export/`firstExportFailureLazily` path (not just the literal `.createSiteApp(` string).**

- Only two files in the entire 67 spawn a real child process: `process-error-guards.unit.test.ts` (`execFile`, no `env` key at all — full inherit) and `daemon-boots.integration.test.ts` (`spawn` with `env: { ...process.env, ... }` — also full inherit, just adds three keys on top). `daemon-supervisor.test.ts`'s "spawn" hits are a fake test double and a comment, not a real process. Both real-spawn files were already covered together in round 9 (media + agent-daemon(3)+boot(2)) — **clean for `provider-credential-store.ts`**.
- `firstExportFailureLazily`/`exportSite`/`createServer(` grepped across all 67: the only `createServer(` hits are Node's plain `http.createServer(app)` used to stand up an in-process test listener (a name collision with Sol's `createServer(routeDeps.createSiteApp())`, not the same call) — `theme-preview-static.test.ts`, `theme-static-assets.test.ts`, `daemon-boots.integration.test.ts` (its own readiness probe, separate from the daemon child), `pages.route.test.ts`, `static-menu-embed-resolution.test.ts`, `products.route.test.ts`. None construct `routeDeps` via `createSqliteRouteDeps` first — they use `createApp(deps)` with in-process, non-lazy deps. Zero `firstExportFailureLazily` matches anywhere in the 67.
- Traced the 12-file `http` cluster's DTO-mapper imports one more hop (`../../plugins.js`, `../admin/posts.js`, `../admin/presentation.js`, reached from `headless-contracts.test.ts` and `plugins-dto.unit.test.ts`) — all three are pure response-shaping files (`toAdminPluginResponse`/`toAdminPostResponse`/`toAdminPresentationResponse`), importing only types from `#src/features/post`, `#src/headless`, `#src/features/presentation`. No path to `commit-site.ts`, `export/index`, or `media/`.

Both of the team lead's hypothesized explanations for layer 1's mystery (an unredirected child spawn, or an indirect `firstExportFailureLazily`-style reach-point) are now ruled out for the 12-file `http` cluster specifically. Layer 1's cause is still unexplained by any static trace attempted so far — two independent people (this session's predecessor, on the worker-thread angle, and this round, on the spawn/reach-point angle) have each read the code and come up empty. That itself is worth weighting: it is becoming less likely this is a single discoverable call site and more likely a property of the coverage-collection/merge process itself, consistent with layer 2's already-confirmed non-determinism.

**Lead 2 — record `daemon-boots.integration.test.ts` explicitly as a suspected second instance of Sol's mechanism, for files OTHER than `provider-credential-store.ts`.**

Recorded here per the team lead's request: `daemon-boots.integration.test.ts` spawns a real child (`spawn(process.execPath, ["--import", TSX_LOADER, DAEMON_ENTRY], { env: { ...process.env, ... } })`) with the full parent environment inherited — structurally identical to the confirmed Sol mechanism (child inherits `NODE_V8_COVERAGE`, writes its own profile). It reads clean against `provider-credential-store.ts` only because the daemon boot path it exercises (`agent-daemon-server.ts`, with the test's own `TOVU_DB: "memory"`) takes the `createRouteDeps()` branch, which constructs the in-memory media credential repo rather than the real SQLite-backed one. **This is UNCONFIRMED but structurally live**: `agent-daemon-server.ts`'s full import graph (express, `@jini-ai/daemon`, `@jini-ai/agent-runtime`, `@jini-ai/http-kit`, tool-audit repos, rate-limit, runtime-mode, tool-surface-exchanges, and more) all get pushed through this same child's coverage-emitting context. Any of those files that are ALSO exercised as ESM elsewhere in a full-repo run are candidates for the same dual-image merge that hit `provider-credential-store.ts` via the CLI-child path — this test was never audited for that because this whole investigation is anchored to one target file. Flagging for the next person rather than chasing it myself, per the team lead's note that discarding it as "clean" (true only for the one anchor file) would lose the finding.

This reframes round 5's full-repo-scale reproduction: it likely didn't need a single dedicated trigger file at all. At 162 files' worth of concurrent test execution, layer 1 is close to guaranteed to fire (localizes to just `src/server/http/**`, 12 of 162 files), and layer 2's apparent race window gets enough chances to also fire somewhere in that much larger run. Round 3 and 6a's cleanliness is consistent with this: neither included any of the `src/server/http/**` cluster.

## Next, if this bisection continues

Two different investigations now, not one:
- Confirm layer 1 is real and not itself a measurement artifact of MY bisection (e.g., rerun the 9-file non-worker set once more to see if it's reliably partial, then try to find which single one of those 9 is doing it via further halving — it does not require a worker thread, so the earlier worker-thread hypothesis is not the whole story).
- Characterize layer 2's trigger condition empirically rather than by code trace, since code tracing has now failed twice in this investigation (once for the child-process case pre-Sol, and again here) — e.g., repeat round 10 several more times to estimate how often it fires, and check whether `TEST_CONCURRENCY=1` (serialized) ever produces it at all, which would strongly implicate scheduling/interleaving over file content.
