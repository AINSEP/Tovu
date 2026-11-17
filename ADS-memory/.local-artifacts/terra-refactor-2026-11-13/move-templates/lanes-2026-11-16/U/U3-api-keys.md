# U3 (revision 2) — API keys (types, secret format, service, SQL repo) -> `@jini-ai/user-management`

Security code. Template: T-SQLREPO rev 2 (SQL part) + split. Facts: `U3-api-keys.facts.md` (4 files, 877 lines) plus
`SqlApiKeyRepo` (`features/identity/repo.ts:631-710` after S3a reduced that file).
Revision 2 fixes judge findings 11 (the middleware test could not prove authentication runs), 12 (`issueApiKey` is 85
lines; two security helpers were missing from the declaration map) and 15 (the grant clamp is reused in U3b; the
round-1 follow-up "U3c" is deleted). Repos are public: checks are named by class and location only.

```
id: U3a-api-key-format-and-store (~190k)  types + secret format + SQL repo        U3b-api-key-service (~210k, cut point after J1)
jini_target: user-management
  NEW src/core/api-keys.ts                         ApiKeyRecord, ApiKeyRepoPort, ApiKeySecretHasherPort (universal; named exports from the root entry)
  NEW src/server/api-keys/{secret.ts,shared.ts,authenticate.ts,issue.ts,principal.ts,index.ts}   (node; named exports from ./server)
  NEW src/server/sql/api-keys.ts                   SqlApiKeyRepo (exported from ./server/sql)
prerequisites: S0 DONE (P3 wire format, P4 stored hash N-1). S3a landed: `ls packages/user-management/src/server/sql/transactions.ts`.
  OD-4 YES (API keys enter the library that documents them as out of scope); without it: SKIPPED.
successor_of: S3b (hot files `features/identity/{wiring,repo,repo.sqlite}.ts`; user-management manifest)
```

## Declaration map (complete; `rg -n "^(export )?(async )?(function|const|interface|type) " apps/website/src/features/identity/api-key-*.ts` must match it, else STOP)
| Declaration (`api-key-service.ts` line) | Role | Destination |
|---|---|---|
| `ApiKeyServiceDeps` (:48), `NAME_MIN_LENGTH`/`NAME_MAX_LENGTH` (:41-42), `APIKEY_MANAGE` (:45), `requireBoundedName` (:56), `assertCallerMayManageApiKeys` (:105) | deps type; caller-permission gate | `shared.ts` |
| `holdsUnconstrained` (:66), `assertGrantClamp` (:82) | grant clamp (private copy) | **not moved: DELETED in U3b**, replaced by the package's own `assertGrantClamp` (below) |
| `CreateApiKeyPrincipalInput` (:118), `createApiKeyPrincipal` (:141), `revokeApiKey` (:382) | machine-principal creation, revocation | `principal.ts` |
| `IssueApiKeyInput` (:171), `requirePolicyIds` (:181), **`findIssuableTargetOrThrow` (:193)** (target-principal eligibility), **`collectSnapshotSourceRows` (:222)** (source-policy resolution), `readOptionalExpiry` (:245), `issueApiKey` (:277) | issuance | `issue.ts` |
| `isCandidateStillUsable` (:413), `authenticateApiKey` (:440) | authentication | `authenticate.ts` |
| `api-key-types.ts` (67): the three types | contracts | `core/api-keys.ts` |
| `api-key-secret.ts` (237): `MintedApiKey`, `mintApiKey`, `parseApiKey`, `ScryptApiKeySecretHasher`, `decoyKeyHash`, private derivation helpers | wire + stored format | `secret.ts` |
| `api-key-secret.ts`: `KEY_SCHEME_PREFIX = "tovu_ak_"` and the pattern built on it | product value AND issued format | **STAY-PRODUCT (the value)**: see `keyScheme` |
| `site-key-permission.ts` | the site root key's permission ids (grouped here by name only) | STAY-PRODUCT, not edited |
| `SqlApiKeyRepo` + `toApiKeyRecord` | storage | `server/sql/api-keys.ts`, `tables: { apiKeys: "api_keys" }` |

## `keyScheme` is data, not a callback
`mintApiKey({ scheme }, _optional = {})` and `parseApiKey({ rawKey, scheme }, _optional = {})`; the pattern is built from
the regex-escaped `scheme`; handle length, secret length and separator stay Jini constants (the library's format, P3).
`ApiKeyServiceDeps` gains a required `keyScheme: string`; the service passes it to mint and parse itself. The host
supplies one string (`const API_KEY_SCHEME = "tovu_ak_"` in `features/identity/wiring.ts`, with the why-comment naming the
product) and cannot replace the parser. LESSONS 20: P3's frozen literals are the judge that the same strings still parse.
`ScryptApiKeySecretHasher` moves unchanged (parameters, lengths, stored layout are a STORED FORMAT; P4's N-1 fixture
proves existing installs verify with no migration). `decoyByHasher` (a `WeakMap` keyed by hasher instance) moves with
`decoyKeyHash`; the one hasher instance is still created at `wiring.ts:184`.

## `issueApiKey` partition (finding 12; today :277-361, 85 lines, all inside `deps.repos.transactions.run`)
The order below is today's and is observable (which refusal wins, which id is drawn first); keep it exactly.
| New function (`issue.ts`) | Content, in order |
|---|---|
| `issueApiKey` (<= 35) | inside `transactions.run({ workspaceId, execute })`: (1) `assertCallerMayManageApiKeys` (2) `validateIssueInput` (3) `findIssuableTargetOrThrow` (4) `collectSnapshotSourceRows` (5) `assertGrantClamp` (6) `keyId = idGen.newId()`, then `snapshotPolicyId = idGen.newId()` (7) `writeIssuanceSnapshot` (8) `mintAndSaveKey` |
| `validateIssueInput({ input })` | label bounds -> policy ids -> optional expiry -> bound principal id present (`'principalId' is required`), in that order; returns the four values |
| `writeIssuanceSnapshot({ deps, workspaceId, keyId, snapshotPolicyId, label, principalId, sourceRows })` | frozen policy save (`name: api-key:<keyId>`, `isFrozen: true`), one permission row per source row (one new id each, `resourceType` / `constraintJson` copied, `?? null`), then the principal-policy link |
| `mintAndSaveKey({ deps, ... })` | mint, hash the secret, build the record (`createdAt` from `deps.clock`), `apiKeys.save`, return `{ apiKey, rawKey }` |

## Grant clamp reuse (finding 15; decided now, done in U3b)
Jini `packages/user-management/src/server/grant-service.ts:174` exports `assertGrantClamp({ deps: AuthServiceDeps, workspaceId, callerPrincipalId, conferredPermissions })`.
Compared with Tovu's `:82-101` on 2026-11-17: same de-duplication, same early return on an empty set, same
`resolveEffectivePermissions({ deps: authorizeDepsFrom(deps.repos), principalId, workspaceId })`, same filter, same
`GrantExceedsIssuerError` message text and `offendingPermissions`. `ApiKeyServiceDeps extends AuthServiceDeps`, so the
call compiles unchanged. `issue.ts` imports it by leaf path (`../grant-service.js`; no export-map entry needed).
The one piece not read side by side is Jini's private `holdsUnconstrained`: U3a's T0 clamp table (below) is written
against Tovu's copy and must stay green, unchanged, after U3b swaps the owner. A row that turns red = the two differ:
STOP, keep nothing half-swapped, report the row.

## Security chain A: `authenticateApiKey` (every step stays in ONE Jini function; none becomes a host port)
T0, unmoved code, fakes implementing `ApiKeyRepoPort`, `PrincipalRepoPort`, `ApiKeySecretHasherPort` (recording).
| # | Step today, in order | Test that fails if the step is removed |
|---|---|---|
| 1 | malformed input -> `null`, no storage read | malformed key: `null` AND zero repo calls |
| 2 | lookup is workspace-scoped | a key of workspace A presented to B -> `null` |
| 3 | an unknown handle still spends ONE real derivation against the decoy | hasher fake: exactly one `verify`, its stored-hash argument is the decoy (assert calls, never wall-clock time) |
| 4 | wrong secret -> `null` before any other lookup | wrong secret for a real handle: `null`, zero principal reads |
| 5 | revoked / expired / principal not active / principal not the machine kind -> `null`, checked AFTER verification (`isCandidateStillUsable`) | four cases, each with the CORRECT secret (expiry written with a non-UTC offset); each asserts `verify` was called once |
| 6 | every rejection is the same `null` | all cases: exactly `null`, nothing thrown, no reason |
| 7 | success records last use from the injected clock | fixed clock; saved row carries it; the returned record is what today returns (pin) |
Mutations: delete each numbered step in turn; each turns its own test RED.

## Security chain B: issuance, principal creation, revocation
| Step | Test that fails if removed |
|---|---|
| Everything runs inside the identity guard | recording `transactions` fake: `run` once per call, every repo call inside it |
| Caller holds the manage permission, checked FIRST | caller without it + otherwise invalid input: the permission error wins; zero writes |
| Target eligibility (`findIssuableTargetOrThrow`) | read :193-221 and pin each refusal it has today (unknown id, other workspace, wrong principal kind, inactive), with its error class |
| Source policies resolve (`collectSnapshotSourceRows`) | unknown / other-workspace policy id: today's refusal; rows returned in today's order |
| Grant clamp | caller holds the permission only with a constraint or a resource type -> `GrantExceedsIssuerError` listing it; caller with the wildcard -> allowed; duplicate permissions reported once; empty conferred set -> allowed |
| Authority is a frozen snapshot | after issuance, widen the source policy: the key's effective permissions are unchanged; the snapshot policy is `isFrozen` |
| A refusal writes nothing (LESSONS 17) | on every refusal path all repo fakes are untouched (no principal, policy, link, key) |
| The raw secret is returned once and never stored | no repo fake holds the raw secret substring |
| Revocation is idempotent and workspace-scoped | cross-workspace id behaves like an unknown id |

## The bearer gate (finding 11; not moved, traced: LESSONS 13)
`server/inbound/admin-http/dev-auth.ts:262-291` `currentCredential`: a session token is tried first; a valid OPERATOR
session returns `{ principal, kind: "session" }`; a non-operator session is treated like no session and falls through;
then the key header -> `authenticateApiKey` -> operator-principal check -> `{ principal, kind: "api_key" }` or `null`.
T0 adds, per shipped security profile (`rg -n "securityProfile|SECURITY_PROFILE" apps/website/src/server -g '!**/__tests__/**'`):
| Case | Assertion | Fails when |
|---|---|---|
| **Positive control**: a valid key calls a protected operation | 2xx AND the resolved credential is that key's principal with `kind: "api_key"` (assert through `currentCredential` and through one route) | the middleware stops calling `authenticateApiKey` (the old equal-denial test stayed green) |
| Revoked key; unknown key | same status and body as each other, and NOT the positive control's | a check is dropped |
| Session precedence | valid operator session + valid key on one request: `kind: "session"`, and the key repo fake recorded zero reads | the order is swapped |
| Non-operator session + valid key | resolves as the key (`kind: "api_key"`): today's fall-through, pinned | the fall-through is removed |
| Machine-credential restrictions | every existing branch on the credential kind (`rg -n "kind === \"api_key\"\|kind !== \"session\"\|kind: \"api_key\"" apps/website/src/server -g '!**/__tests__/**'`): one test per branch, refused with a key, allowed with a session | a restriction is dropped |
This sheet changes only import specifiers and the `keyScheme` field in `dev-auth.ts` and `routes/api-keys/*`.

## commits (each tree compiles alone)
U3a: T0 (chains A, B and the gate, all on unmoved code) -> J1 (`core/api-keys.ts`, `secret.ts`, `sql/api-keys.ts`,
exports, the docs lines that say API keys are out of scope rewritten in the SAME commit:
`rg -n -i "api.?key" packages/user-management/{INFO.md,README.md,src/server/grant-service.ts,src/core/types.ts}`) -> T1:
`api-key-types.ts`, `api-key-secret.ts` deleted; `features/identity/repo.ts` deleted (only `SqlApiKeyRepo` was left);
`SqliteApiKeyRepo` (`repo.sqlite.ts`) binds the Jini class; **`api-key-service.ts` stays in Tovu**, importing the Jini
types and `mintApiKey` / `parseApiKey` / `decoyKeyHash`, with `keyScheme` on `ApiKeyServiceDeps` and at every
construction site (`rg -n "ApiKeyServiceDeps|apiKeyServiceDepsFrom|secretHasher:" apps/website/src`).
U3b: J1 (`shared.ts`, `authenticate.ts`, `issue.ts` with the partition, `principal.ts`, the clamp imported from
`../grant-service.js`, unit tests with fakes) -> T1 (`api-key-service.ts` deleted, routes and `dev-auth.ts` repointed).
All T0 tests stay in Tovu, unchanged, and are the gate for both T1 commits (same count, all green).

## stops
- OD-4 not answered. A second hasher instance or a second scheme constant: `rg -n "new ScryptApiKeySecretHasher|tovu_ak_" apps/website/src -g '!**/__tests__/**'` lists one of each.
- A step of chain A or B would become a callback supplied by Tovu (STOP: a host could weaken it).
- `authenticateApiKey` or a function of the partition exceeds 50 lines / complexity 10 (eslint line): split only by extracting a lookup, never by reordering steps.
- A refusal's error class or message changes (routes map them to status codes; LESSONS 7, 24): chain B's assertions.
- The clamp table turns red after the swap (see above).
Not verified while planning: bodies of `createApiKeyPrincipal`, `revokeApiKey`, `findIssuableTargetOrThrow`,
`collectSnapshotSourceRows`, `isCandidateStillUsable`; Jini's private `holdsUnconstrained`; the list of credential-kind branches.
