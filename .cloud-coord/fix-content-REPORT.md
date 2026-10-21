# Fix report: content and plugin fixes (scheduled posts, comments, plugin lifecycle), 2026-10-21

The run started at 21:21 UTC; the subagents finished by 22:20. Three Opus subagents, one per branch pair.

| Repo | Branch | Commits |
|---|---|---|
| Tovu | `cloud/fix2-scheduled-2026-10-21` | fdd0c32f, 71e0e619, 3f27b4eb, 7fc8e37c, 1456080d, a33a7dab, then this report |
| Tovu | `cloud/fix-plugins-2026-10-21` | 77080ea9, 56c93a7a, 170134f9, b462482f, a2b31a90 |
| Jini | `cloud/fix-plugins-2026-10-21` | c258fba0 |
| Tovu | `cloud/fix-comments-2026-10-21` | 31162fed, 924f58fa, bd07a57a |
| Jini | `cloud/fix-comments-2026-10-21` | d03465ae |

## 04-fix-scheduled.md (Tovu)

| Finding | Outcome |
|---|---|
| HIGH go-live.ts:60, legacy event id collides | fixed (fdd0c32f). The id is now `${id}-entry.published-at-${publishAt}`. Regression test seeds an already-delivered legacy event. |
| HIGH post.ts:1926, enqueue runs after commit | fixed (fdd0c32f). Create, update, delete, retire, restore and import enqueue inside the write transaction. Tests cover enqueue failure and restart recovery. |
| HIGH go-live.ts:85, edit straddling go-live double-fires | fixed (fdd0c32f). One id per scheduled publication. The overlap test uses a fake port; real Postgres needs a local run. |
| HIGH reverters.ts:256/:169, undo announces early | fixed (71e0e619, 1456080d). Both reverters use the shared schedule-aware event logic and still use a raw save with no before-save hooks. Tests go through `revertChangeSet`. |
| HIGH repo.ts:121 + html-document-store.ts:479, HTML edits erase pending announcements | fixed (3f27b4eb). The SQL and in-memory HTML stores announce inside the write transaction. Tested on sqlite and pglite. |
| MED go-live.ts:43, repo.ts:111, repo.memory.ts:77, missing optional object | fixed (fdd0c32f) |

## 11-plugins.md (lifecycle owner)

| Finding | Outcome |
|---|---|
| HIGH install-upload.ts:203, install bypasses the journal guard | fixed (Jini c258fba0, Tovu 56c93a7a). Reproduced first. Every install now settles the journal under the plugin lock. |
| HIGH app.ts:11, site-backups import | listed. The route exists on integration and will resolve at the big merge. |
| HIGH lockfile / 0.4.7 pin / sibling-source resolver | listed. Release-order item. |
| MED plugin-name grammar duplicated in Tovu | fixed. Jini now exports `isAgentPluginName({value})` and Tovu uses it. |
| MED positional helpers (install-upload, rules.ts:567, others) | fixed (170134f9, b462482f). `toToolInputError` stays positional because the comments branch owns its other caller. |
| MED AddAgentPluginPanel complexity 15/14 | fixed (170134f9). Down to 7; status and actions are split into their own components. |

## 03-comments.md

| Finding | Outcome |
|---|---|
| HIGH site-title-write.ts:59, DELETE/reset of the provider bypasses `comments.configure` | fixed (Tovu 31162fed). Reproduced first. Clear, reset, host clear and `settings_clear_value` now refuse `core.comments/provider` with 403. |
| HIGH Jini update.ts:101, A→B→A→C rollback collision | fixed on the plugins branch: not reproduced. The `update.ts:170` stale-copy removal plus the idempotent `restoreOldBytes` cover it. A no-restart A→B→A→C test was added there. |
| MED snapshotAgentPluginSettings never bound | plugins branch: not reproduced. It is bound at `agent-plugin-connections.ts:178` and spread into `deps.ts` and `app.ts`. |
| MED site-backups.integration.test.ts orphan import | listed (big merge) |
| MED update-effects.ts imports assistant code | fixed on the plugins branch (56c93a7a, a2b31a90). The roster notifier is now an injected port. |
| MED tool-metadata baseline missing `agent_plugins_update` | fixed on the plugins branch (77080ea9). The comments entries settle at merge. |
| MED registry.ts:10, two-object API | fixed (Jini d03465ae, Tovu 924f58fa) |
| MED AgentPluginUpdateControl builds its controller internally | fixed on the plugins branch (170134f9). The owner now passes the controller in through props. |
| MED parseJournal complexity | plugins branch: not reproduced. It already measures 7 there. |

LOW findings: none were raised in these three reviews.

## Complexity

- installArchivePlugin: 16/15 → 4 (bd07a57a).
- All touched functions measure ≤10 cyclomatic and cognitive; eslint `complexity` and sonarjs report 0 findings.
- Rows from complexity.md already at ≤10 on the plugins branch: compatibility ≤7, updateLocked 5, reconcilePlugin 6, AgentPluginRow 7, install.ts handler 10.

## Tests run (only the touched packages)

**Scheduled branch**
- Post, pages, commands, trash, change-sets and event suites: 1652 tests; 1650 pass, 1 skip, 1 fail. The failure is `repo.postgres.test.ts`, which needs a Postgres server.

**Plugins branch**
- Jini agent-plugins: 1268 pass, 2 skip.
- Tovu agent-plugins and routes: 1396 pass. This needed a temporary site-backups stub, which was not committed.
- Tovu admin plugins: 477 pass.

**Comments branch**
- Tovu: 1594 pass, 4 skip (pre-existing).
- Jini capability-providers: 186 pass.

`tsc` error counts are unchanged from the baseline; none of the errors are in touched files.

## Coverage of touched files (line/branch/function %)

**Scheduled:** go-live, post, repo, repo.memory, both HTML stores and outbox-repo are 100/100/100. reverters.ts is 100/97.9/100; the uncovered branch is in old code.

**Plugins:**
- 100/100/100: update-effects, install route, install-response, manifest, update, update-store, admin rules.
- Below 100: Jini install.ts 95.2/94.3/100, install-upload 99.7/95.7/100, install-tool 100/87.9/100, uninstall-tool 99.2/94/100, agent-plugin-connections 89/96/80, AgentPlugins.tsx 97.5/100/95.8.

**Comments:**
- 100/100/100: registry, site-title-write, builtin-provider.
- install-tool 100/88/100.
- shared.ts, tool-registrations and provider-selection each have 1–2 branches uncovered.

Every gap below 100% is in code written before this run; all new lines are covered.

## LOCAL-RUN NEEDED

- `*.postgres.test.ts`, including `repo.postgres.test.ts`.
- The go-live overlap on real Postgres under read-committed.
- An end-to-end check: schedule a post, edit it after go-live but before the sweep, and confirm exactly one event.
- Plugin route, tool-metadata and assistant integration tests once site-backups is on the branch.
- Playwright on the Agent Plugins screen.
- `postgres-baseline.test.ts` (pglite) fails a schema-equality check that appears unrelated, likely a mismatch with the linked Jini.

## LOCAL VISUAL CHECK

- Admin Agent Plugins, Add tab, install mode.
- An installed row's Update panel: open/close, "Updating…", alert and success lines.

## Not done / noticed (not coded)

- `peer-site-reads.ts` builds the HTML store without an outbox, so peer-site HTML writes get no go-live catch-up.
- In `plugin-runtime/tool-registrations.ts`, `updateJournalNextStep` still uses positional arguments.
- The Tovu checkouts used `link:jini` against local Jini worktrees. Run `npm run unlink:jini` before a real build.

## Owner questions

1. **Decision needed before deploy:** with the new go-live id, the first boot after deploy announces once every historic scheduled post where `publishAt > updatedAt`. The old ids hid these, so they were already announced early. Accept that one-time burst, or bound the catch-up (for example with a deploy watermark)?
2. A global-scope reset of `core.comments` is now refused. It previously returned 500 because of an unrelated scope error. Is that acceptable?
3. Should a provider *set* through the generic settings route return the same 403 as clear and reset? It currently returns `ValueValidationFailedError` (400).
