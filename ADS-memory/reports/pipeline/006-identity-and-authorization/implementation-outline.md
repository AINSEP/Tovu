# Implementation Outline: identity-and-authorization (API-key issuance plumbing)

- Spec: SPEC-006 v0.6.0 (hash: sha256:2f74289036a419715d2210352d3de271500e0f8dcd5679207bf4d6ae4d3d65dc)
- ADR: ADR-PIPE-006 (mirrored as ADR-048, `reports/architecture/ADR-048-api-key-issuance-and-create-principal-plumbing.md`)
- Status: PRODUCED
- Trigger result: Boundary Cross, Contract Change, Data And Persistence, Critical Cross-Boundary Invariant all matched; System Wiring and Parallelization Ambiguity also matched (see below)
- Date: 2026-07-28
- Author: Software Architect

> Scope: this outline covers only the missing `ISSUE_API_KEY` / `REVOKE_API_KEY` / `CREATE_PRINCIPAL` plumbing identified by the Programmer's escalation. It does not restate or reopen `grant-service.ts` / `admin-crud-service.ts` / `authorize.ts`, which are pre-existing and unchanged.

## Trigger Decision Matrix

| Trigger | Applies? | Evidence | Source Trace |
|---|---:|---|---|
| Boundary Cross | yes | Touches `identity` core (types/ports/services), `infra/db/schema.ts`, `identity/repo.memory.ts` + `repo.sqlite.ts`, `server/middleware/dev-auth.ts`, `server/routes/admin/api-keys/**`, `server/modules/`, `server/routes/types.ts`, `server/deps.ts`/`server/app.ts` composition roots. | Programmer escalation; `src/identity/*`, `src/server/*` read this session |
| Contract Change | yes | New exported functions (`createPrincipal`, `issueApiKey`, `revokeApiKey`, `validateApiKey`), new `ApiKeyRepoPort`/`ApiKeyRecord`, new HTTP endpoints (`APIKEY_ISSUE`, `APIKEY_REVOKE`, and — pending Spec Agent ratification — a `CREATE_PRINCIPAL` route). | api.spec.md §1 rows `APIKEY_ISSUE`/`APIKEY_REVOKE`; state.spec.md §3 `CREATE_PRINCIPAL`/`ISSUE_API_KEY`/`REVOKE_API_KEY` rows |
| System Wiring | yes | Composition-root wiring: two new repo adapters must be threaded through `wiring.ts`'s `IdentityRouteDepsSlice`, `server/routes/types.ts`'s `RouteDeps`, both `server/app.ts`/`server/deps.ts` composition roots, and a new `server/modules/api-keys.ts` module (ADR-046 Phase 3 convention). | `src/identity/wiring.ts`, `src/server/modules/users.ts` (precedent) |
| Data And Persistence | yes | New `api_keys` table; `IdentityRepos` gains a 10th port; a Database Agent migration-generation pass is required. | REQ-08, state.spec §1/§2 `ApiKey` entity |
| Brownfield Dependency | no | No existing HTTP consumer of `APIKEY_ISSUE`/`APIKEY_REVOKE`/`CREATE_PRINCIPAL` exists today (Programmer escalation confirmed zero plumbing) — nothing to preserve. | Programmer escalation |
| Reverse-Spec Or Migration | no | Not a reverse-spec/migration feature. | N/A |
| Critical Cross-Boundary Invariant | yes | INV-07 grant-authority clamp + the F-053-01/F-054-01 issuance-snapshot chain spans `principals`/`policies`/`policy_permissions`/`principal_policies`. | feature.spec.md REQ-08, INV-07, state.spec §3 `ISSUE_API_KEY`/`REVOKE_API_KEY` |
| Parallelization Ambiguity | yes | The schema/port/adapter slice, the core-service slice, and the HTTP-route/middleware slice look independent but share the `IdentityRepos`/`RouteDeps` composition surface — sequencing matters (see Downstream Handoff Notes). | This outline's Wiring Map |

## Module Map

| Module/Domain | Owns | Responsibility | Public Contracts | Dependencies | Notes |
|---|---|---|---|---|---|
| `identity` (core) | `ApiKeyRecord`, `ApiKeyRepoPort`, `createPrincipal`/`issueApiKey`/`revokeApiKey`/`validateApiKey` | Machine-principal minting, key issuance-snapshot, revocation, credential resolution | C-001..C-008 | `core/ports` (Clock/IdGen/UUID), existing `identity/authorize.ts`, `identity/grant-service.ts` helpers | No new port beyond `ApiKeyRepoPort` — hashing stays ordinary code (Article IV) |
| `infra/db` | `apiKeys` Drizzle table | Schema-only; no business logic | — | `drizzle-orm` | Database Agent reviews before `db:generate` |
| `server` (admin routes + composition) | `api-keys` server module, `dev-auth.ts` API-key credential resolution | HTTP surface + request-level auth resolution | C-009..C-012 | `identity` public barrel (`index.ts`), `RouteDeps` | Mirrors `users` server module (ADR-046 Phase 3) exactly |

## File Map

| File Path | Module | Creates / Changes | Public Contracts Housed | Responsibility | Why This Separation Exists | Notes |
|---|---|---|---|---|---|---|
| `src/identity/types.ts` | identity | changes | C-001 `ApiKeyRecord` | Type-only entity shape | Mirrors every other identity record living in `types.ts` | Transcribes state.spec §2 `ApiKey` verbatim |
| `src/identity/ports.ts` | identity | changes | C-002 `ApiKeyRepoPort`; `IdentityRepos.apiKeys` | Port contract | Mirrors the 9 existing ports' shape (`findById`/`save`/etc.) | No new `PasswordHasherPort`-style port for key hashing — see ADR |
| `src/identity/token-crypto.ts` | identity | creates | C-003 `hashOpaqueToken`, `newOpaqueSecret` | One reviewed SHA-256/randomBytes implementation shared by session tokens and API keys | Avoids duplicating crypto code across `auth-service.ts` and the new `api-key-service.ts` (Article III/IV) | `auth-service.ts`'s private `hashToken`/`newRawToken` are refactored to call this, behavior-identical |
| `src/identity/api-key-service.ts` | identity | creates | C-004 `createPrincipal`, C-005 `issueApiKey`, C-006 `revokeApiKey`, C-007 `validateApiKey` | `CREATE_PRINCIPAL`/`ISSUE_API_KEY`/`REVOKE_API_KEY` transitions + API-key credential resolution | New file, not folded into `grant-service.ts`/`admin-crud-service.ts` — REQ-08's issuance-snapshot logic is a large, distinct concern; reuses their exported helpers rather than duplicating | `[internal-invariant]` unit inside — see Critical Internal Constraints artifact |
| `src/identity/repo.memory.ts` | identity | changes | `InMemoryApiKeyRepo` | In-memory `ApiKeyRepoPort` adapter | Rule-of-two partner #1 (Article IV) | Mirrors `InMemorySessionRepo` exactly |
| `src/identity/repo.sqlite.ts` | identity | changes | `SqliteApiKeyRepo` | SQLite `ApiKeyRepoPort` adapter | Rule-of-two partner #2 | Mirrors `SqliteSessionRepo` exactly; depends on schema addition below |
| `src/infra/db/schema.ts` | infra/db | changes | `apiKeys` sqliteTable | Drizzle table definition | Same file as the other 9 identity tables (single schema file convention already established) | Database Agent reviews before `npm run db:generate` |
| `src/identity/wiring.ts` | identity | changes | `IdentityRouteDepsSlice.apiKeyRepo` | Threads the new port through both composition helpers | `buildIdentityRouteDeps` is the one place both roots share | Add to both `createInMemoryIdentityRouteDeps` and `createSqliteIdentityRouteDeps` |
| `src/identity/index.ts` | identity | changes | barrel re-exports of C-001..C-007 | Public module surface (ADR-009 §1) | Deep imports from outside `identity/` must go through here, per the file's own header | — |
| `src/server/routes/types.ts` | server | changes | `RouteDeps.apiKeyRepo` | Composition-root-visible field | Matches the existing flat-field convention for the other 9 identity ports | — |
| `src/server/middleware/dev-auth.ts` | server | changes | C-008 API-key credential resolution folded into `currentPrincipal` | Resolves `Authorization: ApiKey <raw>` when no session cookie is present | `AUTH_SESSION_OR_KEY`/`AUTH_APIKEY_MANAGE` (api.spec §2) require "session cookie or key"; this is the one place request-level credential resolution already lives | Also closes the pre-existing, unrelated `AUTH_ME` API-key-branch drift (api.spec §2) as a side effect — flagged, not separately scoped |
| `src/server/routes/admin/api-keys/deps.ts` | server | creates | `ApiKeysRouteDeps`, `apiKeyServiceDepsFrom` | `RouteDeps` → `identity` service-deps mapping | Mirrors `routes/admin/users/deps.ts`'s `UsersRouteDeps`/`identityServiceDepsFrom` exactly | — |
| `src/server/routes/admin/api-keys/issue.ts` | server | creates | C-009 `registerAdminApiKeyIssueRoute` | `POST .../api-keys` (APIKEY_ISSUE) | One file per route, matching every other admin route file in this codebase | — |
| `src/server/routes/admin/api-keys/revoke.ts` | server | creates | C-010 `registerAdminApiKeyRevokeRoute` | `POST .../api-keys/:id/revoke` (APIKEY_REVOKE) | Same convention | — |
| `src/server/routes/admin/api-keys/create-principal.ts` | server | creates (contingent) | C-011 `registerAdminApiKeyCreatePrincipalRoute` | `CREATE_PRINCIPAL` HTTP surface | Only if Spec Agent ratifies the separate-endpoint resolution (Decision 3) | **BLOCKED on `[NEEDS CLARIFICATION]`** — see ADR §Decision 3 |
| `src/server/modules/api-keys.ts` | server | creates | C-012 `createApiKeysModule` | Registers the 2-3 routes above | Mirrors `server/modules/users.ts` (ADR-046 Phase 3 typed-module convention) | — |
| `src/server/app.ts`, `src/server/deps.ts` | server | changes | — | Construct `apiKeyRepo` (in-memory / SQLite) alongside the other 9 identity repos; call `createApiKeysModule` | Both composition roots must stay identical per `identity/wiring.ts`'s own stated purpose | — |

## Contract Map

| Contract ID / Name | File | Owner Module | Kind | Why Needed | Job | Inputs | Outputs | Validation | Errors | Effect Boundary | Complexity / Resource View | Aggregate-Risk Note | Spec/ADR Trace | Test Seam / Expectation |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| C-001 `ApiKeyRecord` | `identity/types.ts` | identity | type | REQ-08 entity has no type today | data shape | — | — | — | — | none (type only) | O(1) | N/A | state.spec §2 `ApiKey` | type-level only |
| C-002 `ApiKeyRepoPort` | `identity/ports.ts` | identity | interface | REQ-08 needs a repo seam (Article IV rule-of-two) | CRUD + revoke over `api_keys` | `{workspaceId,id}` / full record / `{workspaceId,keyHash}` / `{workspaceId,principalId}` | `ApiKeyRecord \| null` / `ApiKeyRecord[]` / `void` | workspace-scoped lookups only | none (port) | I/O (via adapter) | O(1) per call (indexed) | N/A | REQ-08, REQ-10 (composite scoping) | contract test mirrored across both adapters (existing `repo.contract.test.ts` convention) |
| C-003 `hashOpaqueToken`/`newOpaqueSecret` | `identity/token-crypto.ts` | identity | exported function | Shared, reviewed-once crypto primitive (Article III/IV; see ADR Decision 2) | hash an opaque bearer secret; mint a high-entropy secret | raw string / byte length | hex digest / hex string | none | none | pure | O(1) | N/A | ADR Decision 2 | unit test: deterministic hash, distinct outputs per call for `newOpaqueSecret` |
| C-004 `createPrincipal` | `identity/api-key-service.ts` | identity | exported async function | `CREATE_PRINCIPAL` (state.spec §3) has no implementation | mint a grantless `kind='api_key'` principal | `{workspaceId, callerPrincipalId, displayName}` | `{principal: PrincipalRecord}` | caller holds `apikey.manage`; `displayName` non-blank | `IdentityForbiddenError`, `IdentityValidationError` | write: one `principals` row | O(1) | N/A | state.spec §3 `CREATE_PRINCIPAL`, REQ-08 | unit test: mint always yields `kind='api_key'`, `status='active'`, zero grant rows |
| C-005 `issueApiKey` | `identity/api-key-service.ts` | identity | exported async function | `ISSUE_API_KEY` has no implementation | validate + snapshot + mint key | `{workspaceId, callerPrincipalId, principalId, label, policyIds, expiresAt?}` | `{apiKey: ApiKeyRecord, rawKey: string}` | AC-23 (kind check), AC-25a (grantless), AC-26 (`*`-free source), INV-07 clamp (all four order-sensitive — see CIC U-001) | `IdentityValidationError`, `IdentityNotFoundError`, `GrantExceedsIssuerError`, `IdentityForbiddenError` | writes: 1 frozen `policies` row, N `policy_permissions` rows, 1 `principal_policies` row, 1 `api_keys` row | O(p) in total source-policy permission rows | see CIC U-001 | REQ-08, INV-07, F-053-01, F-054-01, AC-15/23/25a/26 | integration test at the HTTP boundary (Article V) + unit tests per rejection path |
| C-006 `revokeApiKey` | `identity/api-key-service.ts` | identity | exported async function | `REVOKE_API_KEY` has no implementation | revoke key + retire its frozen policy | `{workspaceId, callerPrincipalId, keyId}` | `void` | caller holds `apikey.manage`; key exists in workspace | `IdentityForbiddenError`, `IdentityNotFoundError` | writes: `api_keys.revokedAt`, deletes 1 `principal_policies` row + 1 `policies` row + its `policy_permissions` rows | O(1) | see CIC U-002 | state.spec §3 `REVOKE_API_KEY`, AC-06 | integration test: revoked key's frozen policy is gone; other principals' policies untouched |
| C-007 `validateApiKey` | `identity/api-key-service.ts` | identity | exported async function | REQ-08's "authenticates identically to a session" has no resolver | resolve a raw key to its principal | `{workspaceId, rawKey, nowIso?}` | `{principal, apiKey} \| null` | fail-closed: unknown/revoked/expired/disabled-principal → `null` | none (never throws on bad input) | read + one `lastUsedAt` write on success | O(1) indexed lookup | N/A | REQ-08, EC-02/EC-03 (mirrors `validateSession`) | unit test mirroring `validateSession`'s existing test shape |
| C-008 API-key branch of `currentPrincipal` | `server/middleware/dev-auth.ts` | server | exported function (modified) | `AUTH_SESSION_OR_KEY`/`AUTH_APIKEY_MANAGE` require key-or-session | try session cookie, then `Authorization: ApiKey <raw>` | `Request` | `PrincipalRecord \| null` | session checked first (existing behavior unchanged when a cookie is present) | none | read | O(1) | N/A | api.spec §2 `AUTH_SESSION_OR_KEY`/`AUTH_APIKEY_MANAGE` | integration test: a valid raw key authenticates a route with no cookie present |
| C-009 `registerAdminApiKeyIssueRoute` | `server/routes/admin/api-keys/issue.ts` | server | exported route registrar | `APIKEY_ISSUE` has no route | HTTP → `issueApiKey` + error mapping | Express req/res | HTTP 201/400/403/404 | mirrors `attach-policy.ts`'s catch-block error-mapping convention | maps C-005's errors to api.spec §6's codes | I/O (HTTP) | O(C-005) | N/A | api.spec §1/§4/§5/§6 `APIKEY_ISSUE` | integration test (Article V) |
| C-010 `registerAdminApiKeyRevokeRoute` | `server/routes/admin/api-keys/revoke.ts` | server | exported route registrar | `APIKEY_REVOKE` has no route | HTTP → `revokeApiKey` + error mapping | Express req/res | HTTP 204/403/404 | same convention | maps C-006's errors | I/O (HTTP) | O(C-006) | N/A | api.spec §1/§4/§5/§6 `APIKEY_REVOKE` | integration test |
| C-011 `registerAdminApiKeyCreatePrincipalRoute` | `server/routes/admin/api-keys/create-principal.ts` | server | exported route registrar (contingent) | `CREATE_PRINCIPAL` has no route anywhere | HTTP → `createPrincipal` + error mapping | Express req/res | HTTP 201/400/403 | — | maps C-004's errors | I/O (HTTP) | O(C-004) | N/A | **pending Spec Agent ratification — see ADR Decision 3** | integration test once ratified |
| C-012 `createApiKeysModule` | `server/modules/api-keys.ts` | server | exported factory | ADR-046 Phase 3 module convention | register 2 (or 3) routes | `ApiKeysRouteDeps` | `ServerModuleHandle` | — | — | none (composition only) | O(1) | N/A | ADR-046 | mirrors `createUsersModule`'s existing test coverage shape |

## Wiring Map

| Flow ID | Source | Transport/Call Type | Target | Payload/Contract | Ordering/Retry/Idempotency | Failure Handling | Trace |
|---|---|---|---|---|---|---|---|
| W-001 | admin client | HTTP `POST /api/admin/v1/api-keys` | C-009 → C-005 | `APIKEY_ISSUE` request body (api.spec §4) | not idempotent; a retried request mints a second key (matches `CREATE_USER`'s existing non-idempotent precedent — no idempotency key in this admin surface today) | 400/403/404 per api.spec §6 | api.spec §1/§4 |
| W-002 | admin client | HTTP `POST /api/admin/v1/api-keys/:id/revoke` | C-010 → C-006 | `{}` | idempotent (already-revoked → no-op 204, mirrors `LOGOUT`'s existing precedent) | 403/404 | api.spec §1/§4, state.spec §3 |
| W-003 | any `/api/admin/*` request | in-process middleware call | C-008 (`currentPrincipal`) | session cookie OR `Authorization: ApiKey <raw>` header | session checked first; only falls through to key lookup when no cookie is present (never both, never key-then-session) | no credential → 401 `UNAUTHENTICATED`, same as today | api.spec §2 |
| W-004 | `createApp`/`createRouteDeps` (both composition roots) | direct construction call | `identity/wiring.ts`'s `buildIdentityRouteDeps` | adds `apiKeyRepo` to the returned `IdentityRouteDepsSlice` | must be constructed before `identityReady` resolves is NOT required (no seed data touches `api_keys`) | N/A | `identity/wiring.ts` |

## Data And Side-Effect Boundaries

| Boundary | Owner | Reads | Writes | Side Effects | Consistency / Transaction Rule | Migration / Dual-Write Path |
|---|---|---|---|---|---|---|
| `api_keys` table | `identity` (`ApiKeyRepoPort`) | `issueApiKey`, `revokeApiKey`, `validateApiKey`, admin key-list surfaces (future) | `issueApiKey` (insert), `revokeApiKey` (update `revokedAt`), `validateApiKey` (update `lastUsedAt`) | none external | single-connection, single-event-loop "atomic by construction" (matches `disablePrincipal`/`deleteRole`'s existing documented reasoning — no `await` yielded mid-check) | N/A (new table, no existing data) |
| `policies` / `policy_permissions` (frozen rows only) | `identity` (`PolicyRepoPort`/`PolicyPermissionRepoPort`, pre-existing) | `issueApiKey` (source policies, read-only), `revokeApiKey` (frozen policy, read+delete) | `issueApiKey` (insert 1 frozen policy + N permission rows), `revokeApiKey` (delete both) | none external | frozen rows are 1:1 with exactly one `api_keys` row for the lifetime of that key (CIC U-002) | N/A |
| `principal_policies` (api_key-kind rows only) | `identity` (`PrincipalPolicyRepoPort`, pre-existing) | `revokeApiKey` | `issueApiKey` (insert), `revokeApiKey` (delete) | none external | exactly one row per issued key, by construction of the grantless-bound-principal precondition (CIC U-001/U-002) | N/A |

## Observability And Operational Expectations

| Surface / Flow | Required Signals | Correlation / Trace Context | Metrics | Logs | Alert / Runbook Need | Privacy / Secret Constraints | Trace |
|---|---|---|---|---|---|---|---|
| `APIKEY_ISSUE`/`APIKEY_REVOKE` routes | structured error codes (existing `{error, code, details}` envelope, same as `attach-policy.ts`) | none beyond what the rest of this admin surface already carries (no `correlationId` anywhere yet — pre-existing Article VIII gap, not introduced here) | none new | never log `rawKey`, `keyHash`, or `input.password`-shaped fields (INV-05) | N/A (no alerting infra exists for this admin surface today) | `rawKey` appears in exactly one response body (`ApiKeyIssueResponse`) and nowhere else — never re-logged, never re-returned | INV-05, errors.spec §1 |

This surface inherits the pre-existing Article VIII gap (no `correlationId`) the same way every other identity admin route does — not a new deviation introduced by this ADR.

## Critical Invariants

| Invariant ID | Scope | Rule | Reason | Enforcement Surface | Test Expectation | Trace |
|---|---|---|---|---|---|---|
| INV-A | `issueApiKey` (C-005) | A minted key's frozen policy never carries a permission the issuer does not hold unconstrained | INV-07 grant-authority clamp | `assertGrantClamp` (reused, unmodified) | unit + integration | feature.spec REQ-08, INV-07 |
| INV-B | `issueApiKey` (C-005) | A key's bound principal is always `kind='api_key'` and grantless at issuance time | AC-23/AC-25a; closes F-053-01 | explicit precondition checks in C-005, before any write | unit + integration (negative cases) | AC-23, AC-25a |
| INV-C | `issueApiKey` (C-005) | No frozen policy snapshot ever carries `*` | AC-26; an api_key principal is never owner-tier | explicit source-policy scan, independent of the INV-07 clamp (see CIC U-001) | unit test: owner-caller snapshotting the built-in owner policy still rejects | AC-26 |
| INV-D | `[internal-invariant]` `revokeApiKey` (C-006) | Retiring a key deletes exactly the one frozen policy 1:1 with that key, never zero, never more than one, never another principal's policy | Prevents orphaned frozen policies or cross-principal data loss | `principalPolicies.listByPrincipalId` result is asserted to have exactly one row before delete (CIC U-002) | integration test: revoke one of two api_key principals' keys, assert the other's policy survives | REQ-08 state.spec §3 `REVOKE_API_KEY` row |

## Test Expectations

- Contract tests: `ApiKeyRepoPort` contract test mirroring the existing `identity/__tests__/repo.contract.test.ts` convention (run against both `InMemoryApiKeyRepo` and `SqliteApiKeyRepo`).
- Integration tests: `APIKEY_ISSUE`/`APIKEY_REVOKE` at the real HTTP boundary (Article V — every P1 AC here has an HTTP surface); API-key-based authentication of a route (W-003) with no session cookie present.
- Property/invariant tests: INV-A..INV-D above, especially INV-C (wildcard-source rejection must fail even for an owner caller) and INV-D (frozen-policy retirement targets exactly one row).
- Characterization tests: N/A — no brownfield behavior to preserve (Programmer confirmed zero prior plumbing).
- Explicitly N/A suites: load/performance testing → no NFR budget was stated for this surface (same as every other identity admin route).

## Downstream Handoff Notes

- Coordinator task-generation constraints: sequence as (1) schema + ports + adapters (Database Agent verifies schema first), (2) `token-crypto.ts` extraction + `api-key-service.ts` core functions, (3) `wiring.ts`/`RouteDeps`/composition-root threading, (4) HTTP routes + `dev-auth.ts` middleware extension + `server/modules/api-keys.ts`. Steps 1-2 can run `[P]` in parallel with each other but both must land before step 3; step 4 depends on step 3.
- TDD focus: CIC U-001 (issuance ordering) and U-002 (revocation derivation) get dedicated state-transition/property tests before generic CRUD tests; the wildcard-source rejection (INV-C) is the single highest-value negative test in this slice because it is not implied by the INV-07 clamp alone.
- Programmer architecture audit focus: confirm `api-key-service.ts` reuses `grant-service.ts`'s exported `assertCallerHasAnyPermission`/`assertGrantClamp`/`authorizeDepsFrom` rather than re-implementing them; confirm no new `PasswordHasherPort`-shaped abstraction was added for key hashing (Article IV); confirm `token-crypto.ts` is actually consumed by `auth-service.ts` (not left as an unused duplicate).
- Open risks or ambiguities: `CREATE_PRINCIPAL`'s HTTP surface is explicitly `[NEEDS CLARIFICATION]` (ADR Decision 3) — C-011/the `create-principal.ts` file are contingent on Spec Agent's ratification and must not be built against a guessed shape. The api.spec.md §1 vs §1a path-prefix drift (`/admin/api/...` vs the real `/api/admin/v1/...`) is noted but not re-litigated here; new routes follow the real, working prefix.
