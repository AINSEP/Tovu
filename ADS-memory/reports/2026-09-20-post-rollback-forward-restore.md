# Decision — post rollback restores FORWARD, deviating from `command.ts:82`

Date: 2026-09-20. Branch `restructure/apps-website-phased`.
Origin: sol (`gpt-5.6-sol`, xhigh) peer review 2026-09-20, **High finding 3** — "rollback restores
the current post row but leaves a ghost revision and event".
Status: **implemented**. Owner ruled for the forward restore; this note is the required explicit
record of the contract it deviates from.

A separate, still-open finding (2 — post/page **create** commits with no change-set record) is not
covered here. It needs a `hardDelete` on `PostRepoPort`, not a restore.

---

## The defect

`updatePost`, `deletePost` and `importPostEntity` each write the post row and append an immutable
`post_revisions` row inside ONE `PostRepoPort.transaction`, then enqueue a status-transition event
(`features/post/post.ts`). When the command gateway's `changeSets.insert()` fails *after* that write
landed, it calls `mutation.rollback()` to undo it (`@jini-ai/cms` `core/commands/command.ts`, INV-01
"no mutation without a record").

Every post rollback was a raw `await repo.save(priorPost)`. That rewrites the row and **nothing
else**. Both other halves of the write survived:

- the appended revision, now describing a state the row never kept;
- the enqueued `entry.published` / `entry.updated` / `entry.unpublished` event, which the background
  drainer in the serving app still delivers.

### Reproduced before fixing

`apps/website/src/server/__tests__/admin-post-update-rollback-ledger.test.ts`, against the real
composition root over real HTTP, with `deps.changeSets.insert` patched to throw. All four cases
failed with exactly the state the finding describes:

```
✖ PUT posts: a rolled-back update leaves no revision describing a state the row never kept
  AssertionError: the newest revision must describe the row that actually exists (seq 2 vs row version 1)
  2 !== 1
✖ PUT posts: a rolled-back publish does not leave an uncompensated entry.published event
  actual:   [ 'entry.published' ]
  expected: [ 'entry.published', 'entry.unpublished' ]
```

(identical pair for `PUT pages`.)

### One correction to the review, re-verified

sol implied a duplicate `seq` would be rejected. It is not. `platform/db/schema.ts` gives
`post_revisions` only `index("idx_post_revisions_workspace_post")` on `(workspaceId, postId, seq)` —
an **index**, not a unique constraint. Re-read at `schema.ts:276` for this pass. So a verbatim
restore does not error on the next write; it silently appends a **second row at the same `seq`**.
Ambiguous ledger rather than a loud failure — worse in practice, not better.

---

## The three candidate repairs, and why forward wins

| Repair | Breaks |
|---|---|
| Append a compensating revision at the ghost's own `seq` | The restored row carries `prior.version` again, so the ghost and the next real write share a `seq`. The ledger reports two states under one sequence number. |
| Delete the ghost revision | Barred outright: `PostRepoPort.appendRevision` (`post.ts:365`) is append-only by contract — "never updates or deletes an existing row" (ADR-008 §items / ADR-022 §4a). |
| **Restore forward** (chosen) | `command.ts:81`'s "verbatim, **including `version`**". |

Forward restore is the only option where every `seq` maps to exactly one real state. It also makes
the undo itself a recorded event rather than an erasure, and the compensating status event corrects
the ghost event as a side effect. The other two leave a revision ledger that lies about history,
which is worse than a documented deviation from a contract line.

Secondary confirmation found while implementing: `emitStatusTransitionEvent` keys the outbox row id
on `${post.id}-${name}-${post.version}`. A verbatim restore reuses a version and therefore risks
colliding with the original write's event id; the forward version cannot.

---

## The deviation, stated exactly

`node_modules/@jini-ai/cms/src/core/commands/command.ts:77-86` — line **81**, the clause sol cites
as `command.ts:82` — says `rollback` undoes the mutation
"restoring the entity to its exact pre-`execute` state (verbatim, **including `version`**) so no
'mutation without a record' survives (INV-01)".

`restorePostForward` (`apps/website/src/features/post/post.ts`) restores every field verbatim
**except `version` and `updatedAt`**: the restored row is written at `current.version + 1`, so the
version moves forward across an undo. INV-01 itself is upheld — no unrecorded mutation survives, and
the row's content is exactly the pre-`execute` content. Only the "including `version`" clause is
departed from, and only because the revision half of the write cannot be withdrawn.

**What would remove the deviation:** the transactional path `command.ts:82-83` already anticipates —
"On the SQLite adapter (RT-004) a real transaction replaces this and `rollback` becomes a no-op" —
enrolling the feature write, its revision and the change-set insert in ONE transaction. Nothing
would then be appended that needs undoing, and `restorePostForward` plus all of its call sites could
be deleted outright rather than reconciled.

The same text lives at the deviation site, in `restorePostForward`'s own doc comment, so it is not
discoverable only from this file.

---

## What it does

`restorePostForward({ deps: { repo, clock, outbox }, input: { prior, actorId?, delegatedBy*? } })`

1. Re-reads the row. Stands down (`null`) when it is gone, or when `current.version <= prior.version`
   (the write never landed — nothing to compensate).
2. Writes `{ ...prior, updatedAt: now, version: current.version + 1 }` with **`saveIfVersion`**, not
   `save`, conditional on `current.version`, paired with its `"restore"` revision inside one
   `repo.transaction`. A writer that landed in between owns the row; clobbering them would replace
   one unrecorded mutation with another, so a rejected conditional write stands down without
   appending anything.
3. Sets the revision's `restoredFrom` to the id of the last revision at `prior.version` — the column
   `schema.ts` defines for exactly this and that nothing wrote until now. Without it the ledger says
   an undo happened but not back to what.
4. Emits the compensating status transition, treating a trashed row as `"draft"` — the same framing
   `deletePost` already uses when it classifies a trash as a move to non-public.

## Call sites wired (8)

sol cited four. Four more carry the identical rollback; all eight now share the one primitive.

- `server/inbound/admin-http/routes/posts/update.ts`
- `server/inbound/admin-http/routes/pages/update.ts`
- `server/inbound/admin-http/routes/posts/delete.ts`
- `server/inbound/admin-http/routes/pages/delete.ts`
- `features/post/tool-registrations.ts` — `content_post_update` **and** `content_post_delete`
- `features/widgets/embed-service.ts`
- `features/post/publish-content.ts` — the update arm; the create arm's "trash the orphan" branch is
  unchanged (no pre-image exists to restore).

## Risks and what is still open

- **The delete rollbacks compensate the post row and its ledger only.** `deletePost` also writes a
  Trash index row through the injected `remove` port, which exposes no restore counterpart. That
  half was uncompensated before this change and still is. Noted inline at both delete routes.
  It belongs with the live trash work, not here.
- **`restorePostForward` reads a post's whole revision ledger** (one `listRevisions`) to resolve
  `restoredFrom`. Unbounded in principle, on the failure path only.
- **Finding 2 remains open** and is the reason `features/post/publish-content.ts`'s create arm still
  trashes its orphan rather than removing it: `PostRepoPort` has no hard delete.
