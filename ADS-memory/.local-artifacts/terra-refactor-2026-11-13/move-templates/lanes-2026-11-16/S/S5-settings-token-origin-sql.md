# S5 — settings repo, gated-mutation token store, verified-origin repo -> `@jini-ai/db/{settings,gated-mutations,verified-origin}`

Template: T-SQLREPO. Facts: `S5-settings-token-origin-sql.facts.md` (7 files, 943 lines, 12 test files).
All three ports live in `@jini-ai/core` (`core/settings/ports.ts:20 SettingsRepoPort`, `core/gated-mutations/token.ts:14
TokenStorePort`, `core/contracts/server/verified-origin/ports.ts:29 OriginSettingRepoPort`). Kysely may not enter core
(COMMON 21), so their SQL adapters go to `@jini-ai/db`, beside the existing `db/secrets-vault/repo.sql.ts` (OD-1).
CLASSIFY's target for origin-repo (`http-kit/verified-origin`, "adds @jini-ai/db") is REJECTED: http-kit has no kysely and
may not import db.

```
id: S5a-settings-sql (~170k) | S5b-token-store-sql (~90k) | S5c-origin-sql (~130k)      file-disjoint, parallel
jini_target: db NEW subpaths ./settings, ./gated-mutations, ./verified-origin (node), each {repo.sql.ts, index.ts} (naming follows db/secrets-vault)
prerequisites: S0 green (P1: `setting_revisions`, `gated_mutation_tokens:<token>`, `origin_settings:<ws>`). OD-1 YES.
  Untangle R11 (db): landed or no TSV row on `packages/db/package.json`.
  S5a: lost-updates design status on settings (settings writes carry `expectedRevision`; `setting_revisions` is its lock):
  if a lost-updates sheet edits `features/settings/repo.ts`, it runs first.
```

## split
- `features/settings/repo.ts` `SqlSettingsRepo` (426 lines, one class) MOVE; `repo.sqlite.ts` STAY-WIRING (3 prod + 4 tests). The class is the largest single class in lane S: measure every method; expect to extract the revision-append sequence into a private helper.
- `platform/db/repos/gated-mutation-token-repo.ts` `SqlTokenStore` MOVE. It imports `isRedeemable`, `ConfirmationTokenRecord`, `TokenStorePort` from TOVU's `contracts/core/gated-mutations/token.ts` (146 lines) while Jini has `core/gated-mutations/token.ts` (123 lines). They are NOT assumed identical: step 0 runs `diff <(sed 's/[[:space:]]*$//' apps/website/src/contracts/core/gated-mutations/token.ts) packages/core/src/gated-mutations/token.ts` and records every differing declaration. If `isRedeemable` or the record shape differs: SKIP S5b and report (a redeemability rule is a security predicate; picking one silently changes which confirmation tokens are honoured). `platform/db/sqlite/gated-mutation-token-repo.sqlite.ts` STAY-WIRING.
- `platform/db/repos/origin-repo.ts`: `SqlOriginSettingRepo` MOVE. `seedDevCapabilityOriginOn`, `registerConfiguredOriginOn`, `ConfiguredOriginWriteResult`: read first; label each MOVE (generic write of a verified origin) or STAY-PRODUCT (dev-capability seeding is a host boot policy; default STAY). `sqlite/origin-repo.sqlite.ts` STAY-WIRING. `features/origin/configured-origin.ts` (82 lines; imports `contracts/core/runtime-mode.ts`) STAY-PRODUCT: it decides from the host's runtime mode; not edited.

## Characterization (T0)
| Risk | Test | Mutation -> RED |
|---|---|---|
| Lost update on a setting | two writers with the same `expectedRevision`: exactly one succeeds, one gets the conflict; a no-op write (same value) appends no revision and bumps nothing (LESSONS 17) | drop the revision predicate; append unconditionally |
| Revision history gap | concurrent appends under a recording kernel take `setting_revisions` before reading the last revision | remove the lock |
| Confirmation token redeemed twice / after expiry / for another action | redeem twice -> second refused; expired -> refused; wrong action/target binding -> refused; all under `gated_mutation_tokens:<token>` | make redeem not consume; remove the lock |
| Verified origin accepted for the wrong workspace or downgraded | two workspaces; write then read; a second write with a different origin follows today's rule (pin it) | drop the workspace predicate |
| Origin check elsewhere in the chain (LESSONS 13) | not moved: one route-level test that a state-changing admin request with a non-matching Origin is refused, per security profile; it must fail if the origin repo binding returns nothing | bind an empty repo |

## stops
- Any change to `settings` keys, value encodings or the revisions table (stored format; no N-1 migration is planned because
  nothing stored changes — if a change appears necessary, STOP).
- The env-schema design (`plan/env-schema-design-2026-11-16`) renames a setting or an env-backed default used here.
Not verified while planning: the token.ts diff; bodies of all three repos; origin-repo's three non-class exports.
