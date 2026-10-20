# google-workspace phase B review — Jini side (READ-ONLY)

Reviewer lenses loaded: Software Architect, Code Inspection, Security (AI-Dev-Shop agents/*/skills.md).
Diff: `git diff origin/general-work...cloud/google-workspace` at 394b7134 (88 files, +7795/-13).
Tovu consumers checked at Tovu `cloud/google-workspace` 4cfe739ac (apps/website/src, apps/admin/src,
content/agent-plugins/google-workspace). Nothing was edited, built or committed; no suites were run.

Vendor neutrality: the provider/vendor grep over every changed production file in the generic seams
finds nothing. The only hits are the agent-plugins README.md:7-8 and package.json:4 lines that cite
the Agent Plugins spec's own publisher (spec provenance, not seam code).

Order: severity (High, then Medium, then Low). "Tovu shape" says whether the fix changes an exported
shape Tovu consumes, and names the consumer.

---------------------------------------------------------------------------------------------------
## HIGH

### H1. A changed OAuth client id (or a corrupt row) permanently bricks the connection
- Category: correctness/security (revocation honesty, lock-out). Severity: High.
- Where: integrations/src/api-connections/token-store/vault-token-store.ts:71-76 (`open` throws
  `owner-mismatch`/`invalid-record`), :127 (`installOnce` → `open`), :140 (`deleteOnce` → `open`),
  :164 (`loadForRevocation` → `open`); account-actions.ts:51 (`loadForRevocation` is called OUTSIDE
  the `try` that only wraps the hook); authorization.ts:42 (start refuses while `revocation-pending`).
- What happens: the owner sealed into every row includes `clientId` (record.ts:14-19, :79-81).
  Tovu builds the owner from the runtime's client (Tovu host.ts:116), so changing the configured
  client (operator config change, or moving to/from the BYO client the owner decisions allow) makes
  every existing row `owner-mismatch`. Then:
  - disconnect: the record first moves to `revocation-pending`/generation+1 (account-actions.ts:110),
    then `loadForRevocation` throws, so every retry throws the same way;
  - start refuses while `revocation-pending` (authorization.ts:42), so the person cannot reconnect;
  - even before any disconnect, reconnect fails: `installCredential` moves the record to
    `reconnect-required` (install-credential.ts:24) and then `install` → `open` throws.
  The same lock-out follows from a single `invalid-record` row. Nothing short of editing the DB
  recovers the connection, and it never reaches the "Disconnected locally; revocation pending"
  state the owner asked for.
- Smallest fix: (a) `deleteOnce` needs only the revision: read `vault.get(...).summary.revision`
  without parsing the payload. (b) Let `install` overwrite a row whose sealed key and
  workspace/plugin/connection match but whose `clientId` differs (keep `owner-mismatch` for any
  key/workspace/plugin/connection mismatch). (c) In `revokeStoredCredential`, catch an
  `OAuthTokenStoreError` from `loadForRevocation`, delete the local row, and report `pending`, so the
  person is told to finish revocation on the provider's account page. Add a security pin for each.
- Tovu shape: none (internal behaviour only).

---------------------------------------------------------------------------------------------------
## MEDIUM

### M1. A switch to the SAME account is staged; cancelling it revokes the live grant
- Category: security/correctness. Severity: Medium.
- Where: finish-authorization.ts:82-96 (`stageSwitch` never compares `account.accountId` with
  `record.account.accountId`); account-actions.ts:97 (cancel revokes the staged refresh token),
  :113 (disconnect does the same).
- What happens: providers commonly revoke the whole grant for client+user when any of its refresh
  tokens is revoked. Someone who picks the same account in "switch account" and then cancels gets
  `remoteRevocation: 'confirmed'`, and the live credential silently stops working.
- Smallest fix: in `stageSwitch`, when the staged account equals the current account, throw
  (`account-unchanged`, or reuse `request-invalid` with "This is the account already connected; use
  reconnect") before writing anything. The other option is to commit it as a same-account reconnect.
- Tovu shape: only if a new code is added to `ApiConnectionErrorCode`. No Tovu file uses the type.

### M2. Start/complete expose no attempt id or state, so hosts parse the URL and the G5c inbox cannot be keyed
- Category: contract. Severity: Medium.
- Where: authorization.ts:19-24 (`StartApiConnectionResult` = connectionRef, authorizationUrl,
  expiresAt); finish-authorization.ts:20-28 (`CompletedAuthorization` has no attempt id);
  admin-surfaces/surface-capabilities.ts:41-46 (`AdminSurfaceAuthorizationStart.attemptId`);
  callback-field-inbox.ts:15-20 (the deposit key needs `attemptId`).
- Evidence: Tovu connect.ts:89 does `new URL(start.authorizationUrl).searchParams.get("state")` to
  arm the loopback receiver. The hosted callback route gets a `CompletedAuthorization` with no id, so
  it cannot deposit `callbackFields` under the `attemptId` the plugin handler was given. The Picker's
  picked-file delivery on hosted has no working path today.
- Smallest fix: add `state` to `StartApiConnectionResult`, documented as host-only (arming the
  loopback receiver; never handed to plugin code or a frame). Add a separate random `attemptId`
  (stored on the attempt) to both `StartApiConnectionResult` and `CompletedAuthorization`, and use
  that id for the inbox and `AdminSurfaceAuthorizationStart`. Do not reuse `state` as `attemptId`: it
  is the CSRF binding, and the sandboxed frame does not need it.
- Tovu shape: additive. Tovu connect.ts:89 should switch to `start.state`. The hosted callback route
  (Tovu server/inbound/public-http/routes/api-connections/oauth-callback.ts) gains the id for the deposit.

### M3. Callback-field limits and name rules differ across three seams; a valid declaration fails on desktop only
- Category: contract/trim (duplicated helpers). Severity: Medium.
- Where: integrations/.../descriptor.ts:12,17,19 (name `/^[A-Za-z0-9_.-]{1,64}$/`, at most 8 fields,
  maxLength up to 8192); oauth/src/loopback-callback.ts:187-190 (at most 16 fields, 4096 characters,
  name must start with a letter); admin-surfaces/capability-declarations.ts:30-31 (copy of the
  descriptor patterns, "Same shapes the API-connection descriptor accepts").
- What happens: a descriptor field `_x`, or `maxLength: 8192` with a 5,000-character value, passes
  `parseApiConnectionDescriptor`. On desktop, `startLoopbackAuthorizationReceiver` throws at connect
  time (Tovu connect.ts:85 passes the descriptor's names), or it consumes the one callback and refuses
  it. Hosted works, so the bug only shows on desktop.
- Smallest fix: api-connections already depends on `@jini-ai/oauth`. Import `MAX_CALLBACK_FIELDS`
  and `MAX_CALLBACK_FIELD_LENGTH` there, and export the loopback's name check from oauth
  (`isCallbackFieldName`). Delete descriptor.ts's local `MAX_FIELD_LENGTH`/`MAX_FIELDS` for callback
  fields; start params keep their own bound. capability-declarations stays a copy, because
  agent-plugins must not import integrations, but its comment should name the oauth source of truth.
- Tovu shape: none.

### M4. connectionRef-only operations do not check the workspace; every host must re-derive the key
- Category: security (defense in depth, token reach). Severity: Medium.
- Where: records.ts:24-30 (`loadOwnedRecord` checks plugin and connection, not workspace);
  status.ts:28-37; access-token.ts:62; account-actions.ts:74,93,107.
- What happens: a service for one plugin connection serves any workspace's ref for that plugin. Tovu
  closes this itself (host.ts:129-132 `declaredFor` derives and compares; :160 and :165 compare
  workspaces), but a second host has to repeat that. The token store's owner binding stops token
  reads across workspaces. Records are not protected the same way: a foreign ref can still be moved
  to `revocation-pending` by `disconnect` before the token store throws.
- Smallest fix: put `workspaceId` in the requiredArgs of getAccessToken/getStatus/disconnect/
  confirmSwitchAccount/cancelSwitchAccount, and refuse in `loadOwnedRecord` when
  `record.workspaceId !== workspaceId` (same `connection-not-found`).
- Tovu shape: YES. Tovu host.ts:147 (getAccessToken) and connect.ts:59 (getStatus) need
  `workspaceId`. Tovu's account-action callers (G6d, not merged) also need it.

### M5. The token scan is per call; a token kept from an earlier call leaks unscanned
- Category: security (token scans). Severity: Medium.
- Where: lifecycle/tools/capabilities.ts:97-120 (`issued` set per `openCapabilityGate`), :161-170;
  admin-surfaces/surface-capabilities.ts:247 and :212 (the state-write scan uses the same per-call
  set). Already pinned "(reported, not fixed)" in ca28a268.
- What happens: plugin code that caches a token in module scope can return it, or save it to state,
  in a later call without being caught. Plugin code is digest-pinned, so the scan exists to catch
  accidents, which is exactly this case.
- Smallest fix: hold `issued` per plugin generation, created in projection.ts `generation()` and
  surface-handlers.ts `admit()`, and pass it into `openCapabilityGate`. Bound it (for example the last
  64 tokens or the last hour). No new exported shape.
- Tovu shape: none.

### M6. The admin-surface connection vocabulary diverges from api-connections
- Category: naming/contract. Severity: Medium.
- Where: surface-capabilities.ts:24-28,31-38 versus api-connections types.ts:10,13 and
  account-actions.ts:19.
  - `AdminSurfaceConnectionAction` has `connect|reconnect|switch|add-scopes`; `ApiConnectionIntent`
    has `connect|switch-account`. `reconnect` and `add-scopes` are both intent `connect` with
    different `scopeSetIds`, which the handler passes anyway.
  - `AdminSurfaceRevocationOutcome` is `revoked|revocation-pending|not-needed`;
    `ApiConnectionRemoteRevocation` is `confirmed|pending|not-needed`.
  - The field is `state` on one side and `status` on the other, with the same four values.
- Proposed: action `connect|switch`; revocation `confirmed|pending|not-needed`; rename the field to
  `status`. Hosts then pass values through instead of mapping them.
- Tovu shape: no current consumer. Tovu handlers.ts:2,41 still passes the executable-tool port
  (`AgentPluginToolCapabilitiesPort`) where `createAdminSurfaceHandlerHost` now expects
  `AdminSurfaceCapabilitiesPort`, so it does not typecheck against the current dist. Settle these
  names before G6d adopts the port.

### M7. A connect that completes after a switch was staged drops the staged credential unrevoked
- Category: correctness. Severity: Medium-Low.
- Where: finish-authorization.ts:72-80 (`commitConnect` has no staged check; `stageSwitch` has one at
  :85); install-credential.ts:25 (`staged: null`).
- What happens: the staged grant stays in the vault, consented to but not revoked, until a later
  disconnect, or until a later stage overwrites it at an older generation.
- Smallest fix: move the `record.staged !== null` → `switch-in-progress` check into `currentRecord`
  so both intents get it.
- Tovu shape: none.

---------------------------------------------------------------------------------------------------
## LOW

- L1 trim: `service.readGeneration` (service.ts:27,44) duplicates the exported
  `createApiConnectionGenerationReader`, and `service.connectionRefFor` (:25,43) duplicates
  `deriveApiConnectionKey`. Tovu uses both pairs (connect.ts:60,69,70; host.ts and vault-stores.ts:169
  use the free functions). Proposal: drop both service members and keep the free functions. Tovu
  shape: yes, connect.ts:60,69,70.
- L2 trim: status.ts:36 repeats records.ts:27-28's ownership test. Extract
  `isOwnedRecord(record, descriptor)`.
- L3 trim: vault-token-store.ts:41-46 re-declares the install/loadForRevocation/delete signatures
  already in ports.ts:21-25. Define one from the other.
- L4 trim, options nobody passes in production (Tovu passes only callbackFields, timeoutMs and signal
  to the loopback; none of the others):
  - loopback `path` (loopback-receiver.ts:38,107);
  - `defineAdminSurfaceContribution` `optional.contribution` (contribution.ts:28; Tovu surfaces.ts:76
    passes none);
  - `AdminSurfaceMountRecord.expectedOrigin` (host-validator.ts:30,62: `createAdminSurfaceMount`
    always returns "null", and Tovu use-admin-surface-frame.hooks.ts:69 omits it);
  - `createAdminSurfaceCallbackInbox` `ttlMs`/`maxEntries` (callback-field-inbox.ts:36, tests only);
  - `createAdminSurfaceBootstrap` `ttlMs` (sandbox.ts:96; tests only; Tovu admin-surfaces route :101
    omits it).
  Keep the injected ports (timers, randomBytes, now): they are test seams.
- L5 trim: `startLoopbackAuthorizationReceiver` is exported from both `@jini-ai/oauth` (index.ts
  +2 lines) and the new `./loopback-receiver` subpath (package.json). Tovu imports the root only
  (connect.ts:2). Drop the subpath.
- L6 trim: loopback-callback.ts:185 `MAX_CODE_LENGTH = 2048` copies authorization-code's code bound
  ("Matches completeAuthorizationCode's code bound"). Export one constant from authorization-code and
  import it.
- L7 trim: `ApiConnectionSwitchResult.previousAccountRevocation: 'not-attempted'`
  (account-actions.ts:25-32) is a single-valued constant field. Move that fact to the README/JSDoc
  unless a host renders it; no Tovu use today.
- L8 docs: token-store/README.md:51-54 says a dedicated vault kind is "the expected follow-up", but
  platform now ships `api-connection` (vault.types.ts:4, vault.meta.ts:9,24) and Tovu uses it
  (vault-stores.ts:23). host-validator.ts:5 says "or the declared origin", but there is no declared
  origin (see L4).
- L9 security, documentation only: the init envelope carrying the bootstrap access token is posted
  with targetOrigin "*" (Tovu use-admin-surface-frame.hooks.ts:58,71,77). An opaque-origin frame makes
  that unavoidable, and the mount nonce protects only the inbound direction. Say so in
  admin-surfaces/README.md, and require hosts to post init once, on the frame's first `load`.
- L10 correctness: on re-consent a public (installed-app) client may come back without a refresh
  token, and the credential is still installed with `refreshToken: null` (finish-authorization.ts:67
  keeps the stored token only for confidential clients). It then expires silently about an hour
  later. Consider refusing at finish ("Reconnect and allow offline access") when
  `clientKind === 'public' && tokens.refreshToken === null`.
- L11 robustness: action-dispatcher.ts:49-66 (the authoritative server-side check) does not bound
  payload size. The 64 KiB cap is only in the browser-side host-validator.ts:41,80, and the
  action-schema strings have no default maxLength (action-schema.ts:131). Move `MAX_PAYLOAD_CHARS`
  into `dispatch` too, or rely on and document the host route's body limit.
- L12 naming: there are three tool-effect type declarations (plugins/host contributions.ts
  `PluginToolEffect`, lifecycle/tools manifest.ts:10 `AgentPluginToolEffect`, and projection.ts:33
  structural). This is acceptable because agent-plugins may not import plugins. The comment at
  projection.ts:27 should name it as the mirror of `PluginToolEffect`.

---------------------------------------------------------------------------------------------------
## Exported names with no consumer outside their package and its tests
(Tovu prod and tests, plus content/agent-plugins/google-workspace, grepped with -w. Type-only return
or port types that a host implements were counted as consumers wherever Tovu names them.)

- api-connections: ApiConnectionErrorCode, ApiConnectionServiceDeps, StartApiConnectionResult,
  CompletedAuthorization, ApiConnectionStatusView, ApiConnectionDisconnectResult,
  ApiConnectionRemoteRevocation, ApiConnectionSwitchResult, ApiConnectionAccessTokens,
  ApiConnectionAccount, ApiConnectionBoundedField, ApiConnectionIntent, ApiConnectionStagedSwitch,
  ApiConnectionStatus, VaultOAuthTokenStore, VaultOAuthTokenStoreDeps, OAuthTokenVaultPort,
  ReadConnectionGeneration, OAUTH_TOKEN_RECORD_FORMAT, OAuthConnectionOwner, OAuthConnectionStatus,
  OAuthTokenStoreError, OAuthTokenStoreErrorCode.
  The result/port types are a legitimate contract, so keep them. The value exports to drop are
  `OAUTH_TOKEN_RECORD_FORMAT`, and `OAuthTokenStoreError` unless H1(c) uses it.
- admin-surfaces (value exports first): ADMIN_SURFACE_PROTOCOL, ADMIN_SURFACE_PROTOCOL_VERSION,
  ADMIN_SURFACE_SANDBOX, SANDBOXED_FRAME_ORIGIN, checkAdminSurfaceActionSchema,
  validateAdminSurfaceActionValue, isContainedAdminSurfacePath, isAllowedAdminSurfaceCspSource,
  ADMIN_SURFACE_CSP_DIRECTIVES, adminSurfaceContentSecurityPolicy, adminSurfaceFileHeaders (used by
  readAdminSurfaceFile internally), isAdminSurfaceBootstrapCurrent, MAX_ADMIN_SURFACE_BOOTSTRAP_TTL_MS,
  AdminSurfaceActionError, ADMIN_SURFACE_PLUGIN_DISABLED_MESSAGE,
  parseAdminSurfaceCapabilityDeclarations, openAdminSurfaceCapabilitySession,
  ADMIN_SURFACE_STATE_LIMITS, STATE_CREDENTIAL_MESSAGE, createAdminSurfaceCallbackInbox,
  ADMIN_SURFACE_CALLBACK_INBOX_DEFAULTS. Tests only: parseAdminSurfacesFile.
  Types: AdminSurfaceInitMessage, AdminSurfaceActionRequest, AdminSurfaceActionFailure,
  AdminSurfaceActionResponse, AdminSurfaceActionSchema, AdminSurfaceCspDirective,
  AdminSurfaceDescriptor, AdminSurfaceMessageEvent/MountRecord/MessageVerdict,
  AdminSurfaceHandlerContext, AdminSurfacePluginContext, AdminSurfaceBootstrapCall,
  AdminSurfaceHandlerCall, AdminSurfaceHandlerModule, AdminSurfaceConnectionDeclaration,
  AdminSurfaceCapabilityDeclarations, AdminSurfaceConnectionState/Action/RevocationOutcome/Status,
  AdminSurfaceAuthorizationStart, AdminSurfaceConnections, AdminSurfaceStateValue, AdminSurfaceState,
  AdminSurfacePublicConfig, AdminSurfaceCapabilities, AdminSurfaceCapabilitiesPort,
  AdminSurfaceCallbackFieldKey.
  The whole G5c port (capabilities, connections, state, publicConfig, callback inbox) has no Tovu
  consumer yet; G6d is pending. Make the barrel explicit instead of `export *`, and drop the
  internal-only parsers and checkers: isContained*/isAllowed*, check/validateAdminSurfaceAction*,
  adminSurfaceContentSecurityPolicy, parseAdminSurfaceCapabilityDeclarations, and the message
  constants.
- lifecycle/tools: openCapabilitySession, REVOKED_MESSAGE, WITHHELD_OUTPUT_MESSAGE,
  WITHHELD_ERROR_MESSAGE (value exports, no consumer; drop them from the barrel). Tests only:
  parseAgentPluginToolsFile, AgentPluginToolModule. Types: AgentPluginToolDescriptor,
  AgentPluginToolCapabilityScope, AgentPluginStateReader, AgentPluginStateValue,
  AgentPluginToolProjectionPorts, AgentPluginToolSnapshot, AgentPluginContractTool,
  AgentPluginToolInvocation. These are port shapes; keep them.
- oauth loopback: MAX_CALLBACK_FIELDS and MAX_CALLBACK_FIELD_LENGTH (used once M3 lands);
  LoopbackAuthorizationReceiver, LoopbackAuthorizationResult, LoopbackReceiverOptions,
  LoopbackReceiverTimers (types; keep).

---------------------------------------------------------------------------------------------------
## Checked and found sound (no finding)
- PKCE S256 is always set by the core (authorization-code.ts:236), and every attempt sets
  `usesPkce: true` (authorization.ts:31).
- The attempt is consumed before the binding check (attempt-state.ts:56-67) and bound to ownerKey,
  which is JSON of workspace, actor, plugin and connection; to the exact redirectUri, compared on
  `new URL().href`; to the TTL; and to the generation, checked at finish-authorization.ts:57. Every
  failure gives the same `invalid-attempt`.
- The loopback receiver: binds 127.0.0.1 only, port exclusive, Host pinned (DNS rebinding), one
  consumed slot, constant-time state, repeated parameters refused, no body, static pages with
  no-store/CSP/nosniff, timer and abort close the port.
- Refresh tokens never leave the token store. `loadForRevocation` reaches only the revoke hook
  (account-actions.ts:51-54). `markNeedsReauth` clears the sealed tokens and stores no reason.
- Revocation honesty: local tokens are deleted only after the hook returns; otherwise `pending`, with
  the record kept `revocation-pending` (apart from H1's lock-out).
- Sandbox: exactly `allow-scripts`, CSP `default-src 'none'` plus a `sandbox` directive, https-only
  bare origins for connect-src and frame-src, a nonce plus window identity for inbound messages, and
  a surface client that posts only to the origin it learned from init.
- Capability isolation: surfaces get only their declared connections, start params, callback fields
  and config names; secret-looking config names are refused; state keys are checked; the tool state
  is read-only; capabilities are revoked on generation change.
- `destructive` only ever adds confirmation (plugins tool-contributions.ts +3 lines).
  `isCopyableKind['api-connection'] = false`.
