# Fix report: content and plugin fixes, 2026-10-21

Run 21:21–22:25 UTC; three Opus subagents, one per branch pair. All branches pushed; HEAD = origin.

| Repo | Branch | Commits |
|---|---|---|
| Tovu | `cloud/fix2-scheduled-2026-10-21` | fdd0c32f 71e0e619 3f27b4eb 7fc8e37c 1456080d a33a7dab + report |
| Tovu | `cloud/fix-plugins-2026-10-21` | 77080ea9 56c93a7a 170134f9 b462482f a2b31a90 |
| Jini | `cloud/fix-plugins-2026-10-21` | c258fba0 |
| Tovu | `cloud/fix-comments-2026-10-21` | 31162fed 924f58fa bd07a57a |
| Jini | `cloud/fix-comments-2026-10-21` | d03465ae |

## 04-fix-scheduled.md
| Finding | Outcome |
|---|---|
| HIGH go-live.ts:60 legacy id collision | fixed fdd0c32f: id `${id}-entry.published-at-${publishAt}`; regression with delivered legacy event |
| HIGH post.ts:1926 enqueue after commit | fixed fdd0c32f: create/update/delete/retire/restore/import enqueue in the write txn; enqueue-failure + restart tests |
| HIGH go-live.ts:85 straddling edit double-fires | fixed fdd0c32f: one id per scheduled publication; fake-port overlap test |
| HIGH reverters.ts:256/:169 undo announces early | fixed 71e0e619, 1456080d: shared schedule-aware logic, raw save kept; tests via `revertChangeSet` |
| HIGH repo.ts:121 + html-document-store.ts:479 | fixed 3f27b4eb: SQL + memory HTML stores announce in the write txn; sqlite + pglite |
| MED go-live.ts:43, repo.ts:111, repo.memory.ts:77 optionalObj | fixed fdd0c32f |

## 11-plugins.md (lifecycle owner)
| Finding | Outcome |
|---|---|
| HIGH install-upload.ts:203 journal guard bypass | fixed Jini c258fba0 + Tovu 56c93a7a (reproduced first): every install settles journal under plugin lock |
| HIGH app.ts:11 site-backups import | listed: exists on integration (big merge) |
| HIGH lockfile / 0.4.7 pin / sibling resolver | listed: release order |
| MED name grammar duplicated | fixed: Jini exports `isAgentPluginName({value})`, Tovu uses it |
| MED positional helpers | fixed 170134f9, b462482f (`toToolInputError` left: comments branch owns its caller) |
| MED AddAgentPluginPanel 15/14 | fixed 170134f9 → 7; status/actions split |

## 03-comments.md
| Finding | Outcome |
|---|---|
| HIGH site-title-write.ts:59 provider clear/reset bypass | fixed Tovu 31162fed (reproduced first): clear/reset/host clear/`settings_clear_value` refuse `core.comments/provider` (403) |
| HIGH Jini update.ts:101 A→B→A→C | plugins branch: not reproduced (stale-copy removal at :170 + idempotent `restoreOldBytes`); no-restart test added |
| MED snapshotAgentPluginSettings unbound | plugins branch: not reproduced (bound agent-plugin-connections.ts:178, spread in deps.ts/app.ts) |
| MED site-backups test orphan | listed (big merge) |
| MED update-effects assistant import | fixed on plugins 56c93a7a, a2b31a90 (injected port) |
| MED tool-metadata baseline | fixed on plugins 77080ea9 (comments entries settle at merge) |
| MED registry.ts:10 two-object API | fixed Jini d03465ae, Tovu 924f58fa |
| MED AgentPluginUpdateControl props | fixed on plugins 170134f9 |
| MED parseJournal complexity | plugins branch: not reproduced (measures 7) |
LOW findings: none in these reviews.

## Complexity
installArchivePlugin 16/15 → 4 (bd07a57a). All touched functions ≤10 cyc+cog (eslint 0 findings). complexity.md rows already ≤10 on plugins: compatibility ≤7, updateLocked 5, reconcilePlugin 6, AgentPluginRow 7, install.ts handler 10.

## Tests (touched packages only)
- Scheduled: 1652 run, 1650 pass, 1 skip, 1 fail (`repo.postgres.test.ts`, needs Postgres).
- Plugins: Jini agent-plugins 1268 pass/2 skip; Tovu agent-plugins+routes 1396 pass (temp uncommitted site-backups stub); admin plugins 477 pass.
- Comments: Tovu 1594 pass/4 skip (pre-existing); Jini capability-providers 186 pass.
- tsc error counts unchanged from baseline, none in touched files.

## Coverage (line/branch/func %)
- Scheduled: go-live, post, repo, repo.memory, both HTML stores, outbox-repo 100/100/100; reverters 100/97.9/100.
- Plugins: update-effects, install route, install-response, manifest, update, update-store, rules 100/100/100. Below: Jini install.ts 95.2/94.3/100, install-upload 99.7/95.7/100, install-tool 100/87.9/100, uninstall-tool 99.2/94/100, agent-plugin-connections 89/96/80, AgentPlugins.tsx 97.5/100/95.8.
- Comments: registry, site-title-write, builtin-provider 100; install-tool 100/88/100; shared.ts, tool-registrations, provider-selection 1–2 branches short.
- Every gap is in pre-existing code; all new lines covered.

## LOCAL-RUN NEEDED
- `*.postgres.test.ts`; go-live overlap on real PG read-committed; e2e: schedule, edit after go-live before sweep, expect one event.
- Plugin route/tool-metadata/assistant integration tests once site-backups lands; Playwright on Agent Plugins.
- `postgres-baseline.test.ts` (pglite) schema mismatch, likely linked-Jini drift.

## LOCAL VISUAL CHECK
Admin Agent Plugins: Add tab (install mode); installed row Update panel (open/close, Updating…, alert, success).

## Noticed, not coded
- `peer-site-reads.ts` HTML store has no outbox → peer HTML writes get no go-live catch-up.
- `updateJournalNextStep` in plugin-runtime/tool-registrations.ts still positional.
- Checkouts used `link:jini` to local worktrees; `npm run unlink:jini` before real builds.

## Owner questions
1. **Before deploy:** the new go-live id makes the first boot announce once every historic scheduled post with `publishAt > updatedAt` (already announced early under old ids). Accept the burst, or bound catch-up with a deploy watermark?
2. Global-scope reset of `core.comments` is now refused (was 500). OK?
3. Make generic-route provider *set* return 403 like clear/reset (now 400)?
