# fix-scheduled — scheduled posts fired `entry.published` at save time (2026-10-21)

Branch `cloud/fix-scheduled-2026-10-21` (Tovu only; no Jini change, no schema change, no migration).

**Root cause.** Write paths fed the stored `status` to `classifyStatusTransition`. A `published` row with a future `publishAt` counted as public, so saving it emitted `entry.published` immediately. Nothing ran at go-live, so no event fired when the post actually went live.

**Fix.**
- `post.ts`: the `publicFacingStatus({post, nowIso})` input to `classifyStatusTransition` now uses `isLiveAt`, so both trashed and scheduled rows count as not public. `classifyStatusTransition` itself is unchanged. All 6 emit sites (create, update, delete, retire, restore-forward, import) now go through `emitPublicTransitionEvent`. Results: a scheduled save emits nothing. Rescheduling or unscheduling before go-live emits nothing. Clearing `publishAt` publishes now. Moving a live post to a future time emits `entry.unpublished`, then `entry.published` at go-live. Trashing a published post still emits `entry.unpublished`.
- New `features/post/go-live.ts`: `startPostGoLiveSweep`, a 60s interval timer that doesn't keep the process alive (`unref`). It starts with a full catch-up pass, so posts that went live during downtime are announced after a restart. Later passes only read posts that went live since the previous pass, minus a 10-minute overlap. One pass at a time (a tick during a running pass is skipped). A failed pass keeps its window, so the next pass retries it. `stop()` waits for a running pass.
  - A post is announced if it is published, not trashed, has `publishAt <= now`, and has `publishAt > updatedAt` (meaning it was saved while still scheduled).
  - Event id is `${id}-entry.published-${version}`, the same id a live save of that version would have used.
- Exactly once: `SqlOutboxAdapter.enqueue` and `InMemoryOutbox.enqueue` now ignore an event id that is already in the outbox (`ON CONFLICT (id) DO NOTHING`; ids are deterministic and outbox rows are never purged). This makes overlapping passes, two processes, and restarts harmless.
  - Edge case: someone edits or trashes a post after its go-live but before the sweep runs. That write enqueues the go-live event first (same id), then `entry.updated` or `entry.unpublished`, so the go-live event is never lost and never duplicated.
- Wiring: the sweep runs only in the serving process, after `createApp` has subscribed the handlers, through `createServingApp`. It reads candidates from `RouteDeps.postGoLiveCandidates` (optional; set in `deps.ts` to the same `postRepo`). It is stopped on shutdown by both `src/index.ts` and `tovu serve`. New repo method `listGoLiveCandidates` exists on both `SqlPostRepo` (a single query) and `InMemoryPostRepo`.

**Every consumer and entry type checked.**
- SEO sitemap: `app.ts` subscribes to `entry.published`, `entry.updated` and `entry.unpublished`. It is the only live `entry.*` subscriber and is fixed by this change.
- Webhooks: `integrations.ts` currently subscribes only to `form.submission.received`. No `subscribeAll` caller exists. Future entry topics get the corrected event stream.
- Newsletter `scheduledAt` is a send date with no automatic timed delivery wired, and it emits no `entry.*` events. Out of scope.
- Jini generic Collection entries set `publishedAt = now` on publish and have no future scheduling. Not affected.
- Pages are posts (same code), so they are covered.

**Tests** (node:test, `--test-concurrency=1`, fake clock + fake timers):
- New: `go-live.test.ts` (7); `post.schedule-events.test.ts` (10: create / update / reschedule / unschedule / clear / live→scheduled / edit-after-go-live race / already-announced / delete / restore / import); `go-live.repo.test.ts` (memory + every in-process SQL dialect); an outbox contract test that a repeated id is a no-op (memory, sqlite, kysely dialects); boot-wiring source pins (started only in serving-app after `createApp`; stopped by both boot paths).
- Updated fakes: `serve-command-wiring`, `serve-export-teardown`.
- Run of post / events / serving / serve / SEO suites: 1009 tests, 1007 pass, 1 fail (`repo.postgres.test.ts`, which needs a Postgres server), 1 skipped.

**Coverage.**
- `go-live.ts`: 100% lines, branches and functions. Every changed line in `post.ts`, `repo.ts`, `repo.memory.ts`, `memory-bus.ts` and `outbox-repo.ts` is covered (lcov diff check).
- Those files are not at 100% whole-file in this targeted run. Their existing gaps predate this change.

**Typecheck / lint.**
- `tsc` (app): 10 errors and `tsconfig.tests.json`: 46 errors, all in files this change doesn't touch (they look like type mismatches from the linked Jini packages). Zero errors in touched files.
- eslint on touched files: clean apart from a `sonarjs/pseudo-random` warning in `serving-app.ts` (its existing `Math.random()` lease-owner line).

**LOCAL-RUN NEEDED**
- `repo.postgres.test.ts` and the real-Postgres leg of `go-live.repo.test.ts` / `outbox-repo.contract.test.ts` (`ON CONFLICT DO NOTHING` + `publish_at > updated_at` on PG).
- End-to-end with a browser: schedule a post 2 minutes ahead in admin, confirm there is no sitemap invalidation or `entry.published` row at save, and exactly one row about 60s after go-live; restart the server across a go-live and confirm the catch-up pass.
- `npm run unlink:jini` before any real build (Jini was linked here for testing).
