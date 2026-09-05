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

---

# Part 2 — what was fixed, what it measured, and what is left (same day)

## Fix 1 (Route W) — `worker-sandbox.ts`, commit `4d48f645`

Under `tsx`, the sandbox worker is now given an `env` that is `process.env` **minus**
`NODE_V8_COVERAGE`, and only when that variable is set at all (so a non-coverage run passes no `env`
option and is byte-identical to before). With no aggregation directory in its env the worker writes
no V8 profile, so there is no CJS-shaped second image for the runner to merge.

MEASURED — same command, before and after, `liquid-sandbox.test.ts` alone, no `--test-coverage-include`:

| | contaminated | SEVERE | exit |
|---|---:|---:|---:|
| before | 62 of 63 first-party blocks | 46 | 1 |
| after | 0 of 2 | 0 | 0 |

MEASURED — the whole 9-file `apps/website/src/server/inbound/public-http/http/site/__tests__/*.test.ts`
cluster (`handlebars-sandbox`, `liquid-sandbox`, `page-head`, `render-handlebars`, `render-products.unit`,
`render`, `sandbox-timeout-resolution`, `tiptap-render-contract`, `worker-sandbox`), all passing:
**63 first-party blocks evaluated, 0 contamination, exit 0.** `render.ts` in that lcov now reads a
single coherent ESM image, `FNF:166 FNH:153 LH:2633 LF:2718`.

**The cost, stated plainly:** `liquid-worker.ts` and `handlebars-worker.ts` execute in no other
thread, so they no longer appear in coverage output at all (verified: zero `SF:` lines for either in
the post-fix cluster lcov). Their only previous coverage was the CJS image this removes. Every other
file the worker touched still gets its real ESM coverage from the main thread — the 63 blocks above
are the proof.

Alternative considered and rejected (offered here in case the owner prefers it): give the worker an
ESM bootstrap instead — a `data:text/javascript,...` entry that `register()`s `tsx/esm/api` and
`await import()`s the `.ts` worker file. Verified working on this machine, and it would keep the two
worker files' coverage while making both images ESM-shaped and therefore mergeable. Rejected because
it silently weakens the sandbox: `handlebars-worker.ts:72-75` deletes Handlebars' own
`require.extensions[".hbs"]`/`[".handlebars"]` hooks ("Hardening 4", the only `fs` touch in the
Handlebars runtime) behind a `typeof require !== "undefined"` guard that an ESM entry would make
false. Worth flagging on its own: under the compiled `dist/` build that guard is ALREADY false, so
Hardening 4 is currently a dev-only protection that does nothing in production. That is a separate
finding, not fixed here.

## Fix 2 (Route A, the dominant call site) — `commit-site.ts`, commit `b3748e94`

`firstExportFailureLazily`'s `require("#src/platform/export/index")` is now a plain static import of
`firstExportFailure` from the same barrel. Evidence it is safe, both from dependency-cruiser over the
real graph, type-only edges excluded:

- the export barrel's runtime closure is 67 modules and contains **nothing** under
  `apps/website/src/server/**`, `apps/website/src/assistant/**`, `features/source-control/**` or
  `features/deployments/**` — the documented cycle cannot close;
- with the `require` edge itself removed from the graph, `commit-site.ts`'s own runtime closure is 83
  modules and **already contains all 65** of the barrel's first-party modules. The static import adds
  zero modules to what loads.

Regression pin: `apps/website/src/features/source-control/__tests__/commit-site-export-resolution.unit.test.ts`.
RED was captured without touching the shared tree, by running the same comment-stripped regex over
`git show HEAD:.../commit-site.ts`: pre-fix source matches, post-fix source does not.

## What is STILL OPEN, with numbers

1. **`features/deployments/static-publish/adapter.ts:377`** — the identical `require("#src/platform/
   export/index")`, fired unconditionally by every `publishStaticSite` call, and exercised by
   `adapter.unit.test.ts`, `publish-run.unit.test.ts`, `publish-agent-tools.unit.test.ts`,
   `publish-site-route.test.ts`. **Owner decision, deliberately not taken here:** with the require
   edge excluded, `adapter.ts`'s own runtime closure is only **7 modules**, so making its import
   static would pull in **65** (better-sqlite3, drizzle, handlebars, liquidjs and the whole
   theme/post/db graph) at boot, on a module reached from `assistant/tool-registrations.ts`. Three
   shapes, in the order I would recommend them:
   - *(a)* extract `firstExportFailure` (a 10-line pure function over `ExportReport`) into a leaf
     module, e.g. `platform/export/export-failure-summary.ts`, re-exported by both `site-exporter.ts`
     and the barrel so the public surface and `__tests__/index.test.ts`'s identity assertion are
     unchanged; `adapter.ts` then imports the leaf statically. Cost: a deep import into a guarded
     module, so it needs an entry in `.dependency-cruiser.mjs`'s `no-deep-imports:export` exemptions.
   - *(b)* accept the eager 65-module import, as `commit-site.ts` now does. Cheapest diff, real boot
     cost, and it re-tests a cycle whose absence I measured but which `adapter.ts`'s own header says
     it once observed crashing.
   - *(c)* leave it and baseline the resulting blocks. Keeps a known, measured corruption open.
2. **`deps.ts:1445/1508/1527` and `app.ts:800/840`** — the composition root's `exportSiteLazily` /
   `createSiteAppLazily`. These are the genuinely load-bearing cycle-breaks (`deps.ts` <-> `app.ts`),
   and the 2026-08-21 report established they execute only inside a spawned CLI child. Leave them.
3. **`platform/observability/index.ts:36`** — `require("./otel.js")`. Not in the 71; `otel.ts` appears
   not to be loaded as ESM anywhere in the same run. Latent, not active.
4. **`packages/sdk/src/index.ts`** — the detector-precision finding in Part 1. The honest fix is the
   extensionless `import * as sdk from "../../index"` in that package's own unit test, plus a sweep
   for the same pattern elsewhere. Not touched.
5. **The child-process wiring guard's hand-maintained list.**
   `apps/website/src/server/runtime/boot/__tests__/process-error-guards.unit.test.ts:27` spawns a Node
   child with no `env` override and is not on `child-process-coverage-env-wiring.test.ts`'s list.
   MEASURED today: that test contributes **0** contaminated blocks — its child loads only the fixture
   through tsx's ESM path and never `require()`s first-party code, so there is no CJS image to merge.
   It is a latent gap in the guard, not a current defect. The guard would be stronger as a discovered
   list (grep for `spawn`/`spawnSync`/`execFile*` of `process.execPath` under `apps/website/src`) than
   as a hand-maintained one.

## Expected effect on a full `test:cov`

INFERRED, not measured (a full run is forbidden on this machine): of the 71 contaminated blocks in the
2026-09-03 lcov, Fix 1 removes the 62 reproduced by the worker route plus `handlebars-worker.ts`, and
Fix 2 removes `commit-site.ts`'s contribution. The residual should be whatever
`static-publish/adapter.ts`'s still-open `require()` reproduces on its own (its blast radius overlaps
Route A's measured 45 heavily) plus the two `packages/sdk` blocks. A full run is the only way to get
the real number.

## Environment blocker hit mid-verification — NOT caused by anything here

At **10:35 today** a `pnpm install` in the `/Users/la/Programming/Jini` workspace replaced
`better-sqlite3@11.10.0` with `@13.0.3` in its store, but
`Jini/packages/infra/node_modules/better-sqlite3` still symlinks to the removed `11.10.0` path. Every
Tovu test whose import graph reaches `@jini-ai/infra`'s `dist/db/sqlite/open.js` now dies at import
with `ERR_MODULE_NOT_FOUND: Cannot find package 'better-sqlite3'` — `site-exporter.test.ts`,
`tool-registrations.unit.test.ts`, `adapter.unit.test.ts`, and (as of ~10:45) `commit-site.unit.test.ts`.

`commit-site.unit.test.ts` ran fully green (25 assertions, including the real-export path) **with the
Route A change already applied** at ~10:43, before the breakage widened to reach it; the same failure
also hits files this work never touched. I did not attempt to repair another workspace's
`node_modules`. Someone will need to re-run the Jini install before the source-control and
static-publish suites can be re-verified.
