# lcov dual-instantiation: the two routes, measured and attributed (2026-09-05)

**Status:** root cause ISOLATED and attributed. Supersedes the "still open / search space narrowed"
conclusion of `2026-08-21-coverage-dual-instantiation-root-cause.md` for everything except that
report's own confirmed CLI-child finding (which remains true, and is now fixed at its call sites by
`childProcessCoverageEnv`).

Everything below marked MEASURED was produced by a command run on this machine and its output read
directly. Everything marked INFERRED is reasoning on top of that.

## Summary

Against the on-disk `development/coverage/lcov.info` (generated 2026-09-03 19:43),
`npx tsx development/scripts/check-coverage-integrity.ts` reports:

```
71 of 1652 first-party block(s) contaminated: 28 SEVERE, 43 NEW, 0 known via baseline.  (exit 1)
```

**62 of those 71 blocks (26 of the 28 SEVERE) are reproduced by ONE test file in about ten seconds.**
A further 6 are reproduced by a second single test file. Two are a different phenomenon entirely.

| Route | Carrier | Blocks of the 71 it explains |
|---|---|---:|
| **W** — worker-thread CJS bootstrap | `worker-sandbox.ts:141` | 62 (+ `handlebars-worker.ts`, engine twin) |
| **A** — in-process lazy `require()` | `commit-site.ts:296`, `static-publish/adapter.ts:377`, `deps.ts:1508/1527`, `app.ts:840` | 45, of which 6 are not in W |
| **detector precision** — single CJS image, no merge | `packages/sdk/src/index.ts` + its own test file | 2 |

W ∪ A = 68 of 71. The remaining 3 are `handlebars-worker.ts` (Route W, Handlebars engine — my repro
only ran the Liquid one) and the two `packages/sdk` blocks (see "Detector precision" below).

## Route W — the worker-thread CJS bootstrap (dominant, 87% of all contamination)

`apps/website/src/server/inbound/public-http/http/site/worker-sandbox.ts:137-143`:

```ts
const workerFile = path.join(import.meta.dirname, `${workerBasename}.ts`);
const tsxApiPath = require.resolve("tsx/cjs/api");
const bootstrap = `require(${JSON.stringify(tsxApiPath)}).register();\nrequire(${JSON.stringify(workerFile)});\n`;
return new Worker(bootstrap, { eval: true, workerData, resourceLimits });
```

Under `tsx` (i.e. every test run), each sandboxed render spawns a `worker_threads` Worker whose entry
is an **eval'd CommonJS** string that registers tsx's **CJS** hook and then `require()`s
`liquid-worker.ts` / `handlebars-worker.ts`. Everything those two files transitively import —
`./render.js` and `#src/features/theme/index`, and through them the widgets, forms, post, media,
db-schema and contracts subgraphs — is therefore transpiled by esbuild in **CJS format inside that
worker**, complete with the `__toCommonJS` / `__copyProps` / `__export` / `__toESM` interop helpers.

MEASURED (this machine, today): a worker thread emits its **own** `coverage-*.json` into
`NODE_V8_COVERAGE`, keyed by pid + thread index:

```
$ NODE_V8_COVERAGE=covprobe node -e "new (require('node:worker_threads').Worker)('const x=(a)=>a+1; x(1);',{eval:true})"
coverage-34303-1788628550105-1.json   <- worker thread
coverage-34303-1788628550122-0.json   <- main thread
```

Node's `--experimental-test-coverage` collector reads every file in that directory, so the worker's
CJS image lands in the same lcov under the same `SF:` path as the main thread's ESM image.

### The repro (MEASURED)

```
env -u TOVU_ADMIN_PASSWORD TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json \
  node --import tsx --test --experimental-test-module-mocks --test-concurrency=1 \
  --experimental-test-coverage \
  --test-reporter=lcov --test-reporter-destination=<scratch>/repro-before-wide.lcov \
  --test-reporter=dot --test-reporter-destination=stdout \
  apps/website/src/server/inbound/public-http/http/site/__tests__/liquid-sandbox.test.ts
```

6 tests, all passing, ~10s. Then:

```
$ npx tsx development/scripts/check-coverage-integrity.ts <scratch>/repro-before-wide.lcov
check:coverage-integrity — 62 of 63 first-party block(s) contaminated: 46 SEVERE, 16 NEW, 0 known via baseline.
```

**Every one of those 62 paths is also in the real lcov's 71.** Set-compared with `comm`; zero paths in
the repro that are not in the real run.

Scoped narrower (`--test-coverage-include` limited to `http/site/**` and `features/theme/**`) the same
single test file gives `28 of 29 first-party block(s) contaminated: 18 SEVERE`.

## Route A — in-process lazy `require()` of first-party TS (the report's "Route A", relocated)

The path named in `check-coverage-integrity.ts`'s header as `src/server/deps.ts:1048` is now
`apps/website/src/server/runtime/composition/deps.ts:1508` / `:1527`. It is **not the only instance**,
and it is not the one that fires most often. The full first-party `require()` set:

| file:line | requires |
|---|---|
| `apps/website/src/features/source-control/commit-site.ts:296` | `#src/platform/export/index` |
| `apps/website/src/features/deployments/static-publish/adapter.ts:377` | `#src/platform/export/index` |
| `apps/website/src/server/runtime/composition/deps.ts:1445` | `../../../platform/export/index.js` |
| `apps/website/src/server/runtime/composition/deps.ts:1508` | `../../../platform/export/index.js` |
| `apps/website/src/server/runtime/composition/deps.ts:1527` | `./app.js` |
| `apps/website/src/server/runtime/composition/app.ts:800` | `../../../platform/export/index.js` |
| `apps/website/src/server/runtime/composition/app.ts:840` | `../../../platform/export/index.js` |
| `apps/website/src/platform/observability/index.ts:36` | `./otel.js` |

The 2026-08-21 report correctly found `deps.ts`'s `createSiteAppLazily` to be reachable only from a
spawned CLI child. It did **not** test `commit-site.ts:296`, which its own author flagged as
"the most promising of the two remaining untraced files" and left unrun. That flag was right.

### The repro (MEASURED)

```
... same flags ... apps/website/src/features/source-control/__tests__/commit-site.unit.test.ts
$ npx tsx development/scripts/check-coverage-integrity.ts <scratch>/routeA.lcov
check:coverage-integrity — 45 of 772 first-party block(s) contaminated: 28 SEVERE, 17 NEW, 0 known via baseline.
```

`firstExportFailureLazily()` runs on **every** `commitSiteToSourceControl` call, not only on failure,
so every test that commits a site pulls `platform/export/index.ts`'s whole graph
(`route-manifest.ts`, `site-exporter.ts`, and through them `platform/routing/routing.ts`,
`contracts/core/path-containment.ts`, `contracts/core/events/{memory-bus,outbox-worker}.ts`) through
tsx's CJS hook **in the same process** that already has ESM images of those files.

The 6 blocks Route A explains that Route W does not:
`contracts/core/events/memory-bus.ts`, `contracts/core/events/outbox-worker.ts`,
`contracts/core/path-containment.ts`, `platform/export/route-manifest.ts`,
`platform/export/site-exporter.ts`, `platform/routing/routing.ts`.

## Detector precision finding — REPORTED, NOT PATCHED

`packages/sdk/src/index.ts` is flagged SEVERE, and I believe that verdict is **not** a dual
instantiation. MEASURED — running only `packages/sdk/src/__tests__/unit/sdk-public-api.unit.test.ts`:

```
check:coverage-integrity — 1 of 1 first-party block(s) contaminated: 1 SEVERE, 0 NEW.
FNDA:5,__export   FNDA:5,__copyProps   FNDA:1,__toCommonJS
FNF:12  FNH:12  LH:134  LF:135
```

`FNH == FNF` and `LH == LF - 1` — a single, fully-hit, internally coherent image, not a merge of two.
The cause is the test's own `import * as sdk from "../../index"` — an **extensionless relative
specifier**, which Node's ESM resolver cannot resolve, so tsx falls back to its CJS hook for that
file. There is exactly one image, and it happens to be the CJS one.

This is the same *shape* of false positive the header already carves out for pure re-export barrels:
wrapper-helper presence is real, but nothing was merged. It differs from the barrel case in that the
file does have real functions of its own, so the "function coverage is untrustworthy" half of the
verdict is arguably still fair (the function table is inflated by three esbuild helpers) — but the
SEVERE escalation's claim ("the wrapper image also won the line-hit merge") is false here: no merge
happened.

**I did not touch the detector.** Per the dispatch's rule 1 and the script's own header, a suspected
detector bug is a finding to report, not to patch. If the owner wants it addressed, the honest fix is
at the call site, not in the gate: changing that test's import to `"../../index.js"` would make the
file load as ESM and the flag would disappear on its own. That is a one-character-class change to a
test file and I have left it for the owner because it changes a test, and because the same
extensionless-import pattern may exist elsewhere and deserves a sweep rather than a spot fix.

## What the dispatch brief got wrong (or was stale on)

- The brief and the script header both name **`src/server/deps.ts:1048`** as Route A. That file is now
  `apps/website/src/server/runtime/composition/deps.ts` and the lines are 1508/1527. More importantly,
  `deps.ts` is **not** the dominant carrier — `commit-site.ts:296` is, and the worker-thread bootstrap
  outweighs both.
- The brief said `childProcessCoverageEnv` "is very likely central". It is a correct and already-wired
  mitigation for the *child-process* route, and its wiring guard
  (`child-process-coverage-env-wiring.test.ts`) is real. It is **not** central to the current 71:
  neither Route W (a worker thread inside the runner's own process) nor Route A (an in-process
  `require`) crosses a process boundary at all, so no env redirect can reach either.
- One gap in that guard worth naming: its `NODE_CHILD_SPAWNING_FILES` list is hand-maintained, and
  `apps/website/src/server/runtime/boot/__tests__/process-error-guards.unit.test.ts:27` spawns
  `execFileAsync(process.execPath, ["--import", "tsx", FIXTURE_PATH, mode])` with **no `env` override**
  and is **not** on the list. It is a live, unguarded instance of the child-process route.

## The fix

See the commit that follows this report.
