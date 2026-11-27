# Commit plan

Tovu `0fdd3eedf7d82d334c826acd92df0dac1eba235e` (`codex/tv-w62-tt-2`, equal to `origin/codex/m27t`). Jini contracts read from `origin/integ/merge-27-2026-11-26` at `a9f58d6bcf69d817876d165992ef29aa8d2c8c6a`.

## 1. test: align post fixtures with extracted Jini contracts

Files, relative to `apps/website/src/`:

- `features/post/__tests__/L156-characterization.test.ts`
- `features/post/__tests__/content-duplicate.post-page.test.ts`
- `features/post/__tests__/featured-image.test.ts`
- `features/post/__tests__/integration/post-plugin-hook.integration.test.ts`
- `features/post/__tests__/preview-tool.test.ts`
- `features/post/__tests__/publish-content.characterization.test.ts`
- `features/post/__tests__/publish-content.round-trip.test.ts`
- `features/post/__tests__/publish-content.schedule-featured.test.ts`
- `features/post/__tests__/publish-content.terms.test.ts`
- `features/post/__tests__/publish-content.test.ts`
- `features/post/__tests__/reverters.schedule-events.test.ts`
- `features/post/__tests__/revision-refs.test.ts`
- `features/post/__tests__/revision-thinning.postgres.test.ts`
- `server/runtime/composition/publish-content-manifest.ts` (exports only, after test edits)

No new, skipped, or deleted test cases. Deleted the forwarding post-repo fixture in favor of a spy on the real in-memory repo and removed duplication's type casts, duplicated adapter mapping, and partial HTML fake.

## Mutation probes for Opus

These are source-review probes, not executed or applied in this clone.

| Test file | Concrete mutation and expected failure |
| --- | --- |
| L156 characterization | Change the versioned branch of `persistUpdatedPost` to call `repo.save(post)`. The expected CAS call is missing. |
| Content duplication | Pass through the original widget placement ID. The copy's fresh ID check fails. Skip HTML conversion. The injected failure is not propagated. |
| Featured image | Stop trimming the input before lookup or pass a different workspace to `getMany`. Exact lookup or content-type request checks fail. |
| Post plugin hook | Start the repo save before the before-save hook resolves. The throw-before-save counter or persistence checks fail. |
| Preview | Remove the `postId` alternative from the preview input schema. The exact schema check fails. |
| Publish characterization | Include unset byline defaults in the hash. The pinned hashes and cleared wire-state assertions fail. |
| Publish round trip | Preserve the destination's stale slug instead of the incoming slug. Its repacked hash differs. |
| Publish schedule/featured | Drop `publishAt` on import. The read-back and pre-go-live checks fail. Omit the scheduled row from pack. The hash test fails before comparing hashes. |
| Publish terms | Omit `term` from the planner's returned apply order or omit the post outcome row from the second plan. The order or row membership check fails. |
| Publish handlers | Record a create's change set before the new row is persisted, or omit compensation after recording fails. The at-failure read or post-rollback read fails. |
| Schedule reverts | Emit `entry.published` immediately for a still-scheduled restore. The exact pre-go-live event list fails. |
| Revision refs | Remove the workspace predicate from the change-set item query. The unrelated workspace's reference is wrongly reported. |
| Postgres thinning | Ignore the undo reference read after the fence. The exact kept/deleted sets fail. |

The Author Checklist was applied by source review, using the existing exact hash pins, output values, error predicates, and independent read-backs. The final diff preserves all 131 test declarations and supplies bindings at 84 contributor calls. Runtime mutation checks, tests, type checks, builds, and linters were not run per dispatch.

## Quality findings

- `L156-characterization:publish import` F2.5 fixed by checking the actual versioned write and its arguments.
- `content-duplicate.post-page:HTML conversion failure` F3.6 fixed by using the real HTML store with one failing method that checks the seed. The widget case reads back both rows and snapshots the original body independently.
- `featured-image:sniffed type / injected lookup` F3.6/F2.5 fixed by checking workspace, digest, ref, and repo. The canonical ID test covers resolution only (F6.1 left, persistence needs an admin writer).
- `post-plugin-hook.integration:throwing beforeSaveHook` F2.1/F4.5 fixed by using a real write receiver, a distinct proposed edit, and independent row and revision assertions.
- `preview-tool:id alias / W10` F1.6 fixed by finding the named tool.
- `publish-content.round-trip:existing destination` F4.5 fixed by seeding a stale slug. The Trash refusal also reads back the unmodified row.
- `publish-content.schedule-featured:scheduled landing / changed hash` F6.1/F5.2 fixed for go-live timing and hash membership. Planner selection and scoped media inclusion remain F6.1, beyond the direct handler seam.
- `publish-content.terms:applied after taxonomy and term` F5.2 fixed by requiring the named kinds in order and a complete second plan.
- `publish-content:failed create rollback` F4.5 fixed by observing the row before injecting the exact recording error.
- `revision-refs:probe that cannot read` F6.1 left, the test is a direct SQL probe rather than the thinning engine.
- `revision-thinning.postgres:both fence tests` F7.1 left, replacing the fixed delay requires observing the real Postgres lock wait.
