HARD RULE (first): stop before ~250k tokens of context. If you get close, stop at a consistent point (no half-done row), list DONE rows and a REMAINING list in your report, and stop. Stopping early at a consistent point is always correct.

# Terra job, stage 01: delete dead Tovu code and Jini shims

READY. Self-contained. Background only: `development/refactor-patterns/move-to-jini/PLAN.md`.

## Why
The 2026-11-11 survey found Tovu files that nothing in production imports (DELETE) and thin files that only re-export a Jini package (JINI-SHIM). Deleting them first shrinks every later stage. Nothing in Jini changes.

## Repos
- Tovu clone: `/Users/la/Programming/tovu-terra-d1` (branch `design-d1`). Jini clone: `/Users/la/Programming/jini-terra-d1`. Work ONLY in these two. Never read-modify-write `/Users/la/Programming/Tovu` or `/Users/la/Programming/Jini` (the live trees); never run `npm run link:jini`, `npm install` or `pnpm install` yourself.
- BOOTSTRAP: `AI-Dev-Shop/AGENTS.md` is missing in these clones. That is expected: do not look for it, do not stop, proceed with this prompt.
- If this job edits Jini, the runner must give you `/Users/la/Programming/jini-terra-d1` as a writable directory; if it is read-only, stop and say so.

## Input
`development/refactor-patterns/move-to-jini/stage-01.files.tsv` (176 rows, header line first). Columns: path, loc, action, pkg, subpath, exists_now, feature, label, home, was, route. Skip header and any row whose path is under `__tests__/` or ends in `.test.ts(x)`. Rows whose survey text asks to inline, fold or relocate a file are NOT in this list (they are adapter-inline work in stage 02b); if a row's `home` still asks for that ("inline", "fold", "move ... to tests", or offers an alternative with "or"), mark it BLOCKED "adapter-inline: stage 02b" and do not touch it.

## What to do per row
Find importers first, every time (labels are from 2026-11-11 and may be stale):
```
STEM=<basename without its extension>
rg -n --glob '!**/node_modules/**' -e "['\"][^'\"]*/$STEM(\.(js|mjs|cjs|jsx|ts|tsx|mts|cts))?['\"]" apps development
```
This matches every quoted specifier that ends in the stem, with ANY extension or none: `from`, `export ... from`, `import()`, `require()`, `mock.module()`/`vi.mock()` and `new URL()` all show up. Tovu imports `.ts` paths directly in places (e.g. `apps/desktop` imports `"../../auto-update-controller.ts"`), so a search without `.ts`/`.tsx` misses live importers. If the basename is `index`, search for the folder instead (`STEM=<folder name>` and also `<folder>/index`).
Keep only hits that really resolve to this file (same folder path; `#src/x/y` = `apps/website/src/x/y`; admin `@/x` = `apps/admin/src/x`). A hit in `__tests__/` or a `.test.` file is a test importer; anything else is a prod importer.
Cross-check with the survey: if `home` or `label` says the file has callers ("1 prod caller", "2 callers", "Repoint ...") and your search found fewer, the search is wrong, not the survey: mark the row BLOCKED "importer count disagrees with survey" and do not delete.

A. action `DELETE`, label has NO backticked identifier (whole-file delete):
   - 0 prod importers: delete the file. Each test importer whose ONLY subject is this file: delete that test file. A test that also tests other files: remove only the `import` and the `test(...)`/`it(...)` blocks that use this file's names; if that is not clean (shared setup), mark BLOCKED.
   - Prod importers exist and the `home` column gives a repoint instruction (e.g. "Repoint 1 caller (WidgetPickerDialog.tsx:9) to `@jini-ai/ui/admin-widgets` Select"): apply exactly that instruction, then delete. If the importers differ from what `home` names, BLOCKED.
   - Prod importers exist and `home` gives no instruction: BLOCKED.
B. action `DELETE`, label names identifiers in backticks (partial delete, e.g. "DELETE `translateAssistantDockLabel`"): for each named identifier, `rg -n -w <name> apps`; if its only references are its own declaration and tests, delete the declaration (and those test cases); otherwise leave it and report it BLOCKED. Delete nothing else in the file.
C. action `T0:JINI-SHIM ...`: the file only re-exports from `@jini-ai/...`. For every importer (prod and test), replace the import specifier with the Jini specifier the shim re-exports from, keeping names (a shim `export { a as b } from "@jini-ai/x"` means the importer writes `import { a as b } from "@jini-ai/x"`). If the shim re-exports from several Jini specifiers, split the importer's import accordingly. If the shim also declares anything itself, BLOCKED. Then delete the shim.

Before deleting any file, `rg -n "<path without extension>" apps development package.json apps/*/vite.config.ts apps/*/package.json` for path-loaded uses (vite entries, `new URL(...)`, spawn paths, scripts). Any hit outside comments: BLOCKED.

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
- For every deleted file, the importer search above returns nothing.
- `npx eslint <every changed (not deleted) file>`.
- Run each changed test file once (single-file commands above).
## Cycle gate (run before and after; paste both outputs)
```
cd /Users/la/Programming/tovu-terra-d1
node development/refactor-patterns/move-to-jini/feature-cycles.mjs
node development/refactor-patterns/move-to-jini/feature-cycles.mjs --include-type
node development/refactor-patterns/move-to-jini/feature-cycles.mjs --app admin --include-type
```
The SCC sizes and mutual-pair counts after your change must be equal or smaller than before, in all three. If one grows, find the new edge with `--edges` and undo the import that made it.

Change summary for the coordinator's commit: `refactor(tovu): delete dead code and Jini re-export shims (move-to-jini stage 01)`.

## Report (your final message)
1. Per row/edge: DONE, BLOCKED (with the exact blocking `file:line` and import), or SKIPPED (why). Use the row's path as the key. Every BLOCKED/SKIPPED row also gets `waits_on:` = what must land first (`path:<tovu path>`, `stage:<NN>`, `owner:<Dn>`, or `design:<one line>`); the coordinator copies these into `development/refactor-patterns/move-to-jini/ledger.tsv`.
2. The gate outputs (before/after).
3. Changed, added and deleted paths per repo (you do not commit).
4. Anything surprising, in one line each. Do not paste diffs.
