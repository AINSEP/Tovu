Five sheets done; C7-WHY stopped under its duplicate-ID rule.

- **I2-J — done:** Changed CMS media `ports.ts`, `repo.memory.ts`, and `__tests__/repo.memory.test.ts`. Added two tests before source edits. Both `list` signatures gain the optional hash filter. Wrote `.changeset/jm7-i2-blob-list-filter.md`.
- **K-04b-J — done:** Widened `media/cover-image.ts`’s named property and copied the supplied leaf into `seo/cover-image.ts`, with four exports. No tests or changeset added; manifest/API integration remains owed to cloud.
- **C7-CX1 — done:** Changed only `packages/agent-plugins/src/lifecycle/automatic-use.ts`, extracting `withPluginNotes` exactly as specified. No test, changeset, or API delta.
- **C7-CX2 — done:** Changed only `packages/integrations/src/api-connections/hosted-mcp/sign-in-configuration.ts`, extracting `selfConfiguredEndpoints`. Both endpoint return types matched. No test, changeset, or API delta.
- **C7-ERR — done:** Updated `scripts/error-gate-debt.json`, webhook `tool-handlers.ts` and its registration test, and CMS `chat-preview.ts`. Strengthened the conflict-cause assertion before source changes. Wrote `.changeset/jm7-c7-err.md`. No API delta; ledger total unchanged.
- **C7-WHY — STOPPED:** All 116 supplied IDs already existed, starting at `scripts/why-comments-debt.json:949`. The working-tree append appeared independently during this session and exactly matches the supplied rows. Preserved it without editing or duplicating rows.

Created [COMMIT-PLAN.md](SCR/c-jm7-b/COMMIT-PLAN.md) and `REFRESH.md`, recording deferred checks, mutations, API work, the WHY STOP, and the existing chat-preview assertion’s actual test name.

Diff review found no unrelated edits to delete. Assertions were reviewed by reading; no tests, builds, gates, staging, or commits were run.
