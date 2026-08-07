# Widget purge UI fix — "Delete permanently" leaves the row visible

## Diagnosis (confirmed, matched dispatch brief exactly)

The dispatch's root-cause diagnosis was accurate and required no correction:

1. `src/widgets/write-service.ts:335` `purgeWidgetInstance()` never hard-deletes the `entries`
   row — `EntryRepoPort` exposes no delete primitive for any content type (ADR-047 Amendment 4:
   "never deleted, only active⇄disabled"). Purge only flips `fields_json` → `ext.widget.payload`
   `status` to the terminal value `"purged"`.
2. `apps/admin/src/features/widgets/hooks/use-widgets-library.hooks.ts:55` (`load()`) fetches with
   `api.listWidgets({ includeInactive: true })`. The server route
   (`src/server/routes/admin/widgets/list.ts:8`) documents that `includeInactive=true`
   intentionally returns **both** `trash` and `purged` rows. So every reload after a purge —
   including the one the purge handler itself triggers — comes back still carrying the row, now
   with `status: "purged"`, and the UI rendered it identically to any other row (with its
   now-permanently-ineffective "Delete permanently" button).

Nothing found during implementation contradicts this diagnosis.

## Fix

Single-line filter in the admin hook, not a server change (see "Why not the server route" below).

**File changed:** `apps/admin/src/features/widgets/hooks/use-widgets-library.hooks.ts`

```ts
setWidgets(r.widgets.filter((w) => w.status !== "purged"));
```

with an inline comment explaining why `trash` stays visible (reversible, still has a working
"Delete permanently" action) while `purged` is terminal and filtered client-side.

This makes the row disappear as soon as `load()` re-resolves after a successful purge — no manual
page reload needed, since `trashOrPurge` → `purge` → `load()` already re-renders from the new
`widgets` state.

## Why not the server route

Checked for other callers of `api.listWidgets(...)` in the admin app:

```
apps/admin/src/features/widgets/hooks/use-widgets-library.hooks.ts:55   listWidgets({ includeInactive: true })
apps/admin/src/components/WidgetPickerDialog.tsx:43                      listWidgets({ widgetType })   // no includeInactive — server already defaults active-only
```

The widgets-library hook is the **only** caller that passes `includeInactive: true`. Filtering
client-side is therefore fully equivalent to filtering server-side for every existing consumer —
there was no genuine insufficiency to justify touching `list.ts`, so per the dispatch's
preference the server route was left untouched.

## RED evidence

Added two tests to
`apps/admin/src/features/widgets/__tests__/WidgetsLibrary.unit.test.tsx` (extending the existing
fixture, which already had `status: "trash"` on `WIDGET`):

- `"drops a purged row from the list once the reload comes back (server still includes purged
  rows under includeInactive)"` — mocks the post-purge reload to return
  `{ widgets: [{ ...WIDGET, status: "purged" }] }` (the real server behavior per `list.ts`'s doc
  comment), then asserts the row disappears and the empty state shows.
- `"keeps trash rows visible — only purged is filtered"` — asserts a `trash` row still renders
  while a `purged` row in the same response does not.

Pre-fix run (`cd apps/admin && npx vitest run
src/features/widgets/__tests__/WidgetsLibrary.unit.test.tsx`):

```
FAIL  ... > drops a purged row from the list once the reload comes back ...
  expected document not to contain element, found "Hero banner" ... (timed out waiting)

FAIL  ... > keeps trash rows visible — only purged is filtered
  expected document not to contain element, found <a href="/admin/widgets/w2">Purged one</a>

Test Files  1 failed (1)
     Tests  2 failed | 2 passed (4)
```

Confirms the existing two tests (which mocked the reload as already excluding the purged row,
masking the bug) stayed green while the two new tests — mocking the real server contract — failed
exactly as the diagnosis predicted.

## GREEN evidence

Post-fix, scoped run (`cd apps/admin && npx vitest run src/features/widgets`):

```
Test Files  5 passed (5)
     Tests  49 passed (49)
```

(47 pre-existing + 2 new, all green; no other widgets-feature test regressed.)

## Server route

Not touched. `src/server/routes/admin/widgets/list.ts` was read and left unmodified — see "Why
not the server route" above.

## Scope

Only files changed:
- `apps/admin/src/features/widgets/hooks/use-widgets-library.hooks.ts` (the fix)
- `apps/admin/src/features/widgets/__tests__/WidgetsLibrary.unit.test.tsx` (the two new tests)

Did not touch `purgeWidgetInstance`, the no-hard-delete rule, `App.tsx`, `styles.css`, the
assistant routes, or anything under `Jini/`, per the dispatch's "Do not touch" list.
