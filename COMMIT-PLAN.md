# r62t-rev-p11 Tovu handoff

Base/branch: `7c87b3c3f95301d59f55041bf163b723bbab5d79`, `codex/tv-f-p11`.
Changes are in the working tree. No commits, pushes, installs, tests, builds, type-checks, linters or mutations were run. `.git` was not modified. No subagents were used.

The dispatch's explicit instructions override the persona's test-running, pattern-confirmation, documentation, refactoring and commit requirements. Its sheets are the approved implementation pattern. The missing clone-local bootstrap and architecture documents were read from `/Users/la/Programming/Tovu/AI-Dev-Shop/` and `/Users/la/Programming/Tovu/ADS-memory/` where available. No external workspace was modified.

## Ordered coordinator commits

### 1. ST-6a.T — Site retention lifecycle (source implemented; untested)

Write tests first, then lifecycle and serving bindings.

Created:
- `apps/website/src/server/runtime/composition/retention.test.ts`
- `apps/website/src/server/runtime/composition/retention.ts`

Changed:
- `apps/website/src/server/runtime/composition/serving-app.ts`
- `apps/website/src/cli/commands/serve-listen.ts`
- `apps/website/src/index.ts`

`startSiteRetention` injects the existing released retention runner, policies, clock, scheduler, error sink and log sink. Listener readiness arms a five-minute boot delay; the runner then schedules daily dry runs. The current host supplies no policies. It retains the last report, logs each report, aborts its policy signal on stop, cancels timers and awaits the runner's drain.

Only a defined, unattached site-running lease composes the lifecycle. Both roots pass their lease, notify real app readiness and await retention stop before proceeding to bounded serving/store shutdown. Failed CLI boot also records retention among its owned workers. `index.ts`'s existing memory path returns no lease.

Anchor adjustment: the real CLI app creation, listener and shutdown are already in `cli/commands/serve-listen.ts`, called by `serve.ts:serveBootedSite`. Therefore the lifecycle edit belongs there; `serve.ts` needs no source edit. Its broad import tidier remains unchanged because ST-6c.T is skipped, not partly activated.

Tests added, before production edits:
- `never starts on a client role` (source wiring assertions using the existing boot-test convention)
- `stop drains before storage closes` (real runner with a held measurement, plus root shutdown wiring)
- `report line written` (real runner failure/report path)
- `boot pass waits for ready` (controlled timers; asserts delayed boot, daily interval and measurement-only mode)
- `no chat, revision, screenshot or media policy is registered`

Named mutation for Opus: start on every role by removing the lease/attachment condition in `serving-app.ts`. The ownership assertion must turn red. Existing ST-4 mixed-mode tests remain unchanged.

### 2. ST-9.T — Pinned chat migration (migration portion only; routes STOPPED)

Write migration/no-vacuum tests first, then DDL and registration.

Created:
- `apps/website/src/platform/db/migrations/__tests__/chat-pinned-step.test.ts`
- `apps/website/src/platform/db/migrations/__tests__/no-vacuum.test.ts`
- `apps/website/src/platform/db/migrations/chat/0004_chat_pinned.ts`

Changed:
- `apps/website/src/platform/db/migrations/index.ts`
- `apps/website/src/platform/db/sqlite/chat-db.ts`

Adds nullable `pinned_at` and `idx_ai_chats_owner_cleanup(scope_id, owner_kind, owner_id, pinned_at, updated_at)`. The TS step is immediately after `activeRunIndex`. Both SQLite paths guard the column using `pragma_table_info`; PostgreSQL uses its qualified table and `IF NOT EXISTS`. Fresh synchronous bootstrap calls the shared DDL immediately after its active-run index.

Tests added, before production edits:
- `fresh bootstrap = migrated schema`
- `migration manifest is complete`
- `adopted SQLite parity` (existing column and retained data, repeated step, repeated synchronous bootstrap)
- `no migration performs vacuum` (recursive scan of every non-test TS migration, including chat/project/commerce)

Named mutations for Opus: add `VACUUM` to `0004_chat_pinned.ts`; omit the fresh-bootstrap pinned DDL from `openChatDb`. The scanner and schema parity assertions, respectively, must turn red.

**Required Opus pin handoff:** `chat/0004_chat_pinned` is deliberately missing. `checksums.ts` and `source-digests.ts` are untouched. `pinned()` consequently throws on migration-module import until Opus generates the new pin. Do not release this intermediate tree. Temporarily allow only this key to return a placeholder only with `UPDATE_MIGRATION_CHECKSUMS=1`, run `__tests__/checksums.test.ts` with that flag, remove the temporary branch, rerun without the flag and verify that only the new checksum was appended. Commit neither bypass nor placeholder. No historical baseline, Drizzle SQL, journal or snapshot changed.

Route mounts and their rename/wire/CSRF/spoofing characterization tests are not implemented: they depend on a released ST-8a.J API (see stops below). Existing PATCH and single-delete paths remain unchanged.

## Sheet stops and skips (dispatch order)

1. **ST-6b.T STOPPED before edits.** On permitted Jini `codex/f-p11j`, `packages/db/src/recovery/journal-repo.sql.ts:SqliteRestorePointsRepo.save()` invokes its private `pruneCopies()`, which unlinks files directly. `RestorePointsRepoDeps` supplies `db`, `siteId`, `protectedRestorePointIds` and `onPruneWarning`, but no shared coordinator/mutex or reader-hold seam. A host-only coordinator around publication, daily cleanup and `restoreFromArtifact` would leave this existing deletion path outside the shared fence. Fixing it requires a Jini DB contract change not named in these sheets; no second pruning policy or Tovu wrapper was invented. The metadata-only Recovery list is not a byte reader and was left alone.
2. **ST-6c.T SKIPPED:** ST-6c.J stopped; `packages/platform/src/fs/owned-temp-root.ts` is absent from the permitted branch. The six writers and existing tidiers remain unchanged.
3. **ST-9.T route consumption STOPPED:** ST-8a.J is source-implemented, but the Jini report explicitly says release is incomplete. The new route export was added only by Jini `962986d0a`, while its package manifest still declares the same `0.7.3-next.2` as merge-21. No actual released consuming version is supplied. Tovu's manifest/lockfile cannot honestly be advanced to a nonexistent version. Migration work above is independent.
4. **ST-10.T STOPPED:** no actual chat major from ST-8b.J; `packages/chat/package.json` on the permitted branch still declares `0.7.3-next.2`. Its required ST-9 transport is also stopped. No hook/transport/UI shell was added.
5. **ST-11b.T SKIPPED:** OPUS ST-11a.J is not done; `packages/core/src/contracts/blob-gc.ts` is absent. No journal step, pin or media registration was added.
6. **ST-13.T STOPPED:** the new CMS engine/spec leaves exist only in the unreleased Jini change. No actual consuming release version is provided. No thinning path was enabled; STOP 6 remains intact.
7. **ST-15b.T STOPPED:** the platform retention route export exists only in the unreleased Jini change, with no new released version. Owner-only HTTP mounting was not replaced with a local route implementation.
8. **ST-15c.T STOPPED at host binding before edits:** the specified shared serving storage service is not present in the tool catalog's dependencies. ST-6a returns its lifecycle to the serving root; the current catalog receives no bound `measure`, `runOnce` or serving-owner storage availability. ST-14's `features/storage/measure.ts` is a standalone function taking resolved paths, not that service. ST-15b serving composition is stopped. Wiring the contributor now would need an additional host contract/bridge or disconnected implementation; neither is authorized by the anti-overbuild rule. No tools were registered without their real serving-owner service.
9. **ST-17s.T SKIPPED:** ST-17s.J stopped; `packages/integrations/src/web-screenshot/capture-retention.ts` is absent. Neither a parallel cleanup implementation nor an automatic screenshot policy was added.
10. **ST-17.T STOPPED:** the new admin StoragePanel export is unreleased, the ST-15b HTTP transport is stopped and ST-17s screenshot hook is unavailable. No dead panel route was registered.

Jini handoff evidence: the supplied `o-f-p11j/f-p11j.md` reports eight source-built sheets and five stopped sheets, and explicitly leaves releases/declarations/baselines/tests/mutations incomplete. Its source changes are now on the permitted branch at `962986d0a` (`wip(f-p11j): Sol extraction sheets (untested)`). All Jini reads used `git -C /Users/la/Programming/Jini show codex/f-p11j:<path>` or read-only branch metadata/diffs; Jini was not edited.

## OPUS sheets left

Tovu: ST-1a.T, ST-2a.T, ST-2b.T, ST-1.T, ST-3.T, ST-2c.T, ST-16r.T, ST-16.T, ST-7b.T, ST-7c.T, ST-12a.T, ST-12b.T, ST-18a.T, ST-18b.T.

Jini OPUS sheets (outside this Tovu job): ST-7a.J, ST-8c.J, ST-11a.J, ST-2a.J, ST-2c.J.

## Diff review / deletions

- Removed an exploratory fourth migration test and its imports: it asserted PG DDL but did not exercise an independent fresh-bootstrap path. The retained cases are exactly the named migration cases and mutation scanner.
- No pre-existing code or tests were deleted, weakened, reformatted or moved. No new helpers, factories, exported types, configuration flags, release versions or re-export shells were added beyond the sheet's lifecycle and DDL factories. Lease plumbing and lifecycle handles are the required host integration.
- No content policies were registered. No new broad wildcard tidier was introduced. No UI or desktop files changed.

## Review evidence and remaining validation

Architecture review: static inspection preserves the Jini runner boundary, site lease ownership, injected effects, no content retention, existing shutdown sequencing, immutable migration history and the required SQLite adoption guard. WARNING / partial delivery: new Jini consumers and shared storage service binding are stopped; the intentionally missing migration pin blocks runtime import until Opus handles it.

| Unit | Disposition | Findings / evidence | Local action |
| --- | --- | --- | --- |
| `startSiteRetention` | INCONCLUSIVE | Five named tests written; tests and mutations forbidden in this executor | Timer, abort, report and drain seams injected; no helpers added |
| Serving bindings | INCONCLUSIVE | Actual readiness and shutdown sites inspected; ownership check is source-tested | Both roots pass the lease and drain before storage close |
| `chatPinnedStatements` / `chatPinned.up` / fresh DDL | INCONCLUSIVE | Three named migration cases written; no execution; missing pin intentionally blocks imports | Same DDL shared by both SQLite paths; existing-column guards retained |
| Recursive no-vacuum test | INCONCLUSIVE | Exact named scanner authored, not run | Covers nested histories and excludes test code |

Cost: ST-6a retains one last report, one boot timeout and one runner interval per owning site; scheduled policy list is empty, so this commit adds no sweep or filesystem scan. Runner queue/mixed-mode behavior remains Jini's existing implementation. Bounds: five-minute boot delay, one-day cadence, abort signal and drain on stop.

Pre-completion review: `git diff --check` passed (whitespace only); requirements and diff reread; nine test blocks written before their corresponding implementation; existing tests untouched; no test/build/install/type-check/linter commands or runtime self-validation executed, as explicitly forbidden. No green baseline, RED/GREEN evidence, mutation result, coverage number or release readiness is claimed. Coordinator/Opus must generate the pin, run the named tests and mutations, verify the stopped dependencies, then resume the stopped sheets.
