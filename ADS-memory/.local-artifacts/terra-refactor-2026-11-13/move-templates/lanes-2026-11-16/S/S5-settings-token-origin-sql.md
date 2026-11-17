# S5 (revision 2) — settings repo, confirmation-token store, verified-origin repo -> `@jini-ai/db/{settings,gated-mutations,verified-origin}`

Template: T-SQLREPO rev 2. Facts: `S5-settings-token-origin-sql.facts.md` (7 files, 943 lines, 12 test files).
The three ports are declared in `@jini-ai/core` (`core/settings`, `core/gated-mutations`, `core/contracts/server/verified-origin`);
kysely may not enter core, so their SQL adapters go to `@jini-ai/db`, beside `db/secrets-vault/repo.sql.ts` (OD-1).
`@jini-ai/db` already declares kysely. Revision 2 fixes judge finding 10: the settings repo has NO expected-revision
contract and the token adapter does not see the action binding; both tables now describe what the code does.

```
id: S5a-settings-sql (~180k) -> S5b-token-store-sql (~100k) -> S5c-origin-sql (~130k)     serial (one manifest: packages/db/package.json)
jini_target: db NEW subpaths ./settings, ./gated-mutations, ./verified-origin (node); files named like db/secrets-vault (`repo.sql.ts`, `index.ts`)
prerequisites: S0 DONE (P1: `setting_revisions`, `gated_mutation_tokens:<token>`, `origin_settings:<ws>`; P6). OD-1 YES.
  No xpkg lane owns `packages/db/**` (xpkg R11 no longer touches db).
successor_of: S0.  S6a follows on the same manifest.
```

## S5a — settings
**What it is today.** `features/settings/repo.ts` (426): lines 1-149 are row types and mappers, `SqlSettingsRepo` is
:150-426. Value writes (`saveGlobalValue` :257, `saveWorkspaceValue` :268, `saveUserValue` :281) are **unconditional
upserts**: there is no `expectedRevision` anywhere in the file. `appendRevision` (:350) takes `lockKey("setting_revisions")`
inside a transaction to allocate the next `seq`: it ORDERS ledger rows, it does not reject a stale writer.
`deleteWorkspaceValue` / `deleteUserValue` (:322, :332) remove an override row (the value falls back to its default);
they exist today and move verbatim.
**split.** Mappers and row types (:1-149) -> `packages/db/src/settings/repo.rows.ts`; `SqlSettingsRepo` -> `repo.sql.ts`
(277 lines); `features/settings/repo.sqlite.ts` STAY-WIRING (3 prod + 4 tests). port_compat (step 0):
`rg -n "export interface SettingsRepoPort" -A60 packages/core/src/settings/ports.ts` vs the 20 methods listed by
`rg -n "^  async " apps/website/src/features/settings/repo.ts`; positional methods (`getGlobalValue(settingId)`,
`saveDefinition(record)`, `transaction(fn)`) keep the PORT's signature.
Tables: `setting_definitions`, `setting_values_global`, `setting_values_workspace`, `setting_values_user`,
`setting_revisions` (confirm against the facts file "tables touched"; a name not there = STOP).
**characterization (T0).**
| Risk | Test (unmoved code, real kernel) | Mutation -> RED |
|---|---|---|
| Revision sequence gap or duplicate | two concurrent `appendRevision` calls: `seq` values are consecutive and distinct; recording kernel: `transaction` -> `lockKey("setting_revisions")` -> the max-`seq` read | remove the lock; read `seq` before the lock |
| A value write silently becomes conditional (or stops being last-write-wins) | two `saveWorkspaceValue` calls for one setting: the second wins, one row; same for global and user scope. This PINS today's behaviour; it is not a lost-update guard | add a version predicate; change the conflict target |
| Scope leak | workspace A's and user U's values are not returned for workspace B / user V by each `get*` / `list*` | drop a predicate |
| Reset removes the wrong override | `deleteUserValue` removes exactly `(workspace, principal, setting)`; the workspace and global rows stay; revisions are untouched | drop the principal predicate |
| `listRevisionsSince` ordering / bound | fixture of 5 revisions: exact `seq` list for a cursor in the middle | change the comparison |
| Definition lookup by `workspaceId: null` vs a workspace | active definition resolution for both, as today | drop the null branch |
**Lost-updates.** The lost-updates design names this file. Either order works, never the same wave: if it lands first,
`rg -c "expectedRevision|expectedVersion" apps/website/src/features/settings/repo.ts` is non-zero and the facts diff
fails -> STOP, and this table is regenerated against the new contract before S5a runs.

## S5b — confirmation-token store
**What it is today.** `platform/db/repos/gated-mutation-token-repo.ts` `SqlTokenStore` implements TOVU's `TokenStorePort`
from `contracts/core/gated-mutations/token.ts`. That Tovu file re-exports `isRedeemable` and `ConfirmationTokenRecord`
FROM `@jini-ai/core/gated-mutations` (so the redeemability predicate and the record shape are already the Jini ones),
but declares its own port with positional `save(record)` and an extra `count()`; core's port is `save(required: { record })`.
`tryRedeem({ token, now })` (:79) reads, checks `isRedeemable`, and conditionally writes inside one transaction under
`lockKey("gated_mutation_tokens:<token>")`. It receives only `{ token, now }`: **the plan / scope / confirmer binding is
checked by `redeemToken` in `@jini-ai/core/gated-mutations`, not here** (not lane code, not moved).
**split.** `SqlTokenStore` MOVE -> `packages/db/src/gated-mutations/repo.sql.ts`, implementing CORE's `TokenStorePort`
(`save({ record })`), `isRedeemable` imported from `@jini-ai/core/gated-mutations`; `count()` moves as an extra method.
`platform/db/sqlite/gated-mutation-token-repo.sqlite.ts` STAY-WIRING and becomes the shape adapter: `SqliteTokenStore`
keeps implementing Tovu's port, `save(record)` -> `inner.save({ record })` (an argument-shape adaptation, allowed by xpkg
COMMON; binding test: a recording fake `inner` receives `{ record }` with the same object). Tovu's `token.ts` is not edited.
| Risk | Test (T0) | Mutation -> RED |
|---|---|---|
| Token redeemed twice | two concurrent `tryRedeem`: exactly one `{ redeemed: true }`; stored status `redeemed` once; recording kernel: lock before the read | remove the lock; make the write unconditional |
| Expired / unknown / already expired by `expire` | each returns `redeemed: false` with the record (or `null` for unknown), fixed `now` | skip `isRedeemable` |
| The store drops a binding field the service checks | `save` then `findByToken`: `planHash`, `scopeId`, `confirmerPrincipalId`, `expiresAt` round-trip; then Tovu's own redeem wrapper over the SQL store refuses a mismatched plan exactly as it does today over the memory store (read `token.ts` for the wrapper's name; if it exposes no such check, record that and add nothing) | null one mapped column |

## S5c — verified origin
`platform/db/repos/origin-repo.ts`: `SqlOriginSettingRepo` (:71-110) MOVE -> `packages/db/src/verified-origin/repo.sql.ts`;
`registerConfiguredOriginOn` (:206, read + write under `lockKey("origin_settings:<ws>")`) and `ConfiguredOriginWriteResult`
MOVE with it as `registerConfiguredOrigin({ kernel, tables, workspaceId, ... }, _optional = {})`;
`seedDevCapabilityOriginOn` (:112-142) **STAY-PRODUCT** (dev-capability seeding is host boot policy) in the reduced Tovu
file, calling the Jini repo. `sqlite/origin-repo.sqlite.ts` STAY-WIRING. `features/origin/configured-origin.ts` (82;
decides from the host's runtime mode) STAY-PRODUCT, not edited.
| Risk | Test (T0) | Mutation -> RED |
|---|---|---|
| Origin read for the wrong workspace | two workspaces: `findByWorkspaceId`, `findRedirectAllowlist`, `findEgressAllowlist` each return only their own | drop a predicate |
| Configured origin write races / reports the wrong result | same origin twice: `inserted` then `unchanged` and no second write; changed origin: `updated`; recording kernel: lock before the read | remove the lock; always write |
| The gate that consumes the repo stops consulting it (LESSONS 13; not moved) | one route-level test per shipped security profile: a state-changing admin request with a non-matching `Origin` is refused, and the same request is ALSO refused when the bound repo returns no origin (pin today's outcome for that case, whatever it is), while a matching `Origin` succeeds (positive control) | bind a repo that returns the request's own origin |

## commits / stops
Each run T0 -> J1 -> T1 (T-SQLREPO §5). Trees after each T1 compile alone (three disjoint source files).
- STOP: any change to setting keys, value encodings or the revisions table (S0-P6; no migration is planned because nothing stored changes).
- STOP: the env-schema design renames a setting or an env-backed default used here (`git log --oneline $BASE..origin/<integration> -- apps/website/src/features/settings` shows its commit): re-take facts.
Not verified while planning: bodies of the settings methods beyond the lines cited; `origin-repo.ts:6-11` imports and
`:112-205`; the route-level test's profile list (`rg -n "securityProfile|SECURITY_PROFILE" apps/website/src/server -g '!**/__tests__/**'`).
