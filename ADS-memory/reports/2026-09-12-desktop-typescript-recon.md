# apps/desktop: should it move from JavaScript to TypeScript? — recon

**Date:** 2026-09-12 · **Branch:** `restructure/apps-website-phased` · **Agent:** Software Architect (Opus 5), recon only
**Nothing was written to `apps/desktop`. No packaging build, no test suite, no `electron-builder` run.**

---

## Recommendation, in one line

**Do not convert yet — turn on `checkJs` over the existing `.js` first (58 errors, 48 of them one mechanical JSDoc nit), because it catches the only bug in this app's history that types would have caught, costs one day, and changes nothing about packaging; then decide about conversion from a green baseline.**

Conversion itself is *cheaper and safer than the dispatch assumed* — Electron 43.6.0 runs a `.ts` main entry
natively with no build step (proven below), so the packaging objection largely evaporates. But it is a ~500-site
annotation job whose payoff is unproven against this app's actual defect history, and it forces a rewrite of the
coverage gate's area definitions. `checkJs` buys most of the value for ~4% of the cost.

---

## 1. Verified file counts

Source: `git ls-files apps/desktop`, then extension-split. The dispatch's numbers are confirmed with one correction.

| Group | Count | Non-test LOC |
|---|---|---|
| JS family (`.js` / `.mjs` / `.cjs`) | **95** | — |
| ├─ tests (`*.test.js`) | **52** | 8,998 |
| └─ non-test | **43** | **9,412** |
| TS family (`.ts` / `.tsx` / `.mts`) | **37** | 5,848 |
| └─ of which tests (`*.test.ts`) | 9 | 1,674 |

> **Correction to the dispatch table:** TS family is **37**, not 35 — the count omitted `src/preload/preload.mts`
> and `vite.config.mts`. Every other figure in that table is confirmed exactly: 85 `src/*.js`, 6 `scripts/*.mjs`,
> 2 `bin/*.mjs`, 1 `src/*.cjs`, 1 root `main.js`; 52 of the 95 are tests; non-test source is 43 files.

The 43 non-test JS files, by role:

| Scope | Files | LOC | Largest |
|---|---|---|---|
| `main.js` (Electron entry) | 1 | 1,386 | — |
| `src/*.js` + `src/speech/*` | 34 | 7,382 | `tovu-server.js` 640, `project-ipc.js` 623 |
| `scripts/*.mjs` | 6 | 1,087 | `stage-payload.mjs` 340 |
| `bin/*.mjs` | 2 | 399 | `mcp-bridge.mjs` 223 |
| `src/speech/preload-speech.cjs` | (1, in the 34) | 51 | — |

## 2. What is genuinely unchecked today

Only two tsconfigs exist, and between them they cover **37 of 132** source files:

- `tsconfig.preload.json:32` — `"include": ["src/preload/**/*.mts", "src/contracts/**/*.ts"]`
- `tsconfig.renderer.json:16` — `"include": ["src/renderer/**/*.ts", "src/renderer/**/*.tsx", "src/contracts/**/*.ts", "vite.config.mts"]`

Neither sets `allowJs`. **All 43 non-test `.js`/`.mjs`/`.cjs` files — 9,412 lines, including the entire main
process and the whole gate harness — receive no type checking of any kind.** `tsconfig.preload.json`'s own header
comment states this outright and is accurate: *"This shell's main process is hand-written JavaScript … and is not
typechecked."*

### Measured: what `checkJs` would say right now

I ran `tsc --noEmit --allowJs --checkJs` over `main.js` + `src/**/*.js` + `scripts/**/*.mjs` + `bin/**/*.mjs`
(config in scratchpad; `--noEmit`, nothing written to the repo).

**Non-strict: 58 errors.**

| Code | Count | What it is |
|---|---|---|
| TS8032 | **48** | `Qualified name 'options.port' is not allowed without a leading '@param {object} options'` — a pure JSDoc *formatting* rule. Mechanical, zero behaviour risk. |
| TS2339 | 6 | property-does-not-exist |
| TS2345 | 3 | argument-not-assignable |
| TS1110 | 1 | malformed JSDoc type (`site-dir-store.js:154`) |

**Strict (`strict: true`): 608 errors**, of which **496 are `noImplicitAny`-family** (447 × TS7006 implicit-any
parameter, 28 × TS7031, 8 × TS7005, 6 × TS7053, 6 × TS7034, 1 × TS7023). By scope: `src/` 451, `main.js` 67,
`scripts/` 63, `bin/` 27.

### Are the 10 non-TS8032 findings real bugs? Mostly no — and that matters

I read each one. Honest verdict:

| Finding | Verdict |
|---|---|
| `src/tovu-server.js:402` — `const { port } = server.address()` on `string \| AddressInfo` | **Real unhandled union.** Benign in practice (a TCP listen always yields `AddressInfo`), but genuinely unguarded. |
| `src/sites-mcp-registration.js:294` — `{method, url}` passed where `{method, url, body}` expected | **Real.** A declared-shape mismatch. |
| `main.js:1000` — menu template not assignable to `MenuItemConstructorOptions[]` | Real Electron-API shape mismatch; likely literal-widening, low severity. |
| `src/project-ipc.js:164` — `"created" \| "adopted"` not assignable to `"adopted"` | **Artifact, not a bug.** `tracked-sites.js:152` is `function trackSite(projectsPath, siteDir, origin = SITE_ORIGIN.adopted, …)`; the default value makes TS infer the literal `"adopted"` as the parameter type. A real TS signature (`origin: SiteOrigin = …`) gets this right for free. |
| `src/speech/mac-on-device-transcriber.js:122,140` — `Property 'error' does not exist on '{ok:true} \| {ok:false;error:string}'` | **Artifact.** The `if (!compiled.ok)` guard at :121 is correct; narrowing fails because the union is expressed in JSDoc rather than TS syntax. Real TS would narrow. |
| `src/runner-ipc-stubs.js:80-81` — `error.code` / `error.channel` | Deliberate Error augmentation; benign. |

**This cuts both ways, and I want it stated plainly:** the `checkJs` route's findings are dominated by
JSDoc-authoring artifacts, which weakens "`@ts-check` is enough"; but it also means the code is *not* full of
latent type bugs, which weakens "convert to TypeScript."

## 3. Does the lack of checking cost anything? One proven case — and it is decisive

I searched all 107 commits touching `apps/desktop` for a defect types would have caught, then verified the
candidate empirically rather than reasoning about it.

### `cbb727db` — "restore own-server boot mode gutted by the boot-token commit"

Its message (verified against the diff — the commit restores 8 named functions, `git show cbb727db`):

> `15548bef` … deleted `openSiteWindow`, `adoptAndOpenSite`, `promptAndOpenNewSite`, `buildAppMenu`,
> `refreshAppMenu`, `reportBootFailure`, `buildSelftestTracker`, `selftestTracker`, and
> `resolveStartupSiteDirs` from `main.cjs` **with no replacement, while keeping every call site that
> references them. `bootOwnServerMode` — the default, no-env boot path — could not have run: every call into
> it threw ReferenceError.** Nobody saw this because the E2E run that would have caught it was still in
> flight when the coordinator committed.

**I ran the check that did not exist.** `git show 15548bef:apps/desktop/main.cjs` into the scratchpad, then
`tsc --allowJs --checkJs --noEmit` on that one file:

```
16 × error TS2304: Cannot find name …
  selftestTracker (×6), buildSelftestTracker (×3), refreshAppMenu (×2),
  resolveStartupSiteDirs, openSiteWindow, promptAndOpenNewSite, reportBootFailure
```

A regression that made the app's **default boot path** unrunnable, shipped, and was found only by a
still-in-flight E2E run, would have been caught in under a second by a check that requires **no conversion, no
build step, and no packaging change** — only `allowJs` + `checkJs`.

That is the single strongest argument in this report, and it argues for `checkJs`, **not** for TypeScript.

### The counter-evidence, from the repo's own commit messages

`516dc010`'s message, on two renderer defects in files that are *already* TypeScript:

> Renderer wiring guards are source-text … **both defects type-check perfectly — which is why they survived.**

The desktop's fix history is overwhelmingly wiring, lifecycle and race defects that no type system sees:
`4b89cd09` (preload built and tested but never wired into `main.cjs`), `6831f683` (`handleDelete` never touched
`deps.serializer` — *"serializer appeared exactly once in the file"*), `79ab57fc` (registry row displacement),
`a0e4edaa` (an `electron-builder.yml` `files:` omission), `89687fb1` (a staleness check that warned instead of
failing). **One** commit in 107 is type-catchable.

## 4. What packaging would break — and the finding that changes the answer

### The finding: Electron 43.6.0 runs a `.ts` main entry natively. No build step.

`apps/desktop/node_modules/electron` is **43.6.0**, whose bundled Node is **24.20.0** (read headlessly with
`ELECTRON_RUN_AS_NODE=1 electron -p`). Node 24 strips types natively. I tested the real path, not the analogy —
a scratchpad app with `"main": "main.ts"`, an `interface`, a typed function, `app.setPath("userData", …)` into
the scratchpad, and `app.quit()`:

```
$ electron <scratchpad>/eprobe
ELECTRON_TS_MAIN_OK ts-main node=24.20.0
rc=0
```

Follow-ups, all measured:

| Probe | Result |
|---|---|
| `.ts` importing `"./lib.ts"` | **works** |
| `.ts` importing `"./lib.js"` when only `lib.ts` exists | **`ERR_MODULE_NOT_FOUND`** |
| `.test.js` importing `"./lib.ts"` | **works** — so tests may stay `.js` |
| `tsc -p` with `allowImportingTsExtensions` + `erasableSyntaxOnly` + `NodeNext` + `noEmit` | **accepted** (tsc 5.9.3) |

**Consequence:** a TypeScript main process here does **not** require compiled output, a new `dist/` path, or any
change to what gets packed. `.ts` files ship as source under the existing `src/**` entry, and
`verify-package.mjs`'s byte-for-byte comparison against source keeps working **unchanged**. The dispatch's
central worry — *"a compile step means the shipped bytes no longer equal any source file"* — is avoidable.

### If a compile step *were* introduced anyway, here is exactly what breaks

Listed because the option must be evaluated, not because I recommend it.

1. **`scripts/verify-package.mjs:38`** — `const VERIFIED_PREFIXES = ["src", "bin", "main.js"];`
   Compiled output lands outside these. And the degradation is **silent**, by design:
   `src/asar-verify.js:58-60` documents *"A prefix absent from the archive is silently skipped — that is a
   scope decision for the caller."* `filesUnderPrefixes` (`asar-verify.js:82-85`) does `if (node) walk(...)`.
   So if `src/**` stopped being packed, the gate would check only `bin` and `main.js`, print a smaller
   `checkedCount`, and **pass**. The backstop against a signed corrupt asar would quietly shrink.
   Note this hole **already exists**: `dist/**` is packed (`electron-builder.yml:23`) and is *not* in
   `VERIFIED_PREFIXES`. Compiling the main process enlarges an existing gap from two directories to the
   whole app.
2. **`scripts/check-tree-quiet.mjs:30`** — `VERIFIED_RELATIVE_PATHS = ["apps/desktop/src", "apps/desktop/bin", "apps/desktop/main.js"]`,
   with the comment *"Exactly the surface `scripts/verify-package.mjs` checks."* Both lists move together or the
   two halves describe different things.
3. **`check-tree-quiet.mjs:54-65`** `gitDirtyPaths()` pathspecs those same three paths. Compiled output is
   gitignored (`apps/desktop/.gitignore`), so **git-dirty is structurally blind to it** — exactly the hole
   `movingPaths()` (`:107-112`) exists to cover, and it covers only an 0.8s sample window
   (`check-tree-quiet.mjs:35`).
4. **`electron-builder.yml:13-53`** — the `files:` list. Its own comment records the trap: *"a positive
   `files:` list REPLACES electron-builder's default all-files glob — `app-builder-lib/out/fileMatcher.js`
   only prepends that default when the list is empty or contains nothing but negations."* Any new output
   directory must be named explicitly. `src/electron-builder-files.test.js:50` pins the pre-fix pattern set and
   would need updating.
5. **`main.js:127-169`** — six `__dirname`-anchored constants, including `REPO_ROOT = path.resolve(__dirname, "..", "..")` (`:169`),
   `SPEECH_PRELOAD_PATH` (`:151`), `APP_ICON_PATH` (`:167`), `bridgePath` (`:635`). Compiling `main.js` into a
   subdirectory moves `__dirname` one level and silently repoints every one. `src/packaged-paths.js:7` records
   that this exact derivation has already broken once.
6. **New staleness class.** `src/shell-staleness.js`'s header documents the defect it exists for: a packaged
   app *"shipped an `apps/admin` bundle dated Aug 31 — twelve days stale … and the package step reported
   SUCCESS."* `stage-payload.mjs:72` (`STAGED_SHELLS`) guards `apps/admin/dist` and `apps/site-chat/dist`.
   The desktop main process is immune today **because its source is what ships**. Compiling it makes it a
   third shell that can go stale — and `npm run dev` is bare `electron .` (`package.json:8`) with no build
   step, so dev would boot yesterday's main process. That is not hypothetical: `dev-desktop.mjs:8-10` exists
   precisely because *"a renderer edit does not show up until `npm run build:renderer` runs."*

### What a source-shipped `.ts` conversion would still require

1. **145 import-specifier rewrites**, `.js` → `.ts` — 58 production import edges + 87 test import edges
   (measured; see §6). This is forced by the `ERR_MODULE_NOT_FOUND` probe above.
2. **`electron-builder.yml`** — no change needed (`src/**`, `!src/**/*.test.ts` already present). But
   `package.json:7`'s `"main": "main.js"` changes, and **21 files reference `main.js` as a literal path
   string**: `coverage-floors.json`, `package.json`, `scripts/check-tree-quiet.mjs`,
   `scripts/stage-payload.mjs`, `scripts/verify-package.mjs`, `src/asar-verify.js`, `src/packaged-paths.js`,
   `src/tovu-server.js`, plus 13 test files (the six `main-*-wiring.test.js` read it as source text).
3. **A new tsconfig** for `src/` + `main.ts` with `allowImportingTsExtensions: true`, `noEmit: true`,
   `erasableSyntaxOnly: true` (the last one is load-bearing — it is what stops someone writing an `enum` that
   native stripping cannot handle). `package.json:12`'s `typecheck` script gains a third `tsc -p`.

## 5. What the gate harness would break

The harness design is in `ADS-memory/reports/2026-09-12-desktop-gate-harness-handoff.md`: *"Pure policy lives
in `src/*.js` so the repo's existing `npm test` glob picks up its tests; the filesystem/spawn half lives in
`scripts/*.mjs`."*

| Component | Effect | Where |
|---|---|---|
| `npm test` | **Survives.** `"node --test \"src/**/*.test.js\" && node --import tsx --test \"src/**/*.test.ts\""` (`package.json:11`). Tests stay `.js`; a `.test.js` importing a `.ts` module works natively (probed). | — |
| **Coverage gate — the real casualty** | `coverage-floors.json` splits `src` into a **`.js`/`.cjs` area (floors line 96 / branch 90 / funcs 90, `minFilesOnDisk: 27`)** and a **`.ts` area (line 76 / branch 88, *no funcs floor*, `minFilesOnDisk: 18`)`. On disk today: 34 and 21. Converting `src/*.js` collapses the `.js` area to **1 file** — below its floor of 27, so `evaluateArea` (`src/coverage-floors.js:130-136`) **fails the gate**, correctly. Fixing it by merging the areas **deletes a 96/90/90 floor and pools 34 well-covered files into the 76/88-no-funcs area**, where their surplus masks the `.ts` area's 8 grandfathered `knownUnmeasured` files. | `coverage-floors.json`; `src/coverage-floors.js:110-151` |
| Coverage denominator | Unaffected in mechanism — it is a **disk scan**, not the lcov (`check-coverage.mjs:44-62`, and `coverage-floors.js`'s header on why). But every area's `extensions` array and `knownUnmeasured` path list must be repointed. | `check-coverage.mjs:36,146` |
| Coverage `--test-coverage-exclude` | `check-coverage.mjs:97-98` already excludes both `*.test.js` and `*.test.ts`. No change. | — |
| Complexity gate | **Survives.** `eslint.config.mjs:481` matches `apps/desktop/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}` already, and `check-complexity.mjs:76` ignores `**/*.test.{ts,tsx,js,mjs,cjs}`. `MIN_FILES_LINTED = 58` (`:59`) is a *count*, unchanged by renames. Only `complexity-debt.json`'s two `src/tovu-server.js` entries need repointing — and the gate will name them loudly, exactly as it did for the rename in `efbb6fb0`. | `complexity-debt.json` |
| Gate runner | **Survives.** `quality-gates.json` runs `npm run typecheck`; adding a third project to that script needs no manifest change. The orphan-script rule (*"a `scripts/check-*.mjs` that no gate runs fails the runner"*) is not triggered — no new script. | — |
| CI | **No change.** `.github/workflows/desktop.yml:79` runs `npm run gates` and deliberately enumerates nothing (`:25-30`). Node 24 (`:55`) already supports stripping. | — |
| Source-text tests | **30 of 61 test files call `readFileSync`**; the six `main-*-wiring.test.js`, `electron-builder-files.test.js`, and the renderer `*-wiring.test.js` set assert against source *text*. Renaming a file they read breaks them at the path, and any assertion quoting JS-specific syntax must be re-verified against the TS text. | — |

## 6. Effort, grounded in call sites and interfaces

File count is the wrong unit. Measured per non-test file: production importers, test importers, exported symbols.

| Metric | Value |
|---|---|
| Non-test files | 43 |
| **Exported symbols needing a real signature** | **206** |
| Production import edges | 58 |
| Test import edges | 87 |
| **Total import specifiers to rewrite `.js`→`.ts`** | **145** |
| **`noImplicitAny` annotation sites (strict)** | **496** (`src/` 364, `main.js` 48, `scripts/` 58, `bin/` 26) |
| Files referencing `main.js` as a literal string | 21 |
| Test files reading source as text | 30 of 61 |

**Fan-in is shallow**, which is the good news: the maximum is `src/tracked-sites.js` at 8 production importers;
`site-dir-store.js` 4; `main.js`, `add-site-pointer.js`, `tovu-server.js`, `transcription-port.js` 3 each. **26 of
43 files have exactly one production importer.** Conversion is therefore near-embarrassingly-parallel per file,
*after* the import-specifier rewrite, which is a single atomic change across all 145 edges.

The cost concentrates in six files, by strict-error count: `main.js` 67, `tovu-server.js` 49, `project-ipc.js` 49,
`tracked-sites.js` 40, `site-dir-store.js` 28, `site-process-registry.js` 27 — **260 of 608 (43%) in 6 of 43 files**.

| Option | Effort | Packaging risk |
|---|---|---|
| `checkJs` gate only (58 errors → 0) | **~1 day.** 48 are one mechanical JSDoc edit; 4 real fixes; 1 malformed type. | **None.** No file renamed, no byte changed in the archive. |
| + `strict` on `src/` only | +364 annotations, ~3–4 days | None |
| Full source-shipped `.ts` conversion | 496 annotations + 145 specifiers + 21 string refs + 30 source-text tests + coverage-area re-cut. **~8–12 days.** | Low (no build step) but **not zero** — see §7 |
| Conversion **with** a compile step | The above, plus all six items in §4 | **High** |

## 7. The strongest argument AGAINST converting

Stated as well as I can make it, because I think it is close to right.

**One.** The only defect in 107 commits that types would have caught is caught by `checkJs` — proven, 16 × TS2304
on the actual regressed file. Conversion buys, over `checkJs`, the *artifacts*: correct union narrowing in
`mac-on-device-transcriber.js`, a non-degenerate `origin` parameter in `trackSite`. Both of those are today
*false positives of the JSDoc route*, not live bugs. **The marginal defect yield of conversion over `checkJs` is,
on this evidence, zero.**

**Two.** This app's defects are not the kind types see. `516dc010`'s own message is the indictment: the renderer
is already TypeScript, and *"both defects type-check perfectly — which is why they survived."* The fix history is
unwired call sites (`4b89cd09`), an untaken lock (`6831f683`), a packaging glob (`a0e4edaa`), a warning that
should have been a failure (`89687fb1`). Every one type-checks perfectly. Converting spends 8–12 days hardening
against the one failure class this codebase does not suffer from.

**Three — the one that should decide it.** `verify-package.mjs` exists because **today's shipped bytes are source
bytes.** That equality is the whole mechanism: `asar-verify.js`'s header says *"Neither shortcut — size, nor
asar's own integrity field — can detect this failure class. Only comparing the shipped bytes against the SOURCE
file on disk can."* Native stripping preserves that equality — but it is one `enum`, one `namespace`, one
`import x = require()` away from someone reaching for a compile step. The moment that happens the backstop against
a **signed corrupt artifact** degrades *silently* (`asar-verify.js:58-60`: an absent prefix is *"silently
skipped"*), the shell joins `apps/admin` and `apps/site-chat` as a third thing that can be twelve days stale
(`shell-staleness.js` header), and `npm run dev` — bare `electron .` — starts booting yesterday's main process,
which is already an observed defect for the renderer (`dev-desktop.mjs:8-10`). **A build step that a packaged
Electron app depends on is a new failure mode in the exact machinery that produced a signed corrupt artifact
today.** `erasableSyntaxOnly` is a real guard against that slide, but it is a guard someone has to keep set.

**Four.** Conversion actively *weakens* the coverage gate that shipped hours ago. The `src .js/.cjs` area holds
34 files at **line 96 / branch 90 / funcs 90**; the `.ts` area holds 21 at **line 76 / branch 88 and no funcs
floor at all** — deliberately, per its own comment, because the measured 22.54% *"would lock in the badness."*
Converting collapses the first area into the second. The honest fix is to re-cut the areas by **role** rather than
extension, which is real design work nobody has scoped, done under pressure to make a red gate green — the precise
circumstance every comment in that harness warns against.

## 8. Recommendation

**Stage 0 — do this now.** Add a third tsconfig covering `main.js` + `src/**/*.js` + `scripts/**/*.mjs` +
`bin/**/*.mjs` with `allowJs: true`, `checkJs: true`, `noEmit: true`, `strict: false`; fix the 58 errors (48 are
the one-line TS8032 JSDoc form, 4 are real); chain it into `package.json:12`'s `typecheck` script, which
`quality-gates.json`'s `typecheck` gate and `.github/workflows/desktop.yml:79` already run. **~1 day. Not one
byte of packaging changes, not one file renamed, `verify-package.mjs` untouched.** It closes the `cbb727db` hole
permanently and proves its own value on day one.

**Stage 1 — optional, and only after Stage 0 is green for a while.** Raise `strict` on `src/` alone (+364
annotations). Still no rename, still no packaging change. If the `noImplicitAny` pass surfaces real defects, that
is the evidence for Stage 2 that does not exist today.

**Stage 2 — convert, only if Stage 1 earned it.** If you do: **source-shipped `.ts` via native type stripping,
never a compile step.** Set `erasableSyntaxOnly: true` and `allowImportingTsExtensions: true`; rewrite all 145
specifiers `.js`→`.ts` in one atomic change; keep tests as `.js` (they import `.ts` natively — probed); leave
`scripts/` and `bin/` alone (they are 84 strict errors for tooling that never ships); re-cut
`coverage-floors.json`'s areas by **role**, not extension, *before* the rename lands, so the 96/90/90 floor
survives in some form.

**Do not** convert with a compile step. The six §4 breakages are all real, and the app that would depend on that
build step is the one that shipped a signed corrupt `.dmg` this morning.

---

### Verification note

Everything above that is a number was measured today against this working tree, not inherited: file counts from
`git ls-files`; error counts from `tsc --noEmit` runs (configs in the session scratchpad, nothing written to the
repo); the `cbb727db` regression reproduced from `git show 15548bef:apps/desktop/main.cjs`; the Electron `.ts`
main entry, the import-specifier behaviour, and the `.test.js`→`.ts` import all executed as live probes against
`apps/desktop/node_modules/electron` 43.6.0. Line references were read from the files at the SHAs in the working
tree; `electron-builder.yml` was re-read after another agent amended it mid-session (its `node_modules` negations
at `:39-53` do not affect any conclusion here).

Three files were read but deliberately not analysed for change impact because other agents hold them:
`apps/desktop/src/renderer/use-site-*.hooks.ts`, `coverage-floors.json` (read-only), and
`scripts/stage-payload.mjs` / `src/stage-payload-lib.js` (read-only).
