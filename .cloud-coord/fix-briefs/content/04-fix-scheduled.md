Code Inspection(Review): Personas used: code-inspection + security + tdd.

All locations refer to the reviewed branch tip.

| Sev | repo:file:line | Problem | Concrete fix |
|---|---|---|---|
| HIGH | `tovu-int:apps/website/src/features/post/go-live.ts:60` | **Existing scheduled posts miss their real go-live event after deployment.** The previous implementation already emitted this exact event ID at save time. The new outbox conflict handling silently discards the go-live announcement when that row already exists—even if delivered. | Give scheduled go-live events a distinct identity from legacy save-time events. Add a regression seeded with an already-delivered legacy event. |
| HIGH | `tovu-int:apps/website/src/features/post/post.ts:1926` | **A crash can permanently lose the go-live event.** The edit commits before its catch-up enqueue. A crash or enqueue failure leaves `updatedAt >= publishAt`, so even a full restart sweep excludes the post. Delete, restore, and import have the same ordering. | Persist required events inside the same transaction as the mutation and revision. Test enqueue failure and restart recovery. |
| HIGH | `tovu-int:apps/website/src/features/post/go-live.ts:85` | **An edit straddling go-live can double-fire.** On PostgreSQL, an edit can capture a pre-deadline timestamp while a sweep reads the prior committed version at the deadline. After the edit commits, the next sweep emits another publication because its version produces a different ID. | Deduplicate by stable scheduled-publication identity, rather than mutable content version. Add a test controlling the overlapping transactions. |
| HIGH | `tovu-int:apps/website/src/features/post/reverters.ts:256` | **Undo still announces scheduled posts early.** Restoring a trashed scheduled post classifies stored `"published"` status and immediately emits `entry.published`. The update reverter similarly ignores scheduling at line 169. The new tests exercise `restorePostForward`, which is a different path. | Call the shared schedule-aware event logic from both reverters, preserving their prohibition on invoking before-save hooks. Test actual History/Trash undo flows. |
| HIGH | `tovu-int:apps/website/src/features/post/repo.ts:121` | **HTML page edits can erase pending announcements.** The predicate excludes rows updated after go-live, but `html-document-store.ts:479` advances `updated_at` without announcing the pending go-live. Editing a due page before its first sweep therefore loses the event permanently. | Integrate pending go-live announcement into the HTML writer’s transaction. Cover HTML edits between the deadline and first sweep. |
| MEDIUM | `tovu-int:apps/website/src/features/post/go-live.ts:43` | The new public candidates contract and its implementations omit the mandated second options object. | Add the optional options parameter to the port and both implementations. |

Static review only; tests, builds, and metrics were not run. Reported coverage remains unverified. UTC normalization and workspace filtering showed no defect in the inspected flow.

**Rules check**

- Plugins never import each other: **OK** — no such imports introduced.
- Generic code in Jini; site-specific code in Tovu: **OK** — post scheduling and existing storage adapters extended.
- Two-object API signatures: **violated** — `go-live.ts:43`, `repo.ts:111`, `repo.memory.ts:77`.
- Dependencies injected as ports: **OK** — `go-live.ts:116`.
- React components receive data through props: **OK** — no React changes.
- Cyclomatic complexity ≤10: **OK by inspection for added functions**; not mechanically measured.
- Existing “why” comments preserved: **OK** — changed comments retain their rationale.
- Schema changes only through ADR-066 migrations: **OK** — no schema changes.
- No data loss: **violated** — durable publication events can be lost at `post.ts:1926` and `repo.ts:121`.
- Unflagged `TEMP: replaced by shared helper`: **OK** — none introduced.

**Verdict: MERGEABLE AFTER FIXES** — scheduling still has verified early, missing, and duplicate publication-event paths.
