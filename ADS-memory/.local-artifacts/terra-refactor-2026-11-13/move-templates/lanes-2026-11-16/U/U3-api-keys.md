# U3 — API keys (types, secret hasher, service, SQL repo) -> `@jini-ai/user-management`

Security code. Kind: SPLIT + SQLREPO. Facts: `U3-api-keys.facts.md` (4 files, 877 lines; plus `SqlApiKeyRepo`,
`features/identity/repo.ts:647-710`). Runs AFTER S3a (same files). Independently removable: every Jini file of this sheet
sits under `server/api-keys/` and one core leaf, and nothing else in user-management may import them.

```
id: U3-api-keys      (two runs: U3a = types + secret + SQL repo; U3b = service)
jini_target: user-management
  NEW packages/user-management/src/core/api-keys.ts                (ApiKeyRecord, ApiKeyRepoPort, ApiKeySecretHasherPort; universal; exported from the root entry)
  NEW packages/user-management/src/server/api-keys/{secret.ts,service.ts,index.ts}   (node; exported from ./server)
  NEW packages/user-management/src/server/sql/api-keys.ts           (SqlApiKeyRepo; exported from ./server/sql)
prerequisites:
  - S0 green + red mutations (P3 wire format, P4 stored hash N-1). S3a landed: `rg -n "createIdentityTransactions" packages/user-management/src/server/sql/transactions.ts`.
  - Owner decision OD-4 answered YES (API keys enter the library that documented them out of scope). Without it: SKIPPED.
  - Jini `INFO.md`/README/grant-service header lines that say "Out of scope, deferred: API keys" are rewritten in the SAME Jini
    commit that adds the code (plan-v6 U3: "lift the exclusion in the same batch"): `rg -n -i "api.?key" packages/user-management/{INFO.md,README.md,src/server/grant-service.ts,src/core/types.ts}`.
```

## split
| File / declaration | Label | Notes |
|---|---|---|
| `api-key-types.ts`: `ApiKeyRecord`, `ApiKeyRepoPort`, `ApiKeySecretHasherPort` | MOVE -> `core/api-keys.ts` | 7 prod importers + 2 tests repoint to `@jini-ai/user-management`. Facts flag "tovu-text": the header/comments name the product; reword neutral. |
| `api-key-secret.ts`: `MintedApiKey`, `mintApiKey`, `parseApiKey`, `ScryptApiKeySecretHasher`, `decoyKeyHash`, private scrypt helpers | MOVE -> `server/api-keys/secret.ts` | see `values_injected` |
| `api-key-secret.ts`: `KEY_SCHEME_PREFIX = "tovu_ak_"`, `PREFIX_PATTERN = /^tovu_ak_[0-9a-f]{12}$/` | STAY-PRODUCT (the value) | the scheme prefix is a Tovu name AND a stored/issued format. Jini takes it as a value. |
| `api-key-service.ts`: `ApiKeyServiceDeps`, `CreateApiKeyPrincipalInput`, `createApiKeyPrincipal`, `IssueApiKeyInput`, `issueApiKey`, `revokeApiKey`, `authenticateApiKey`, private helpers (`requireBoundedName`, `holdsUnconstrained`, `assertGrantClamp`, `assertCallerMayManageApiKeys`, `requirePolicyIds`, `readOptionalExpiry`, `isCandidateStillUsable`) | MOVE -> `server/api-keys/service.ts` | VERBATIM, including the private grant clamp. See "No dedupe in this sheet". |
| `SqlApiKeyRepo` + mapper | MOVE -> `server/sql/api-keys.ts` | T-SQLREPO; `tables: { apiKeys: "api_keys" }` |
| `site-key-permission.ts` | STAY-PRODUCT | product permission ids (`admin.security.site-key.manage`, derived from `admin.integrations.manage`) and grant registration; it is the SITE ROOT KEY permission, not API keys. It was grouped here by name only. Not edited. |
| `SqliteApiKeyRepo` (`repo.sqlite.ts:80`) | STAY-WIRING | binds kernel + `api_keys` |
| `server/inbound/admin-http/routes/api-keys/*`, `http/api-keys.ts`, `dev-auth.ts` | STAY (Express, composition) | imports repointed only |

## values_injected
`createApiKeyCodec({ scheme }, _optional = {})` returns `{ mint, parse }`; `scheme` is required, no default (Tovu passes
`"tovu_ak_"` from a `const API_KEY_SCHEME` placed in `features/identity/wiring.ts` with the why-comment that names the
product). The prefix pattern is built from `scheme` with the scheme regex-escaped; handle length (6 bytes -> 12 hex),
secret length (32 bytes) and separator (`.`) stay constants in Jini (they are the library's format, pinned by P3).
LESSONS 20 applies: making the constant configurable must not change which strings parse — P3's frozen literals are the judge.
`ScryptApiKeySecretHasher` moves unchanged: parameters, key length, salt length, maxmem and the stored-hash layout are a
STORED FORMAT. No parameter becomes configurable in this sheet. Existing installs keep verifying with no migration because
nothing about the stored value changes; P4's N-1 fixture proves it.
`decoyByHasher` (`WeakMap` keyed by hasher instance) moves with `decoyKeyHash`: it is module state. Owner of that state after
the move = the Jini module; one hasher instance per process is created in `wiring.ts:184` and that stays the only one.

## Security chain: `authenticateApiKey` (every step keeps its owner in ONE function; none becomes a host port)
| # | Step (today, in order) | Test in T0 that fails if the step is removed (write on unmoved code) |
|---|---|---|
| 1 | `parseApiKey` rejects malformed input -> `null`, no storage read | malformed key: result `null` AND the repo fake recorded zero calls |
| 2 | `findByPrefix({ workspaceId, prefix })` — workspace-scoped | a key issued in workspace A presented to workspace B -> `null` |
| 3 | unknown prefix still spends ONE real derivation against the decoy hash | hasher fake records calls: exactly one `verify` with the decoy stored hash when no row matches (assert call count and that the argument is the decoy; never assert wall-clock time) |
| 4 | `verify(candidate.keyHash, secret)` false -> `null` | wrong secret for a real prefix -> `null`, and the principal repo recorded zero reads (verification precedes every other lookup) |
| 5 | revoked / expired / principal not `active` / principal kind not `api_key` -> `null`, checked AFTER verification | four cases, each with a CORRECT secret: revoked key, key expired by instant comparison (use an expiry written with a non-UTC offset, the comment's own case), disabled principal, principal of kind `user`. Each asserts `verify` WAS called once (the check did not short-circuit ahead of it) |
| 6 | every rejection is the same `null` | all cases above return exactly `null`, nothing thrown, no reason field |
| 7 | success records `lastUsedAt` from the injected clock | fixed clock; saved row carries that instant; returned `apiKey` is the pre-save candidate (pin what today returns) |
Mutation list for the cloud run: delete each numbered step in turn; each must turn its own test RED and (for 3 and 5) no other.

`issueApiKey` / `createApiKeyPrincipal` / `revokeApiKey`:
| Step | Test that fails if removed |
|---|---|
| caller must hold `apikey.manage` (`assertCallerMayManageApiKeys`) | caller without it: refused with the same error class the route maps today; zero rows written |
| grant clamp (INV-07): every permission the snapshot would confer is held UNCONSTRAINED by the caller; owner wildcard `*` counts | caller holds the permission only with a constraint -> refused, zero rows; caller with `*` -> allowed |
| authority is a frozen snapshot: issuance copies policy permissions into a NEW `isFrozen` policy | after issuance, widen the source policy; the key's effective permissions are unchanged |
| refusal writes nothing (LESSONS 17: no principal, no policy, no key row, no event) | on each refusal path assert all repo fakes are untouched |
| name bounds 1..255, policy ids validated, expiry canonicalised | boundary cases as today |
| revoke is idempotent and only for a key in the caller's workspace | cross-workspace id -> same outcome as unknown |
| the raw secret is returned once and never stored | after issuance no repo fake holds the raw secret substring |

## No dedupe in this sheet
The service re-implements the grant clamp because Jini's `grant-service.ts` does not export its own. Do NOT replace
`assertGrantClamp` with the Jini internal in this move: a DEDUPE claim needs a behaviour diff and one real caller checked
(LESSONS, "DEDUPE claims"). Follow-up sheet U3c (not written, ~60k): table-driven comparison of the two clamps over the
same fixtures (constraint present, wildcard, missing policy, frozen policy); only if identical, the service calls the
package-internal one by leaf import and the copy is deleted.

## Route/middleware gate (not moved, but traced: LESSONS 13)
The Bearer path is: request -> admin-http auth middleware -> `authenticateApiKey` -> principal on the request context ->
`authorize`. This sheet changes only the import specifier in the files that call it (facts: `dev-auth.ts`,
`routes/api-keys/{create-principal,deps,issue,revoke}.ts`). T0 adds ONE route-level test per security profile the app
ships (find them: `rg -n "securityProfile|SECURITY_PROFILE" apps/website/src/server -g '!**/__tests__/**' | head`): a
request with a revoked key gets the same status and body as a request with an unknown key. It must fail if the middleware
stops calling `authenticateApiKey`.

## wiring (Tovu, T1)
`features/identity/wiring.ts:18` -> `import { ScryptApiKeySecretHasher, createApiKeyCodec } from "@jini-ai/user-management/server";`
+ `const API_KEY_SCHEME = "tovu_ak_";` + `const apiKeyCodec = createApiKeyCodec({ scheme: API_KEY_SCHEME });` passed into
`ApiKeyServiceDeps` as `codec` (new required field; the service stops importing mint/parse directly). Every construction site
of `ApiKeyServiceDeps` must pass it: census `rg -n "ApiKeyServiceDeps|secretHasher:" apps/website/src`.
The four Tovu files are deleted except `site-key-permission.ts`. `repo.ts` is deleted if S3a left only `SqlApiKeyRepo` in it.

## commits
U3a: T0 (chain tests, both tables above) -> J1 (core leaf, secret.ts, sql/api-keys.ts, docs exclusion lifted, changeset minor)
-> T1 (types/secret/repo repointed; service still in Tovu, now importing Jini types and taking `codec`).
U3b: J1 (service.ts + its unit tests moved with fakes of the repo ports) -> T1 (service deleted, routes repointed).
Fakes implement `ApiKeyRepoPort` / `PrincipalRepoPort` / `ApiKeySecretHasherPort`; no `vi.mock` of user-management internals.

## stops
- OD-4 not answered. A second hasher instance or a second scheme constant appears. Any step of the chain would need to
  become a callback supplied by Tovu (that would let a host weaken it: STOP, report).
- `authenticateApiKey` exceeds 50 lines / complexity 10 after adding `codec` (it is ~30 lines today): split only by extracting
  the lookup, never by reordering steps 3-5.
- A changed error class or message on any refusal path (routes map them to status codes; LESSONS 7 and 24).

## estimate
U3a ~190k, U3b ~200k tokens. Not verified while planning: bodies of `issueApiKey`/`createApiKeyPrincipal`/`revokeApiKey`
(read the header and `authenticateApiKey` only); the number of security profiles; whether `core/index.ts` is in R3's TSV.
