# Handoff: adminthemes-67 (admin themes steps 1-3 checker) — stopped at 250k context

## Done
1. Baseline: 18 screens (12 desktop @1244 viewport, new-user form, pages row menu, chat dock, 3 phone @390 via same-origin iframe) — screenshots + full computed-style JSON (every visible element, 34 props, pseudo-elements, all root custom properties, loaded fonts, sheet order) in SCRATCH/baseline/.
2. Codex build-r1 (steps 1-3) ran OK. Jini ui + admin dist rebuilt (lock). :3000 serves 200.
3. After capture (SCRATCH/after/*.json, SCRATCH/after-shots/*.jpg): all colours/borders/radii/shadows/fonts identical on every element of all 18 screens; root vars 0 changed/removed, 66 added. Leftover diffs = sub-pixel geometry from the Chrome window moving to a DPR-1 external display mid-run (proven: SCRATCH/envcheck/ same code re-captured shows the same diffs), themes-card animated gradient angle, a stale hover (opacity .88) in baseline 07.
4. Token move verified textually: light :root 74 decls + dark 40 decls moved verbatim, order preserved; no other blocks changed.
5. Codex fix1 updated 4 admin tests to read the classic theme; 35 admin CSS test files: 548 passed / 2 skipped. Jini: ui src/theme/__tests__ (6 files, 16 passed), admin integration-entries (4 passed), scripts check-package-layers (71 passed).
6. COMMITTED Tovu e95aa70bd (styles.css, assistant.css, admin-themes/classic/*, 4 tests, ADR-069, token contract, ADR-INDEX).

## Remaining (numbered)
1. Jini half is UNCOMMITTED (branch general-work): packages/ui/src/styles/variables.css, packages/admin/package.json, packages/admin/src/themes/default/{admin.css,chat.css,manifest.json}. Codex read-only review = FIX NEEDED: SCRATCH/out-review-r1/review-r1.md. BLOCKER: variables.css:174 re-declares every --jini-chat-* on any [data-color-scheme]/[data-admin-theme] element, which overrides ChatPane's local tokens inside nested scopes. SHOULD: default/admin.css:31 material inputs resolve at root and freeze the root scheme into nested scopes. Read the full review for the rest.
2. Write Codex prompt build-r1-fix2 (new dir) pasting the review findings; launch with CODEX_ADD_DIRS=/Users/la/Programming/Jini; then rebuild Jini ui + admin (one lock per build), re-capture after JSON, re-run diff, re-run the 3 Jini test commands below, commit Jini by explicit paths (no push).
3. Admin tsc NOT run yet (only CSS/JSON + 4 test files changed): run `cd apps/admin && npx tsc --noEmit -p .` under the lock.
4. Delete SCRATCH/baseline, after, after-shots, envcheck, repeat once parity is done.

## How to re-run parity (tools in SCRATCH/tools)
- Start sink: `nohup python3 -I SCRATCH/tools/sink.py SCRATCH > SCRATCH/tools/sink.log 2>&1 &` (port 8799; POST saves SCRATCH/<phase>/<name>.json; GET serves helpers.js).
- In your own Chrome tab on https://localhost:3000/admin/: `(0,eval)(await (await fetch('http://127.0.0.1:8799/h.js')).text())`, then `await __frame('/admin/pages',1244,723); await __fw().__cap('after2','02-pages-list')` (390 for phone). Park the mouse at (640,10). The dev server restarts often (other lanes): re-run the eval line after any reload.
- Diff: `python3 -I SCRATCH/tools/diff.py SCRATCH/baseline/X.json SCRATCH/after2/X.json width,height` (geometry ignored because the window changed displays; colours/fonts/borders must be identical; ignore `+ --jini-*` var additions and font-list lines).

## Test commands (each under test-lock acquire/release)
- Jini ui: `cd Jini/packages/ui && npx vitest run --maxWorkers=2 --minWorkers=1 src/theme/__tests__`
- Jini admin: `cd Jini/packages/admin && npx vitest run --maxWorkers=2 --minWorkers=1 src/core/__tests__/integration-entries.test.ts`
- Jini scripts: `cd Jini && npx vitest run --maxWorkers=2 --minWorkers=1 scripts/__tests__/check-package-layers.test.ts`
- Tovu admin: `cd apps/admin && npx vitest run --maxWorkers=2 $(cat SCRATCH/admin-test-files.txt)` (35 files)

## Warnings
- SCRATCH = /Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/8655ba7e-6293-4ab0-ac50-c88a2fb27da5/scratchpad/adminthemes-67
- Load hit 57 at the first Codex launch (other lanes); waited for load ≤10 before every build and test.
- HOME snapshot unchanged after all test runs.
- No Codex jobs still running.
