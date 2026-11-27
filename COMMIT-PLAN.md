# BUGD admin — Tovu handoff

Coordinator owns commits. Leave this file uncommitted; `.git` is read-only.
Starting branch: `codex/tv-bugd-admin`; HEAD: `bc262146be9e2ca472b0759821f8e30e74f20c05`.
Initial working tree was clean. No commits or pushes were attempted.

## Completed design units, in order

### 1. Sheet 1 — Trash retention consumer pins

Proposed commit: `test(admin): qualify Trash retention copy pins`

Files touched:
- `apps/admin/src/features/trash/__tests__/Trash.unit.test.tsx`
- `apps/admin/src/features/trash/__tests__/trash-i18n.unit.test.ts`

Updated the existing exact 14-day header assertion to the approved qualified sentence,
including the existing per-row explanation. The 14-day interpolation input remains.
Replaced only the old `CALL_SITE_KEYS` entry; executable translation checks remain intact.
These test edits are the only Tovu code changes; no host production fix is required.

Mutation: `retention-copy-promises-retroactive-window` restores the old unqualified
Jini template. The updated exact header assertion rejects that copy.
The peer added “the current window does not replace previously assigned deadlines”
in Jini, covering the 30-day policy with a legacy 44-day row before production edits.

### 2. Sheet 2 — existing Media integration retained

No Tovu commit needed; no files changed for this sheet.
Retained `apps/admin/src/features/media/__tests__/media-screen-states.unit.test.tsx`,
“Media Trash explains retention and displays each supplied countdown”. It injects
the real `useMedia` and CMS `useGridPages`, asserts 30-day copy on empty Trash,
44 days left on a legacy card, and neither copy nor countdown on Images.

Mutation: `media-trash-copy-dropped` removes the matching retention-copy render;
the existing Trash policy assertion rejects that mutation.
Jini peer regressions cover `media-grid-drops-retention-policy` (current first-page
policy) and `media-countdown-ignores-current-tab` (retained trashed row on Images).

Inspected and retained the existing SQL deadline query, repository binding, route
clock/retention/error wiring, and `useWiredMedia` CMS-hook injection. No paging shim.

### 3. Sheet 8 — approved no-op

No files changed. Release/version consumption is no longer required by coordinator
correction 1. Existing Storage binding and consumer witness remain intact.

## Shared fixes and exclusions

Read the peer report at `../o-bugd-adminj/bugd-adminj.md`. Read-only inspection of
`origin/codex/bugd-adminj` in `/Users/la/Programming/Jini` confirms the qualified
`retentionLine` template and current-first-page `useGridPages.retentionDays` return.
Shared production fixes, three named regressions, and both changesets belong to
the Jini half; none were duplicated in Tovu.

Sheet 5 is excluded: another job owns Desktop. No package manifests, lockfiles,
themes, export paths, schema, paging, stored deadlines, or sweeper were changed.
No release, publish, or version bump was attempted.

## Review and verification

Only the two required test-string replacements are in the code diff. No added
helpers, wrappers, interfaces, guards, fixtures, comments, or production logic.
Diff-review deletions: none; no out-of-sheet additions needed removal.
Architecture review: PASS for the two test-only edits; host/Jini boundaries and
injected seams are unchanged. No public symbols or logic-bearing functions changed,
so function-quality assessment and API documentation changes are not applicable.

RED/GREEN execution and mutation execution are unverified: the dispatch forbids
tests, builds, installs, typechecks, and linters. No local Jini node_modules links
exist in this clone. Cloud/Opus owns runtime acceptance and mutation runs.
Final static verification: inspect `git diff` and run `git diff --check`.
