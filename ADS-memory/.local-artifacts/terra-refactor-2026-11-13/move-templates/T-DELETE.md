# T-DELETE: delete a dead file, fold a pass-through/barrel into its callers, or reduce a file to its kept binding

Template for kind DELETE (KINDS.md §2). No pilot recipe; derived from the d1 terra lane, the survey DELETE rule ("delete and repoint callers — give the caller count") and W0 calibration (2026-11-15: both W0 DELETE rows held real code; this template now carries the reduce form, moved bodies and relocated tests). Executor: script (0 importers, no fold, nothing kept) or Sonnet 5.5 high. Several rows per job (cap 15 EDITED FILES / 3k lines); each row skips alone.

## Sheet (one block per row)
```
id: {ID}                                   # DL-<feature-slug>-<n>
tovu_file: {path} | blob {sha}
non_reexport_statements: {N}               # from the filler; N > 0 needs tovu_file_after "keep only" or moved_bodies for every one of them
why_dead: {dead-root | dead-cluster with {paths} | pass-through to {target} | barrel of {targets} | superseded by {jini specifier} | forwarder: {names} only call {jini specifier} with no host value}
tovu_file_after: {delete | keep only: {names}}
file_after: {- | "block FILE_AFTER below"}  # "keep only": the WHOLE new file, verbatim, in a fenced block headed FILE_AFTER after this sheet block
moved_bodies:                              # a function/constant body that leaves tovu_file for another file; or -
  - {name} -> {destination file} | {after | before}: "{exact anchor line in the destination, occurring once}" (or "append at end of file after one blank line") | exported? {yes|no} | text: verbatim from tovu_file lines {a-b} (doc comment included)
  - destination import edits: {destination file}: "{old import line}" -> "{new import line}" (or "none: every name it uses is already imported there")
census:                                    # python3 scripts/census.py {TOVU_CLONE} {tovu_file}; output must equal this list
  - {path}:{line} | {static | reexport | dynamic | import-type | path-literal} | "{specifier or literal as written}"
reach_check:                               # each must print only the census lines and comment_refs below (path-loaded roots look dead to import scans)
  - rg -n --no-heading -F "{repo-relative path of tovu_file without extension}" apps content development .github package.json --glob '!**/node_modules/**' --glob '!{tovu_file}'
importers:                                 # one edit per census line that imports it; - when dead
  - {path}:{line} | "{old import line}" -> "{new import line}"
folds:                                     # caller absorbs the forwarded call, or -
  - {caller path}: "{old call}" -> "{new call}"
comment_refs:                              # comment lines that give a LIVE path to tovu_file; or -
  - {path}:{line} | "{old}" -> "{new}"
path_literals:                             # a path literal inside a list a test scans; or -
  - {path}:{line} | "{old literal}" -> "{new literal}" | why: {the new file is the one the scan must now cover}
tests:
  - {path} | blob {sha} | {delete (every block relocated, or covered: cite where) | repoint import to {target} | relocate blocks per relocations | drop block lines {a-b}: identical assertions at {file:lines}, check: {command that prints OK}}
relocations:                               # one block per relocated test; or -
  - from {test path} lines {a-b} -> {destination test file} | {after | before}: "{exact anchor line}" (or "append at end of file after one blank line", or "new file: header block below") | import edits: "{old}" -> "{new}" | framework change: {none | "import test from \"node:test\"" -> "import { test } from \"vitest\""}
why_moves:
  - "{comment first words}" -> {file}, {anchor}   # a why-comment in the removed text that explains a live rule moves next to that rule
baselines:                                 # every hit of: rg -n -F "{repo-relative path of tovu_file}" --glob '*.json' --glob '*.mjs' --glob '*.cjs' --glob '*.yml' --glob '*.yaml' --glob '!**/node_modules/**' .
  - {path}: remove "{entry}"                # or -
jini_commit: {- | test-only: {paths}}      # a test relocated into Jini = test-only Jini commit, no changeset
untangle_followup: {- | rows the coordinator must add/change in another lane's TSV because this row adds or removes an import there}
jini_msg: {"test(pkg): …" or -} | tovu_msg: "{refactor(area): …}"
```

## Steps
0. Branch rule; blob checks of `tovu_file` and every file the sheet edits (each listed with its blob, or guarded by exact text).
1. Census: run `python3 scripts/census.py {TOVU_CLONE} {tovu_file}` (resolves `#src/`, `@/`, relative, `.js`→`.ts`, folder `index`, and path literals). Its output must equal `census`; else SKIP the row. Do not use `rg -F <basename>` alone: it also matches substrings of other names and misses `../../index.js` style imports.
2. Run every `reach_check`. Hits that are only comments must be listed under `comment_refs` (or be conceptual mentions of the folder/feature, which stay); a path literal inside a list a test scans must be listed under `path_literals`; any other unlisted hit = SKIP (the file is reached by a path literal, a vite entry, a spawn, a workflow).
3. Jini (only if `jini_commit` is set): apply the `relocations` whose destination is in Jini (framework change as stated; assertion lines verbatim), eslint, commit with `jini_msg` (test-only: no changeset).
4. Tovu: apply `moved_bodies` (copy the stated lines verbatim to the destination after the anchor; then the destination import edits), then the Tovu `relocations`, then `importers` and `folds` (exact old -> new, each exactly once), then `comment_refs`, `path_literals`, `why_moves`, `baselines`.
5. Tests per `tests`: run each `drop block` check command first (it must print OK, else SKIP), then remove the block; `git rm -q` the `delete` ones (only when every block was relocated or the sheet cites where it lives on); repoint the others (import line only; if a repointed test then asserts something the target does differently, SKIP).
6. If `tovu_file_after` is `delete`: `git rm -q -- {tovu_file}`. Else overwrite the file with exactly `file_after`. Re-run the census and `reach_check`: for `delete`, no hit outside conceptual comments; for `keep only`, no hit imports a removed name (rg each removed name over the census files).
7. eslint the edited files. One Tovu commit per job: `refactor(<area>): delete unused <what>` (or `fold <what> into its callers`, or `reduce <file> to its binding`) with every path, deleted ones included. Report `untangle_followup` verbatim to the coordinator.

## STOP / SKIP specific to DELETE
- `non_reexport_statements` > 0 and the sheet has neither `keep only` covering them nor a `moved_bodies` row for each: SKIP (the row is mis-kinded; it is a MOVE/DEDUPE).
- A fold changes behaviour (the pass-through added a default, caught an error, logged, or reordered arguments): that is a DEDUPE/SPLIT; SKIP with the difference.
- The file is a `BOUNDARY-ENTRY` (dependency-cruiser guarded `index.ts`, public entry): SKIP.
- A test would lose an assertion: a `delete` test whose assertions the sheet does not show living on elsewhere, or a relocation that needs an assertion edited. SKIP.
- A `baselines` search hit the sheet does not list: SKIP.

## Expected afterwards
Typecheck + the touched and relocated tests in the batched cloud run; dead-code dossier re-run shows the row gone (or, for `keep only`, the removed names gone).
