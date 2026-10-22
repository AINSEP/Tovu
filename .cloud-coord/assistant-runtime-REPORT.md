# assistant-runtime REPORT — branch `cloud/assistant-runtime-2026-10-21` (Tovu + Jini)

## Items
- **1 Batch by default — DONE.** Jini `4ceb6f7c` (batchEligibilityFor/defaultBatchableTools), `cdf5171c` (withoutBatchGuidance). Tovu `29b20e41`, `b6e0424f` (remaining suites).
- **2 preferSubagents — DONE.** Jini `c47b63a4`; Tovu `76f06f46`.
- **3 Claude in Chrome — DONE.** Jini `d77f7c09`; Tovu `116d973a`.

## Item 1 — batching
- Rule (Jini, generic): a tool takes `items` unless the host opts it out. Three structural exclusions: no object schema; already has its own `items`; read-only with no required input (list/search reads, not read-by-id).
- Tovu `BATCHABLE_TOOLS` (opt-in) is **replaced** by `BATCH_OPT_OUT` (75 entries, one-line reason each) plus `BATCH_TOOL_SETTINGS` (caps only). File: `apps/website/src/assistant/batch-tool-inputs.ts`.
- Opt-out groups (full reasons are in the file):
  - Leaves the site / live host: deploy, static publish, set/unset secret, export, Dockerfile, publish_content_publish/execute_pull, source_control commit, newsletter send/schedule/resume, mail test, consent publish, custom_credential_make_request.
  - Asks per call (escalation/overwrite/permanent): mail/comments provider, consent update, plugins_set_enabled, settings_set/clear_value, db migrate/transfer run, backup restore, theme_reset_file, change_sets_revert, taxonomy merge, plugin_source_delete. The 11 permanent deletes are batched through the existing ONE-card plan; trash_empty is excluded because it already empties everything.
  - Restart / site switch / whole-site actions: sites_switch/create/duplicate, preview_reload, theme_rescan, theme_set_active, backups, share, credential copy, forms_pull_submissions, plus 9 site-wide singletons (SEO/comments settings, sitemap, workspace, etc.).
  - Already takes an array or its own `items`: menus create/update tree, redirects_import, custom_credential_write_files, site_collect_page_evidence, assistant_render_ui.
  - Interactive: assistant_ask_choice, external_mcp_reauth_prompt, credential_save, identity_user_create (password dialog), the OAuth connect/poll tools, deployment_ops_wait.
- Counts, from the production catalog with all permanent deletes granted: **314 tools → 165 batchable**, 75 opted out, 74 list reads.
- maxItems: 146 tools at 25 (default), **16 at 100** (redirects create/update/tombstone, taxonomy create/rename/assign/unassign, seo_set_entry_overrides, theme_trash_file, trash_item, content_post_delete, media/widgets/comments trash, comments approve/spam), theme_read_file and plugin_source_read at 20, web_fetch_page at 10.
- The 100-item tools are all approval class edit/trash, which run directly with no card. The guard test makes sure no tool that asks per call is ever batched per item, so none can ask once per item.
- Guard tests (`assistant/__tests__/batch-tool-inputs.test.ts`):
  - Fails for any production tool that is not batchable, not opted out and not a list read.
  - Fails for any asking or rule-classified tool that is not opted out.
  - Fails for stale or duplicate opt-out entries and for entries without a reason.
- System guidance (`BATCH_GUIDANCE` in `assistant-system-overlay.ts`): "When doing the same operation to several items, pass them as items: [{...}, ...] in ONE call of that tool instead of one call per item."
- Side fix: about 200 identical batch suffixes pushed BM25 search ranking down (two operator-request ranking tests regressed). The search index now drops that guidance text (`withoutBatchGuidance`, used in `tool-catalog-query.ts`). The text the model reads in descriptions is unchanged.

## Items 2+3 — settings, for the later UI toggles
- Storage: existing `core.interface` definitions (same store, API and validation as `chatAgentPlugins`), per-operator scope, no schema change. Read/write through the generic settings API the admin already uses.
  - `preferSubagents`: boolean, default **true**.
  - `useClaudeInChrome`: boolean, default **false**. Always asks when the assistant tries to change it.
- Capability flags (Codex not declared: its `multi_agent` default is unverified): `GET /api/agents` now returns `supportsSubagents` and `supportsClaudeInChrome` booleans per runtime (type `AssistantAgentSummary`). These come from the Jini def fields `supportsSubagents` and `supportsChromeIntegration`, true on `claude` only.
- Admin non-UI module: `apps/admin/src/components/AssistantDock/assistant-runtime-preferences.ts` (load/save plus `visibleAssistantRuntimePreferences({agent})`).
- Subagent guidance is added only when the setting is ON, the runtime supports subagents, and Task/Agent are allowed for the run (`nativeCapabilities.subagents`).
- Chrome flags:
  - ON, owner, Claude Code: `--chrome` plus `--allowedTools mcp__claude-in-chrome mcp__claude-in-chrome__*`.
  - Supported runtime but not in effect: `--no-chrome`. Other runtimes: no flag.
  - Both flags depend on a `--chrome` help probe, so an older CLI never sees them.
  - Every existing deny stays (Bash stays disabled on locked runs; a test checks this).
  - Guidance line: "Claude in Chrome is available: prefer it for checking pages the owner is logged into; otherwise use the existing screenshot/Playwright tools."

## Tests (all touched packages)
- Jini core batch suites: 59/59. agent-runtime: 4104 passed, 1 skipped. daemon: 3477 passed.
- Tovu, final combined tree (assistant, inbound/assistant, settings and composition suites, `--test-concurrency=1`): **4065 passed, 2 failed**. Both failures were already there (below). Earlier: features tool suites 2369 passed; their only remaining failures are the Postgres suite and the propose-credential test that was already failing.
- Tovu typecheck (`tsconfig.tests.json`): 0 errors in touched files; 70 errors were already present elsewhere.
- Failing before this work and still failing (checked in a worktree of the base commit):
  - `mcp-ui-tool-calls` allowlist (`comments_set_provider`).
  - `cross-site-read-catalog` (`comments_get_provider`).
  - `publish-agent-tools` propose-credential.

## Coverage (line / branch / function)
- 100 / 100 / 100: Jini `core/batch-tool-inputs.ts`; Tovu `assistant/batch-tool-inputs.ts`; Jini `registry.ts`, `defs/claude.ts`, daemon `launch.ts` and `contracts.ts`; Tovu `admin-interface.ts`, `runtime-preferences.ts`, `assistant-runtime-guidance.ts`, `agents.ts`; the admin preferences module.
- Tovu `tool-catalog-query.ts`: 100 / 95.83 / 100. The uncovered branch is not confirmed to be the old `metadata` spread.
- `assistant-system-overlay.ts`: 95.42 lines. The uncovered lines are 37–47, untouched re-export and function-header lines that the tests at :157 and :165 do exercise; probably a tsx source-map artifact, not verified.
- `settings/tool-registrations.ts`: branches 97.78; the uncovered branch was already uncovered before (97.73).
- `tool-registrations.ts` and `agent-daemon-server.ts`: comment- or wiring-only changes, not coverage-gated (entry point / partial suite).

## Complexity
- eslint with `complexity` 10 and `sonarjs/cognitive-complexity` 10 on every touched source file: 0 errors; only warnings that were already there.

## LOCAL-RUN NEEDED
1. Real Claude Code with the Chrome extension installed: the `mcp__claude-in-chrome__*` tools appear in the in-app assistant when `useClaudeInChrome` is ON and do not appear when it is OFF. Also check that this holds together with `--strict-mcp-config --mcp-config`, `--setting-sources ''` and bypass/restricted permission modes.
2. The CLI accepts `--allowedTools mcp__claude-in-chrome mcp__claude-in-chrome__*` followed by `--chrome`.
3. The guidance lines show up in a real run's `--append-system-prompt`.
4. `features/database-transfer/__tests__/tool-registrations.postgres.test.ts`, which needs Postgres.
5. A live chat that bulk-creates taxonomy terms or tombstones redirects makes one `items` call of up to 100.

## Owner questions
- Chrome is **owner-only** (a non-owner admin gets `--no-chrome`). Keep that, or let the setting alone decide? To change it, edit `resolveClaudeInChromeEffective`.
- Should list/search reads (no required input) stay unbatched? This run treats only read-by-id reads as batchable.
- Asking tools (publish, escalation) stay single-call. A later pass could give them one combined confirmation card per batch, as permanent deletes have (not done; out of scope like the toggle screens).
