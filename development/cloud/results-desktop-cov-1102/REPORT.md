# Desktop coverage investigation — 2026-11-02 (read + measure only)

Branch `cloud/desktop-coverage-1102`, made from `cloud/verify-1102` @ `df9f875`. Jini `main` @ `8a4794c` (0.6.17), linked in with `link:jini`. Node 24.22.2. Nothing in product or test code was changed.

## The short version (numbers first)

| | line % | branch % | funcs % |
|---|---|---|---|
| What the gate measures now (3 areas, 160 files) | **96.28** | **99.32** | **93.70** |
| Same, plus `main.ts` | 92.33 | 99.15 | 90.86 |
| Plus `main.ts`, all renderer `.tsx`, both preloads | 92.91 | 99.06 | 91.58 |
| Gate result today | **FAIL**: "src main-process" line 94.55% is under its 96% floor | | |

What this means:

1. **You are right that the numbers mislead, but in more ways than the pre-read said, and one of its claims is backwards.** The 99% branch figure is the *least* honest number here, not the most. Node only counts the branches inside functions that actually ran. `main.ts` has 68 functions and about 143 decision points, yet the lcov lists just **11 branches** for it.
2. **Today's gate failure comes from the measurement, not from missing tests.** When the full suite's coverage is merged, the line counts for 8 files get corrupted. Run alone, those same files score about 100%. With the isolated numbers swapped in, the main-process area is **99.86%, not 94.55%**.
3. **`main.ts` is the real hole.** It is 2,041 lines (1,010 of them code), it calls **0 of its 68 functions** under test, and it counts toward no floor. It imports 53 local modules. That code shape is the root cause: work happens at import time, and Electron and `process.env` are called directly.
4. Two tests failed. Neither failure is a desktop bug: Tovu's website code needs `@jini-ai/agentic/core/handle`, which only exists in the unpublished 0.6.18 (see "Setup problems").

## 1. The coverage run

- Command: the real gate (`scripts/check-coverage.ts`, which is what `npm run gates` runs for coverage), started through a small wrapper (`raw/run-cov.ts`). The wrapper only copies each pass's lcov out before the gate deletes its temp folder.
- Full output: `raw/coverage-gate-output.txt` (exit 1). The test failures are listed in full in `raw/node-pass-spec-output.txt` (1,892 tests: 1,880 pass, 2 fail, 10 skipped).
- lcov files: `raw/node.lcov` (node pass) and `raw/tsx.lcov` (renderer/contracts pass).
- Per-file table (lines, branches and functions, sorted by uncovered branches): `raw/per-file-coverage.md`.

Gate's own area output:

| area | line | branch | funcs | floor (L/B/F) | result |
|---|---|---|---|---|---|
| src main-process (99 files) | 94.55 | 99.36 | 93.01 | 96/90/90 | FAIL (line) |
| src renderer+contracts (59 files) | 99.91 | 99.03 | 94.31 | 76/88/66 | OK |
| bin (2 files) | 100 | 100 | 100 | 85/80/62 | OK |

## 2. Checking the pre-read claims

| claim | verdict | what the real lcov shows |
|---|---|---|
| `main.ts` (2,040 lines) is in NO coverage area | **CONFIRMED** | It *is* loaded into the lcov (via `coverageInclude`), but no area's directories cover the repo root, so no floor applies. In the lcov: 0/68 funcs, 1/11 branches, and "880/2040 lines", which are imports, comments and top-level declarations. |
| renderer `.tsx` (3,447 lines) is outside every denominator | **CONFIRMED, but the reason given is stale** | 10 files, 3,457 lines, and the renderer area only counts `.ts`. However, 9 of the 10 *are* loaded and measured at 95–100% branch. Only `main.tsx` (the bootstrap entry) is never loaded. The gate's own "wiring tests read source text" note is out of date. |
| `preload.mts` is outside every denominator | **CONFIRMED, reason stale** | Outside the denominator (the area excludes `src/preload`). But it *is* measured: 100% lines, branches and funcs. The gate text "nothing imports it" is out of date. |
| 4 paused agent/chat files (755 lines) are outside every denominator | **REFUTED** | They are inside the main-process denominator and measured at 100% / 99–100% / 100%. The gate itself prints "NOW COVERED, remove from knownUnmeasured". |
| floors are per-area, not per-file | **CONFIRMED** | 9 files sit below 96% branch inside areas that read 99%. |
| Node line % counts comments and blanks as covered | **CONFIRMED, but small effect on the totals** | 13,391 of the 31,060 lcov lines are comments or blanks, and 12,553 of them are marked covered. Code-only line % for the areas is 96.78 versus 96.28 reported: comments inside functions that never ran count *against* you, so the two effects partly cancel. It matters per file: `main.ts` reads "43%" while running none of its functions. |
| branch % is the honest number | **REFUTED** | V8 does not report branches inside functions that never ran. `main.ts`: 68 funcs and ~143 decision points, but 11 branches reported. Funcs % is the number that shows untested code. |
| 17 tests read source as TEXT | **UNDERSTATED** | 29 test files read `main.ts` as text on their own. Counting all source files, 81 test files read one as text without importing it (`raw/source-as-text-tests.txt`; a heuristic, so treat it as an upper bound). |
| ~20 tests run cut-out code via `new Function`, giving the real file 0 | **CONFIRMED** | 17 files, 29 call sites. For `main.ts` the real file gets 0 functions covered. Renderer files are also covered through real imports elsewhere. |
| `knownUnmeasured` lists stale `preload-speech.cjs` while `preload-speech.cts` isn't counted | **CONFIRMED** | `src/speech/preload-speech.cjs` no longer exists, and the gate does not flag the stale entry. `preload-speech.cts` (75 lines) is in no area (the extensions are `.ts` and `.cjs`) and is never loaded by any test. |

### New things the pre-read missed

- **A. The full-suite lcov is corrupted for 8 files.** Each one has duplicate function records (one called, one at 0), and its line count drops. Isolated reruns (`raw/isolated-*.lcov`) compare like this:

  | file | full suite lines | isolated lines |
  |---|---|---|
  | `tovu-server.ts` | 65% | 99.8% |
  | `tracked-sites.ts` | 76% | 100% |
  | `shared-sites.ts` | 36% | 100% |
  | `site-dir-store.ts` | 73% | 100% |
  | `site-config.ts` | 70% | 100% |
  | `durable-json-file.ts` | 62.5% | 100% |

  The likely cause is that some test loads these files a second way (a child process or a different loader), and Node merges the two copies badly. **This alone accounts for the main-process FAIL.** Fixing it is a measurement fix, not a test-writing job.
- **B.** The gate keeps whichever pass's copy of a file is "better" instead of combining the two passes. It does not change much today, but it is not a true union.
- **C.** `src/renderer/app-render-harness.ts` is test scaffolding (0/37 of its own fake callbacks run), yet it counts as product code in the renderer denominator.

## 3. Top 10 files by uncovered branches

(Lines are `file:line`. "Why hard" is the honest reason, and for most of them it is "not hard, just not written".)

1. **`main.ts:286-289` (10 uncovered, plus every branch inside its 67 functions that never ran)**
   ```ts
   app.setPath("userData", process.env.TOVU_DESKTOP_USER_DATA_DIR?.trim() ? path.resolve(...) : DESKTOP_ROOTS.userDataDir);
   if (process.env.TOVU_DESKTOP_USER_DATA_DIR?.trim()) process.env.TOVU_DESKTOP_USER_DATA_DIR = app.getPath("userData");
   ```
   Why hard: this runs **at import time**, with Electron `app` and `process.env` called directly. The same override is decided again at lines 352 and 925. Singletons (`sharedSites` at line 351, the abort controllers) are created at load, so a test can only reach this by faking all of Electron before import.
2. **`src/owner-store-cli.ts:60-115` (5)**: the `warn` callback and the `stdout`/`stderr`/`stdin` `'error'` handlers on a spawned child. Why hard: **child_process** stream errors, though `spawnFn` is already injectable, so it only needs a fake child that emits `error`.
3. **`src/renderer/SharedKeys.hooks.ts:11-33` (5)**: `messages[code] ?? FAILED`, `imported === 1 ? '' : 's'` and `_options = {}` defaults. Why hard: not hard; these are pure functions with missing cases.
4. **`src/renderer/app-render-harness.ts:7,23,102` (4)**: test harness code (`.css` resolve hook, fake settings). It should not be in the denominator.
5. **`src/renderer/ResourcesPanel.tsx:18,134` (4)**: `{ unitGap = '' } = {}` and `_options = {}` default-parameter branches, plus null RSS. Why hard: not hard; they are pure formatters.
6. **`src/update-check-now.ts:80-102` (3)**: the untyped switch fallthrough and `error instanceof Error ? … : String(error)`. Why hard: defensive code for inputs the types forbid, so a test has to pass bad data on purpose.
7. **`src/product-telemetry.ts:26,84` (3)**: `catch { warn(... unavailable) }` around native crash reporting, and `code === null ? {} : { code }`. Why hard: the crash reporter is native Electron code, so failure needs an injected throwing reporter.
8. **`src/tovu-server.ts:668,991` (2, plus the corrupted line data above)**: the Windows `taskkill` path (`if (command === null) throw`) and the `if (!finish()) return` race. Why hard: **platform-specific** process killing and **timer/race** ordering.
9. **`src/renderer/SharedKeys.tsx:16,35` (2)**: `onClick={() => setOpen(true)}` and `dialog.current!.showModal()`. Why hard: jsdom has no `HTMLDialogElement.showModal`, so it needs a DOM stub.
10. **`src/site-directory-identity.ts:52,73` (2)**: `if (meta.siteId !== id) return;` and `if (fs.existsSync(targetDir)) throw`. Why hard: real **fs** state (a marker rewritten mid-operation, a pre-existing target), though temp folders make both reachable.

Files the branch ranking hides, because their functions never ran or their records are corrupted: `shared-sites.ts`, `site-dir-store.ts`, `tracked-sites.ts` and `tovu-server.ts` (artifact A above).

## 4. How the modules connect

```
bin/tovu-desktop.ts, bin/mcp-bridge.ts ──► src/* (pure-ish modules)
                                              ▲
main.ts (2,041 lines, 0/68 funcs tested) ─────┘ imports 53 local modules
  │  (51 from src/*, 1 from src/speech, 1 from src/renderer/visible-interval.ts)
  │  + electron (app, BrowserWindow, ipcMain, dialog, shell, Menu, net, session, screen, crashReporter)
  │  + @jini-ai/agent-runtime, @jini-ai/desktop-host
  ▼
src/project-ipc.ts (fan-out 14) ─► tracked-sites, site-dir-store, shared-sites, durable-json-file
src/tovu-server.ts  ◄─ imported by 8 modules (CLI spawn plans, env building)
src/tracked-sites.ts ◄─ 10   src/durable-json-file.ts ◄─ 9   src/site-dir-store.ts ◄─ 9

renderer (separate world): src/renderer/main.tsx ─► App.tsx ─► *.hooks.ts ─► src/contracts/*
preload: src/preload/preload.mts (contextBridge), src/speech/preload-speech.cts
```

- **Cycles: none.** Tarjan's algorithm finds no strongly-connected group of more than one file (`raw/import-graph.txt`).
- **Where the logic lives:** most of it is already in `src/*` modules: 18,685 lines, at about 95–100% when measured correctly. `main.ts` holds 1,010 code lines with ~143 decision points, 10 top-level `ipcMain`/`app.on` registrations and 20 `process.env` reads. Those decisions are the untested part. They are "tested" today by 29 files that read `main.ts` as text, plus 17 files that run cut-out pieces through `new Function`. Those tests check that the text is present, not that it behaves correctly.

## 5. What it would take to reach 96% branch per file

**Today, without moving anything:**
- 9 measured files are under 96% branch, about 30 missing branches in total. That is roughly **20–30 small tests**, mostly easy: pure formatters, fake child-process errors, temp-dir fs cases.
- Add the `.tsx` files and preloads to the denominator and 3 more files fall below 96%, about **6–10 more tests** (they are already loaded, just not counted).
- **`main.ts` as it is:** a test would have to `mock.module("electron")` with ~10 APIs and re-import the module fresh for every scenario, because work runs at import and singletons are created on load. Estimate: **one large Electron fake plus ~150–200 tests**, and those tests would break whenever the wiring order changes. I don't recommend it.

**After moving `main.ts` decisions into small pure modules with injected inputs and outputs:**
- ~143 decision points move into maybe 10–15 modules. That is about **80–120 small tests**: one or two per branch, plain function calls, no Electron.
- `main.ts` shrinks to a ~300–400 line wiring shell (create window, register handlers, pass in `app`/`process.env`). Excluding that shell is legitimate, as long as it holds no `if` beyond "call the decided thing" and one smoke/E2E launch covers it.
- **The precondition: fix the measurement first** (artifact A), or every new test fights a fake 94% number.

One before/after, using the userData override that `main.ts` decides 4 times (lines 286, 289, 352, 925):

```ts
// BEFORE — main.ts, runs at import, untestable without faking Electron
app.setPath("userData", process.env.TOVU_DESKTOP_USER_DATA_DIR?.trim()
  ? path.resolve(process.env.TOVU_DESKTOP_USER_DATA_DIR.trim()) : DESKTOP_ROOTS.userDataDir);
if (process.env.TOVU_DESKTOP_USER_DATA_DIR?.trim()) process.env.TOVU_DESKTOP_USER_DATA_DIR = app.getPath("userData");
// ...line 352: appDataDir: process.env.TOVU_DESKTOP_USER_DATA_DIR?.trim() ? app.getPath("userData") : undefined
// ...line 925: if (process.env.TOVU_DESKTOP_USER_DATA_DIR !== undefined) return;

// AFTER — src/user-data-override.ts (pure, decided once)
export function decideUserData({ env, defaultDir }: { env: Record<string, string | undefined>; defaultDir: string }) {
  const raw = env.TOVU_DESKTOP_USER_DATA_DIR?.trim();
  const dir = raw ? path.resolve(raw) : defaultDir;
  return { dir, overridden: Boolean(raw), childEnv: raw ? { TOVU_DESKTOP_USER_DATA_DIR: dir } : {} };
}
// test: decideUserData({ env: {}, defaultDir: "/d" }) → { dir: "/d", overridden: false, childEnv: {} }
// test: decideUserData({ env: { TOVU_DESKTOP_USER_DATA_DIR: " rel " }, defaultDir: "/d" }) → overridden, absolute dir

// main.ts — thin shell, no decisions
const userData = decideUserData({ env: process.env, defaultDir: DESKTOP_ROOTS.userDataDir });
app.setPath("userData", userData.dir); Object.assign(process.env, userData.childEnv);
// lines 352/925 read userData.overridden instead of re-parsing process.env
```

### Which exclusions are legitimate and which are cheating

- **Legitimate:** a true wiring shell (`main.ts` *after* the decisions are moved out), `src/renderer/main.tsx` (the 27-line render bootstrap), `.d.ts` files, `dist/`, `*.test.ts`, and preload files that are pure `contextBridge.exposeInMainWorld` one-liners.
- **Not legitimate, the way things are today:**
  - `main.ts` as it stands: 143 decisions excluded and "tested" by reading the text.
  - The 9 `.tsx` components: they are already measured, and excluding them just hides 6 branches.
  - `preload-speech.cts`: real logic, never loaded.
  - The stale `.cjs` entry in `knownUnmeasured`.
  - Counting `app-render-harness.ts` as product code: the reverse problem, test code padding the denominator.

## Setup problems (environment, not desktop)

- Root `npm ci` fails with `ETARGET`: root `package.json` asks for `@jini-ai/agentic ^0.6.18`, which isn't published, and Jini main is 0.6.17. To install, I edited that one line to `^0.6.17` with `sed`, ran `npm ci`, then **edited it back right away with `sed`** (no git commands). `git status` stayed clean.
- That same version gap causes the 2 test failures (`site-dir-store.test.ts:538` and the `initSiteDir` real-CLI test). The website imports `@jini-ai/agentic/core/handle`, and Jini main doesn't export it yet. Their file, `site-dir-store.ts`, still measures 100% lines when run alone.
- The Playwright pin was symlinked as instructed (`chromium_headless_shell-1228 → -1243`). No Playwright test was part of this coverage run.

## Files in `raw/`

`coverage-gate-output.txt`, `coverage-gate-exit.txt`, `node.lcov`, `tsx.lcov`, `per-file-coverage.md`, `node-pass-spec-output.txt`, `whatif-output.txt`, `lf-vs-wc.txt`, `isolated-tracked-shared.lcov`, `isolated-six.lcov`, `isolated-six-output.txt`, `source-as-text-tests.txt`, `import-graph.txt`, plus the scripts that produced them (`run-cov.ts`, `table.py`, `whatif.py`).
