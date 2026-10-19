TDD(Direct): TDD persona selected for behavior-focused coverage tests. Added 11 tests across six existing suites; no production changes.

CHANGED FILES:

- /Users/la/Programming/Tovu/apps/website/src/features/navigation/__tests__/page-target-fallback.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/server-logs/__tests__/unit/server-logs-tool.unit.test.ts
- /Users/la/Programming/Tovu/apps/website/src/platform/server-logs/__tests__/unit/log-buffer.unit.test.ts
- /Users/la/Programming/Tovu/apps/admin/src/components/AssistantDock/__tests__/use-chat-display-preferences.hooks.unit.test.ts
- /Users/la/Programming/Tovu/apps/admin/src/components/__tests__/use-folder-upload.hooks.unit.test.ts
- /Users/la/Programming/Tovu/apps/admin/src/components/__tests__/MediaContentEditor.unit.test.tsx

PER FILE:

- `page-target-resolver.ts`: added non-entry target rejection, explicit optional arguments, and whitespace-only URL fallback rejection.
- `pages/agent-tools.ts`: unchanged; fixed-vocabulary fallback gaps documented below.
- `server-logs/tool-registrations.ts`: added unexpected filter-error propagation and default process-log source coverage.
- `style-values.ts`: unchanged; existing tests already exercise both return outcomes of both functions.
- `log-buffer.ts`: added omitted-options/default-clock behavior and eviction with a long live tail across compaction.
- `chat-display-preferences.adapter.ts`: added real hook → ledger → API flow, asserting stored preferences and the exact changed user-setting write.
- `use-folder-upload.hooks.ts`: added missing input, null file list, unexpected handoff failure, and successful retry.
- `HtmlAttributeRows.hooks.ts`: added external-value replacement, including dropped-attribute flags and no edit emission.

UNREACHABLE:

- `apps/website/src/features/pages/agent-tools.ts:78`: generic placeholder fallback cannot occur with the installed marker vocabulary; every keyed type has a placeholder.
- `apps/website/src/features/pages/agent-tools.ts:80`: missing-note fallback cannot occur; every included marker type has a note.

Both remain unchanged for the owner’s decision.

NOT DONE:

- Tests, typecheck, builds, coverage, and package scripts were not run, as instructed. Exact 100% coverage remains unverified.
- The reported third catalog branch and style-value gaps need reconciliation by the locked verifier.
- No git state mutations or commits.
