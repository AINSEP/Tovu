# apps/desktop → TypeScript: migration plan

**Date:** 2026-09-12 · **Branch:** `restructure/apps-website-phased` · **Author:** Coordinator (Opus 5)
**Owner decision (not open):** convert everything to `.ts`. The recon's `checkJs`-first route was overridden.
**Input:** `2026-09-12-desktop-typescript-recon.md` (`cb126e42`). Facts re-checked today are marked ✔.
**Models:** the rewrite uses **Opus 5, Programmer persona** (owner, 2026-09-12). The later architecture and coverage sweep uses **Sonnet 5**.

---

## Target end state

- Every JS-family file in `apps/desktop` becomes `.ts`, tests included: `main.js`, `src/**`, `src/speech/**`, `bin/*.mjs`, `scripts/*.mjs`. Electron and Node run them through native type stripping. **The main process gets no compile step.** Shipped bytes stay equal to source bytes, so `verify-package.mjs` keeps working.
- `src/speech/preload-speech.cjs`, a sandboxed preload, stays `.cjs`. Decided by evidence: probe P2 (Phase 0 results table, below).
- Relative import specifiers end in `.ts`. A `.js` specifier with only a `.ts` file on disk fails with `ERR_MODULE_NOT_FOUND`.
- A new `tsconfig.main.json` has these settings: `strict`, `noUncheckedIndexedAccess`, `noEmit`, `module`/`moduleResolution: NodeNext`, `allowImportingTsExtensions`, `erasableSyntaxOnly`, `verbatimModuleSyntax`. It covers `main.ts`, `src/**` except `renderer`/`contracts`/`preload`, `bin`, `scripts`, and their tests. It is chained into `npm run typecheck`.
- **Coverage floors survive by role, not by extension.** The main-process area keeps **96 / 90 / 90** and `minFilesOnDisk: 27`. The renderer+contracts area keeps 76 / 88 / 66. See Phase 1.

Verified facts this plan builds on ✔:
- `package.json` has `"type": "module"`, and all 43 non-test files already use ESM `import`. No CJS rewrite is needed, except the `.cjs` preload.
- No `.ts` file lives directly in `src/`; every existing `.ts` is under `src/renderer` or `src/contracts`. The `.js/.cjs` area is therefore exactly the main-process role, 34 files, and the `.ts` area is exactly renderer+contracts, 21 files.
- The existing renderer `.test.ts` files use `.js` specifiers under bundler resolution, so they need `tsx`. Native stripping cannot run them. They are already TypeScript and outside this migration's scope.
- `mcp-bridge` is exec'd as `ELECTRON_RUN_AS_NODE=1 '<electron>' '<bridge>'` (`src/sites-mcp-registration.js:123-125`), so it runs on Electron's Node 24.20, not system Node.
- System Node is **v24.2.0**.
- `@types/node` is **not** in `apps/desktop/node_modules/@types`. It is only reachable transitively.

## Rules for every phase

1. **No compile step for the main process, ever.** `erasableSyntaxOnly` enforces this: no `enum`, `namespace`, parameter properties, or `import x = require()`.
2. **No behaviour change hides inside a migration commit.** The rename commit only renames files and rewrites specifiers and path strings. Annotation commits add types only. If a type error exposes a real bug, stop, report it, and fix it in its own commit with a RED test first.
3. **Coverage floors are never lowered.** Per-area numbers must not drop at any phase.
4. `scripts/stage-payload.mjs` and `src/stage-payload-lib.js` were **released 2026-09-12**, when PAYLOAD-SLIM landed (`65906931`, `172d783a`, `641bf728`). They are in scope now and much larger: the lib gained about 250 lines, and its tests grew from 25 to 51. Re-measure their strict error count before sizing B9. `c8824fa6` since added the `lucide-react` exclusion to `EXCLUDED_PACKAGES` in `src/stage-payload-lib.js`, with tests; B9 must carry that change too.
5. No `electron-builder` while the tree is being written. No second Electron app while an owner app runs.
6. Tests run scoped and sequentially. Check `pgrep -f "node --import tsx --test"` and `pgrep -f "node --test"` first. At most **2** Opus agents work in parallel, on disjoint files.
7. Git rules: explicit pathspecs, no `add -A`, no bare stash, no `checkout --`. Confirm every commit with `git show --stat HEAD`.

---

## Phase 0: probes (scratchpad only, nothing written to the tree)

| # | Question | Pass condition, or decision it drives |
|---|---|---|
| P1-node | Does a `.ts` file load **from inside an asar**? The recon proved only an unpacked directory. | Pack a scratch dir with `@electron/asar`, then run `ELECTRON_RUN_AS_NODE=1 electron app.asar/main.ts`. This is safe beside the owner's live app. **Fail = stop the migration and report.** |
| P1-app / P2 | Does app-mode `"main": "main.ts"` load from an asar? Can a `sandbox: true` preload be `.ts` or `.cts`? | Both need a real Electron app launch. Whether that kills the owner's running app is unproven (tovu-b4, 2026-09-12), so both are **deferred to the quiet-tree repackage window**, with the owner's app stopped. Until then, `preload-speech.cjs` is planned to stay `.cjs`, which is **the one exception to confirm with the owner**. |
| P3 | Does `ELECTRON_RUN_AS_NODE=1 electron bridge.ts` run? | Must pass, or `bin/mcp-bridge` stays `.mjs`. |
| P4 | Coverage comparability. Copy `keyed-serializer.js` and its test into the scratchpad and take the js lcov image. Convert both, then run (a) bare `node --test` and (b) `node --import tsx --test`. | LF/LH/BRF/BRH/FNF/FNH must equal the js image for whichever runner the main-process pass uses. This decides whether `check-coverage.mjs` keeps a native pass for main-process tests or can use one `tsx` pass. |
| P5 | Does electron-builder accept `"main": "main.ts"`? | Read `app-builder-lib`'s main-entry validation. **Do not run it.** |
| P6 | Is the generated MCP launcher, or its registered row, persisted with the absolute bridge path, or rebuilt at every boot? | If persisted, renaming `bin/mcp-bridge.mjs` breaks existing registrations after restart, so Phase 3 needs a repoint or migration step. |
| P7 | Does `node scripts/x.ts` on Node 24.2 print an ExperimentalWarning, and does any gate parse stderr? | If a gate parses stderr, handle it before Phase 3. |

### Phase 0 results (2026-09-12, `ts-phase0`, Opus 5)

Full detail is in `ADS-memory/.local-artifacts/desktop-ts/phase0-probes.md`. The coordinator re-read the P6 and P7 citations in code.

| Probe | Result |
|---|---|
| P1-node | **Pass.** `ELECTRON_RUN_AS_NODE=1 electron app.asar/main.ts` loads from inside the archive (`import.meta.url` is `.../app.asar/main.ts`), resolves `./lib.ts` inside it, and strips types at load time; the packed `main.ts` still contains its types. Running `app.asar` alone loads it through `main` too. App mode is still unproven and belongs to P1-app. |
| P1-app | **Pass** (`ts-p1app-p2`, run after the owner stopped the dev app). App-mode `"main": "main.ts"` loads from inside app.asar, `app.whenReady()` fires, the `./lib.ts` import resolves, and types are stripped. The unpacked control is identical. |
| P2 | **Fail for `.cts` and `.ts`.** Electron's sandboxed-preload loader (`sandbox_bundle`) never strips types and rejects ESM, so a `.ts` file with a CommonJS body fails with the same syntax error. The `.cjs` control works. **Decided by evidence: `src/speech/preload-speech.cjs` stays `.cjs`.** The only alternative is a compiled preload in `dist`, which rule 1 forbids. |
| P3 | **Pass.** `.ts` and `.mts` bridges run under `ELECTRON_RUN_AS_NODE=1` (Node 24.20.0), including a path with a space. Exit 0, empty stderr. |
| P4 | **Bare `node` reproduces the JS lcov image exactly** (all six counters and every per-line record, on two files). **`tsx` does not:** esbuild's `__name` helper adds a fake function and branch per file, and hits land on the wrong lines. So main-process tests must run on bare `node`. |
| P5 | **Accepted.** electron-builder only checks that the `main` file exists in app.asar and is non-empty (`asarFileChecker.js`, via `platformPackager.js:539-540`). The extension is never checked. |
| P6 | **The DB row stores the launcher path, not the bridge path.** The launcher script in userData holds the absolute `bin/mcp-bridge.mjs` path and is rewritten only when a site opens (`main.js:631-636`). It is not rewritten at boot. No row migration is needed, but there is a stale-launcher window; see Phase 3. |
| P7 | System Node 24.2 prints an ExperimentalWarning, and no gate reads stderr. **The orphan-script rule is a filename filter** at `check-gates.mjs:54`, `name.endsWith(".mjs")`, with the runner's own basename excluded at `:46`. After the rename it finds zero scripts and passes silently. |

## Phase 1: re-cut the coverage areas by role, before any rename (the one condition)

This lands as its own commit **before any file is renamed**, so the floors never depend on the rename.

1. **Baseline.** Run `node scripts/check-coverage.mjs` once on a quiet test slot. Save the full output to `ADS-memory/.local-artifacts/desktop-ts/coverage-baseline.txt`.
2. **`excludeDirs` support.** `filesOnDisk()` in `scripts/check-coverage.mjs` recurses, so today `dirs: ["src"]` cannot express "main process only". Add an optional `excludeDirs` to the area schema. Put the filter as a pure function in `src/coverage-floors.js` and write its RED test first.
3. **New areas.** Transitional extension lists cover both the old and new extensions, so the rename cannot move a file between areas:

   | id | dirs | excludeDirs | extensions | floors | minFilesOnDisk | knownUnmeasured |
   |---|---|---|---|---|---|---|
   | `src main-process` | `src` | `src/renderer`, `src/contracts`, `src/preload` | `.js .cjs .ts .cts` | **96 / 90 / 90** | 27 | `preload-speech.cjs` (as today) |
   | `src renderer+contracts` | `src/renderer`, `src/contracts` | — | `.ts` | 76 / 88 / — | 18 | the same 8 |
   | `bin` | `bin` | — | `.mjs .ts` | 85 / 80 / 62 | 2 | — |

3b. **Split the test runners by directory (required by P4).** Today `package.json` `test` and `check-coverage.mjs:130-131` send every `*.test.ts` to `tsx`. Change both:
   - main-process tests (`src/*.test.{js,ts}`, `src/speech/**`) run on **bare `node`**
   - renderer and contracts `*.test.ts` stay on `tsx`
   Nothing is renamed yet, so this is a no-op today. It keeps Phase 3's coverage numbers identical.
4. **Acceptance.** Re-run the gate. **Every area's on-disk count (34 / 21 / 2) and every percentage must equal the baseline exactly.**
   **Mutation proof.** In the scratchpad, point one copy at a test-less main-process file. The gate must fail by name, and it must fail under the main-process area, not the renderer area.
5. After Phase 5, the extension lists narrow to `.ts`, plus `.cjs` if P2 keeps the exception.

### Phase 1 result: `352d76e2` (2026-09-12, `ts-phase1`)

The coordinator re-read `coverage-floors.json` and the variance trials.
- **Areas cut by role:** main-process 34 files, renderer+contracts 21, bin 2. The file lists, floors, minimums and known lists are identical to before.
- **Runners:** 52 test files on bare `node`, 8 on `tsx`.
- **Mutation proof:** a test-less `src/zz-mutant-probe.js` fails under `src main-process` by name.
- **Empty-glob guard:** `check-coverage.mjs` now fails a pass whose globs match zero files. Node 24.2 exits 0 with "tests 0" on an empty glob.
- **The acceptance amendment is measured, not assumed.** Main-process **branch% varies run to run on an unchanged config**. `src/sites-mcp-tools.js` reports BRF 1013 or 1014, and its BRDA ids reshuffle between identical runs. Across 12 alternating trials, both the old and new configs gave 95.36 and 95.46, while line and funcs were stable at 99.32 and 95.21. So from Phase 3 on, "identical to baseline" means:
  - identical file sets
  - identical line% and funcs%
  - branch% within that file's ±1 BRF jitter

**Follow-ups found in Phase 1: all four closed in `45519aeb`.** That commit also added a renderer+contracts **funcs floor of 66** (measured 70.54%) and `src/coverage-runner-split.test.js`, which guards against drift between `package.json` and `TEST_PASSES`. Small leftovers for Phase 3:
- the `coverage-floors.js` survey paragraph says "18 non-test .ts files"; there are 21 today
- a `coverage-floors.test.js` title says "TENTH … nine", but its fixture has 2
- risk: renderer funcs% may shift if those tests ever leave `tsx`

The original list:
1. `check-coverage.mjs`'s usage line advertises an unimplemented `--keep-lcov`.
2. `coverage-floors.js`'s header says "Nine" `.ts` files; the list has 8.
3. `_comment_no_funcs_floor` quotes a stale 22.54% funcs figure; it now measures 70.54%.
4. The runner split lives in both `package.json` `test` and `check-coverage.mjs` `PASSES`, so the two can drift apart.

## Commits landed since Phase 1 that Phase 3 must carry

- `eb6f8241`: `main.js` sites-home `minWidth` 960 → 480, plus a `main-project-wiring.test.js` assertion.
- `c8824fa6`: the `lucide-react` exclusion in `src/stage-payload-lib.js`, plus tests. The same change vendored the icons in Jini as commit `1e46cfe2`, in the Jini repo, not Tovu.
- `1c5d9f72`: new `src/quit-signals.js` routes SIGTERM/SIGINT into the graceful quit; `development/scripts/dev-desktop.mjs` now waits 7s before SIGKILL; wiring tests updated.
- `d1772c82`: new `src/quit-drain-gate.js` holds every quit attempt during the before-quit drain; `before-quit` also arms the shared 15s deadline.
- `2c832694`: grayed-out Marketplace nav entry. Touches `src/contracts/sections.ts` and `src/renderer/icons.tsx` (both already `.ts`/`.tsx`, out of migration scope) and adds `src/renderer/marketplace-nav-wiring.test.js`.
- `0393f2ce`: hides the Tasks nav icon (`hidden: true` in `sections.ts`, contract id kept). Adds `src/renderer/tasks-nav-hidden-wiring.test.js`.

Both `1c5d9f72` and `d1772c82` touch `main.js` and add new `src/*.js` files plus tests, which Phase 3 renames too.

`2c832694` and `0393f2ce`'s two new test files are `.js`-family inside `src/renderer`, joining 6 pre-existing ones (`card-preview-wiring`, `one-chat-fab-wiring`, `rescan-wiring`, `site-card-menu-wiring`, `webview-failure-wiring`, `webview-partition-wiring`) — **8 total today**. None affect either coverage area: test files are excluded by `isMeasurableSource`, and the renderer+contracts area's `extensions: [".ts"]` never scans `.js`, so Phase 1's floors and the 34/21 file counts above are unchanged. But "tests included" in Target end state puts all 8 in Phase 3's rename scope, and the `node`/`tsx` split in `TEST_PASSES` (`src/coverage-floors.js`) is by glob, not by area: `src/**/*.test.js` (bare `node`) vs `src/renderer/**/*.test.ts` (`tsx`). Renaming any of these 8 to `.test.ts` moves it from the bare-`node` pass to the `tsx` pass — a runner change, not just an extension change. All 8 only `fs.readFileSync` + assert on text (verified for the two newest; same convention as `main.js`'s wiring tests), so there's no import-resolution or lcov risk, but Phase 3 must list these 8 by name and confirm each still passes under `tsx` post-rename rather than assume it.

## Phase 2: toolchain prerequisites

- **Explicit devDependencies:** `@types/node` (must match Electron's Node 24 line) and `@electron/asar` `^3.4.1`, which was open item 4. Both go in one `npm install`, which needs a **quiet tree and the owner's OK**, because it writes the `node_modules` under their running app.
- **Complexity gate:** confirm `eslint.config.mjs`'s desktop block parses `.ts` outside `src/renderer`. The recon says its glob already matches, but a glob match is not parser config.

## Phase 3: one atomic mechanical rename (a single commit with zero type annotations)

**Scope:** every JS-family file except the two held stage-payload files, their test, and any P2/P3 exception.

1. `git mv` each file to `.ts`, or `.test.ts` for tests.
2. Rewrite relative specifiers from `.js`/`.mjs` to `.ts`. The recon counts 145 edges. Use a script, not hand edits.
3. Repoint every literal path string. Found so far:
   - `package.json`: `main`, `test`, `gates`, `stage`
   - `electron-builder.yml` `files:`: `main.ts`, and keep both `!src/**/*.test.js` and `!src/**/*.test.ts` until Phase 5
   - `scripts/verify-package` `VERIFIED_PREFIXES`
   - `scripts/check-tree-quiet` `VERIFIED_RELATIVE_PATHS`
   - `src/asar-verify`, `src/packaged-paths`, `src/tovu-server`
   - `main.ts`: `bridgePath`
   - `quality-gates.json` commands
   - the **orphan-script filter** in `check-gates.mjs`. Change `:54` (`endsWith(".mjs")`) and `:46` (`RUNNER_BASENAME`) **together**; changing only `:54` makes the runner flag itself as an orphan. Also update the `check-orphaned.mjs` fixtures in `check-gates-exit-code.test.js:151-157,173-177`. `quality-gates.js` needs no change.
   - `complexity-debt.json`
   - `coverage-floors.json` path strings
   - `scripts/hooks/pre-push`
   - the 13 test files that read source as text, including every `main-*-wiring` test
4. Add `tsconfig.main.json` in **loose mode** (`strict: false`) and chain it into `typecheck`. From this commit on, the `cbb727db` class of bug (TS2304, a call to a deleted function) is gated.

**Acceptance.** Every item is recorded, and every item is a tool result rather than an agent claim.
- a. `git diff -M --stat` shows only renames. A script confirms that every non-rename content line is a specifier or path-string change.
- b. Zero relative `.js`/`.mjs` specifiers remain in converted files. The grep must be shown to match before the change, so a zero result means something.
- c. The scoped desktop suite is green. Coverage gate per-area numbers are **identical to the Phase 1 baseline**.
- d. `typecheck`, the complexity gate, and the gate runner are green. `tree-quiet` stays RED while the dev stack runs, which is expected.
- e. Orphan-rule mutation: adding a dummy `scripts/check-zzz.ts` fails the runner. Then remove it.
- f. After the owner restarts the dev app: it boots, and one site window opens, which exercises the speech preload and the MCP bridge path.

**Owner impact.** The running app and the userData launcher script both still name `bin/mcp-bridge.mjs`. **Land this only after the owner agrees to restart.** Restart order (P6):
1. Restart the desktop app.
2. Open one site, which rewrites the launcher.
3. Only then restart any dev-stack agent daemon. Today's live bridge, pid 9416, belongs to daemon 9315 and reads the same launcher.

An optional hardening would be to rewrite the launcher at app start, which closes that window.

## Phase 4: annotation batches (Opus 5 Programmer, leaf-first)

**Strict ratchet.** Add `tsconfig.main-pending.json` (loose). It lists files not yet annotated. `tsconfig.main.json` becomes strict and lists done files. Each batch moves its files from pending to done. The last batch deletes the pending config.
Batches go **leaf-first** by import graph, computed at the end of Phase 3. That way a strict file never pulls an unannotated import into the strict program.

Indicative batches. The recon's strict error counts set the sizes, and the import graph fixes the final order.

| Batch | Files | Status |
|---|---|---|
| B1 | Pure policy leaves: `keyed-serializer`, `shutdown-tracker`, `selftest-tracker`, `tree-quiet`, `quality-gates`, `complexity-debt`, `coverage-floors`, `shell-staleness`, `webview-guest-policy`, `site-supervisor`, `runner-ipc-stubs` | **Done** — `b4099135` |
| B2 | `speech/*`, `desktop-auth`, `desktop-user-data-dir`, `packaged-paths`, `admin-dev-proxy`, `asar-verify` | **Done** — `f106b5df` |
| B3 | `tracked-sites` (40), `site-dir-store` (28) | **Done** — `46160781` |
| B4 | `site-process-registry` (27), `site-preview-store`, `site-config`, `project-delete-guard`, `add-site-pointer` | **Done** — `4e6d5dd9` |
| B5 | `tovu-server` (49) | **Done** — `c8f0d7af` |
| B6 | `project-ipc` (49), `sites-mcp-registration`, `sites-mcp-server`, `sites-mcp-tools` | **Done** — `80365c96` (project-ipc, bin/tovu-desktop), `b3c31a90` (sites-mcp trio, bin/mcp-bridge) |
| B7 | `bin/*`, `scripts/*` (except stage-payload) | **Done**, folded into other lanes' commits — `2c8cb578` (verify-package), `4c1ed6bd` (gate scripts, self-labeled "batch B2" — see the progress section's label-drift note), `80365c96`/`b3c31a90` (bin/*) |
| B8 | `main.ts` (67) | **Done** — `38f2f65b`, `fefefe41`, `95206dd9` |
| B9 | the `stage-payload` pair, **released** (Rule 4): rename and annotate, carrying the `lucide-react` exclusion from `c8824fa6`, with its tests | **Done** — `e29043f3`, `c5b5ff5a`, `51e0357c` |

*Status column added 2026-09-13; see "Progress: 2026-09-13" below for lane rotations, the B2/B7 label drift, and per-commit evidence.*

**Per-batch rules.**
- A batch is its source files **plus their tests**.
- Types only. Real signatures replace JSDoc type tags, and JSDoc prose stays.
- `any` requires a same-line reason comment. The batch report counts them.
- A source-text test whose regex breaks under the new signatures gets updated to assert **the same wiring**. A test must never be loosened to pass. The reviewer diffs every such regex.

**Per-batch acceptance.** These are tool results, never agent claims.
1. **Type-only proof.** For each file, `module.stripTypeScriptTypes()` of the new text must equal the pre-batch text once comments and whitespace are normalized. This proves no runtime change mechanically.
2. Strict `tsc -p tsconfig.main.json` is green, and so is pending.
3. The batch's scoped tests pass, then the coverage gate. **No area percentage may drop.**
4. Complexity gate is green.

## Phase 5: close-out

1. `coverage-floors.json`: narrow the extensions to `.ts`, plus `.cjs` if P2 kept it. Keep 96/90/90 and `minFilesOnDisk: 27`. Remove `!src/**/*.test.js` from `electron-builder.yml`.
2. **Backslide guard** (proposed, small): a new non-test `.js/.mjs/.cjs` under `main`, `src` (outside renderer), `bin`, or `scripts` fails a gate by name.
3. Fix comments that are now false. Examples: `tsconfig.preload.json`'s header ("main process is hand-written JavaScript… not typechecked"), `electron-builder.yml`'s `main.js` notes, and `dev-desktop.mjs`'s header.
4. **Packaging proof, only with `tree-quiet` green**, meaning the owner's stack is stopped. Record `verify-package`'s `checkedCount` **before** Phase 3. After `npm run package`, it must be ≥ that number. This catches the silent prefix-shrink hole (`asar-verify.js:58-60`).
5. Then hand off to the deferred Sonnet 5 architecture and coverage sweep. It includes the rule that `.tsx` files hold no state or hooks.

---

## Risks

- **P1 fails** (asar plus type stripping): the whole approach is invalid. Stop and return to the owner.
- **Live app disruption:** Phase 2's `npm install` and Phase 3's rename both need the owner's OK to restart.
- **Coverage measurement drift** between the native and `tsx` runners. P4 settles it before Phase 1 commits.
- **Source-text wiring tests** are the likeliest place a batch silently weakens a guard. Every changed regex gets reviewed.
- **`noUncheckedIndexedAccess`** adds annotation sites beyond the recon's 496. It is kept, to match both sibling tsconfigs.

## Owner decisions and sequencing (as of 2026-09-12, 12:40)

- Decision 1 is resolved by evidence: `preload-speech.cjs` stays `.cjs`.
- As of 2026-09-12 ~12:40, the owner has stopped the desktop dev stack, yesterday's website `tsx watch` dev server, and the orphaned tovu-com server, for a clean repackage. **Do not restart any of them** until the coordinator says so.
- **Order from here:**
  1. **Done.** The orphan-server fix commits: `1c5d9f72` and `d1772c82`.
  2. **Done** as `b68cad83`: the admin "modified" refresh fix (agent `theme-modified-refresh`). A follow-up data-loss fix for resetting files over 1 MB is in progress (agent `reset-oversize-fix`), so the admin dist rebuild waits for that too.
  3. `cd apps/admin && npx vite build`.
  4. Phase 2 `npm install` of `@electron/asar` and `@types/node`, which needs the quiet tree.
  5. Repackage and measure the real app size. This is the pre-TypeScript baseline, and it records `verify-package`'s `checkedCount`.
  6. Phase 3 rename.
  7. The owner restarts the dev app, following the Phase 3 restart order: app, then open one site, then any daemon.
- The SPEC-050 site-title implementation (agent `site-title-impl`) is writing `apps/website` source and a DB migration, so the repackage also waits for it to commit.
- **Still open for the owner:** publishing `@jini-ai/ui` 0.3.8 to npm, which is not done. The local Jini build already ships the vendored icons.

---

## Progress: 2026-09-13 — Phase 4 batches B1–B9, the backslide gate, Phase 5 close-out

**Author of this section:** Docs Agent (Sonnet 5), dispatched by the coordinator. Every sha below was independently re-verified with `git show --stat <sha>` against this branch's history; none are agent claims. Sourced from `ADS-memory/.local-artifacts/owner-worklist.md`, the `ADS-memory/.local-artifacts/desktop-ts/ts-lanes/*/` lane folders, and current `git log`.

**Ownership.** The owner transferred remaining B8 (`main.ts`) + close-out part 2 + follow-ups from session tovu-78 to tovu-bf on 2026-09-12 ~17:00, at HEAD `80365c96`, tree clean, no lock held. B8 and the rest of close-out landed the evening of 2026-09-13.

### Execution ran as lanes, not the batch table verbatim

The indicative B1–B9 table above set initial sizing, but real execution ran as parallel Sonnet lanes (A–D) plus the dedicated Opus B8 lane for `main.ts`, with lanes rotating to a fresh agent whenever one hit its context limit or the owner stopped it directly. Some commits' own "batch" labels drifted from the plan's table — noted inline below rather than silently corrected.

**Lane rules actually followed** (from owner-worklist.md's "Lane rules" section): Opus for `main.ts`, Sonnet for everything else, always an explicit model per dispatch; a hard 350k-context stop with a context estimate in every dispatched agent's message; at most 3 test-running agents machine-wide, exact test files only, never a bare `npm test` or `npm run gates`, one node process at a time (check `uptime`, wait if load > 20); main-process tests on bare `node --test`, renderer tests on `node --import tsx --test` (fixed by Phase 0's P4 result above); a `gate.lock` directory `mkdir`/`rmdir`'d around `check-coverage`/`check-complexity` runs; commits as `git commit -F <unique msgfile> -- <exact paths>` then `git show --stat HEAD`, never `add -A`/stash/checkout/reset/restore/amend; never `pgrep -l`/`-fl` or `ps eww`; the shared proof tool is `desktop-ts/ts-phase4-b1-opus/type-only-proof.mjs`.

### B1 — pure policy leaves
`b4099135` (Opus, session tovu-1f). `complexity-debt`, `coverage-floors`, `keyed-serializer`, `quality-gates`, `quit-drain-gate`, `quit-signals`, `selftest-tracker`, `shell-staleness`, `shutdown-tracker`, `site-supervisor`, `tree-quiet`, `webview-guest-policy`, plus `coverage-runner-split.test`, annotated with their tests. `quit-signals`/`quit-drain-gate` weren't in the plan's B1 row (they landed after it) but are leaves; `runner-ipc-stubs` held out. This commit also creates the strict `tsconfig.main.json` (an explicit `files` ratchet) and the loose `tsconfig.main-pending.json` (everything not yet annotated).

### B2 — modules whose desktop imports are already strict
`f106b5df` (Opus, tovu-1f). `speech/{mac-on-device-transcriber,pcm-wav-encoder,speech-ipc,transcription-port}` + `preload-speech.test`, `desktop-auth`, `desktop-user-data-dir`, `packaged-paths`, `asar-verify`, `runner-ipc-stubs`, `site-history-menu`, `site-config`, `site-preview-store`, `admin-dev-proxy.ts`. `admin-dev-proxy.test.ts` stayed pending — it imports `tovu-server.ts`, not yet strict. 26 files moved from pending to strict.

### Lane A — tovu-server, then tracked-sites/site-dir-store, then the orphan-registry group
- Step 1: `c8f0d7af` — `tovu-server.ts` + test (plan row B5).
- Step 2: `46160781` — `tracked-sites.ts` + `site-dir-store.ts` (plan rows B3/B4 boundary). `SITE_ORIGIN` gets `as const` so `SiteOrigin` derives from it directly.
- Step 3: lane A stood down mid-step ("owner: past limit") and rotated to **A2**, which committed `4e6d5dd9` — `site-process-registry`, `project-delete-guard`, `add-site-pointer` (plan row B4), plus their tests. Coordinator re-ran the type-only proof on all 6 files from this lane, SAME; A2 stopped after the commit.

### Lane B / B2 — the stage-payload pair (B9), then the gate scripts
- `e29043f3` — B9 rename half: `scripts/stage-payload.mjs`→`.ts`, `src/stage-payload-lib.js` (+ its test) →`.ts`. Held out of the earlier mechanical rename per the plan's Rule 4 (the pair was released 2026-09-12 as part of PAYLOAD-SLIM); `c8824fa6`'s `lucide-react` exclusion in `EXCLUDED_PACKAGES` carries through unchanged.
- `c5b5ff5a` — B9 annotate half. New interfaces: `Target`, `HostInfo`, `StripTally`, `PruneTally`, `PrebuildBuilt` in the lib; `RuntimeManifest`, `ShellEntry` in the script.
- `51e0357c` — follow-up: repoints stage-payload doc comments to `.ts`. Unlike the earlier Phase 3 precedent (leaving old-extension prose alone), the coordinator asked specifically for this fix, because the type-only proof tokenizes real TS and strips comments — fixing prose here carries zero risk of masking a real diff.
- Lane B was stopped by the owner directly at ~155k context (not a misread) and rotated to **B2**, which resumed from lane B's step-3 drafts and committed `4c1ed6bd`: `check-complexity.ts`, `check-gates.ts`, `check-tree-quiet.ts`, `check-coverage.ts`, `check-gates-exit-code.test.ts`, `electron-builder-files.test.ts`. **Label drift:** this commit's own message calls itself "batch B2," but by content it is scripts/gate work, closer to the plan table's B7 row (`bin/*`, `scripts/*` except stage-payload) than to B2 (already done by `f106b5df`). Recorded as observed, not corrected.

### Lane C / C2 — the sites-mcp trio and mcp-bridge
`b3c31a90` (commit message: "batch B6 tail"; lane C2 resuming lane C after a full rotation). `src/sites-mcp-tools.ts`, `src/sites-mcp-registration.ts`, `src/sites-mcp-server.ts`, `bin/mcp-bridge.ts`, plus their tests. Seven `any` types added, each with a same-line reason (JSON-RPC/tool-result payload shapes are polymorphic per method/tool, asserted by that method's own test) — the same convention as `c5b5ff5a`/`4c1ed6bd`. At rotation, lane C's 8 drafts were already mirrored into the tree with a post-tree strict tsc of 0; C2 finished acceptance and committed. Coordinator re-ran the proof on all 8 files, SAME.

### Lane D / D2 / D3 — verify-package, admin-dev-proxy.test, project-ipc, the tovu-desktop CLI
- `2c8cb578` — `scripts/verify-package.ts`. Not covered by the coverage gate (`scripts/` is outside every area's `dirs`) and has no direct test file. Also fixes a stale `stage-payload.mjs` comment.
- `7421c646` — `src/admin-dev-proxy.test.ts`, once `tovu-server.ts` was strict. Two `@ts-expect-error` lines kept, each with a same-line reason (tests that deliberately exercise a runtime guard against input the new type now disallows), per the plan's "never loosen a test" rule.
- Lane D had no uncommitted work left for step 3 (`project-ipc` + its test, `add-site-button-wiring.test`, `bin/tovu-desktop.ts`, `tovu-desktop-cli.test`), so a fresh **D2** was dispatched; D2 was stopped mid-step by the owner; **D3** resumed and committed `80365c96` ("batch B6/lane D3"). `project-ipc.ts` and `bin/tovu-desktop.ts` arrived from D2 already fully annotated and needed only a stray trailing comma removed from `handleCreate`'s signature — a real token-level diff the type-only proof caught. The two test files were still loose and were annotated in this commit.

### The backslide gate (Phase 5 item 2 — not itself a lettered batch)
`46df8bee` (agent `ts-jsguard`, Sonnet). `src/js-backslide-guard.ts` (a pure predicate; the `preload-speech.cjs` exemption is matched by exact path only, never a directory or pattern) + `scripts/check-js-backslide.ts` (candidates gathered via `git ls-files -co --exclude-standard`, so build output stays out) + a new `"js-backslide"` entry in `quality-gates.json`. RED-first and mutation-proofed. Per owner-worklist.md item 9, **this gate is not yet enforcing anything live**: `core.hooksPath` is unset (verified 2026-09-12), so `apps/desktop/scripts/hooks/pre-push` never runs, and `.github/workflows/desktop.yml` only helps if GitHub Actions CI is enabled for this repo (memory says CI is off; unverified by this report). Owner action still open: `git config core.hooksPath apps/desktop/scripts/hooks`.

### Close-out, part 1 (Phase 5, everything not waiting on `main.ts`)
`fc3256b4` (agent `ts-closeout1`, Sonnet). `coverage-floors.json` extensions narrowed (`src main-process` to `.ts`+`.cjs`, `bin` to `.ts`; floors and `minFilesOnDisk` unchanged); dropped the now-empty `src/**/*.test.js` glob from `package.json`'s `test` script and from `TEST_PASSES`; `electron-builder.yml` dropped `!src/**/*.test.js` and fixed stale `main.js`/`stage-payload.mjs` comments; `tsconfig.renderer.json` re-included the 8 renamed renderer wiring tests Phase 3 had excluded. **Unverified by this report:** the lane notes record that this agent ran an unscoped `npm test` at some point, which is against the lane rules (exact test files only) — flagging as observed rather than re-litigating, since I did not re-run anything myself.

### B8 — `main.ts`, 2026-09-13 (Opus)
- `38f2f65b` (part 1, widenings only): `tovu-server.ts` — both `adminDevProxyUrl` fields admit `null` (already dropped by `buildServeEnv`'s `typeof` guard); `TovuServerHandle.pid: number` with one `child.pid!` at the resolve site. `site-dir-store.ts` — `devFallbackDir` admits `null`. `tracked-sites.ts` — `ClassifySiteDirFn` admits `"unreadable"`; `TrackSiteOptions.siteId` admits `null` (runtime-checked before widening, per the plan's precondition: `trackSite` treats `null` exactly like `undefined`/omitted — owner-worklist.md records "Widening-5 precondition HOLDS"). `admin-dev-proxy.test.ts` drops the now-unused `@ts-expect-error`. Type-only proof: all four files SAME with both sides stripped.
- `fefefe41` (part 2, types and comments only): `project-ipc.ts` — `SiteRow.siteId` admits `null`; `classifySiteDir`'s return type spelled out inline (`site-dir-store.ts` doesn't export `SiteClassification`); `cliMode` typed `"source" | "compiled"`; `ProjectIpcDeps<TCtx = unknown>` for the opaque `openSiteServer`/`ctx` pass-through pair. `sites-mcp-registration.ts` — `AdminHttpResponse`'s data listener typed to take a `Buffer`, matching Electron's own declared type.
- `95206dd9` (`main.ts` + 4 wiring tests): every function gets parameter/return annotations; 6 local types (`CliMode`, `TovuServerHandle`, `RejectedDefault`, `OpenSite`, `SiteOpenCtx`, `SiteOpenOptions`); 5 reasoned `!`, 7 `(error as Error)`, 1 `as const`, 0 `any`, 0 `@ts-expect-error`. `main-preview-wiring`'s three deps-arrow regexes were updated to match `main.ts`'s new typed `(siteDir: string)` parameter — the one approved non-type token change (same wiring asserted).
- **Results** (owner-worklist.md, "O2 DONE"): strict tsc went from 82 errors to 0 (82→4 after the widenings in `38f2f65b`/`fefefe41` landed, then 4→0 with `main.ts` itself); the type-only proof came out SAME with 4 planted mutants failing; 17 test files' counts matched HEAD; complexity and coverage gates both passed. **The coverage gate's ~25-second runtime was flagged and then resolved**: agent `s16-tsconfig-closeout` found that `scripts/check-coverage.ts` creates a fresh temp dir per run (`mkdtempSync`), runs `node --test --experimental-test-coverage` for both passes (main process on bare `node`, renderer+contracts on `tsx`), merges the lcov, walks the filesystem for the denominator, and deletes the temp dir — nothing cached is read. A live run took 18s for about 920 tests, rc=0. The file counts differ from the 2026-09-12 baseline log (37/38 main-process files measured vs 33/34 then), which is itself evidence it measured the current tree, not a stale one. Main process measured 99.45% lines / 95.58% branches / 95.45% functions against floors of 96/90/90; complexity was 78 files at ≤9, 4 grandfathered, 0 new. The gate is legitimate.
- Full signature list and replay evidence: `ADS-memory/.local-artifacts/owner-worklist.md` ("O2 DONE" entry) and `ADS-memory/.local-artifacts/desktop-ts/ts-lanes/b8/` (`b8-phase2-handoff.md`, `edits*.txt`, `checks/`, `pre/`, `pre2/`).

### Phase 5 close-out, part 2 — found DONE, not open
The dispatch for this report described close-out part 2 as still in progress. Checking current HEAD found it already landed the same evening:
- `40476c5e` — comment-only sweep across `*.ts` files replacing stale `main.js` mentions (~100 of them) with `main.ts`, in present-tense descriptions of current behavior. Left alone: genuinely historical narration (a postmortem describing pre-rename behavior), Tovu-Runner's own unrelated compiled `dist/src/cli/main.js`, and an unrelated generic fixture string in `coverage-floors.test.ts`.
- `b4e47da7` — replaced `tsconfig.main.json`'s file-by-file `files` ratchet with glob coverage (`main.ts`, `bin/**/*.ts`, `scripts/**/*.ts`, `src/*.ts`, `src/speech/**/*.ts` — which also picks up `js-backslide-guard*.ts` and `check-js-backslide.ts`); deleted `tsconfig.main-pending.json` (confirmed nothing else referenced it: `package.json`'s `typecheck` script and the desktop CI workflow only ever named `tsconfig.main.json`). `npm run typecheck` reported green.
- `07e8f78b` — two more stale `main.js` mentions outside `.ts` files: `tsconfig.preload.json`'s header comment, `coverage-floors.json`'s `_comment_knownUnmeasured` string.

This is HEAD as of this report (`git log --oneline -1 -- apps/desktop` → `07e8f78b`).

### Still genuinely open (checked against current HEAD)
- **The `unknown`-type sweep** in `apps/desktop` (owner-worklist.md item 1.3), including the decision on whether to touch the deliberately-kept ones (7 reasoned `any`s in `sites-mcp-*`, 1 in `project-ipc`'s `IpcMainLike.handle`, 1 in the selftest-tracker test fake, and unreasoned test-file `!`s accepted per `c8f0d7af`/`46160781`) — no commits found.
- **Repackage + the packaged file-count proof**: `verify-package`'s `checkedCount` must be recorded before Phase 3 and be `>=` that after `npm run package` — needs a quiet tree (owner-deferred); not run.
- **The owner's app restart** (close the running app → `npm run desktop` → open one site → then any dev-stack daemon) and **the 5 toolbar checks from `40a5a4cd`** (arrows left + URL right; back/forward across admin↔site with pill and URL following; Reload keeps history; Cmd+[ / Cmd+]; History menu present, Help menu empty) — not done.
- **Card preview timing** (`PREVIEW_PAINT_SETTLE_MS=1200`, `PREVIEW_CAPTURE_DEBOUNCE_MS=1500`, both currently guesses) and **`minWidth`** on the site/admin `createWindow` — unowned, no commits found.
