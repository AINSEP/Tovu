# External MCP / OAuth / delegated-custody surface map

- **Date:** 2026-09-02
- **Agent:** Software Architect (Execution) — reconnaissance only
- **Repos read:** `/Users/la/Programming/Tovu`, `/Users/la/Programming/Jini`
- **Scope:** map the real surface, prove bugs, name genuine forks, assess reversibility. **No design, no migration, no implementation.**
- **Files NOT edited (owned by other agents in flight):** `apps/website/src/assistant/external-mcp-store.ts`, `development/scripts/backfill-*-aad.ts`, `Jini/packages/integrations/src/media-providers/`. Nothing in this repo was edited by me except this report.

> **In-flight caveat.** The AAD-gap closure for `external_mcp_servers` landed *while this recon was running*: `apps/website/src/assistant/external-mcp-aad.ts` is untracked (`??`), `apps/website/src/platform/db/schema.ts` is modified (`M`), and `external-mcp-store.ts` / `external-mcp-oauth.ts` changed on disk mid-read. Everything below reflects the tree as of the final read. The dispatch brief's statement that the table has "no `aad_version` column" is **no longer true** — it now has two (`aad_version`, `oauth_aad_version`). B-1 below is a defect *in that in-flight work*, not in the pre-existing code.

---

## A. The surface as it actually is

### A.1 Two independent axes, not one

`apps/website/src/assistant/external-mcp-store.ts:58`
```ts
export const SUPPORTED_EXTERNAL_MCP_TRANSPORTS = ["stdio", "streamable_http"] as const;
```
`apps/website/src/assistant/external-mcp-store.ts:70`
```ts
export const EXTERNAL_MCP_AUTH_MODES = ["none", "static_env", "oauth"] as const;
```
`apps/website/src/assistant/external-mcp-store.ts:83`
```ts
export const EXTERNAL_MCP_OAUTH_STATUSES = ["disconnected", "pending", "connected", "needs_reauth"] as const;
```
`apps/website/src/assistant/external-mcp-store.ts:88`
```ts
export const EXTERNAL_MCP_OAUTH_GRANTS = ["authorization_code", "device_code"] as const;
```

### A.2 The stored row (28 fields, one table, composite PK)

`apps/website/src/assistant/external-mcp-store.ts:113` — `interface ExternalMcpServerRecord`. Load-bearing members, verbatim:
```ts
  envNames: string | null;
  sealedEnv: SealedSecret | null;
  oauthProviderId: string | null;
  oauthGrant: string | null;
  oauthClientId: string | null;
  oauthEndpointsJson: string | null;
  oauthScopesJson: string | null;
  oauthStatus: string | null;
  oauthExpiresAt: ISODateTime | null;
  oauthTokenEnvName: string | null;
  oauthRefreshLeaseUntil: ISODateTime | null;
  sealedOAuth: SealedSecret | null;
```
plus, added by the in-flight AAD work at `:184`–`:186`:
```ts
  aadVersion: number;
  /** AAD lineage of `sealedOAuth`, tracked separately from `aadVersion` — the two blobs are written by different flows. */
  oauthAadVersion: number;
```

Table: `apps/website/src/platform/db/schema.ts:2175` `export const externalMcpServers = sqliteTable(`, with `sealed_ciphertext` at `:2214`, `oauth_sealed_ciphertext` at `:2251`, `aad_version` at `:2259`, `oauth_aad_version` at `:2266`. No surrogate `id`: `(workspace_id, server_id)` is the PK, and the AAD binds it directly (`apps/website/src/assistant/external-mcp-aad.ts:22`).

**The plaintext/sealed split is deliberate and load-bearing.** Variable *names*, token *expiry*, connection *status* and the refresh *lease* are all plaintext beside the sealed blob so the admin tab and the liveness gate can answer questions without a keyring round trip — `external-mcp-store.ts:151-161`.

### A.3 The persistence port, including the one non-CRUD method

`apps/website/src/assistant/external-mcp-store.ts:182`
```ts
export interface ExternalMcpServerRepoPort {
  listByWorkspaceId(workspaceId: UUID): Promise<ExternalMcpServerRecord[]>;
  findByServerId(input: { workspaceId: UUID; serverId: string }): Promise<ExternalMcpServerRecord | null>;
  upsert(record: ExternalMcpServerRecord): Promise<void>;
  deleteByServerId(input: { workspaceId: UUID; serverId: string }): Promise<boolean>;
  tryClaimOAuthRefreshLease(input: {
    workspaceId: UUID;
    serverId: string;
    nowIso: ISODateTime;
    leaseUntil: ISODateTime;
  }): Promise<boolean>;
  releaseOAuthRefreshLease(input: { workspaceId: UUID; serverId: string }): Promise<void>;
}
```

One production adapter (`apps/website/src/platform/db/sqlite/external-mcp-repo.sqlite.ts`) plus `external-mcp-store.memory.ts`. The CAS is real SQL, verified at `external-mcp-repo.sqlite.ts:160`:
```ts
  async tryClaimOAuthRefreshLease(input: {...}): Promise<boolean> {
    const result = this.db
      .update(externalMcpServers)
      .set({ oauthRefreshLeaseUntil: input.leaseUntil })
      .where(
        and(
          eq(externalMcpServers.workspaceId, input.workspaceId),
          eq(externalMcpServers.serverId, input.serverId),
          or(isNull(externalMcpServers.oauthRefreshLeaseUntil), lte(externalMcpServers.oauthRefreshLeaseUntil, input.nowIso)),
        ),
      )
      .run();
    return result.changes > 0;
  }
```

### A.4 Sealing: two blobs, two AADs, one row

`apps/website/src/assistant/external-mcp-aad.ts:54` and `:64`
```ts
export function buildExternalMcpEnvAad(input: ExternalMcpAadIdentity): string {
  return `external-mcp-env:${AAD_VERSION}:${input.workspaceId}:${input.serverId}`;
}
export function buildExternalMcpOAuthAad(input: ExternalMcpAadIdentity): string {
  return `external-mcp-oauth:${AAD_VERSION}:${input.workspaceId}:${input.serverId}`;
}
```

The sealed OAuth payload, `external-mcp-store.ts:1367` (approx.; the interface as it now stands):
```ts
export interface ExternalMcpSealedOAuthPayload {
  readonly clientSecret?: string;
  readonly tokens?: {
    readonly accessToken: string;
    readonly refreshToken: string | null;
    readonly tokenType: string;
    readonly scopes: readonly string[];
    readonly expiresAt: ISODateTime | null;
  };
}
```
Note: **no `schemaVersion` field.** Contrast `connector-credential-store.ts:214` which stores `schemaVersion: 1` inside its record. See D-3.

Read side (`external-mcp-store.ts:1415`) branches on lineage:
```ts
      await sealer.open({
        sealed: record.sealedOAuth,
        ...(record.oauthAadVersion >= EXTERNAL_MCP_AAD_VERSION ? { aad: buildExternalMcpOAuthAad(record) } : {}),
      }),
```
Write side (`external-mcp-store.ts:1449`) does **not** branch — it always seals under AAD:
```ts
    return await deps.sealer.seal({
      plaintext: JSON.stringify(payload),
      key: await deps.keyring.activeKey(),
      aad: buildExternalMcpOAuthAad(identity),
    });
```
That asymmetry is correct *only if every writer also bumps `oauthAadVersion`*. Two of the four writers do not — B-1.

### A.5 The generic OAuth client (`apps/website/src/platform/oauth/`, 14 modules)

Provider-agnostic by construction. `ports.ts:39`: *"Architectural role: port declarations and value types only. No I/O, no policy."*

Full export surface, `apps/website/src/platform/oauth/index.ts:12-90`: types (`OAuthClient`, `OAuthClientAuthMethod`, `OAuthClock`, `OAuthFetch`, `OAuthGrantKind`, `OAuthProviderDescriptor`, `OAuthRandomBytes`, `OAuthTokenSet`); errors (`isOAuthError`, `mapProviderErrorCode`, `OAuthError`); PKCE (`assertValidCodeVerifier`, `createPkcePair`, `deriveCodeChallenge`); `createPendingAuthorizationStore`; `assertSafeProviderEndpoint`, `assertSafeUserFacingUrl`; RFC 9728/8414 discovery (`discoverAuthorizationServer`, `discoverProtectedResourceMetadata`, `fetchAuthorizationServerMetadata`, `parseResourceMetadataUrl`, `parseWwwAuthenticateScopes`); RFC 7591 `registerOAuthClientDynamically`; `requestOAuthToken`; `beginAuthorizationCode` / `completeAuthorizationCode`; `beginDeviceAuthorization` / `pollDeviceAuthorizationOnce`; `createTokenRefresher` / `isTokenDueForRefresh`; and the provider registry (`assertValidOAuthProvider`, `buildOperatorOAuthProvider`, `EXAMPLE_GENERIC_OIDC_PROVIDER`, `getOAuthProvider`, `listOAuthProviders`, `registerOAuthProvider`).

**Nothing in this directory imports MCP, connectors, or a vendor.** Verified: the only MCP-aware join is `assistant/external-mcp-oauth.ts`.

**The refresher's claims are TRUE as written.** `apps/website/src/platform/oauth/token-refresh.ts:52`
```ts
export interface TokenRefreshPort {
  load(key: string): Promise<OAuthTokenSet | null>;
  refresh(key: string, refreshToken: string): Promise<OAuthTokenSet>;
  persist(key: string, tokens: OAuthTokenSet): Promise<void>;
  markNeedsReauth(key: string, reason: string): Promise<void>;
  tryAcquireRefreshLease?(key: string): Promise<boolean>;
  releaseRefreshLease?(key: string): Promise<void>;
}
```
Proactive skew: `token-refresh.ts:44` `const DEFAULT_REFRESH_SKEW_MS = 120_000;` and `:108`
```ts
export function isTokenDueForRefresh(tokens: OAuthTokenSet, nowIso: string, skewMs: number): boolean {
  if (tokens.expiresAt === null) return false;
  return Date.parse(tokens.expiresAt) - skewMs <= Date.parse(nowIso);
}
```
In-process single-flight: `token-refresh.ts:207-214`. Cross-process loser-waits: `token-refresh.ts:187`
```ts
  const refreshOnce = async (key: string, current: OAuthTokenSet): Promise<string> => {
    if (!deps.port.tryAcquireRefreshLease) return performRefresh(key, current);
    const acquired = await deps.port.tryAcquireRefreshLease(key);
    if (!acquired) return awaitLeaseHolder(key, current);
```
Persist-before-hand-out: `token-refresh.ts:162` `await deps.port.persist(key, rotated); return rotated.accessToken;`

**Is it scoped to external MCP?** No — the module itself is generic; `key: string` is opaque and the port is fully injected. It is *reached* only through external MCP today (see A.7). Reuse cost for a second consumer is **implementing six methods**, no edits to `token-refresh.ts`.

**But see B-2: it has exactly one production caller, invoked once per daemon boot.**

### A.6 Acquisition, end to end

| Step | Location |
|---|---|
| Operator saves a row | `PUT /api/admin/v1/workspaces/:workspaceId/mcp-servers/:serverId` → `admin-http/routes/external-mcp/put.ts:111` → `saveExternalMcpServer` (`external-mcp-store.ts:1490`) |
| Operator clicks connect | `POST .../mcp-servers/:serverId/oauth/connect` → `admin-http/routes/external-mcp/oauth.ts:111` → `beginConnect` (`external-mcp-oauth.ts:694`) |
| Self-configuration (RFC 9728/8414 discovery + RFC 7591 registration) | `selfConfigureConnection` (`external-mcp-oauth.ts:536`), persisted by `persistSelfConfiguration` (`:491`) |
| `state` minted, bound, single-use | `createPendingAuthorizationStore` (`platform/oauth/pending-authorizations.ts:123`), `ownerKey = ${workspaceId}:${serverId}` (`external-mcp-oauth.ts:572`) |
| Browser returns | `GET {EXTERNAL_MCP_OAUTH_CALLBACK_PATH}/:serverId` → `public-http/routes/external-mcp/oauth-callback.ts:99` → `completeAuthorizationCallback` (`external-mcp-oauth.ts:732`) |
| Device grant instead | `POST .../oauth/device/poll` → `oauth.ts:140` → `pollDeviceAuthorization` (`external-mcp-oauth.ts:751`) |
| Token written | `persistTokens` (`external-mcp-oauth.ts:579`) → `oauthStatus: "connected"`, `oauthExpiresAt`, sealed blob |
| Disconnect | `DELETE .../oauth` → `oauth.ts:162` → `disconnect` (`external-mcp-oauth.ts:787`) |

**Where the in-flight state lives:** two **in-memory, process-local** maps.
- `platform/oauth/pending-authorizations.ts:128` — `const pending = new Map<string, PendingAuthorization>();`
- `external-mcp-oauth.ts:144` — `const byServerId = new Map<string, DeviceAuthorization>();`

Both are deliberate. `pending-authorizations.ts:26-33` states the constraint explicitly: *"The cost is that the START and the CALLBACK must land on the same process. That is true today (both are Express routes on the main web server; the agent daemon serves neither)."* The `state` binding is hardened: 24 CSPRNG bytes (`:37`), 10-minute TTL (`:40`), consumed **before** the owner check so a guessed state cannot be used as an oracle (`:163-166`), constant-time owner compare (`:100`).

### A.7 Consumption: where the token actually goes

`external-mcp-store.ts:625`
```ts
export interface ExternalMcpOAuthTokenResolverPort {
  resolveAccessToken(input: { serverId: string }): Promise<string>;
}
```
Sole implementation: `external-mcp-oauth.ts:792-808` (`tokenResolver`). Sole *production* consumer: `external-mcp-store.ts:671` inside `resolveExternalMcpAccessToken`, reached only from `readEnabledExternalMcpConfigs` (`:778`).

`readEnabledExternalMcpConfigs` has exactly two production call sites:
1. `server/inbound/assistant/agent-daemon-server.ts:898` — `resolveStoredExternalMcpConnections()`, awaited **once**, inside `start()` at `:938` (`extraConnections: await resolveStoredExternalMcpConnections()`).
2. `server/inbound/admin-http/routes/external-mcp/probe.ts:196` — the operator's "test connection" button.

The resolved token is then **baked into an immutable launch spec**: `external-mcp-store.ts:828` `toFederatedLaunchSpec` yields `{ url, headers }` or `{ command, args, env }`, and the token is placed at `external-mcp-store.ts:713` (`resolvedEnv = { ...resolvedEnv, [record.oauthTokenEnvName]: token.token }`) or `:748` (`headers.authorization = \`Bearer ${token.token}\``).

Sessions are created once and held: `mcp-federation/bootstrap.ts:259` `defaultConnect`, and the HTTP adapter reads `this.spec.headers` at `adapter.http.ts:144-146` for every request thereafter.

### A.8 The runtime liveness gate

`external-mcp-oauth.ts:178`
```ts
export function createExternalMcpConnectionGate(deps: {
  readonly workspaceId: UUID;
  readonly repo: Pick<ExternalMcpServerRepoPort, "findByServerId">;
}): (connectionId: string) => Promise<void> {
  return async (connectionId) => {
    const record = await deps.repo.findByServerId({ workspaceId: deps.workspaceId, serverId: connectionId });
    if (!record || resolveExternalMcpAuthMode(record) !== "oauth") return;
    if (resolveExternalMcpOAuthStatus(record) !== "needs_reauth") return;
    throw new ExternalMcpReauthRequiredError({ serverId: connectionId, label: record.label });
  };
}
```
Wired at `agent-daemon-server.ts:934` as `assertConnectionUsable`. It reads the DB on every federated call — genuinely cross-process, no cache. It fires **only** on `needs_reauth`, which only `markNeedsReauth` sets.

### A.9 Composio (delegated custody) — the single-process claim, settled

**The claim in the brief is correct.** The single-process constraint pins *connection initiation only*.

`apps/website/src/platform/connectors/composio-service.ts:21-29` (file header):
```
 * A SINGLETON, not a per-request construction, and that is load-bearing rather than an
 * optimisation: `ComposioConnectorProvider` holds the discovery/definition caches AND — for the
 * OAuth handshake — the pending-connection map keyed by OAuth `state`. Rebuilding it per request
 * would discard the pending state between starting an authorization and completing it, so the
 * callback could never match the connect that produced it.
 *
 * That same in-process pending map is why connector OAuth is single-process-only today: a second
 * worker would not share it.
```

The map, in Jini: `/Users/la/Programming/Jini/packages/integrations/src/composio/composio.ts:595`
```ts
  private readonly pendingConnections = new Map<string, ComposioPendingConnection>();
```
Its **only** writers/readers are the handshake: `:881` (`.set(state, ...)` during initiation), `:886`, `:925-927`, `:937-939` (`.get`/`.delete` on callback completion), `:968-969` (expiry sweep). **No execution path touches it.**

Steady-state credential use goes through durable, sealed storage instead. `apps/website/src/platform/connectors/connector-credential-store.ts:11-27` (header): *"Durable, sealed storage for connected third-party ACCOUNTS — what survives an OAuth handshake. Replaces Jini's `InMemoryConnectorCredentialStore`, which drops every connection on restart."* Rehydrated from the table by `hydrate()` (`:187`), which any process can call — `composio-service.ts:161` `await credentialStore.hydrate();`.

Also verified: Composio performs **no** token exchange in Tovu. `platform/oauth/ports.ts:16-22`: *"`ComposioConnectorProvider` never performs an OAuth token exchange at all... There is no `authorization_code` grant, no PKCE, no token endpoint, no refresh token and no expiry anywhere in that path (`ConnectorCredentialRow` has no `expiresAt` column precisely because Composio refreshes vendor-side)."* Confirmed against `connector-credential-store.ts:32-42` — the row is `{workspaceId, connectorId, accountLabel, sealed, aadVersion, createdAt, updatedAt}`. No expiry.

### A.10 The credential model — ten tables, verified by `.seal()` call site, not by doc comment

Ten credential-bearing tables in `apps/website/src/platform/db/schema.ts`:

| # | Table | schema.ts | `.seal()` call site | AAD | `aad_version` col |
|---|---|---|---|---|---|
| 1 | `site_assistant_credentials` | `:1415` | `assistant/site-credential-store.ts:208` | yes | yes (`:1449`) |
| 2 | `admin_execution_credentials` | `:1486` | `assistant/execution-credential-store.ts:248` | yes | yes (`:1516`) |
| 3 | `publish_credential_sets` | `:1579` | `features/deployments/publish-credentials/store.ts:254` | yes | no (born with AAD) |
| 4 | `source_control_credential_sets` | `:1747` | `features/source-control/store.ts:231` | yes | no (born with AAD) |
| 5 | `custom_credential_sets` | `:1830` | `features/custom-credentials/store.ts:281` | yes | no (born with AAD) |
| 6 | `vendor_credential_sets` | `:1958` | `features/vendor-credentials/store.ts:336` | yes | no (born with AAD) |
| 7 | `media_provider_credentials` | `:2019` | `features/media/provider-credential-store.ts:272` | yes | yes (`:2046`) |
| 8 | `composio_config` | `:2083` | `platform/connectors/composio-config-store.ts:254` | yes | yes (`:2122`) |
| 9 | `external_mcp_servers` | `:2175` | `assistant/external-mcp-store.ts:1290` (env) **and** `:1449` (oauth) | yes (in-flight) | yes ×2 (`:2259`, `:2266`) |
| 10 | `composio_connector_credentials` | `:2307` | `platform/connectors/connector-credential-store.ts:138` | yes | yes (`:2329`) |

Method: `grep -rn "\.seal(" apps/website/src --include=*.ts` filtered to non-test files, then each read. **11 seal call sites across 10 tables** — `external_mcp_servers` is the only table with two. As of this read, every production `.seal()` passes an `aad`.

The migration playbook: `apps/website/src/features/vendor-credentials/dual-read.ts:38-50`
```
 * ## The AAD trap this module must never reintroduce
 *
 * `publish-credentials/aad.ts`, `source-control/aad.ts`, and this feature's own `aad.ts` each derive
 * a DIFFERENT additional-authenticated-data string from `(workspaceId, providerId/vendorId, id)` —
 * never stored, always re-derived at open time... A legacy row's ciphertext auth tag only verifies
 * against ITS OWN table's AAD lineage; opening it with the new table's AAD (or vice versa) fails
 * closed, not silently. This module NEVER attempts to build a "generic" decrypt path parameterized
 * by lineage
```

**One caveat on calling it "shipped":** `resolveDefaultForVendorDualRead` (`dual-read.ts:246`) is exported from `features/vendor-credentials/index.ts:48` and referenced in a doc comment at `server/routes/types.ts:341`, but has **zero production call sites**. Its own header says so at `:66` (*"has zero real callers today"*). It is a proven *pattern*, not a running one.

### A.11 Where an OAuth-acquired credential lands today — the direct answer

**`external_mcp_servers.oauth_sealed_*`, and nowhere else.** There is no generic OAuth credential table.

Every other credential table stores a *static* secret. `features/vendor-credentials/types.ts` — every arm of `VendorConnectionInput` is `{ readonly token: string }` plus vendor-specific non-secret fields (`:88`, `:93`, `:100`, `:106`, `:114`, `:122`). **No `expiresAt`, no `refreshToken`, no status, no lease, in any of them.**

**What breaks if an OAuth credential has to land somewhere else.** Five things, all of which live on `external_mcp_servers` today and exist on no other credential table:
1. `oauthExpiresAt` — plaintext, so a scheduler/tab can read expiry without unsealing.
2. `oauthRefreshLeaseUntil` — plaintext, so the CAS is expressible in one `UPDATE`.
3. `oauthStatus` — plaintext, so the cross-process liveness gate is one indexed read.
4. `oauthClientId` / `oauthEndpointsJson` / `oauthScopesJson` / `oauthGrant` — the descriptor a refresh six weeks later must rebuild from (`external-mcp-oauth.ts:276-286` explains why `clientAuth` in particular *must* persist).
5. The `{clientSecret, tokens}` co-sealing and its read-modify-write rule (`external-mcp-store.ts` OAuth-payload doc).

A second OAuth consumer landing in, say, `vendor_credential_sets` would need all five added, plus a `tryClaim…Lease` CAS on that table's port. The *refresher itself* needs no change (A.5).

---

## B. Bugs found

Ranked by whether a user hits it today.

### B-1 — HIGH, LIVE, DATA-DESTROYING: two writers re-seal under AAD but never bump `oauth_aad_version`, permanently bricking a legacy row's OAuth blob

**Who hits it:** any install with an OAuth external-MCP connection whose row predates today's AAD migration (`oauth_aad_version = 0`, blob sealed with no AAD). The *first* token refresh or the *first* re-connect destroys it.

**Proof.** The write side always seals with AAD — `external-mcp-store.ts:1449`:
```ts
    return await deps.sealer.seal({
      plaintext: JSON.stringify(payload),
      key: await deps.keyring.activeKey(),
      aad: buildExternalMcpOAuthAad(identity),
    });
```
The read side branches on the column — `external-mcp-store.ts:1427`:
```ts
        ...(record.oauthAadVersion >= EXTERNAL_MCP_AAD_VERSION ? { aad: buildExternalMcpOAuthAad(record) } : {}),
```
`saveExternalMcpServer` gets this right — `external-mcp-store.ts:1585-1588`:
```ts
    aadVersion,
    // `resolveSealedOAuthBlob` always re-seals when it returns a blob, so a non-null result is
    // always at the current lineage.
    oauthAadVersion: EXTERNAL_MCP_AAD_VERSION,
```
**`persistTokens` does not** — `external-mcp-oauth.ts:585` then `:598`:
```ts
  const sealedOAuth = await sealExternalMcpOAuthPayload(deps, record, {   // seals WITH aad
    ...
  });

  await deps.repo.upsert({
    ...record,                                    // carries oauthAadVersion === 0 forward
    oauthStatus: "connected" satisfies ExternalMcpOAuthStatus,
    oauthExpiresAt: tokens.expiresAt,
    oauthRefreshLeaseUntil: null,
    sealedOAuth,
    updatedAt: deps.clock.nowIso(),
  });
```
**`persistSelfConfiguration` does not** — `external-mcp-oauth.ts:503` then `:508`:
```ts
  const sealedOAuth = await sealExternalMcpOAuthPayload(deps, record, { ... });   // seals WITH aad

  const next: ExternalMcpServerRecord = {
    ...record,                                    // carries oauthAadVersion === 0 forward
    oauthClientId: identity.clientId,
    ...
    sealedOAuth,
    updatedAt: deps.clock.nowIso(),
  };
```

**Sequence.** Legacy row, `oauthAadVersion = 0`, no-AAD blob. Refresh fires → `openExternalMcpOAuthPayload` opens *without* AAD (correct, succeeds) → `sealExternalMcpOAuthPayload` seals *with* AAD → upsert writes the AAD-bound ciphertext next to `oauth_aad_version = 0`. Every subsequent read opens with no AAD → auth-tag verification fails → `ExternalMcpSecretStoreUnconfiguredError` ("stored OAuth credentials could not be decrypted"). The client secret and both tokens are unrecoverable.

**Fail-closed direction, but not fail-safe:** `readEnabledExternalMcpConfigs` skips the row and reports it (`external-mcp-store.ts:786-789`), so the daemon still boots. The credential is simply gone.

**Correct sibling pattern for comparison** — `platform/connectors/connector-credential-store.ts:161-163`:
```ts
          sealed: await sealCredentials(record.connectorId, record.credentials),
          // A fresh seal every write (never a re-wrap), so the row always ends up bound to the new
          // aad — including a legacy (aadVersion 0) row this write just re-sealed for free.
          aadVersion: 1,
```

**Fix shape (not implemented here):** add `oauthAadVersion: EXTERNAL_MCP_AAD_VERSION` to both upserts. Two lines. Owner is the in-flight AAD agent, not this recon.

### B-2 — HIGH, LIVE, "advertised but doesn't work": the entire proactive-refresh machinery fires at most once per daemon boot

**Who hits it:** every operator with an OAuth external-MCP server, roughly one access-token lifetime (commonly 1h) after each daemon start.

**Proof, four links, each verified:**

1. `resolveAccessToken` has exactly one production consumer. `grep -rn "resolveAccessToken" apps/website/src --include=*.ts | grep -v __tests__` returns three lines: the implementation (`external-mcp-oauth.ts:793`), the port declaration (`external-mcp-store.ts:632`), and one call — `external-mcp-store.ts:671`:
```ts
    return { ok: true, token: await oauth.resolveAccessToken({ serverId: record.serverId }) };
```
2. That call is inside `readEnabledExternalMcpConfigs`, which the daemon awaits **once**, in `start()` — `agent-daemon-server.ts:938`:
```ts
    extraConnections: await resolveStoredExternalMcpConnections(),
```
3. The token is then frozen into the launch spec. `external-mcp-store.ts:713` for stdio (`resolvedEnv = { ...resolvedEnv, [record.oauthTokenEnvName]: token.token }` → child process environment, unchangeable after `spawn`), `:748` for HTTP (`headers.authorization = \`Bearer ${token.token}\``), and the HTTP adapter re-uses that same frozen map forever — `adapter.http.ts:144`:
```ts
  private baseHeaders(): Record<string, string> {
    return {
      ...this.spec.headers,
```
4. Nothing re-invokes it. `grep -rn "setInterval\|cron\|scheduler" apps/website/src/assistant/ apps/website/src/platform/oauth/` (non-test) returns **one hit, and it is a doc comment**, `external-mcp-store.ts:164`: *"expiry has to be checkable by a scheduler"*. **There is no scheduler.** No reconnect path exists in `bootstrap.ts` or `registrations.ts`.

**The codebase already knows.** `mcp-federation/adapter.http.ts:230-234`:
```
 * 401/403 are called out by name because they are the ones with a specific cause and a specific
 * fix: the connection's OAuth token has expired or been revoked, and the row needs reconnecting.
 * `external-mcp-store.ts` already reports that state at boot; this is the same finding arrived at
 * from the other direction, when a token that was valid at boot stops being valid mid-session.
```
So the accepted answer to a mid-session expiry is "tell the operator to reconnect" — with a live refresh token sitting sealed in the row and a fully-built, correct, tested refresher one function call away.

**Second-order defect.** `assertOkStatus` (`adapter.http.ts:236-244`) throws a plain `McpProtocolError`; it does **not** call `markNeedsReauth`, so `oauthStatus` stays `"connected"` and `createExternalMcpConnectionGate` (A.8) never fires. The carefully-worded non-retryable `ExternalMcpReauthRequiredError` — whose message (`external-mcp-oauth.ts:104`) is explicitly designed to stop a model looping — **is unreachable on the most common failure path**. The model instead sees a transient-looking transport error and will retry.

**Scope note.** `stdio` + `oauth` is worse than HTTP: even a correct fix cannot re-inject an env var into a running child process. HTTP is fixable in place (resolve per request instead of per connect).

### B-3 — MEDIUM-HIGH, LIVE: `clearToken` nulls the whole OAuth blob, destroying the client secret; for a dynamically-registered client this is unrecoverable through the UI

**Proof.** The blob holds two independent secrets — `external-mcp-store.ts` `ExternalMcpSealedOAuthPayload` (A.4): `{ clientSecret?, tokens? }`. The store's own header states the rule: *"a writer that seals `{ tokens }` alone silently deletes the operator's client secret."*

`setOAuthStatus` breaks exactly that rule by nulling the column — `external-mcp-oauth.ts:617-623`:
```ts
  await deps.repo.upsert({
    ...record,
    oauthStatus: status,
    ...(options.clearToken === true ? { sealedOAuth: null, oauthExpiresAt: null } : {}),
    oauthRefreshLeaseUntil: null,
    updatedAt: deps.clock.nowIso(),
  });
```
Two callers pass `clearToken: true` — `external-mcp-oauth.ts:674` (`markNeedsReauth`, reached automatically whenever a provider answers `invalid_grant`) and `:789` (`disconnect`).

**Consequence.** After either, `resolveClient` (`external-mcp-oauth.ts:360-376`) reads `payload.clientSecret === undefined` and builds a secret-less client. `platform/oauth/token-endpoint.ts:64-71`:
```ts
  if (client.authMethod === "client_secret_basic") {
    const encoded = Buffer.from(`${encodeURIComponent(client.clientId)}:${encodeURIComponent(client.clientSecret ?? "")}`).toString("base64");
    headers.authorization = `Basic ${encoded}`;
```
```ts
  if (client.authMethod === "client_secret_post" && client.clientSecret) {
    params.client_secret = client.clientSecret;
```
→ `Basic base64("id:")`, or the secret silently omitted. Provider answers `invalid_client`.

**Why an operator-typed secret recovers and a minted one does not.** For a typed secret the operator can re-enter it (`SaveExternalMcpOAuthInput.clientSecret`). For a secret minted by RFC 7591 dynamic registration, the operator **has never seen it** — and re-registration is unreachable, because `selfConfigureConnection` short-circuits (`external-mcp-oauth.ts:543`):
```ts
  const stored = readStoredEndpoints(record);
  const mustDiscover = needsEndpointDiscovery(record, stored);
  if (!mustDiscover && record.oauthClientId !== null) return record;
```
After self-configuration the row has both `oauthEndpointsJson.tokenEndpoint` and `oauthClientId`, so `mustDiscover === false` and the guard returns early — forever. **The connection cannot be repaired; the row must be deleted and recreated.** The `clientSecret` destruction is silent, and it happens on an *automatic* path (`markNeedsReauth`) that no human triggered.

**Note the intent is defensible and the fix is narrow:** `markNeedsReauth`'s comment (`:672-673`) explains why the *token* is cleared. It reads as a case of a whole-column null standing in for a read-modify-write.

### B-4 — MEDIUM: every `upsert` on this row is a full-row last-write-wins overwrite across two processes

**Proof.** The port has no partial update (A.3) — `upsert(record: ExternalMcpServerRecord)`. Both the admin web server and the agent daemon construct their **own** `ExternalMcpOAuthService` over the same row (`agent-daemon-server.ts:886`, `composition/app.ts:539`, `composition/deps.ts:1010`). Every writer spreads a snapshot: `external-mcp-oauth.ts:598` (`...record`), `:508` (`...record`), `:618` (`...record`), and `saveExternalMcpServer` builds a whole record from scratch (`external-mcp-store.ts:1559-1591`).

**Reachable interleaving.** Daemon refreshes a token (reads row at T0, writes at T0+400ms). Operator saves an `allowedToolNames` edit at T0+100ms. The daemon's write is built from the T0 snapshot and clobbers the operator's edit. Symmetrically, a save at T0+300ms clobbers the freshly rotated token and — because `carryOAuthRuntimeState` (`external-mcp-store.ts:1335-1365`) returns `keepToken: true` only when the binding fingerprint matches — may or may not preserve it.

**Mitigating context:** the refresh lease serializes the *refresh* against another refresh, and B-2 means refreshes are rare. This is real but currently low-frequency. The lease does **not** guard against a concurrent `saveExternalMcpServer`.

### B-5 — LOW: an unreachable-provider lease loser can be handed an already-expired access token

`token-refresh.ts:170-185`:
```ts
      const reloaded = await deps.port.load(key);
      const nowIso = deps.clock.nowIso();
      if (reloaded && !isTokenDueForRefresh(reloaded, nowIso, skewMs)) return reloaded.accessToken;
      if (Date.parse(nowIso) >= deadline) {
        const fallback = reloaded ?? current;
        if (!isHardExpired(fallback, nowIso)) return fallback.accessToken;
```
If the lease winner crashed and the token is within the 120s skew window but not yet hard-expired, the loser returns it after a 5s wait. That is the documented tradeoff (`token-refresh.ts:126-129`) and is preferable to double-redeeming a rotating refresh token. Noted for completeness, not for action.

### B-6 — STALE COMMENT (not a behaviour bug, but it misleads)

`external-mcp-store.ts:50-56` states:
```
 * `stdio` is what `mcp-federation/adapter.stdio.ts` implements and is the only transport that can
 * actually be federated today. `streamable_http` is accepted and STORED so an operator can describe
 * a hosted server and authorize it now, but {@link readEnabledExternalMcpConfigs} reports such a row
 * as unusable rather than pretending — there is no HTTP MCP client in this repo yet
```
**Both halves are false now.** `apps/website/src/assistant/mcp-federation/adapter.http.ts` exists (16.8 KB) and is dispatched to at `bootstrap.ts:261` (`if (isHttpLaunchSpec(connection.launch))`). And `readEnabledExternalMcpConfigs` does **not** report such a row unusable — `resolveExternalMcpConfig` (`external-mcp-store.ts:743-745`) admits both members of `SUPPORTED_EXTERNAL_MCP_TRANSPORTS` and `resolveHttpTarget` returns `{ ok: true, ... }`. Anyone reasoning from this header will get the HTTP capability wrong in both directions. (Adding to the project's false-comment register.)

---

## C. Genuine forks

Three. I looked for more and the code settled them; the settled ones are listed after.

### C-1 — Does a live access token get resolved per connect, or per call?

This is the design question B-2 exposes, and the code does **not** settle it.

- **Option A — resolve at connect, refresh out of band.** Keep `readEnabledExternalMcpConfigs` as-is; add a background pass that refreshes due tokens and, on rotation, marks the connection so it is re-established. Keeps the hot path at zero cost. Cannot help `stdio` without restarting a child process.
- **Option B — resolve per call, for HTTP only.** Make the HTTP adapter's `baseHeaders()` ask a resolver instead of reading a frozen map. Correct by construction for hosted servers, and hosted MCP is where the industry is going. Adds an indexed read plus a possible refresh to every federated call, and makes `stdio` and `streamable_http` behave differently — which A.1's orthogonality argument was written to avoid.
- **Option C — accept it and say so.** Document that an OAuth external-MCP connection is valid for one access-token lifetime per daemon boot, and surface the expiry in the admin tab. Cheapest, and honest, but it makes the refresher dead code.

**What would decide it:** (a) the actual mix of `stdio` vs `streamable_http` OAuth rows across real installs — if hosted dominates, Option B's asymmetry cost is small; (b) whether the daemon can be given a "re-establish one connection" operation at all without breaking `trust.ts` R5's frozen-at-connect guarantee (`agent-daemon-server.ts:858-864` says the current answer is no, which is what forces the restart-required UX); (c) measured p50 of the extra DB read against `FEDERATED_CONNECTION_DEFAULTS.callTimeoutMs`.

### C-2 — Does an OAuth-acquired credential get its own table, or does an existing table grow?

The code does not settle this because **there is exactly one OAuth credential holder today** (A.11), so no precedent has been set.

- **Option A — a new `oauth_credentials` table** keyed by `(workspaceId, consumerKind, consumerId)`, carrying the five plaintext columns from A.11 plus one sealed blob, with `external_mcp_servers` migrated onto it.
- **Option B — each consumer keeps its own columns**, exactly as `external_mcp_servers` does, and `platform/oauth/` stays the only shared thing. This is what ships. It has produced zero duplication so far *because there is one consumer*.

Strongest argument for A: the five plaintext columns and the lease CAS are non-obvious and were got right once; a second consumer re-deriving them is where the second implementation diverges. Strongest argument for B: `dual-read.ts:38-50`'s rule is that a legacy row's auth tag verifies only against its own table's AAD lineage, so a shared table is a *migration*, not a refactor — and the shop has already paid that cost once for `vendor_credential_sets`, whose dual-read seam has zero callers a year on.

**What would decide it:** name the second consumer concretely and check whether it needs *all five* plaintext columns or only expiry. A consumer that needs only expiry (no cross-process lease, no liveness gate) is a much weaker case for a shared table. Also: does any planned consumer live outside the single-workspace assumption in C-3?

### C-3 — Is the public OAuth callback single-workspace forever?

`public-http/routes/external-mcp/oauth-callback.ts:99` mounts `GET {EXTERNAL_MCP_OAUTH_CALLBACK_PATH}/:serverId` — **`serverId` only, no `workspaceId`**. Disambiguation comes from `ExternalMcpOAuthDeps.workspaceId` (`external-mcp-oauth.ts:191`), a construction-time constant. The `state` binding *is* workspace-scoped (`ownerKeyOf`, `:572`), so nothing is unsafe — but a second workspace on the same origin has no route to reach its own service.

- **Option A — leave it.** Tovu is self-hosted and effectively single-workspace per install.
- **Option B — put the workspace in the path or resolve it from `state`.** Resolving from `state` is the more interesting one: the pending store already knows the `ownerKey`, so a workspace-agnostic mount could look the workspace up before dispatching.

**What would decide it:** whether hosted multi-workspace Tovu is on the roadmap at all. If it is, this and the in-memory `pending`/`devices` maps (A.6) fail together, and should be decided together rather than twice.

### Settled — do not re-debate

- **Composio's single-process constraint.** Settled by `composio-service.ts:21-29` plus `composio.ts:595/881/937` plus `connector-credential-store.ts:187`. It pins **connection initiation only**. Steady-state credential *use* is durable, sealed, hydrated from `composio_connector_credentials`, and reachable from any process. (A.9)
- **Whether `platform/oauth/` is MCP-coupled.** It is not. Zero MCP/connector/vendor imports; `key: string` is opaque; the port is fully injected. Reuse cost is six methods. (A.5)
- **Whether the cross-process lease is real.** It is — a genuine single-statement CAS with the condition in the `WHERE`. (A.3)
- **Whether transport and auth mode should be one field.** Settled by `external-mcp-store.ts:40-46`: stdio+OAuth and HTTP+OAuth are both real, so neither field derives from the other.
- **Whether the `state` ledger is safe.** It is: CSPRNG, single-use, expiring, owner-bound, consumed before the owner check, constant-time compare. (A.6)

---

## D. Reversibility: what is cheap to change, and what locks us in

### Cheap — change it later for near-nothing

| Seam | Blast radius | Why it is cheap |
|---|---|---|
| Swapping/adding an OAuth provider | 0 files | `registerOAuthProvider` / `buildOperatorOAuthProvider` (`platform/oauth/providers.ts`); operators can type endpoints on a row, and discovery mints descriptors at connect. |
| Refresh policy (skew, lease TTL, poll interval) | 1–2 constants | `token-refresh.ts:44-48`, `external-mcp-oauth.ts:81`. All injectable via `TokenRefresherDeps`. |
| Adding a second `TokenRefreshPort` consumer | 0 edits to `token-refresh.ts` | Six-method port, `key: string` opaque. |
| Storage backend for the roster | 1 file | `ExternalMcpServerRepoPort` has one adapter (`external-mcp-repo.sqlite.ts`) + one in-memory double. |
| The `ExternalMcpServerRecord` shape | 8 files total (5 non-test) | `external-mcp-store.ts`, `external-mcp-oauth.ts`, `external-mcp-store.memory.ts`, `external-mcp-repo.sqlite.ts`, `routes/external-mcp/probe.ts`. Measured by call site, not file size. |
| Which transport a row uses | 0 | `defaultConnect` dispatches on launch-spec *shape* (`bootstrap.ts:260`), so it cannot disagree with configuration. |
| Trust policy (allowlists, write grants) | already separated | `trust.ts` owns admission; the store carries the lists and enforces nothing (`external-mcp-store.ts:30-34`). |

### Expensive or locking — the owner's #1 concern

**D-1 — The sealed OAuth payload has no schema version *inside the blob*.** `ExternalMcpSealedOAuthPayload` is `{ clientSecret?, tokens? }` with no discriminator (A.4). `oauth_aad_version` versions the *AAD lineage*, not the payload schema — the two are different things, and only one exists. Compare `connector-credential-store.ts:214`, which stores `schemaVersion: 1` inside the record. Adding a member to the payload later is safe (optional fields); **changing or removing one is not**, because there is nothing to branch on at open time. *This is the cheapest thing to fix now and the most expensive to fix later.*

**D-2 — Two plaintext JSON columns with no version and no schema.** `oauthEndpointsJson` and `oauthScopesJson` are parsed by hand-rolled tolerant readers (`external-mcp-oauth.ts:290-297`, `:324-331`) that swallow anything unparseable as `{}` / `[]`. Meaning: a shape change is *silently* absorbed rather than detected. `StoredOAuthEndpoints.clientAuth` (`:276-286`) is already load-bearing for refresh six weeks out — it is exactly the field a silent absorption would destroy.

**D-3 — `aad_version` is a two-state boolean today, and B-1 shows how easily it desynchronizes.** The mechanism is right (`>= EXTERNAL_MCP_AAD_VERSION` branching read); the discipline is what's fragile, because *every* writer must remember to bump. `connector-credential-store.ts:161-163` handles it by writing `aadVersion: 1` unconditionally next to the seal, in the same object literal — a shape that cannot be forgotten. `external-mcp-oauth.ts` puts the seal and the version in different statements, and forgot twice.

**D-4 — Published admin API surface: 9 routes under `/api/admin/v1/...`.** Enumerated in A.6 (`list.ts:17`, `put.ts:111`, `delete.ts:17`, `probe.ts:247`, `admissions.ts:86`, `oauth.ts:111/140/162`). Versioned (`v1`), which is the mitigation. The `restartRequired: true` field in the disconnect response (`oauth.ts:166`) is a *contract* asserting the daemon's frozen-at-connect model — anything that changes C-1 changes the meaning of that field.

**D-5 — "Frozen at connect" is the real architectural lock.** `trust.ts` R5 plus the one-shot `search_tools` FTS index (`agent-daemon-server.ts:858-864`, `bootstrap.ts:81-84`) mean the daemon cannot add, remove, or re-establish a connection mid-process. This is what forces the restart-required UX **and** what makes B-2 hard rather than trivial. It is a deliberate security property, not an accident — but it should be named as the constraint that any "keep credentials live" work must budget for.

**D-6 — In-memory handshake state pins the web tier to one process.** `pending-authorizations.ts:128` and `external-mcp-oauth.ts:144`, both documented as such (`pending-authorizations.ts:26-33`, `external-mcp-oauth.ts:631-634`). Composio has the identical constraint from a different map (A.9). Three separate in-memory maps now share one assumption; a multi-process web tier breaks all three at once. Cost to reverse: a shared store plus a route change per flow, in three places — bounded and known, but not small, and it interacts with C-3.

**D-7 — Not locking, worth knowing.** `dual-read.ts` proves the playbook for a cross-table credential migration, but has zero callers (A.10). Treat it as a *design precedent*, not as running infrastructure; anyone budgeting a migration on the assumption "we've done this before in production" would be wrong.

---

## Method notes

- Every count in this report came from a call site, not a doc comment. Ten credential tables were established by enumerating `.seal(` and reading each store; the schema table list was cross-checked against `pgTable`/`sqliteTable` declarations. The one doc comment I relied on (`composio-service.ts`'s header) was independently confirmed against `composio.ts:595/881/937` in Jini.
- Two file-header claims were found false and are reported in B-6.
- No tests were run and no files were edited. Nothing here required one.
