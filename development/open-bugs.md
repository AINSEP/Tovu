# Open bugs

Known behaviours that are kept on purpose for now. Each one has a name; reports refer to it by that name.
Fixing one is its own piece of work: write the failing test first, then change the code.

## Preserved (pinned by tests, not fixed)

Logged in extract session 1, batch V1, when `cloud/more-jini-1` was merged. The revert code now lives in
Jini `packages/cms/src/core/commands/revert.ts` (public entry `@jini-ai/cms/core/commands`); Tovu's
`apps/website/src/contracts/core/commands/revert.ts` is a re-export.

### `L079-force-without-principal-kind`

`revertChangeSet` called with `force: true` and no `principalKind` skips the stale version check, so a
revert can be applied over a row that changed after the change set was recorded. Only
`principalKind: "agent"` is refused under `force`.
Pinned by `apps/website/src/contracts/core/commands/__tests__/revert.unit.test.ts`,
"L079: force without principal kind bypasses stale versions (reported, not fixed)".

### `L079-partial-inverse-failure`

When a change set's inverses are applied in reverse order and a later inverse fails, the inverses
already applied stay applied. The revert is not all-or-nothing.
Pinned by the same file, "L079: a later inverse failure leaves earlier writes applied (reported, not fixed)".

## Stale documentation (text kept byte-exact)

### `snapshot-stale-header`

Jini `packages/db/src/data-modules/snapshot.ts`, the comment above `discardCommittedSnapshot`, says a
failed migration "leaves the entry non-terminal". The code marks the journal entry `ROLLED_BACK`, which
is terminal; the snapshot file itself is kept. The comment moved byte-exact and was not edited.

## Pre-existing test failures seen while checking other work

### `plugin-host-bundled-identity`

`apps/website/src/server/runtime/composition/__tests__/plugin-host.integration.test.ts`,
"every bundled agent and site package declares a distinct publisher identity and discovery terms",
fails with `unknown/charts-recharts` where `jini/charts-recharts-agent` is expected. The bundled Jini
manifests now declare their id under `extensions.jini`; the test reads identities with namespace `tovu`.
Seen in V1; it fails the same way on the V0 tip (before the merge), so the merge did not cause it.
