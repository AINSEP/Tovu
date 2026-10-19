TDD(Direct): Used the TDD persona for behavior-focused coverage additions. Production files remain unchanged.

CHANGED FILES:

- /Users/la/Programming/Tovu/apps/admin/src/features/skills/__tests__/use-skill-install.hooks.unit.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/comments/__tests__/ip-hash-salt.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/content-types/__tests__/publish-content.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/media-generation/__tests__/providers-tools.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/navigation/__tests__/trash-aware-memory-menu-repo.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/newsletter/__tests__/campaign-write-service.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/publish-trust/__tests__/handshake.test.ts

PER FILE — added cases, pending execution:

- `session.ts`: authenticated invalid JSON and primitive payload rejection.
- `use-skill-install.hooks.ts`: read errors, stale reads, cancellation, duplicate confirmation, replacement proposals, retry, and callback failure.
- `ip-hash-salt.ts`: default warning sink with injected entropy.
- `publish-content.ts`: fields change while label and status remain unchanged.
- `providers-tools.ts`: reason limit, blank-key preservation, missing hint metadata, safe storage failures, token-policy errors, and contributor registration. Reported lines 48–50 now contain closing catalog syntax.
- `trash-aware-memory-menu-repo.ts`: missing reads, live updates, live-holder conflict forwarding, trashed compare-and-set rejection, and transactions.
- `campaign-write-service.ts`: omitted preheader on creation and clearing an existing preview.
- `challenge.ts`: absent response, invalid clock, and non-array capabilities; verifies nonce preservation or consumption.

UNREACHABLE:

- [providers-tools.ts:102](/Users/la/Programming/Tovu/apps/website/src/features/media-generation/providers-tools.ts:102), lines 103–104: forwarding callbacks never used by the downstream save path.
- [providers-tools.ts:133](/Users/la/Programming/Tovu/apps/website/src/features/media-generation/providers-tools.ts:133): final fallback follows exhaustive handling of all possible statuses.

NOT DONE:

- Execution and measured 100% coverage await the locked verifier. No tests, typechecks, builds, coverage, or package scripts ran.
- Whitespace checks passed. No git state was changed.
