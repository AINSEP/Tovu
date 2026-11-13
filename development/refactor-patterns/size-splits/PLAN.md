# Size splits plan — functions ≤ 50 lines, files ≤ 500 lines (Tovu + Jini)

Owner decision 2026-11-13 (final): functions ≤ 50, files ≤ 500 (ESLint counting: blank + comment lines skipped),
CI error in Tovu and Jini with a shrink-only debt list; React components and hooks get the same 50. Every new
function also stays cyclomatic + cognitive ≤ 10 (Tovu admin 9/9). This replaces the 100-line design. Design only;
execution = Codex Terra (Terra lane) and Opus/Fable (hard lane), after a Codex review of this re-scope.

## Inputs (re-runnable)
1. `node development/scripts/size-hotspots.mjs --repo tovu=<clone> --repo jini=<clone> --out <dir>` → hotspot TSVs
   (today's run: Tovu 548 + Jini 521 functions over 50 after the accepted exceptions; 47 + 29 files over 500).
2. `node plan50.mjs --tovu <clone> --jini <clone> --hotspots <dir> --move <move-to-jini design dir>` → `index.tsv`
   (every over-limit file: items, work, phase, lane + why, fragment, job), `batches.tsv`, `exception-candidates.md`.
   It parses each file (TypeScript from the Tovu clone) for nesting and judgment signals.
3. `node assemble.mjs` → the job prompts and `BATCHES.md`. Never hand-edit a prompt: edit a fragment, a hard plan
   or CONVENTIONS and re-run.

## Files in this folder
- `CONVENTIONS.md` — binding rules, inlined in every prompt: responsibility splits (no mechanical chunks or
  pass-through helpers), per-kind recipes (functions, route registrars, React components → subcomponents with own
  props, hooks → composed sub-hooks with identical effect semantics, factories → per-feature builders with settled
  inputs, classes), what NOT to split (exception candidates) and what to escalate (HARD), `(required, optional = {})`
  always, banned casts/suppressions, test-edit limits, the gate command, commits, report format.
- `outline.mjs` — read-only structure tool (defaults now 50 / 500); `--check` is the per-file done gate.
- `parts/<repo>/<path>.md` — 309 per-file fragments from the 100-line design (responsibility map, helpers with
  signatures, importers, tests). Still valid as first steps; each prompt adds "then continue to 50".
- `hard/*.md` — detailed plans for the 12 hardest files (one job each).
- `BATCHES.md` (generated) — every job, the hard-lane reasons, the held files.
- `exception-candidates.md` (generated) — the owner's list, one line each with a reason.
- `EXAMPLE.md` — the worked example (first pass committed; its 50-line second pass is a Terra row).

## Counts (2026-11-13)
| | Tovu | Jini | total |
|---|---|---|---|
| files with an item over a limit | 403 | 443 | 846 |
| functions over 50 / files over 500 | 548 / 47 | 521 / 29 | 1069 / 76 |
| Terra lane: files (functions) | 352 (463) | 370 (426) | 722 (889) |
| Opus/Fable lane: files (functions) | 36 (68) | 64 (85) | 100 (153) |
| held for the owner: files (functions) | 15 (17) | 9 (10) | 24 (27) |
| phase after-move (Tovu files the move backlog relocates) | 192 | 0 | 192 |
| files with a 100-line fragment / without | 137 / 266 | 172 / 271 | 309 / 537 |

Jobs: **30 Terra** (`size-t-01…07` Tovu now, `size-tm-01…08` Tovu after-move, `size-j-01…15` Jini), each one
folder-ordered run of whole files, ≤ ~3.5k counted lines and ≤ 30 files (one job owns a file). **23 Opus/Fable**
(`hard-01…20` now, `hard-m-01…03` after-move): the 12 hard-plan files are one job each; the rest are packed the
same way. Work = counted lines of the over-limit file / outermost over-limit functions (Terra ~95k, hard ~41k).

## Lanes (plan50.mjs decides; reasons are in BATCHES.md)
- **Held** — every over-limit item is an exception candidate (embedded browser scripts, data tables, agent-tool
  catalogs / tool-registration lists like the owner's 11-11 precedent), or the file was held in the 100-line design.
- **Opus/Fable** — a `hard/` plan; a fragment that recommends a strong executor (matched case-insensitively —
  review finding 6: `project-ipc.ts` is now here, not in a Terra job); or a parse signal: a function sharing ≥ 5
  mutable `let`s with nested functions (≥ 3 when it is ≥ 70 lines), a hook/component with ≥ 6 effects, or a file
  over 500 with ≥ 3 top-level side effects (init order).
- **Terra** — everything else. A Terra executor that meets a judgment cut reports `HARD` and reverts that file; the
  coordinator moves it to an Opus job. Executors also report `EXCEPTION-CANDIDATE` lines (indivisible JSX tree /
  effect); the coordinator appends them to `exception-candidates.md`. Neither is ever decided by the executor.

## Phase
Tovu files listed in the move-to-Jini backlog (`opus-backlog.files.tsv` + `terra-lane.tsv` of the move design) are
**after-move** (`size-tm-*`, `hard-m-*`): they wait, and the prompt skips a file that is gone or already under the
limits. Hard-plan files are **now** (each plan splits around the move; see its header). Jini files are **now**.

## Execution order
1. Codex review of this re-scope (CONVENTIONS, plan50 lanes, the five hard plans changed below, 5+ prompts).
2. Owner rules on `exception-candidates.md` (held items stay untouched until then).
3. Gate: the size + complexity ESLint rules land as errors with the shrink-only debt list (separate job), so a
   split cannot regress.
4. Terra `size-t-*` and `size-j-*` by number (highest score first). Tovu and Jini jobs run in parallel; within a
   repo, jobs touch different folders by construction, but importer rewrites can cross — run same-repo jobs in
   order unless their importer sets are disjoint.
5. Opus/Fable: hard plans in this order — `types` → `deps` → `app` → `render` → `pages` → `api` → `PostEditor`
   (+ `use-post-editor.hooks.ts`) → `launch` → `useChatPane` → `ChatPane` → `agent-daemon-scope` (partial now);
   then the packed `hard-*` jobs.
6. After the move lands: `size-tm-*`, `hard-m-*`.

## Review-d4 findings (Codex review of the 100-line design) — status
1. guarded-reader dependency crossings — fixed in its fragment: settled graph (deny, path resolver, stat, descriptor
   opener built first; lister/sync/stream reads take them), `readBoundedStream` stays with `createBoundedStream`.
2. activation preflight lock — fixed: lock factory built first and passed to the queries factory; strict read stays
   inside the lock; seven ≤ 50-line factories in a settled order.
3. launch cycle — fixed: compatibility trio → leaf `launch-compatibility.ts`; settled import graph in hard/launch.md.
4. app composition `routeDepsOf` — fixed in hard/app.md (`memoryPluginRouteDeps` takes it; every `routeDeps`
   self-reference in `createRouteDeps` checked against a builder that receives the thunk). deps.md contracts: see
   that plan's REMAINING status.
5. `api.mediaContentType` — stays in `api.ts`, still reading `api.mediaOriginalUrl` (hard/api.md).
6. lane detection case-insensitive — in plan50.mjs; `project-ipc.ts` is in the hard lane.
7. two-object boundary — CONVENTIONS rule 8 now requires it everywhere (incl. empty inputs) and forbids deleting an
   existing options object; the three fragments that dropped one were fixed (peer-site-reads, identity
   tool-registrations, agent-plugins automatic-use).
8. complexity ceiling — the gate command runs `complexity` + `sonarjs/cognitive-complexity` as errors at 10 (admin
   9) plus both size rules on the changed files, against a saved baseline.

## Limits of this design (read before trusting a number)
- 537 files have no fragment: their executor designs the split from the outline under CONVENTIONS (the prompt
  says so). The 309 fragments were made for 100; they are first steps, not the full split to 50.
- Lane signals are heuristics; a Terra job can still hit a judgment cut (it escalates, never improvises).
- Work sizes come from counted lines, not effort; a 30-file Terra job of small functions may still be long.
- Six Jini hooks files in the hotspot TSV do not exist in `jini-terra-d4` (newer than this clone); they are planned
  from the TSV numbers only.
- Bugs noticed while designing go to the coordinator (local `open-bugs.md`), not here: this repo is public.
