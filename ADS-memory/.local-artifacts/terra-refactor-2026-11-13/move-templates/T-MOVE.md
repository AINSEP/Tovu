# T-MOVE: pure code moves into a Jini package; Tovu imports it

Template for kind MOVE (KINDS.md §3). Worked example: `../sonnet-extract-pilot/E01-email-template-render.md`. Executor: Sonnet 5.5 high. A filler (script for the mechanical fields, then Sonnet or Opus for the rest) writes the SHEET below; the dispatcher assembles `T-MOVE.md + sheet + COMMON.md`.

## Sheet (filled per slice; every `{…}` must be replaced, `-` when empty)
```
id: {ID}                                   # MV-<feature-slug>-<n>
feature: {FEATURE}
precondition: {MOVE-AFTER precondition, with the rg that proves it landed in Jini, or -}
tovu_files:                                # one line each
  - {path} | blob {sha} | {delete | keep-reduced}
tovu_tests:
  - {path} | blob {sha} | {move-to-jini | keep-repointed | delete}
jini_target: {pkg} {subpath, e.g. ./mail/email-template or existing ./host} {new file path}
jini_guards:
  - {jini path} must not exist
  - {jini path} blob {sha}                 # every Jini file edited
  - rg -n "{each moved exported name}" packages/{pkg}/src -> prints nothing
symbol_map:                                # Tovu export -> Jini export (same name unless stated)
  - {name} -> {jini specifier} {name} {"(args: positional -> (required, optional = {}))" or ""}
values_injected:                           # Tovu-only values the Jini code now takes as arguments/options
  - {Tovu constant/env/wording} -> {required|optional}.{field} (Tovu passes {value})
leaf_import_rewrites:                      # Jini code imports own package by leaf file, never the barrel
  - {old specifier} -> {relative leaf path .js}
header_rewrite: |
  {the neutral @file block for the Jini file, why kept, no Tovu names}
why_moves:                                 # Tovu-specific why that stays in Tovu
  - "{first words of comment}" -> {tovu file}, {anchor line it goes above/below}
deletions_in_copy:                         # exact lines removed from the copy (tracking pointers only)
  - "{exact line}"
entry:                                     # only for a NEW subpath; else -
  exports_after: "{exact line of the preceding exports key}"
  runtime: {universal | node | browser}
  optional_peers_text: {exact old -> new, or -}
  readme_append_after: "{exact last words of the paragraph}"  readme_text: "{line}"
census:
  cmd: rg -n --no-heading {patterns for every import form, incl. ./x, ../x, #src/…, @/…, .js/.ts suffixes} apps content development --glob '!**/node_modules/**'
  allowed: [{path:line}, …]
importer_edits:                            # exact old -> new per importer line
  - {path}: "{old}" -> "{new}"
test_edits: {mechanical changes for moved tests, e.g. node:test -> vitest import, ../x.js -> ../y.js}
changeset: {pkg}: minor | "{one sentence}"
jini_msg: "{feat(pkg): …}" | body "{…}"
tovu_msg: "{refactor(area): use @jini-ai/…}" | body "{…}"
extra_stops: {anything slice-specific, or -}
```

## Steps
0. Check the branch rule (COMMON). Check every guard (blobs, must-not-exist, rg prints nothing). If `precondition` is not `-`, run its rg; no hit = SKIPPED "precondition not landed".
### Jini (commit 1)
1. NEW `{jini new file}` = the Tovu file copied byte for byte, then apply, in order: `deletions_in_copy`, `leaf_import_rewrites`, `header_rewrite` (replace the whole `@file` block), `values_injected` (only the listed signature/body edits), `symbol_map` arg-shape changes. Nothing else changes: names, statement order and why-comments stay.
2. If `entry` is set: add the `exports` block (types/import/default to `./dist/<sub>.js`/`.d.ts`) after `exports_after`; add `"<sub>": "<runtime>"` to `jini.entries` next to its siblings; apply `optional_peers_text`; append the README line. Validate package.json (COMMON checks). Else: add `export * from './<file>.js';` (or the named exports listed) to the subpath `index.ts` after the line the sheet names.
3. Tests marked `move-to-jini`: NEW `packages/{pkg}/src/<…>/__tests__/<name>.test.ts` = the Tovu test byte for byte + `test_edits` (Jini runs vitest; `node:assert` assertions run as-is).
4. NEW `.changeset/{pkg}-{slug}.md` with the sheet's `changeset`.
5. Rule checks on every Jini file you created/edited: no Tovu text (COMMON rule 2); `rg -n "from ['\"]express|process\.env|console\.(log|warn|error|info|debug)\(|await import\(" <files>` prints nothing; no `@jini-ai/<other>` import that `packages/{pkg}/package.json` does not already depend on; a `universal` entry has no `node:` import. Any hit: STOP.
6. eslint the new/edited `.ts` files. Commit `{id}-jini.msg` with every Jini path.
### Tovu (commit 2)
7. Census: run `census.cmd`; every hit must be in `census.allowed`. Else STOP.
8. Apply `importer_edits`, then `why_moves`, then pass `values_injected` at each call site the sheet lists.
9. `git rm -q --` every `tovu_files`/`tovu_tests` row marked `delete`; for `keep-reduced`, delete exactly the moved declarations the sheet lists.
10. Re-run the census: no hit may name the old path; only the listed importers name the Jini specifier.
11. eslint the edited files. Commit `{id}-tovu.msg` with every Tovu path (edited + deleted).

## STOP conditions specific to MOVE
- The copy would need any edit not in the sheet (a Tovu import the sheet did not map, a Tovu name in a string, a `node:` import into a `universal` entry).
- A moved function exceeds 50 lines or complexity 10 and the sheet gives no split.
- A moved export is positional and the sheet does not list its new shape and every caller.
- The target subpath does not exist and `entry` is `-`.

## Expected afterwards (batched cloud run, not here)
Jini: vitest for the new test file, typecheck + `check-subpath-isolation` + complexity/size gates of `{pkg}`. Tovu: typecheck of the touched app after linking the Jini clone (D1).
