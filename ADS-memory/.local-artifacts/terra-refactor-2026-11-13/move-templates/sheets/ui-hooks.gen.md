id: UI-hooks-1   (skeleton by make-sheet.py; judgment fields are TODO(judge))
feature: admin/features/dashboard
precondition: TODO(judge)   # MOVE-AFTER only (label: MOVE)
tovu_files:
  - apps/admin/src/features/dashboard/hooks/use-recent-activity-disclosure.hooks.ts | blob 65fc82ff8ab1797b9cd0deea2b90caf7ed013017 | blob-guarded | 55 loc
tovu_tests:
  - apps/admin/src/features/dashboard/__tests__/use-recent-activity-disclosure.unit.test.ts | blob f85cc33e30fc460112ed08c160b0cc28b2291a77 | TODO(judge)   # move-to-jini | keep-repointed | delete
--- file: apps/admin/src/features/dashboard/hooks/use-recent-activity-disclosure.hooks.ts (survey label MOVE; note: UI `hooks` (a `usePersistedBoolean(key)` hook). Host passes the key.)
declarations (name | line | kind):
  - RECENT_ACTIVITY_OPEN_KEY | apps/admin/src/features/dashboard/hooks/use-recent-activity-disclosure.hooks.ts:14 | const
  - RecentActivityDisclosure | apps/admin/src/features/dashboard/hooks/use-recent-activity-disclosure.hooks.ts:34 | interface
  - useRecentActivityDisclosure | apps/admin/src/features/dashboard/hooks/use-recent-activity-disclosure.hooks.ts:45 | function
census_cmd: rg -n --no-heading -e '["'][^"']*use\-recent\-activity\-disclosure\.hooks(\.[jt]sx?)?[\"']' apps content development --glob '!**/node_modules/**'  # then resolved against apps/admin/src/features/dashboard/hooks/use-recent-activity-disclosure.hooks.ts
importers (1 prod, 1 test; resolved to this file):
  - apps/admin/src/features/dashboard/Dashboard.tsx:8 | static | "./hooks/use-recent-activity-disclosure.hooks"
  - apps/admin/src/features/dashboard/__tests__/use-recent-activity-disclosure.unit.test.ts:4 | static | "../hooks/use-recent-activity-disclosure.hooks"
path_literals (rg -F "hooks/use-recent-activity-disclosure.hooks", not already importers):
  - -
baselines (json files naming the path): -
jini_target: TODO(judge) (survey names no package)
symbol_map: TODO(judge)
values_injected: TODO(judge)
leaf_import_rewrites: TODO(judge)
header_rewrite: TODO(judge)
why_moves: TODO(judge)
deletions_in_copy: TODO(judge)
entry: TODO(judge)
importer_edits: TODO(judge)   # exact old -> new per importer line above
