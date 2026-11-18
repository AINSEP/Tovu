# r13b-c12obs-fix: C12-OBS sheet (untangle gaps)

Run 2026-11-18, unattended plan-edit run (plan documents only; no product code was committed anywhere). Facts were re-read on `origin/refactor/terra`: **Jini `4c1892368` / Tovu `ada11733f`**. The R13b half is reported in `plan/xpkg-lane-sheets-2026-11-16` (`sheets-2026-11-16/r13b-c12obs-fix-REPORT.md`).

## Verdict: C12-OBS is EXECUTABLE (revision 2); R12c and then R12b can follow it

The executor stopped before any commit (Jini `origin/wave1/xpkg-C9c-C12OBS:cloud-results/xpkg-wave1d.md`). Each cause is fixed:

| executor finding | re-checked on terra | fix in the sheet |
|---|---|---|
| `core/package.json` blob mismatch | it moved again (`e082326fca30`) | `core/package.json` is no longer blob-guarded; the guard is `git apply --check` of the patch, because the patch appends one export and one entry. The other 7 guard blobs are unchanged on terra; an 8th was added (`package-surface.integration.test.ts`, a MANUAL row) |
| 4 unlisted importers | still exactly 4 (scan of packages/apps/examples in both repos) | 4 rows added: Jini `tracker-metric-rejection.unit.test.ts`; Tovu `run-finalizer/entry.ts`, `run-daemon-http-client.ts`, `assistant-run-finalizer.characterization.unit.test.ts` |
| row 152 stale (file split) | still stale | dropped; replaced by the `run-finalizer/entry.ts` row (`AgentRunStatus` is no longer imported there) |
| row 12 stale once the patch is applied | stale after the patch | dropped; the patch does that edit |
| `C-lane` test-move row stale after the patch | yes under `--phase all` | the sheet runs the applier with `--phase wave` after the patch (`other-phase 1`) |
| coordinator-only section | contradicted the "no coordinator-only files" rule | rewritten as "shared files, in this same commit": the 3 injection-debt keys, `api:update`, changeset |
| prepared patch | applies cleanly on `4c1892368` (core manifest hunks at offsets) | copied next to the sheet as `C12-OBS.prepared-jini.patch` and made step 1 |
| "provider-plugins has no core devDependency" | it has one on terra | "no manifest edit" |

## Plan-side trial (scratch checkouts, reverted after)
The prepared patch, then the applier with `--phase wave`, on Jini `4c1892368` + Tovu `ada11733f` (Node 24.11.1):
- applier: `rows 167; applied 150, already 2, keep 1, manual 13, other-phase 1, STALE 0, ERROR 0; files changed 126` (Jini 34, Tovu 92);
- core build exit 0; core noop test 6/6;
- analytics 224/224;
- diagnostics 992/993 (the red one is the MANUAL surface-list row, now spelled out in step 4);
- `tsc --noEmit` on diagnostics, analytics, daemon and http-kit: 0 errors;
- provider-plugins `tsc`: 81 errors, all ENV (dependency packages not built), none naming the core observability subpath;
- Tovu typecheck: **not run** (no `npm ci` in this run).

The noop-identity STOP command and the new `C12-OBS.completeness.py.txt` print nothing on the base pair.

## What changed (Tovu `plan/untangle-gaps-2026-11-16`, `untangle/sheets/`)
- `C12-OBS.md` revision 2:
  - header and §0: base, prerequisites in fenced blocks, expected dry-run line, completeness script;
  - §2: one Jini commit + one paired Tovu commit; patch-first with a RED proof; applier line; restatement deletions; the 13 MANUAL rows; shared files;
  - §3 behaviour; §4 gates S1/S3/S4/S6-S11/S13 as fenced commands; §5 STOP list with commands; §6 trial results.
  - §1 (what moves) is unchanged.
- `C12-OBS.repoint.tsv`: 165 → 167 rows (+4, −2).
- New: `C12-OBS.prepared-jini.patch`, `C12-OBS.completeness.py.txt`.

## Still open
- Tovu typecheck and the full Jini suites of daemon, http-kit and provider-plugins with the restatement deletions applied. These are the executor's gates; this run did not do the deletions.
- The executor's C9c `*KitNeeds` STOP (a separate lane) is not part of this run.
