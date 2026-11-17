# G19. `collections_entry_update` can change an entry's body (`@jini-ai/cms` entry tools)

New in revision 2 (judge finding 11). Repo: Jini, `packages/cms`. Estimate: 70k Sonnet. Inherits `COMMON.md`. Runs before N3.
Lane check: lane S sheet S2 moves entry storage, not the tool registrations; confirm with
`git ls-files packages/cms/src/entries/tool-registrations.ts` and the S lane's file list at dispatch.

## Inventory (expected)
`rg -n "collections_entry_update" packages/cms/src/entries/tool-registrations.ts` → the handler (`:177-191`) forwards
`title`, `fields`, `expectedVersion`. `rg -n "body" packages/cms/src/entries/write-service.ts` → `updateEntry` accepts a body.

## Characterization (passes today)
Through the registration's handler with a fake repo: an update carrying `body` leaves the stored body unchanged and reports success (pin it: this is the defect).

## Red-first
1. `body` (string) in the tool input reaches `updateEntry` and the stored body changes; `expectedVersion` still guards it.
2. `body` absent → body unchanged (no clear). `body: ""` → follows the service's own rule (pin what `updateEntry` does; do not invent).
3. the tool's input schema lists `body` with a description; the declared risk and permission are unchanged (assert both).
4. a stale `expectedVersion` with a body → no write (zero repo writes).

## Change
Schema property + one forwarded field, in `tool-registrations.ts`. No new tool, no policy change, no storage change.

## Acceptance
`cms` tests green, counts not lower; Tovu linked typecheck and Tovu's entry-tool tests green (Tovu registers the same tools); the changed description is reported old → new.
