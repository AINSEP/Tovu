- BOOTSTRAP: dispatched job (<<PEER_DISPATCH>>). Bootstrap files (AI-Dev-Shop/AGENTS.md, CLAUDE.md/AGENTS.md startup steps) do not apply and may be missing; expected. This prompt is complete; proceed.

# Terra lane: delete Tovu re-export shims, import Jini directly

You work in ONE Tovu checkout: the current working directory (its root has `apps/` and `package.json`). All paths below are relative to that root.

Inputs (read both in full before editing):
- `development/refactor-patterns/move-to-jini/terra-lane.tsv`: one row per Tovu file to delete. Columns: `id`, `tovu_path`, `blob` (git blob hash of the file this table was made from), `jini_specifier`, `symbol_map`, `tovu_evidence`, `jini_evidence`, `importers` (count), `comment`, `comment_refs`.
- `development/refactor-patterns/move-to-jini/terra-lane.importers.tsv`: every file that references a row's `tovu_path`. Columns: `id`, `tovu_path`, `importer`, `line`, `kind` (`import`, `re-export`, `dynamic-import`, `type-import()`, `comment`), `specifier_as_written`.

What every row is: `tovu_path` only re-exports names from a published `@jini-ai/*` subpath (L40 is a byte-identical copy of `@jini-ai/cms/core`'s keyset cursor). The names, their Jini specifier and the evidence on both sides were checked. Your job per row: point every importer at the Jini specifier, then delete `tovu_path`. Nothing else.

## Hard rules
- Run NO tests, NO tsc/typecheck, NO builds, NO installs, NO formatters or `--write`/`--fix` linters. Leave nothing running.
- Edit only: the importer files and `comment_refs` files of the row you are doing, and `tovu_path` (deleted). Never edit anything under `node_modules`, any Jini checkout, `development/`, `cloud/` or `ADS-memory/`, and never edit `*.sql` or `*.json` files.
- Do not commit, push, stash, checkout, reset or `git add`. Delete files with plain `rm`. The coordinator commits.
- Do not change any name, argument, statement order or behaviour. Do not add `as any`, `@ts-ignore`, `eslint-disable`, `biome-ignore` or a non-null `!`.
- SKIP a row (write the reason, change nothing for that row, or undo your edits for that row if you already started) whenever a step below says SKIP or anything does not match this prompt exactly. Never improvise a fix. A skipped row is a good outcome.
- Rows are independent. Do them in `id` order; one row's skip never affects another.

## Per row

1. File check. Run `git hash-object <tovu_path>`. If the file is missing or the hash differs from `blob`: SKIP ("file changed").

2. Importer census. Let `B` = the file name of `tovu_path` without extension (for L24 `.../plugins/index.ts`, run the command twice: once with B = `index`, once with B = `plugins`, because a folder import `../plugins` also resolves to it). Run:
   `rg -n --no-heading -e "[\"'\`][^\"'\`]*/B(\.js|\.ts|\.tsx)?[\"'\`]" apps content development --glob '!**/node_modules/**'`
   (replace `B`). Keep only hits whose quoted string, resolved from the hit file's folder, names `tovu_path` (with or without `.js`/`.ts`/`.tsx`). Resolution: `./` and `../` are relative to the hit file's folder; `#src/x` means `apps/website/src/x`; `@/x` means `apps/admin/src/x` (admin files only). Compare the set of hit FILES with this row's `importer` files in `terra-lane.importers.tsv` (all kinds; a backticked `./x.ts` inside a comment is a hit and is listed there as `kind` = `comment`). Any hit file not in the table, or any table file with no hit: SKIP ("importers drifted"). Any hit inside `vi.mock(`, `mock.module(`, `jest.mock(`, `require(`, `readFileSync(`, `new URL(` or `import * as`: SKIP ("module-identity use").

3. Repoint each importer (rows of this `id` with `kind` other than `comment`). The statement to edit is the one whose specifier string is on the listed `line` (a multi-line `import {...} from "..."` ends on that line).
   - `import`, `re-export`: replace the specifier string with the Jini specifier from `symbol_map` for the names the statement uses. Keep `import type` / `export type` / inline `type` markers and every `X as Y` alias exactly. If `symbol_map` gives the statement's names more than one specifier, split it into one statement per specifier, in the order the specifiers appear in `symbol_map`, each keeping the same kind (`import`/`import type`/`export`/`export type`). If `symbol_map` says `* -> <spec>` or `type * -> <spec>`, every name goes to that one specifier. If the same file already has a statement of the same kind (`import` vs `import type`, `export` vs `export type`) from that exact Jini specifier, add the names to that existing statement instead of creating a second one. A name the statement uses that `symbol_map` does not list: SKIP.
   - `dynamic-import` (`await import("...")`) and `type-import()` (`import("...").Name` in a type position): replace only the string with the Jini specifier. If the row's `symbol_map` names more than one specifier: SKIP.
   - Never touch other statements in the file.

4. Comment paths. For each `file:line` in `comment_refs` (and each importer row with `kind` = `comment`): on that line only, replace the text that names `tovu_path` (the path as written there, e.g. `features/database/restore-points.ts`, `../database/boot/reconcile-interrupted-migration`, `./types.ts`, `lib/standing-draft-recovery-message.ts`) with the row's `jini_specifier` (for a multi-specifier row, the first one). Keep backticks, `#Symbol` suffixes, `'s` and every other word. If that line no longer contains such a path: leave it and note it in the report (not a skip).

5. The deleted file's comment (`comment` column).
   - `none`, or text starting with `drop`: do nothing (the comment is a pointer, or the Jini file already carries the rationale; the evidence is in the column).
   - `paste-to <file>`: copy the comment lines of `tovu_path` (every `//` or `/** ... */` line, verbatim) and insert them directly above the repointed import statement in `<file>`. Only L32 has this.

6. Delete: `rm <tovu_path>`.

7. Re-check: rerun the step-2 command. No hit may resolve to `tovu_path` any more (comment hits from step 4 included). If one does: undo this row's edits (restore the deleted file with `git show HEAD:<tovu_path> > <tovu_path>` and revert your edits to the importers) and SKIP ("leftover reference").

## Notes for specific rows
- L05 (`durable-runs/ports.ts`) and L14/L15 (`credential-tool-*.ts`) are `export type *` shims: importers keep `import type`.
- L34-L36 (`platform/db/kernel/*.ts`): `@jini-ai/db/kernel` is one specifier for all three; an importer that imports from two of these files may end up with two statements from `@jini-ai/db/kernel`; merge them per step 3 (same kind only).
- L35 has 142 importers. Do it last; same rules.
- L40 (`platform/db/keyset-cursor.ts`): not a shim but an identical copy. Its Jini twin takes an extra trailing optional argument; every Tovu call passes one argument, so calls stay unchanged.

## Report (your final message)
1. A table: `id | DONE or SKIPPED | reason (skips) | importers edited | comment refs edited`.
2. Every path you changed or deleted, one per line (the coordinator commits exactly these).
3. Comment-ref lines that no longer contained the path (step 4), if any.
