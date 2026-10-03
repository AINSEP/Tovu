# Review part 5 of 6: features C, assistant, admin, desktop (962f928fb..HEAD)

Reviewer: Opus 5.5, code-inspection persona (`AI-Dev-Shop/agents/code-inspection/skills.md` loaded). READ-ONLY: all code read through `git show HEAD:` / `git diff 962f928fb..HEAD`. The 11 issues fixed from `2026-09-28-codex-sol-review-today.md` are not re-reported.

Counts: **critical 0, high 1, medium 2, low 9**.

## Bugs

### HIGH-1: a PGlite/Postgres site counts as "no key-dependent data", so boot mints or adopts a wrong key and overwrites the fingerprint guard
- `apps/website/src/features/webhooks/site-key-ensure.ts:202-209` (also used at :236, :240, :250). The same pattern is in `server/inbound/admin-http/routes/system/site-token.ts:190`.
- `siteHasKeyData` scans only `join(siteDir, "content.db")` and returns `false` when that file does not exist. Under ADR-067 a PGlite site keeps its data in `<site>/pglite/` and a Postgres site keeps it in the remote database. Neither has a `content.db`. None of the following are scanned:
  - the sealed rows in those stores;
  - `<site>/.storage-secret.json`, the Postgres connection string sealed with the site key.
- Scenario (dev/local mode):
  1. Start with a Postgres or PGlite site that holds sealed credentials or webhooks.
  2. Its per-site key file `~/.tovu/site-keys/<id>.hex` is missing: new machine, restored folder, or deleted by mistake. No env or legacy key is set.
  3. `planSiteKeyEnsure` receives `siteDbsWithKeyData: false` and returns `mint`. A new key is written, and because `mayRestamp()` also returns `true`, `.site-meta.json`'s `siteKeyFingerprint` is overwritten.
  4. Every sealed value is now unreadable. On Postgres this includes the connection string, so the site no longer boots. The stamp that would have produced a `mismatch`/`refuse` is gone.
- Same scenario with a different env or legacy key present: `adopt` skips the stamped-fingerprint mismatch check at :236, because `siteHasKeyData()` returns false. The wrong key is adopted and the stamp is replaced.
- The admin Site Token route reports `missing` instead of `missing-with-data` for these sites.
- Fix direction: base "has key data" on the site's storage kind. For non-SQLite sites, treat an existing `.storage-secret.json` or a `pglite/` dir as having data. Better: scan through the site's store kernel with `hasKeyDependentData(kernel)`, which is already dialect-agnostic.

### MEDIUM-1: the write-shaped input check misses acronym-led camelCase names
- `apps/website/src/assistant/mcp-federation/trust.ts`, `isWriteShapedName`. The regex is `/([a-z0-9])([A-Z])/g`.
- A run of capitals is never split. Examples:
  - `SQLQuery` becomes `sqlquery`;
  - `SQLStatement` becomes `sqlstatement`;
  - `DDLScript` becomes `ddlscript`;
  - `GraphQLMutation` becomes `graph qlmutation`.
- None of these match `WRITE_SHAPED_INPUT_WORDS`. A tool labelled `readOnlyHint: true` with an input named `SQLQuery` therefore gets no card, and a remembered approval still applies. That is exactly the case the "Extra safety checks" owner rule targets.
- Fix: also split acronym boundaries (`/([A-Z]+)([A-Z][a-z])/g`), or match words as substrings of the lowercased name.

### MEDIUM-2: renaming an external MCP server's label silently voids and deletes every "Always allow" for it
- The fingerprint v2 in `apps/website/src/assistant/external-mcp-tool-approvals.ts` hashes `identity.description`, which is `AdmittedFederatedTool.description`.
- That description is `describeFederatedTool({ label: config.label, ... })` (trust.ts `classifyRemoteTool`), so it embeds the operator-editable connection label.
- `externalMcpAdmissionRevision` (external-mcp-store.ts:406) deliberately leaves the label out. The new fingerprint brings it back in.
- Scenario: the owner renames a server on the Integrations page. The next call to each tool finds a mismatching row, deletes it (`isRemembered`), and shows the card again. The owner never changed what the tool does.
- This fails safe, but it contradicts the admission revision's design and the "drift = the tool changed" intent. Fix: hash the remote's own `tool.description`, not the Tovu-built text.

### LOW-1 (PLAUSIBLE): the storage move fails with a raw Postgres error on plugin tables that use a custom type
- `apps/website/src/features/database-transfer/pg-store-copy.ts`, `columnDdl` / `readCatalog`.
- A created (plugin) table whose column type is an enum, domain or extension type (`format_type` returns its name) fails `CREATE TABLE` on the target, because the type is never created there. The failure surfaces as a raw PG error, not a `StoreCopyError`.
- Nothing is lost, because the whole transaction rolls back. `nextval` defaults get an explicit refusal, but custom types do not.

### LOW-2: the "Always allow" tab lists approvals that no longer skip the card
- `apps/website/src/server/inbound/admin-http/routes/external-mcp/tool-approvals.ts` and `apps/admin/src/features/providers/AlwaysAllowPanel.tsx`. The page text says "These tools run without asking."
- Rows saved under fingerprint v1 are still listed until each tool's next call deletes them. After the v2 bump that is every row that already existed. Tools that are now write-shaped are also listed, although they always ask.
- The display is wrong in the safe direction.

### LOW-3: two concurrent revokes re-enable the second row's button early
- `apps/admin/src/features/providers/hooks/use-always-allow.hooks.ts`, `revoke`. There is only one `pendingKey`.
- The first revoke's `.finally(() => setPendingKey(null))` clears the key while the second revoke is still in flight.

### LOW-4: the RSS `<pubDate>` can read "Invalid Date"
- `apps/website/src/features/seo/feed.ts`, `renderItem`.
- `new Date(item.updatedAt).toUTCString()` gives `Invalid Date` when `updatedAt` cannot be parsed. That produces an invalid RSS item where the item should be skipped or the tag omitted.

### LOW-5 (PLAUSIBLE): `withSecurityMeta` inserts the tag after the first `<head`-like match, not the real `<head>`
- `apps/website/src/features/site-export/static-security-headers.ts`, `HEAD_OPEN_TAG`.
- A theme page with `<head>` text inside an HTML comment or inline script before the real head gets the meta tag inserted there instead.

## Excess / slop

### LOW-6: an orphaned JSDoc in `apps/admin/src/lib/api.ts:111-124`
The new `AdminExternalMcpToolApproval` interface and its doc were inserted between `AdminExternalMcpServer`'s JSDoc block and that interface. `AdminExternalMcpServer` has lost its documentation, and a dangling block now sits above the new doc.

### LOW-7: "Sqlite" names on code that no longer depends on SQLite
- `createSqliteAgentSessionStore`, `createSqliteConversationToolApprovalStore` (assistant/persistence).
- The `Sqlite*Repo` subclasses kept only for the composition root (`navigation`, `widgets`, `workspace`, `content-types`, `plugin-runtime`, `presentation`, `deployments`, `tool-audit`).
- All of them now take any kernel and run on every dialect. The names mislead readers (for example about PGlite support).

### LOW-8: `repo.rows.ts` split files with a single importer
`content-types/repo.rows.ts`, `plugin-runtime/repo.rows.ts` and `presentation/repo.rows.ts` each have exactly one importer (their `repo.ts`). That is an extra file with no reuse. It is repo-wide convention, so this is noted only.

### LOW-9: a type/package version mismatch in root `package.json`
`js-yaml` moved to `dependencies` at `^5.3.0`, while `@types/js-yaml` stays at `^4.0.9`.

## Architecture
- **(inside LOW-8 / noted)** `platform` imports `features`:
  - `platform/db/pglite/content-schema.ts` (new in range) imports `features/database-transfer/table-catalog`;
  - `platform/site-dir/init-site.ts` imports `features/database-transfer/pg-store-copy`.
  - This inverts the layering. There are about 45 pre-existing platform-to-features imports, so it is not a new class of problem. `nonEmptyTables`, `readCatalog` and `collectSchemaTables` belong in `platform/db`.
- ADR-067 checks:
  - The expiry sweep runs in the owner only (`deps.ts` `startOwnerChatExpirySweep`). OK.
  - The chat store and run ledger use only transaction-scoped `lockKey` (no session advisory locks). OK.
  - The move keeps source reads short, and its one long transaction is on the Postgres target, not PGlite. OK.
  - HIGH-1 is the ADR-067 gap: key-safety logic still assumes `content.db`.
- `AlwaysAllowPanel.tsx` is markup only. Its logic is in `use-always-allow.hooks.ts` and `always-allow-rules.ts`. OK.

## Verified clean (no finding)
- `chat-history-store.ts` is a faithful statement-for-statement port of Jini's `createChatHistoryStore`: owner predicate on every statement, cross-conversation id guard on the upsert, position under the conversation lock.
- `run-ledger.ts`:
  - `unlessSettled` and `settle` share the run lock;
  - `checkpoint`'s single guarded UPDATE is safe under READ COMMITTED;
  - nested kernel transactions join, because `sqliteKernel` is memoized per connection, so the store and ledger share one kernel.
- Repo ports (navigation, deployments, tool-audit, widgets, workspace, content-types, plugin-runtime, presentation, database-transfer destination) keep the old semantics:
  - the Postgres ON CONFLICT targets have matching unique indexes;
  - `int8` is parsed to a number;
  - booleans are bound as 0/1 on SQLite;
  - `plugin_activations.enabled` is `boolean` on Postgres.
- Approvals:
  - write-shaped calls cannot be remembered, and a forged choice is ignored;
  - revoke and list are guarded by `admin.integrations.manage`;
  - there is no route-order clash with `:serverId`.
- `AssistantDock.hooks.tsx`: an empty `/api/agents` list now rejects. The server always lists every known CLI (`agents.ts` filters only unsupported ids), so `[]` means a daemon mid-restart. OK.
- `desktop/project-ipc.ts`: `id` is the siteDir, so `explainMissingSiteDir(id, …)` stats the right path.
- `dist-import-check.ts`: the walk is sound, and missing relative targets are reported.
- `escapeHtml` consolidation: `platform/html/escape.ts` output is identical to the removed copies.

## Files reviewed
- **Assistant:**
  - `external-mcp-call-confirmation.ts`, `external-mcp-tool-approvals.ts`, `mcp-ui.ts`
  - `mcp-federation/{ports,registrations,trust}.ts`
  - `persistence/{agent-session-store,chat-expiry-sweep,chat-history-store,conversation-tool-approval-store,run-ledger,store-factory,tenant-scope}.ts`
- **Admin:**
  - `AssistantDock.hooks.tsx`, `Login.tsx`, `StaticSiteTab.tsx`, `OtherCredentialsSection.tsx`, `ProvidersTab.tsx`, `Users.tsx`
  - `providers/{AlwaysAllowPanel.tsx,Providers.tsx,always-allow-rules.ts,providers-i18n (diff stat only),hooks/*}`
  - `lib/api.ts` (diff)
- **Desktop:** `project-ipc.ts`, `dist-import-check.ts`, `scripts/stage-payload.ts`
- **Features:**
  - `analytics/{ports,repo.memory}`, `content-types/*`, `custom-credentials/store`
  - `database-transfer/{destination-repo,pg-store-copy,table-catalog}`
  - `deployments/{repo,repo.sqlite,export-run,static-publish/adapter}`
  - `fs-files`, `navigation/*`, `plugin-runtime/*`, `presentation/*`
  - `publish-content/{file-tree-policy,peers,type-registry}`
  - `seo/{feed,index,page-head-contributor,seo,types}`
  - `site-backup/sources`, `site-export/{route-manifest,site-exporter,static-security-headers}`
  - `sites/{deps,tool-registrations}`, `source-control/commit-site`
  - `theme/{entry-list-render,static-render,theme-files}`
  - `tool-audit/*`, `vendor-credentials/store`
  - `webhooks/site-key-ensure` (plus the old `site-key-sources`)
  - `widgets/{repo,write-service}`, `workspace/*`
- **Root:** `package.json`
- **Context read (outside the slice, to verify findings):**
  - `platform/db/{chat-kernel,key-dependent-data,watermark-kernel,kernel/port,kernel/drivers/sqlite,kernel/drivers/pg-types}.ts`
  - `routes/external-mcp/{tool-approvals,guard}.ts`
  - `server/runtime/composition/{storage-secret,deps (sweep)}.ts`, `modules/assistant(-chats).ts`
  - ADR-067

## Not reviewed
- Test helpers and fixtures: `assistant/persistence/__tests__/{chat-dialect-matrix,chat-seed}.ts`, `webhooks/__tests__/fixtures/site-key-ensure-child.ts`, and every `*.test.ts`.
- `apps/admin/src/features/providers/providers-i18n.ts` and `always-allow.css`: strings and styles only.
- `packages/**` and `scripts/**`: no non-test changes in range.
- Excluded dirs and the theme sync-originals commits, as instructed.
- No mechanical sensors (`code_metrics`, `dependency_graph`, coverage) were run: this was a read-only review with no builds or tests. Complexity was judged by eye; nothing above ceiling 9 was seen in the new functions.
