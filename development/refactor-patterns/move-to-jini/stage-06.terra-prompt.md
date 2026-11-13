HARD RULE (first): stop before ~250k tokens of context. If you get close, stop at a consistent point (no half-moved row or edge), list DONE rows and a REMAINING list in your report, and stop. Stopping early at a consistent point is always correct.

# Terra job, stage 06: move Tovu files into Jini (http-kit, diagnostics, analytics, sidecar, db, search)

READY. Self-contained. Background only: `development/refactor-patterns/move-to-jini/PLAN.md` sections 4 and 5.

## Why
These files are generic (the 2026-11-11 survey labelled them MOVE): they belong in a Jini package, and Tovu keeps only the wiring. Jini half first (additive: new files and new exports only, nothing removed or renamed), Tovu half second (import from Jini, delete the copy). Every live Tovu build keeps working against the published Jini 0.7.x because nothing is removed from Jini.

## Repos
- Tovu clone: `/Users/la/Programming/tovu-terra-d1` (branch `design-d1`). Jini clone: `/Users/la/Programming/jini-terra-d1`. Work ONLY in these two. Never read-modify-write `/Users/la/Programming/Tovu` or `/Users/la/Programming/Jini` (the live trees); never run `npm run link:jini`, `npm install` or `pnpm install` yourself.
- BOOTSTRAP: `AI-Dev-Shop/AGENTS.md` is missing in these clones. That is expected: do not look for it, do not stop, proceed with this prompt.
- If this job edits Jini, the runner must give you `/Users/la/Programming/jini-terra-d1` as a writable directory; if it is read-only, stop and say so.

## Release rule (owner decision D1, default)
No npm publish, no version bump, no `changeset version`, no prerelease. Tovu consumes this Jini clone through `link:jini` (already set up by the coordinator) until one final lockstep 0.8.0 release in stage 16. Your release note is a changeset FILE only (Jini half, step 6).

## Preflight (stop and report if 1 or 2 fails)
1. `test -w /Users/la/Programming/jini-terra-d1/packages && test -d /Users/la/Programming/jini-terra-d1/node_modules && git -C /Users/la/Programming/jini-terra-d1 status --short` (note pre-existing changes; never touch them). No `node_modules` in the Jini clone = no Jini typecheck, tests or cycle check are possible: stop and report "Jini clone not installed" (the coordinator installs it; you never do).
2. Tovu `node_modules` must be the coordinator's APFS copy linked to this Jini clone, never the live tree:
```
cd /Users/la/Programming/tovu-terra-d1
test ! -L node_modules && echo "node_modules is a real folder"
python3 -c 'import os;print(os.path.realpath("node_modules/@jini-ai/core"))'   # must print /Users/la/Programming/jini-terra-d1/packages/core
```
   If `node_modules` is a symlink, or `@jini-ai/core` resolves into `/Users/la/Programming/Tovu` or `/Users/la/Programming/Jini`: do the Jini half only, skip the whole Tovu half, and report "Tovu half skipped: node_modules not linked to the Jini clone (PLAN.md 4.2)". Never fix it yourself.
3. Run the ratchet gate (below) and paste the output.

## Input
`development/refactor-patterns/move-to-jini/stage-06.files.tsv` (columns: path, loc, action, pkg, subpath, exists_now, feature, label, home, was, route). `home` is the survey's text: the destination and the host contract (what the host must supply). `was` (if set) is the survey path before an earlier stage moved the file (`successors.tsv`); if a one-line re-export shim is still at `was`, its importers are repointed too and the shim is deleted with the row. Scope: http-kit, diagnostics, analytics, sidecar, db, search.
Pre-check table (computed when this prompt was written; it is a HINT: re-check every row). "export -> entry file" = the `package.json` export key and the Jini source file behind it; the moved file goes in that entry's folder. Tests: `M` = only imports files of this stage (candidate to move to Jini), `[t.after->onTestFinished]` = convert that call (Jini half step 3), `S(...)` = stays in Tovu, repointed (reason in brackets). "prod importers" = non-test Tovu files to repoint. "pre-check" = imports or strings that block the move unless a port solves them; `API name(...)` = an export to convert or block (Public API shape); `own-pkg` = rewrite to the declaring leaf file; `console.*` = BLOCKED (Logging); `WAITS D2` = owner gate.

| # | path (loc) | pkg | export -> entry file | Tovu tests (M = may move, S = stays) | prod importers | pre-check |
|---|---|---|---|---|---|---|
| 1 | `apps/admin/src/features/observability/recent-errors-rules.ts` (236) | diagnostics | `.` -> `src/index.ts` | S(also api.ts) apps/admin/src/features/observability/__tests__/recent-errors-rules.unit.test.ts | 1: use-recent-server-errors.hooks.ts | type Tovu `@/lib/api` |
| 2 | `apps/website/src/contracts/core/strict-base64.ts` (33) | http-kit | `.` -> `src/index.ts` | M apps/website/src/contracts/core/__tests__/unit/strict-base64.unit.test.ts | 1: index.ts | API `decodeStrictBase64(value: string)` |
| 3 | `apps/website/src/features/agent-plugins/analytics-provider-registry.ts` (130) | analytics | `.` -> `src/index.ts` | S(also lifecycle.ts) apps/website/src/features/agent-plugins/__tests__/analytics-provider-registry.test.ts | 1: analytics-providers.ts | Tovu `./lifecycle.js`; Tovu string in code; own-pkg `@jini-ai/analytics`: import the declaring leaf file, never the entry; API `loadAnalyticsProviders(ctx: { readonly workspaceId: string }, required: { readonly )` |
| 4 | `apps/website/src/platform/db/kernel/checkpoint-stopped-wal.ts` (19) | db | `./sqlite` -> `src/sqlite/index.ts` | M [t.after->onTestFinished] apps/website/src/platform/db/kernel/__tests__/checkpoint-stopped-wal.unit.test.ts | 1: stopped-database.ts | clean |
| 5 | `apps/website/src/platform/db/kernel/sqlite-only.ts` (120) | db | `./kernel/sqlite` -> `src/kernel/sqlite/index.ts` | S(also apply-loop.ts,backstop-audit.ts,baseline-repo.ts) apps/website/src/features/publish-content/__tests__/backstop-batch.apply-loop.test.ts<br>S(also backstop-policy.ts,content-kernel.ts,index.ts) apps/website/src/features/publish-content/__tests__/raw-row-contributor.test.ts<br>S(also pglite.ts,sqlite.ts) apps/website/src/platform/db/kernel/__tests__/sqlite-only.test.ts<br>S(also backstop-ports.ts,content-database.generated.ts,content-kernel.ts) apps/website/src/platform/db/sqlite/__tests__/publish-backstop-row.sqlite.test.ts<br>S(also artifact-format.ts,baseline-repo.ts,bundle-staging.ts) apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/backstop-import-ui.routes.test.ts<br>S(also artifact-format.ts,baseline-repo.ts,bundle-staging.ts) apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/import.routes.pins.test.ts<br>S(also content-hash.ts,content-kernel.ts,entry-refs-repo.sqlite.ts) apps/website/src/server/runtime/composition/__tests__/publish-content-manifest.test.ts | 4: publish-backstop-row.sqlite.ts, index.ts, repo.sqlite.ts, publish-backstop-ports.ts | type Tovu `./port.js` |
| 6 | `apps/website/src/platform/db/kernel/stopped-database.ts` (52) | db | `./sqlite` -> `src/sqlite/index.ts` | none | 1: move-sites-home.ts | Tovu `./drivers/sqlite.js`; own-pkg `@jini-ai/db/sqlite`: import the declaring leaf file, never the entry |
| 7 | `apps/website/src/platform/db/repos/origin-repo.ts` (232) | http-kit | `./verified-origin` -> `src/verified-origin.ts` | S(also content-db.ts,dialect-matrix.ts,origin-repo.sqlite.ts) apps/website/src/features/origin/__tests__/repo.contract.test.ts | 1: origin-repo.sqlite.ts | npm `kysely` not in http-kit deps; type Tovu `../content-kernel.js`; type Tovu `../content-database.generated.js`; own-pkg `@jini-ai/http-kit/verified-origin`: import the declaring leaf file, never the entry; API `seedDevCapabilityOriginOn(kernel: ContentKernel, seed: { workspaceId: UUID; origin: Ve)` |
| 8 | `apps/website/src/platform/server-logs/console-tee.ts` (123) | diagnostics | `.` -> `src/index.ts` | S(also secret-redaction.ts) apps/website/src/platform/server-logs/__tests__/unit/console-tee.unit.test.ts | 5: desktop-agent-service.ts, tovu-server.ts, index.ts, local-admin-bundle.ts, daemon-supervisor.ts | clean |
| 9 | `apps/website/src/platform/server-logs/log-buffer.ts` (137) | diagnostics | `.` -> `src/index.ts` | S(also secret-redaction.ts) apps/website/src/platform/server-logs/__tests__/unit/console-tee.unit.test.ts<br>S(mock) apps/website/src/platform/server-logs/__tests__/unit/log-buffer.unit.test.ts<br>S(also index.ts) apps/website/src/platform/server-logs/__tests__/unit/log-file.unit.test.ts | 3: console-tee.ts, index.ts, log-file.ts | clean |
| 10 | `apps/website/src/platform/server-logs/log-file.ts` (152) | diagnostics | `.` -> `src/index.ts` | S(also index.ts) apps/website/src/platform/server-logs/__tests__/unit/log-file.unit.test.ts | 1: index.ts | clean |
| 11 | `apps/website/src/server/inbound/admin-http/range.ts` (105) | http-kit | `.` -> `src/index.ts` | M apps/website/src/server/http/__tests__/range.test.ts | 3: get-chat-attachment.ts, original.ts, media-rendition.ts | clean |
| 12 | `apps/website/src/server/runtime/boot/parent-watchdog.ts` (193) | sidecar | `.` -> `src/index.ts` | M apps/website/src/server/runtime/boot/__tests__/parent-watchdog.unit.test.ts | 1: index.ts | Tovu string in code |
| 13 | `apps/website/src/server/runtime/composition/telemetry-consent.ts` (42) | analytics | `./product` -> `src/product/index.ts` | S(also app.ts,browser-analytics.ts,isolated-catalog-home.ts) apps/website/src/server/runtime/composition/__tests__/browser-analytics.unit.test.ts<br>M apps/website/src/server/runtime/composition/__tests__/telemetry-consent.unit.test.ts | 3: browser-analytics-http.ts, browser-analytics.ts, deps.ts | own-pkg `@jini-ai/analytics/product`: import the declaring leaf file, never the entry |

## Label check (per row, first; mechanical)
Read the file. The row's `home`/`label` text must still describe it: every host contract the text names is still how the file gets that thing, and the file has not grown new Tovu imports or Tovu-specific exports since the survey. If the text no longer fits (the file was split, merged, or now does something the text does not mention), the row is BLOCKED "label stale: <one line>". Do not re-label it yourself.

## READY check (per row, before editing it; mechanical)
A row is READY only if ALL hold; otherwise mark it BLOCKED with the reason and do not touch it:
1. The file exists at the listed path.
2. Every import in the file is one of: an npm package that is already in the TARGET Jini package's `package.json` `dependencies` or `peerDependencies`; `@jini-ai/core` (any subpath); the target package itself (becomes a relative import); `node:*`; another file in this stage's READY set for the same package (moves with it); or a type that the row's `home` column names as a host contract (becomes a port, see "Ports").
   BLOCKED triggers: a `#src/...` or relative import of a Tovu file outside that set; a VALUE import from any other `@jini-ai/<pkg>`; `express` or any `express` type; `react` when the destination folder is not a `react/` folder; `apps/desktop` Electron imports; a direct `console.*` call (see "Logging in moved code"); a destination covered by the D2 gate (WAITING, not BLOCKED).
3. The destination subpath `"./<subpath>"` exists in `/Users/la/Programming/jini-terra-d1/packages/<pkg>/package.json` `exports` (empty subpath means the package root `"."`). A missing subpath is BLOCKED (new subpaths are an Opus decision).
4. No file with the same basename already exists in the destination folder.
5. The file has no string that only makes sense in Tovu (the word `Tovu`, `tovu`, a Tovu route like `/api/admin/v1`, a Tovu env var `TOVU_*`) outside comments. In comments, drop Tovu SPEC/ADR/U/D IDs and the word Tovu by rewording minimally ("the host"); if the sentence cannot survive that, BLOCKED.

6. Destination: the folder of the row's entry file (table column), e.g. entry `src/sqlite/index.ts` -> `packages/db/src/sqlite/<basename>`. If `home` names a different EXISTING export of the same package, use that one. If `home` asks for a new subpath or a new file name, keep the original basename and use the closest existing export only if the `home` text names it; otherwise BLOCKED "needs new subpath".

## Ports (only when the row's `home` column names a host contract)
Declare the port in the moved Jini file, typed structurally with only the members the code uses, with a doc comment naming who fulfils it:
```ts
/** <What it does>. Typically fulfilled by the host's composition root. */
export interface <Name>Port { <members copied from the Tovu dependency's used members> }
```
Add it to the function's existing `required` object as `<name>: <Name>Port` (no default value). In Tovu, pass the existing implementation at every call site (`rg` the function name). If the call sites are more than 5 or the implementation needs new wiring in `server/runtime/composition/*`, the row is BLOCKED instead.

## Owner gate D2 (persistent; applies to every row, symbol and fallback in this job)
Owner decision D2 (may `@jini-ai/core` hold runtime helpers outside `core/contracts/`?) is OPEN; its default is WAIT. Until the coordinator replaces this block with the owner's answer:
- A row or symbol whose destination is `@jini-ai/core` outside a `contracts` subpath, or whose survey text names core as its home for runtime code, WAITS: do not move it, do not split it, and do NOT choose another package for it (not "the nearest domain package", not a new package). Report it as WAITING with `waits_on: owner:D2`.
- Not affected: types and interfaces under `@jini-ai/core/contracts/*`, and IMPORTING an existing `@jini-ai/core` export.

## Logging in moved code
A moved file (or symbol) that calls `console.error|warn|log|info|debug` is BLOCKED here ("needs a log port": stage 12). Stage 12 replaces the call with an injected reporting port in the function's `required` object, e.g. `report: (required: { label: string; error: unknown }, optional?: Record<string, never>) => void`, documented "the host binds this to its redacting logger"; Jini code never falls back to `console`. Before changing that behaviour, a Tovu test pins today's logged output through the host binding (redaction included) and must stay green after.

## Public API shape (every exported function a row moves into Jini)
Jini's public functions take `(required: {...}, optional: {...} = {})`. The pre-check column lists each exported function of the row that does not (`API name(params)`); check the rest yourself. For each one:
- Convert it ONLY when all hold: at most 3 parameters; every caller (Tovu and Jini, tests included: `rg -n -w <name> apps /Users/la/Programming/jini-terra-d1/packages`) calls it directly as `name(...)` (never passed as a value, spread, `.call`/`.apply`, or re-exported under another name); at most 10 call sites; it is not a protocol hook called by a framework (Node loader `resolve`/`load`/`initialize`, a React component or `use*` hook).
- Mapping (mechanical): required parameters become fields of `required` with the SAME names (`decodeStrictBase64(value: string)` -> `decodeStrictBase64(required: { value: string }, _optional: Record<string, never> = {})`); optional or defaulted parameters become fields of `optional` with their defaults kept (`optional: { limit?: number } = {}` then `const { limit = 50 } = optional`). Rewrite EVERY call site (`decodeStrictBase64(x)` -> `decodeStrictBase64({ value: x })`). Update `@param x` doc lines to `@param required.x`; keep the rest of the doc comment.
- Any condition fails: the row is BLOCKED "API shape: <name>" (stage 12 decides the mapping). Never publish a positional export.

## Imports of the target package itself
Rewrite each `@jini-ai/<pkg>/<subpath>` (or `@jini-ai/<pkg>`) import of a moved file to a relative path to the file that DECLARES the imported name: open the subpath's entry file, follow its `export ... from` lines to the declaring file (at most 3 hops), and import that file. Never import an `index.ts`, `entry.ts` or any file whose only job is re-exporting, and never the entry file you are about to add this file to. If a name is declared in the entry file itself, the row is BLOCKED "own-entry import" (moving that declaration to a leaf is an Opus decision).

## Jini half (per READY row; group the work by package)
0. Per touched package, BEFORE the first edit: `python3 /Users/la/Programming/tovu-terra-d1/development/refactor-patterns/move-to-jini/jini-cycles.py <pkg> > /Users/la/Programming/tovu-terra-d1/development/refactor-patterns/move-to-jini/.cycles-<pkg>-before.txt`.
1. Copy the file to `/Users/la/Programming/jini-terra-d1/packages/<pkg>/<dest folder>/<basename>` (same name; no `git mv` across repos). Rewrite its imports: the target package's own subpaths -> relative paths to the DECLARING leaf file (see "Imports of the target package itself"; never the entry file); files of this stage that move with it -> relative paths; host-contract types -> the port declared in the file (Ports). Apply "Public API shape" to its exports. Keep every comment; drop Tovu SPEC/ADR/U/D IDs and the word Tovu from comments by minimal rewording ("the host").
2. Export it from the entry file: add `export * from './<basename>.js';` (or `export { a, b } from` / `export type { ... } from` when the entry uses named lists). If a name collides with an existing export of that entry, BLOCKED "name clash: <name>".
3. Tests. Each `M` test: copy to `<dest folder>/__tests__/<test basename>` in Jini and convert `node:test` to vitest. The conversion is exactly this and nothing else:
   - imports: `import { describe, it, test, beforeEach, afterEach, beforeAll, afterAll, onTestFinished } from 'vitest'` (only the names used); top-level/`describe`-level `before` -> `beforeAll`, `after` -> `afterAll`, `beforeEach`/`afterEach` unchanged; keep `node:assert/strict` as is; repoint the subject import to the relative Jini path.
   - test context: vitest passes no node:test context. `t.after(fn)` inside a test -> `onTestFinished(fn)` (same timing: after that test, pass or fail), and drop the now-unused `t` parameter. ANY other context use (`t.mock`, `t.skip`, `t.todo`, `t.plan`, `t.test`, `t.diagnostic`, `t.signal`, `t.name`, `t.before*`, `t.afterEach`) or a node:test options object (`test(name, { skip | only | todo | timeout | concurrency }, fn)`) = the test STAYS in Tovu (table `S(...)`; re-check, the table is a hint).
   - after converting, `grep -nE "\bt\.|node:test" <jini test>` must print nothing.
   A test that uses `mock`/`t.mock` from `node:test`, Tovu fixtures or helpers, or files outside this stage stays in Tovu (Tovu half, step 3). If the moved file ends up with no test in Jini, report it as `NO-JINI-TEST` (the package has a 100% coverage gate; the coordinator's cloud run measures it).
4. Per moved test: `cd /Users/la/Programming/jini-terra-d1 && pnpm --filter @jini-ai/<pkg> exec vitest run <test path relative to the package> --maxWorkers=2`.
5. Per touched package: `pnpm --filter @jini-ai/<pkg> exec tsc -p tsconfig.json --noEmit`, then the module-cycle ratchet `python3 /Users/la/Programming/tovu-terra-d1/development/refactor-patterns/move-to-jini/jini-cycles.py <pkg> --baseline /Users/la/Programming/tovu-terra-d1/development/refactor-patterns/move-to-jini/.cycles-<pkg>-before.txt` (exit 1 = the move made a Jini import cycle the Tovu gates cannot see: fix the import to a leaf file or undo that row), then build it so the linked Tovu sees the new exports: `pnpm --filter @jini-ai/<pkg> run build`. `npx eslint <new Jini files>` from `/Users/la/Programming/jini-terra-d1`.
6. Release note: write `/Users/la/Programming/jini-terra-d1/.changeset/move-to-jini-stage-06.md`:
```
---
"@jini-ai/<pkg>": minor
---
New exports (moved from a host application, additive, nothing removed): `@jini-ai/<pkg>/<subpath>` `<name>`, `<name>`; ...
```
   One front-matter line per touched package. No host-app names in it.

## Tovu half (only if Preflight 2 passed; per row whose Jini half is DONE)
1. Repoint every importer (table column; re-find with `rg -n -e "['\"][^'\"]*/<stem>(\.(js|mjs|cjs|jsx|ts|tsx|mts|cts))?['\"]" apps development` (any extension: Tovu imports `.ts` paths directly), and the same for the `was` stem if set; keep hits that resolve to the file): same imported names (call sites rewritten if "Public API shape" converted the function), specifier `@jini-ai/<pkg>/<subpath>` (or `@jini-ai/<pkg>` for the root export); `import type` stays `import type`. `#src/...` re-export barrels that listed the file: re-export from Jini instead only if other files use the barrel name; otherwise drop the line.
2. Port rows: pass the existing Tovu implementation at each call site (at most 5 call sites, no new composition wiring; otherwise undo the Jini half for that row and mark it BLOCKED).
3. Tests: delete the Tovu copies of tests you moved; repoint `S` tests to the Jini import and run each once (single-file command).
4. Delete the Tovu file. Confirm `rg -n "<path without extension>" apps development package.json` has no hit outside comments (path-loaded uses: vite entries, spawn paths, scripts); a hit means undo the delete and mark BLOCKED.
5. `npx eslint <changed Tovu files>`; ratchet gate after.
6. Put this trailer in the Tovu change summary: `Jini-Base: <git -C /Users/la/Programming/jini-terra-d1 rev-parse HEAD>` (the Jini commit the coordinator makes from your Jini half; if not committed yet, write `Jini-Base: pending (stage 06 Jini half)`).

## Ratchet gate (stage 04 has landed: every count must be 0; run before and after, paste both)
```
cd /Users/la/Programming/tovu-terra-d1
node development/refactor-patterns/move-to-jini/feature-cycles.mjs --include-type --max-scc 0 --max-pairs 0
node development/refactor-patterns/move-to-jini/feature-cycles.mjs --app admin --include-type --max-scc 0 --max-pairs 0
```
Exit code 1 = you added a feature cycle. Find it with `--edges` and undo the import that made it (moved code must not import back up into a Tovu feature).

## Rules for every edit
- Keep every comment. A comment that explains WHY moves with the code it explains; never delete one to make a move fit. Do not add new comments except the doc comments this prompt asks for.
- No new `as any`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable`, non-null `!`, no lazy `await import()`.
- Do not change behaviour, error text, signatures or argument order unless this prompt says so. Functions keep the `(required, optional = {})` shape they have.
- Never `git add -A`, `git stash`, `git checkout -- <file>` or `git reset`. Other agents may share the tree.
- Run NO test suites and no repo-wide `tsc`. Allowed checks, one file at a time:
  - Tovu website/assistant/server test: `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --test-concurrency=1 --experimental-test-module-mocks <one test file>`
  - Tovu admin test: `cd apps/admin && npx vitest run <one test file> --maxWorkers=2`
  - Jini test: `cd /Users/la/Programming/jini-terra-d1 && pnpm --filter @jini-ai/<pkg> exec vitest run <one test file> --maxWorkers=2`
  - Jini typecheck of a package you touched: `cd /Users/la/Programming/jini-terra-d1 && pnpm --filter @jini-ai/<pkg> exec tsc -p tsconfig.json --noEmit`
  - Lint: `npx eslint <changed files>` (no new errors).
  Single-file tests only: never run a whole suite, a glob or a directory. Leave nothing running (no watchers, servers or background jobs); if a command hangs past 5 minutes, kill only the process you started.
- Do NOT commit and do NOT push, in either repo: the coordinator reviews and commits. Your report lists every changed, added and deleted path per repo.

## Done check
- Every DONE row: the Tovu file is gone, `rg` finds no importer of its old path, the Jini file exists and is exported, the package typechecks and builds.
- Every BLOCKED row: untouched in both repos.
- The ratchet gate still exits 0.

Change summaries for the coordinator's commits: Jini `feat(<pkgs>): add exports moved from the host app (move-to-jini stage 06)`; Tovu `refactor(tovu): import moved code from Jini (move-to-jini stage 06)` with the `Jini-Base:` trailer.

## Report (your final message)
1. Per row/edge: DONE, BLOCKED (with the exact blocking `file:line` and import), WAITING, or SKIPPED (why). Use the row's `was` path if set, else its path, as the key. Every row that is not DONE also gets `waits_on:` = what must land first: `path:<tovu path>` (a file that must be gone), `stage:<id>` (e.g. `stage:15-cms`), `owner:<Dn>`, or `design:<one line>`. The coordinator copies these into `development/refactor-patterns/move-to-jini/ledger.tsv`; rows come back automatically when their dependency lands (`stage-lists.mjs --retry`).
   Every file or symbol you moved or renamed: one line `SUCCESSOR <old path>[#symbol] -> <new path or @jini-ai specifier>[#symbol]` (the coordinator copies them into `successors.tsv` so later stage lists follow the code).
2. The gate outputs (before/after).
3. Changed, added and deleted paths per repo (you do not commit).
4. Anything surprising, in one line each. Do not paste diffs.
5. Per DONE row: the Jini path, the export key, tests moved / stayed / NO-JINI-TEST.
