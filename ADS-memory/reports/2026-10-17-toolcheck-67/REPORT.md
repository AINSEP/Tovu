# toolcheck-67 — zoran tool fixes (Codex zorantools-67/r1)

Commit (Tovu): cfbad32b8. Jini: unchanged by this job (no rebuild, no Jini commit).

Review: no bugs, no overbuild. media_import_local_file joins BATCHABLE_TOOLS, so it gets the same generic BatchResult as media_import_from_url.
`template` must be in applicableThemeTemplates(active theme, STORED kind). "../page.html", unknown names, wrong-kind names and non-strings all return BAD_REQUEST with the valid list and write nothing.
"" means no template and null resets. Permission is checked before the theme lookup. The pre-image records templateChoice and the reverter restores it (tested end to end).
Production deps: AssistantToolRegistryDeps includes PostToolDeps & SetActiveThemeToolDeps, so presentationRepo/themes are supplied.

RED->GREEN: 16 new/changed tests fail with HEAD's 6 source files swapped in by a load hook. 167/167 pass across the 5 Codex test files + batch-tool-inputs, tool-registrations.post, tool-registrations.contracts.
Typecheck: 2 errors, both in another lane's uncommitted files (features/trash/adapters/media.ts:89, composition/permanent-delete-deps.ts:199).
Mutation: not run (owner rule today).

Shared files: import-local-file.test.ts and media-import tool-registrations.test.ts also had another lane's hunks: the isolated-catalog-home import, the omitted-root-resolver and content-type-failure tests, withCallerSafeEgressRefusal, and the refusal-logger/transport/egress tests. Only my hunks were committed (git apply --cached), so theirs are still uncommitted.
Also untouched: fetch-image.test.ts, post.schedule-featured.test.ts.
:3000 https 200. Real-home snapshot unchanged. No Codex follow-up needed.
