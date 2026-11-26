# identity Overview

Implements ADR-021 / SPEC-006's core path: every actor is a `principals` row;
humans get RBAC (`roles -> policies -> permissions`); machines get direct
policy grants (`principal_policies`); `authorize()` is the one fail-closed
evaluator the command gateway calls before every mutation.

## Responsibilities

- Root identity (`principals`) and human credentials (`users`, argon2id).
- Revocable server-side sessions (`sessions`), absolute 30-day expiry.
- RBAC schema + first-boot seed (4 built-in roles/policies, disabled legacy
  `user-local` principal, owner user).
- `authorize()` — ordinary core function, not a port (ADR-006/ADR-021 §2).
- The registered permission catalog (REQ-03/REQ-12).

## Rules

- Every scoped table/join carries its own `workspaceId` and is looked up by
  composite `(workspaceId, id)` — never a bare id (ADR-021 §4/INV-01).
- Principals are disable-only; there is no hard-delete path (INV-02).
- `authorize()` is fail-closed: a non-null `constraintJson` it cannot
  interpret, or a `resourceType` that doesn't match `entityType`, both deny —
  never treated as an unconstrained/global grant (ADR-021 §8/INV-03).
- Passwords, session tokens, and API-key secrets are hashed; raw values are
  never stored or logged (INV-05). An issued key's raw value is returned exactly
  once, by `issueApiKey`, and is not recoverable from any row afterwards.

## API keys (added 2026-08-24, SPEC-006 REQ-08)

The tenth identity table, and the only one whose rows carry a secret. It lives
here rather than in `@jini-ai/cms/identity`, whose own `INFO.md` scopes API keys
out. The port, the in-memory adapter, the secret lifecycle and the transitions
now live in Jini (`@jini-ai/user-management/identity/{api-key-types,repo.memory,api-key-secret,api-key-service}`);
`repo.sqlite.ts` (the SQL adapter) stays here.

- `api-key-binding.ts` — the host binding: the only place the `tovu_ak_`
  scheme marker lives. It binds Jini's `createApiKeySecret({ prefix })` and
  `createApiKeyService({ keySecret })`; routes and `dev-auth` import the bound
  `issueApiKey`/`authenticateApiKey` from here. Changing the literal would make
  every issued key unparseable.
- `api-key-secret` (Jini) — minting (`randomBytes(32)`, 256 bits), parsing, and the
  scrypt hasher. The raw key is `tovu_ak_<12 hex>.<43 base64url>`: only the
  secret half is hashed; the prefix is stored in the clear as the lookup handle
  so verification is one indexed read plus one constant-time compare.
- `api-key-service` (Jini) — `createApiKeyPrincipal` / `issueApiKey` /
  `revokeApiKey`, plus `authenticateApiKey`, the Bearer counterpart of
  `validateSession` (returns `null` for every rejection reason, never a
  distinguishable error).
- A key's authority is a FROZEN snapshot of the policies named at issuance, not
  a live reference (F-054-01), and may never exceed its issuer's own
  unconstrained permissions (INV-07) or carry the owner wildcard `*`.
- HTTP surface: `src/server/routes/admin/api-keys/*`, documented in
  `openapi/006-identity-and-authorization.yaml`. Those three routes are
  session-cookie-only on purpose — an API key can never mint, issue, or revoke
  another.

## Scope note (this pass)

Out of scope, deferred per the Programmer handoff: agent principals/delegation
and rate limiting. The schema shapes (`isFrozen` on policies, the `agent`
`PrincipalKind` variant) are built to the full ADR-021 §9 target so those
transitions are additive later, not a repaint.

## Persistence direction

Both halves of the ADR-015 rule-of-two exist. The nine core identity tables are
served by `repo.sqlite.ts` against Drizzle, with `@jini-ai/cms/identity`'s own
`InMemory*Repo`s as the test/dev adapters; `wiring.ts` picks between them
(`createSqliteIdentityRouteDeps` vs `createInMemoryIdentityRouteDeps`). The
tenth table, `api_keys`, has no library-supplied in-memory half, so this repo
owns both: `SqliteApiKeyRepo` (`repo.sqlite.ts`) and `InMemoryApiKeyRepo`
(`repo.memory.ts`).

## Wiring

What this host injects into the Jini identity modules (`@jini-ai/user-management/identity/*`):
- `api-key-binding.ts` passes the product scheme marker `"tovu_ak_"` to `createApiKeySecret` and the
  bound secret to `createApiKeyService` (K3: the literal stays here).
- `wiring.ts` builds `ScryptApiKeySecretHasher` and the `ApiKeyRepoPort` (`InMemoryApiKeyRepo` or
  `SqliteApiKeyRepo`); the api-keys routes and `dev-auth` assemble `ApiKeyServiceDeps` from them.
- `reset-owner.ts` / `site-deps/identity-settings.ts` call `applyOwnerPasswordReset` with the host's
  pre-write backup as `beforeReset`.
- `tool-registrations.ts` / `routes/users/deps.ts` call `createUsernameChangePort` with the host's
  outbox, id generator, Trash membership check and seeded owner id.
- `user-purge.ts` (`SqlUserPurge`) implements Jini's `UserPurgePort`.
- `server/runtime/composition/app-permission-grants.ts` calls `registerSiteKeyPermissionGrants`
  (`@jini-ai/user-management/identity/site-key-permission`) with `siteKeyName: SITE_KEY_ENV_VAR_NAME`
  (`features/webhooks/site-key-read-bindings.ts`, K3: the product env var name stays here);
  `__tests__/site-key-permission.test.ts` pins the bound reason and the real SQLite boot.
- `trash-user-binding.ts` calls `createTrashUserService({})` ONCE for the process (one workspace per
  process, CIC U-001) so the admin `DELETE users/:principalId` route and the assistant's `trash_item`
  user port share one INV-08 serialization queue; each call injects `DeleteUserDeps` (the Trash-bound
  `removeUser` and `isInTrash`). The stateless account-contract checks and error identities are
  imported from `@jini-ai/user-management/identity/delete-user-service` at each call site.
- `boot-session-token-binding.ts` calls `createBootSessionTokenStore()` ONCE for the process and
  exports its `mint`/`redeem`: `cli/commands/serve-listen.ts` mints the `--emit-boot-token` token and
  `server/inbound/admin-http/dev-auth.ts`'s boot-session route redeems it from the same store
  (`__tests__/boot-session-token-binding.test.ts`, `serve-command-wiring.unit.test.ts` and
  `admin-boot-session-route.test.ts` pin the sharing). The local-boot-session route builds its own
  request-scoped store and never touches this one.
