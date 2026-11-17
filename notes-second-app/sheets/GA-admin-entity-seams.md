# GA. Admin entity seams the notes screens need (generic, `@jini-ai/admin`)

New in revision 2 (judge findings 6, 7, 8, 12). Repo: Jini, `packages/admin`. Estimate: 150k Sonnet. Inherits `COMMON.md`.
Prerequisites: xpkg R1c / R2 state as for G6 (same folder: check `git ls-files packages/admin/src/react/entities` against those lanes' site lists at dispatch). Runs **before** N1 and N2.

## Inventory (expected at the plan's base)
- `rg -n "undefined" packages/admin/src/react/entities/rules.ts` → the new-draft initializer (`:103`) sets every non-boolean field to `undefined`.
- `rg -n "catch" packages/admin/src/react/entities/use-entity-edit.ts` → `:113` catches without keeping the error; `EntityEdit.tsx` renders a fixed "Operation failed".
- `rg -n "load|scope" packages/admin/src/react/entities/use-entity-read.ts` → reload only when `load` or `scope` changes.
- `rg -n "search" packages/admin/src/core/ports/entities.ts` → no `search` in `AdminEntityListQuery`.

## Characterization (passes today; commit first)
1. a descriptor with a required non-boolean field and no initial value → Save is disabled on create.
2. a rejected `update` → the screen shows the fixed text and the draft is kept; the error object is not reachable.
3. a list does not reload when nothing in `load` / `scope` changes.

## Changes (one gated commit each; red-first test named per item)
1. **Create vs persisted fields (lesson 38).** `AdminEntityField` gains `persistedOnly?: true`: shown read-only on an
   existing row, **absent** from the create form, never counted as a missing required field on create.
   Red: a `version` field with `required: true, persistedOnly: true` → create form saves without it; edit shows it read-only.
2. **Mutation-failure seam.** `useEntityEdit` keeps the last failure and exposes `{ failure, retry, reload }`;
   `EntityEdit` takes `describeFailure?(required: { error }): { message: string; details: string; action?: 'reload' }`
   (host port; default = plain words + Copy details, never swallowed, never the raw exception as the message).
   Red: a rejected update with a conflict error → the host's message, a Reload action, the draft still in the form;
   Reload re-reads and keeps nothing stale. New strings exist in every locale (`rg` the locale folder; add all).
3. **Refresh seam.** `useEntityRead` / the list hook take `refreshToken?: unknown`; a changed token reloads.
   Red: bumping the token reloads once; the same token does not.
4. **`search` in `AdminEntityListQuery`** (optional string), passed through to the port; no UI here (G5 adds the box).
   Red: a typed port fake receives `search`.
Every custom hook used by an edited component stays a prop defaulted to the real hook, with a fake-hook output test.

## Acceptance
Characterization flipped only where an item changes it; Tovu linked typecheck green (Tovu consumes these screens' types); test counts not lower.
