# 2026-09-08 — tool-search-keywords backfill (22 missing ids)

## Task
Add `TOOL_SEARCH_KEYWORDS` entries in `apps/website/src/assistant/tool-search-keywords.ts` for the
22 tool ids verified missing: `backup_execute_restore`, `collections_execute_cleanup`,
`collections_plan_cleanup`, `custom_credential_set_username`, `custom_credential_set_token`,
`custom_credential_create`, `database_execute_migrate_forward`, `database_get_restore_guidance`,
`external_mcp_list`, `external_mcp_save`, `external_mcp_test_connection`,
`external_mcp_oauth_connect`, `external_mcp_oauth_poll_device`, `redirects_import`,
`settings_clear`, `settings_register_definitions`, `settings_reset`, `settings_set`,
`sites_duplicate_site`, `taxonomy_execute_merge_term`, `workspace_create`, `workspace_delete`.

## What changed
`apps/website/src/assistant/tool-search-keywords.ts` — added all 22 entries, phrased from what a
non-technical site owner would type (not restatements of the tool name), each drawn from the tool's
own catalog `description`:

- Read every one of the 22 tools' catalog entries first (`apps/website/src/features/*/agent-tools.ts`
  for the Tovu-local ones; `/Users/la/Programming/Jini/packages/cms/src/*/agent-tools.ts` via the
  `@jini-ai/cms` symlink for `collections_execute_cleanup`/`collections_plan_cleanup`,
  `settings_clear`/`settings_register_definitions`/`settings_reset`/`settings_set`,
  `taxonomy_execute_merge_term`, `workspace_create`/`workspace_delete`).
- `sites_duplicate_site` carries "copy duplicate clone" as required — this closes the specific gap
  named in the dispatch (the "copy Landing sample" production miss).
- New sections added for `sites` (`sites_duplicate_site` had no section at all) and `external mcp`
  (all five `external_mcp_*` tools had no section at all); the rest were inserted next to their
  existing domain siblings (backup/recovery, redirects, database, content-types, taxonomy,
  workspace/settings, custom-credentials).
- 13 of the 22 (`backup_execute_restore`, `redirects_import`, `database_execute_migrate_forward`,
  `database_get_restore_guidance`, `collections_plan_cleanup`, `collections_execute_cleanup`,
  `settings_set`, `settings_clear`, `settings_reset`, `settings_register_definitions`,
  `taxonomy_execute_merge_term`, `workspace_create`, `workspace_delete`; see each tool's own file
  header) are deliberately UNWIRED / "NEVER agent-callable" today. The dispatch explicitly asked for
  `taxonomy_execute_merge_term` to get an entry anyway "for consistency"; the same reasoning was
  applied to every other unwired tool found in this batch and called out inline with a one-line
  comment at each site, so a future wiring change does not also need a keyword backfill.

New test file:
`apps/website/src/assistant/__tests__/tool-search-keywords.2026-09-08-backfill.test.ts` — asserts
all 22 ids now have a non-empty entry, and that `sites_duplicate_site`'s entry matches
`copy`/`duplicate`/`clone`.

## Verification gotcha (confirmed, matches the dispatch's warning)
`TOOL_SEARCH_KEYWORDS` keys are unquoted identifiers — `grep '"tool_id"'` matches nothing. Used
`grep "^[[:space:]]*<id>:"` for all 22, plus a control grep against `content_post_search` (a known-
present key) to prove the pattern actually matches before trusting a "not found" result.

## Test results (verbatim)
```
$ TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test apps/website/src/assistant/__tests__/tool-search-keywords.2026-09-08-backfill.test.ts
✔ every one of the 22 previously-missing tool ids now has a non-empty TOOL_SEARCH_KEYWORDS entry (1.884067ms)
✔ sites_duplicate_site carries the duplicate/copy vocabulary from the production miss it closes (0.745748ms)
ℹ tests 2
ℹ suites 0
ℹ pass 2
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

Also re-ran the 3 sibling test files in the same directory (`tool-search-keywords.content-post-copy.test.ts`,
`tool-search-keywords.test.ts`, `tool-search-keywords.theme-copy.test.ts`) as a regression check —
all 12 tests across those three files pass, no change in behavior for existing entries.

Did NOT run any `serve-command*.integration.test.ts` (known 3-for-3 hang, per dispatch warning).

## tsc result
`npx tsc -p tsconfig.json --noEmit` from repo root fails with 2 pre-existing errors, both in
`apps/website/src/features/content-duplication/tool-registrations.ts` (`Cannot find name
'listDuplicateResourceHandlers'` / implicit-any on `contributor`). Confirmed via `git status` that
this file is separately modified (uncommitted) and NOT touched by this task — it belongs to another
in-flight agent's work on the content-duplication feature (matches the most recent commit on this
branch, `31f83205 feat(assistant): land the in-flight content_duplicate registry so HEAD resolves`).
Not fixed here — out of scope per this dispatch.

## Commit
See git log for this file's own commit; both `tool-search-keywords.ts` and the new test file were
added with explicit `git add` (no `-A`), commit message via `git commit -F` on a uniquely named
message file.
