# T-KT-MOVE (revision 2): move one or more generic Tovu files into a Jini package, in green steps
Used by K-02b, K-06b, T-TH-01, T-PO-01, T-PO-01g, T-PO-02. Self-contained with the sheet and COMMON-KT (no other template).
Inputs per sheet: `<id>.files.tsv` (blob guards), `<id>.decls.tsv` (top-level declarations), `<id>.fnsize.tsv` (functions over 40 code lines, file sizes), `<id>.importers.tsv` (every importer with the imported NAMES, including importers that reach a moved name through a feature `index.ts`; `re-export` rows are barrel lines to delete), `<id>.census.txt`.

## Steps
M0 V0 + V1 (COMMON-KT). Check blobs, the sheet's guards and its `precondition` command (no hit = SKIPPED "precondition not landed").
M1 Tovu, tests only: the sheet's characterization tests, written with fakes, green on the parent. Run V3 for each named mutation. Commit, V2, push.
M2 Tovu, seam in place (no file leaves Tovu): apply the sheet's `seam:` list (host imports become arguments/ports with the exact types given; over-limit units split as given; `(required, optional = {})`). Update every caller in `<id>.importers.tsv` whose names changed shape. M1 tests stay green unedited except for the argument shape the sheet lists. Commit, V2, push.
M3 Jini: NEW file(s) at the sheet's `jini_target` = the seamed Tovu file, with only: own-package imports rewritten to leaf files, the neutral `@file` header, tracking pointers deleted. New subpath only if the sheet's `entry:` says so (exports + `jini.entries` + README line in this commit). Tests marked `move` are copied as vitest files beside the code. Changeset. STOP matrix. Commit, V2, push.
M4 Tovu: delete the moved file(s); repoint every `direct` and `barrel:` row of `<id>.importers.tsv` to the Jini specifier (only the listed names move; other names on the same import line keep their old specifier); delete every `re-export` row; moved tests deleted, kept tests repointed. Re-run the census: no hit names the old path. STOP matrix. Commit (body names the Jini SHA), V2, push.
One file = one M1..M4 cycle when the sheet lists several files with different targets: finish and push a cycle before starting the next, so each pair is green alone.

## STOP (in addition to COMMON-KT)
- The copy needs an edit the sheet does not list (an unmapped Tovu import, a Tovu name in a string, `node:` in a `universal` entry).
- An importer row uses `*`, `<dynamic import>` or `<mock:...>`: handle it only if the sheet names that row; else STOP (a mock of a moved module must become a fake of its port).
- The target folder/subpath does not exist and the sheet has no `entry:`.
