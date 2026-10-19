TDD(Direct): Chose TDD to classify the failures and preserve the existing assertions.

CHANGED FILES:

- [peer-site-reads.ts](/Users/la/Programming/Tovu/apps/website/src/server/runtime/composition/peer-site-reads.ts:253) — reuses the existing theme resolver with B’s read-only database and workspace.
- [peer-site-reads.test.ts](/Users/la/Programming/Tovu/apps/website/src/server/runtime/composition/__tests__/peer-site-reads.test.ts:29) — asserts B’s exact theme tokens and removes the latest TypeScript migration ledger entry for the upgrade scenario.

VERDICT:

- Catalog: **real product bug**, `peer-site-reads.ts:253` — missing peer resolver.
- inSite: **real product bug**, same location.
- appData: **real product bug**, same location.
- Schema refusal: **test bug**, `peer-site-reads.test.ts:139` — deleting the frozen Drizzle head produces divergence; ADR-066 pending detection uses `tovu_migrations`.

RED->GREEN — expected from source inspection, unexecuted:

- Catalog line 88: unavailable dependencies becomes `[]`.
- Both placement cases line 58: B’s page assertion becomes reachable; line 59 additionally checks B’s selected theme and tokens.
- Schema case line 140: unchanged upgrade-message assertion receives a pending TypeScript migration.

NOT DONE: Tests, typecheck, builds, and package scripts were not run. Git state and the four protected composition files were untouched.
