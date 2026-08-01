# Editor stale-response race — verified, deliberately NOT fixed here

Date: 2026-08-01. Verified by: Coordinator (Claude Opus 5, 1M context), reading each file directly.
Status: **CONFIRMED, deferred to the fetch-query migration by owner decision.**

## Why this is deferred rather than open

These six files are `apps/admin/src/sections/`, the active area of the fetch-query server-state
migration (ADR-051, commits `f29e637` → `e4be7a7`). A hand-rolled cancellation guard here would be
deleted by that migration and would conflict with it in six files mid-flight.

**This is therefore a required acceptance criterion for the migration, not a happy accident of it.**
A server-state layer keyed by record id discards a superseded response structurally — but only if the
migrated component actually reads its data from the query keyed by the id in props, rather than
copying it into local `useState` on resolve. Every editor below does exactly that copy today, and a
migration that keeps the copy keeps the bug. **Verify per file that no `.then(...)` writes component
state outside the query layer.**

## The mechanism

Every load effect issues a request and writes the response into component state with **no
cancellation token and no id re-check**. Navigate A → B before A resolves and A's response lands in a
form now bound to B. There is no error, no conflict, and no warning — the operator sees a populated
form and has no way to tell it is the wrong record's data.

Two distinct severities, depending on where `save()` reads the target id:

**Wrong content, correct record** — `save()` uses the id from props, so it writes A's field values
onto B:

| File | Load effect | Save target |
|---|---|---|
| `PostEditor.tsx` | `:138` | `api.updatePost({ id: props.postId })` `:159` |
| `FormEditor.tsx` | `:141`, `:214`, `:295` (three unguarded effects) | `api.updateForm({ id: props.formId })` `:310` |
| `WidgetRegionEditor.tsx` | `:35` / `useEffect(load, [props.regionKey])` `:48` | keyed by `props.regionKey` |

**Wrong record entirely** — `save()` reads the id out of the stale loaded object, so the write is
aimed at whichever record resolved last:

| File | Load effect | Save target |
|---|---|---|
| `CollectionEntryEditor.tsx` | `:180` | `api.updateEntry({ id: entry.id, expectedVersion: entry.version })` `:231` |
| `MenuEditor.tsx` | `:222` | `api.updateMenuTree({ id: menu.id, expectedVersion: menu.version })` `:273` |
| `WidgetInstanceEditor.tsx` | `:58` | `api.updateWidget({ id: widget.id, baseVersion: widget.version })` `:95` |
| `FormEditor.tsx` | as above | `api.updateForm({ id: form.id })` `:325` (the status toggle) |

Note the optimistic-concurrency fields (`expectedVersion` / `baseVersion`) do **not** save these
three. They are read from the same stale object as the id, so they are internally consistent with it —
the write is a valid, non-conflicting update aimed at the wrong row.

## Corrections to the cross-check's account

- The cross-check says "in three of the six, `save()` reads the id from stale state." Counting
  `FormEditor`'s status toggle at `:325`, it is **four of six** — that file has it both ways
  depending on which action the operator takes.
- `FormEditor` has **three** unguarded load effects (`:141`, `:214`, `:295`), not one. A fix that
  guards only the one the audit line-numbered would leave two live.

## Verification

Read directly, 2026-08-01: all six load effects, and every `save()`/update call site listed above.
Not executed — no runtime reproduction was attempted, so the mechanism is read-verified only, which
by this sweep's own standard makes it a strong hypothesis rather than a measured result. The
structural facts (absence of any cancellation token; id read from stale state) are certain; the
user-visible consequence is inferred from them.

## Handoff

- **Suggested next assignee:** whoever owns the fetch-query migration of `sections/`.
- **Acceptance criterion:** for each of the six, a test that resolves record A's request *after* the
  component has switched to record B, and asserts (a) B's values render, and (b) a save issued at
  that moment targets B with B's values.
