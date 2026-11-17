# S0 (revision 2) — pins on UNMOVED code, plus the one binding helper. Gate for every other S and U sheet.

Revision 2 fixes judge findings 8 (P5 named the wrong producer), 13 (P6 was never compiled) and 14 (the pins are new
importers of lane files). Tovu only. One Sonnet run, ~120k tokens.

```
id: S0-pins
jini_target: -
prerequisites: the base pair of T-SQLREPO §1 (typecheck and typecheck:tests green on the unmodified pair)
successor_of: -            (runs first and alone; nothing else in lanes S/U starts before its report says DONE)
commits: K (one helper + its test) -> T0 (the pins) ; gates: T-SQLREPO §5 row T0 for both
```

## Commit K — `schemaErasedKernel` (the only production edit; owner decision OD-8)
`apps/website/src/platform/db/content-kernel.ts`: add, after `contentKernel`,
`export function schemaErasedKernel({ store }: { store: ContentKernel | SqliteConnectionSource }, _optional: Record<string, never> = {}): StorageKernel<Kysely<unknown>, unknown>`
returning `contentKernel({ store })` through the single cast, with the why-comment "Erases the host schema only: a Jini
adapter supplies each query's table view on this same kernel" (the three existing bindings say this inline today).
Imports: `type { StorageKernel } from "@jini-ai/core/contracts/storage"`, `type { Kysely } from "kysely"`.
Test `platform/db/__tests__/schema-erased-kernel.test.ts`: the returned object **is** the kernel `contentKernel` returns
for the same store (`assert.equal`), so a transaction opened through one is joined by the other (assert with one nested
write + rollback). Mutation -> RED: return a new wrapper object. Do not repoint the three existing bindings here.
If OD-8 is answered NO: skip commit K, and every later sheet copies the precedent cast (report it once per sheet).

## Commit T0 — the pins (`apps/website/src/__tests__/lane-su-pins/<pin>.test.ts`)
| # | Pin | Real producer / source today | Assertion | Mutation -> RED (apply to the named file, revert) |
|---|---|---|---|---|
| P1 | Lock keys, exact strings | the `lockKey(` call sites: `rg -n "lockKey\(" apps/website/src -g '!**/__tests__/**'` (INDEX §6 lists the strings) | drive each locking method through a recording wrapper of the real SQLite kernel and assert the literal for fixed ids | change one character of that key in its source file (one mutation per key) |
| P2 | One member, one lock | `features/members/repo.ts:391,424` (`SqlMemberSessionRepo`), `features/members/password-auth.ts:125`, `features/trash/table-adapter.ts:85` with the registry's `member` entry | for one workspace + member id: session save, session revoke-all, password persist and the trash adapter's `hide` all call `lockKey` with the SAME string | change the template at each of the four sites in turn |
| P3 | API key wire format | `features/identity/api-key-secret.ts` (`KEY_SCHEME_PREFIX`, `PREFIX_PATTERN`, separator, byte lengths) | `mintApiKey()` matches the frozen shape; `parseApiKey` accepts a frozen literal and rejects wrong scheme, wrong handle length, missing separator, empty secret | change the prefix, a length, the separator |
| P4 | API key stored hash, N-1 | same file, `ScryptApiKeySecretHasher` | a frozen `{ secret, storedHash }` literal verifies `true`; a one-character-different secret `false`; a stored hash with out-of-bounds cost parameters `false` without throwing | change the layout order, a bound, the key length |
| P5a | Member bearer digest, write side | `features/members/write-service.ts:80-82` `hashToken` -> its module-level `NodeSessionTokens` instance (`:58`); used by `issueMemberSession` (`:451`) and `consumeMemberChallenge` (`:363`) | (1) `consumeMemberChallenge` with `input.token = FROZEN_RAW` and a recording fake `magicLinks`: the `findByTokenHash` argument equals `FROZEN_DIGEST` (literal committed in the test); (2) `issueMemberSession` with a recording fake `sessions`: the saved `tokenHash` is the digest of the returned `rawSessionToken` under the read side below | make `hashToken` return `rawToken` |
| P5b | Member bearer digest, read side | `features/members/access-resolver.ts:59-60` (its OWN `createHash` copy) | `resolveMemberSession` with `sessionToken = FROZEN_RAW` and a recording fake `sessions`: the `findByTokenHash` argument equals the SAME `FROZEN_DIGEST`; round trip: a session minted by (2) is found by the resolver | change the digest algorithm in `access-resolver.ts` |
| P5c | Staff session, pending-proof and recovery-code digests | produced inside `@jini-ai/user-management/server` (`NodeSessionTokens` built at `features/identity/wiring.ts:265`; the MFA and recovery services): **not lane code**. Lanes S/U move only their storage | frozen stored rows (literal `token_hash` / `code_hash` values, as an N-1 install holds them) inserted with raw SQL are found by `SqlSessionRepo.findByTokenHash`, `createMfaStore(...).pending`, `createRecoveryCodeStore(...).contains` for the frozen digest and NOT for a one-character-different digest | drop the hash predicate in each of the three Tovu store methods |
| P6 | Table and column shapes | `platform/db/content-database.generated.ts` | a **type-level** file: for every table named in a facts file, `keyof ContentDatabase["<t>"]` equals a literal union (`Expect<Equal<...>>`). Compiled ONLY by `npm run typecheck:tests` (`tsconfig.tests.json`; the normal tsconfig excludes `__tests__`): that command is this pin's gate, the node runner proves nothing here | rename a column in the union -> `typecheck:tests` fails naming the line |
| P7 | `entry_refs` kinds and the form-job prefix | `contracts/core/entry-refs/types.ts`; event-type strings in `platform/db/repos/{outbox-repo,form-delivery-repo}.ts` | literal unions / strings equal the committed list | change a kind |
| P8 | Outbox event row format, N-1 | `platform/db/repos/outbox-repo.ts` `outboxEventValues` | a frozen event literal maps to a frozen row literal; a frozen stored row is claimed and parsed back to the same event | change a column mapping or the JSON encoding |

## Rules
- Fixtures are literals in the test file, produced once by running today's code in this run and pasted; a test never
  regenerates its own fixture. Security material is described by class only in comments and reports.
- Real SQLite kernel (`openContentDb` + Tovu migrations) behind a thin recording wrapper that implements the kernel
  interface; fakes of port interfaces for P5a/P5b. No `vi.mock`, no `--experimental-test-module-mocks` use.
- P5 is three pins on three owners. The old "swap the hasher in identity wiring" mutation is withdrawn: it never reached
  the member digests.
- After T0, regenerate the facts files (`T-SQLREPO §3`) and commit them in the SAME commit: the only permitted
  difference is new test importers under `__tests__/lane-su-pins/`. Later sheets diff against these regenerated files.

## stops
- A key built by a helper (`slugLockKey`, the trash sweep key, the entries repair key) has a literal you cannot reach
  through a public method: report the method, do not pin the helper's source text.
- A mutation leaves its test green: T-SQLREPO §5 (rewrite or report NOT CHARACTERIZED; for P2-P5 that blocks the U sheets).
