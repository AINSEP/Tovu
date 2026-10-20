# google-workspace G15 review — Jini half (READ-ONLY)

Personas loaded: Code Inspection, Security, Red-Team (AI-Dev-Shop/agents/{code-inspection,security,red-team}/skills.md).
Diff: `git diff origin/general-work...cloud/google-workspace -- packages ':!packages/cms' ':!packages/infra'`
at Jini 836f36f6 (122 files, +12720/-13). packages/cms and packages/infra are byte-identical to
origin/cloud/forms-multidest, so this build does not touch them; they were not reviewed.
Tovu consumers were read at Tovu cloud/google-workspace 293b9a635, only where a Jini contract's
safety depends on how the host uses it. Nothing was edited or committed.

Runs (scratch dir /tmp/gw-G15):
- Complexity, using a temporary flat eslint config (complexity 9, sonarjs cognitive 9) over the 52
  changed production .ts/.mjs files: every new or changed function is at 9 or below. All 9 hits are
  in pre-existing functions this diff does not change: authorization-code.ts beginAuthorizationCode
  (15) and completeAuthorizationCode (10); vault.meta.ts credentialMeta (10) and line 58 (20,
  cognitive 19); vault.types.ts assertVaultReplacement (21, cognitive 12); plugins contributions.ts
  add (13) and renderPluginWidgetFragments (10). They are grandfathered.
- `vitest run` of api-connections security-pins.test.ts and vault-token-store.security.test.ts:
  102 out of 102 tests passed.
- A node probe confirmed F5 below: `JSON.stringify` of the gate's error probe misses a token placed
  in `AggregateError.errors` or in a depth-3 cause.
Vendor neutrality: the grep over every changed seam file finds nothing. The only hits are the
agent-plugins README.md:7-8 and package.json:4 lines, which cite the spec's publisher.
vendor-neutrality.test.ts scans the seams and fails loudly if a seam has no files.

=====================================================================================================
## HIGH

### F1. Hosted callback: the actor/session binding is checked against itself; nothing ties the callback to the browser that started it
- Category: CSRF / authorization-request forwarding (RFC 9700 §4.7, §2.1). Severity: High (hosted
  only; desktop loopback is not affected).
- Where (Jini): authorization.ts:103-106 (doc: "the identities are the host's authenticated
  session, never values read from the callback itself"); authorization.ts:46-48 (`ownerKeyFor`);
  attempt-state.ts:50-54 (`matchesBinding`); README.md:61-63 and the "Host responsibilities" section
  (neither gives a way to bind the browser). There is no browser-binding primitive in
  start/complete.
- Where (Tovu, cross-half evidence): server/inbound/public-http/routes/api-connections/
  oauth-callback.ts:64-68 and :107. The route is cookie-less on purpose (`tovu_session` is
  SameSite=Strict), so it peeks the attempt by `state` and passes `attempt.workspaceId` and
  `attempt.actorId` back into `complete`. The ownerKey comparison therefore compares the attempt
  with itself and always passes. The PKCE verifier is held server-side, so PKCE does not bind the
  user agent either.
- Exploit: an attacker who can start a connection in any hosted workspace (any tenant admin, or a
  compromised admin) calls begin, with the Picker start params if they like, and gets an
  authorization URL. It is valid for 10 minutes. They send it to a victim: "connect your sheet to
  our form". The victim sees the legitimate "Tovu" consent screen, signs in, and picks a
  spreadsheet. Google redirects the VICTIM's browser to the callback with code and state, and Tovu
  completes the attempt as the attacker's actor in the attacker's workspace. That workspace now
  holds the victim's Google credential, and with the picked file ids it can read and write the
  victim's sheet through the plugin's tools. With a browser binding, the victim's browser would not
  carry the initiator's binding and the callback would be refused.
- Smallest fix (generic, Jini): `start` returns an extra host-only random `browserBinding` (32 bytes).
  The attempt stores only a hash of it. `complete` takes `browserBinding` and compares it in
  constant time inside `matchesBinding`; a mismatch gives the same `invalid-attempt`. Document that a
  host whose session cookie is not sent on the provider redirect must set the binding as its own
  short-lived cookie (`HttpOnly; Secure; SameSite=Lax; Path=<callback path>; Max-Age=600`) and read
  it back on the callback. A Lax cookie is sent on the top-level cross-site GET navigation. Tovu then
  sets the cookie when it begins a sign-in and reads it in oauth-callback.ts. This is additive and
  stays vendor-neutral.
- Failing-test idea (Jini security pin): start as actor A, then complete with A's ids but without
  the binding (or with another browser's binding) → `invalid-attempt`, and the attempt is consumed.
  Tovu pin: a callback request without the binding cookie → `state_expired` page, and no tokens are
  installed.

=====================================================================================================
## MEDIUM

### F2. Hosted connect without a refresh token is accepted and fails silently within the hour (for example, the same account connected in a second workspace)
- Category: correctness (lifecycle honesty). Severity: Medium.
- Where: finish-authorization.ts:85-94 (`assertRenewable` refuses only `clientKind === 'public'`);
  :73-83 (`keepRefreshToken` can borrow only from this workspace's own record).
- Failure: the hosted Web client is one client for every workspace. Google returns a refresh token
  only on the FIRST consent for a user and client, unless `prompt=consent` is sent. The plugin's
  confidential params (Tovu tovu-connections.json:12) are `access_type=offline`,
  `include_granted_scopes=true`, with no prompt. So when the same Google account connects in a
  second workspace, or reconnects after a revocation that the "abandoned"/pending path never
  completed, the exchange has no refresh token. It is installed `connected`; about an hour later the
  refresher gets "no refresh token" and the record becomes `reconnect-required`. Every reconnect
  repeats the same failure, so the person is stuck in a loop.
- Smallest fix: apply `assertRenewable` to both client kinds, after `keepRefreshToken`
  (`offline-access-required`: "connect again and allow offline access"). Separately, Tovu's plugin
  should send `prompt=consent` for hosted connects whenever no refresh token is stored. A start
  param or a host-chosen fixed param would do; that is plugin config, not Jini. Tovu shape: none.
- Failing-test idea: confidential client, first connect, token response without refresh_token →
  `offline-access-required`, and nothing is written to the record or token stores.

### F3. A disconnect in one workspace revokes the account's grant for every workspace on the same hosted client
- Category: cross-workspace interference ("a second workspace"). Severity: Medium. This is an owner
  decision to confirm, not a code bug in isolation.
- Where: account-actions.ts:58-78 (`revokeStoredCredential` always calls the revoke hook);
  :119-136. Compare the switch path's own rationale at :35-40 ("revoking it could cut off the same
  account connected elsewhere through the same client").
- Failure: workspaces W1 and W2 both connect alice@ through the one hosted client. Disconnecting in
  W2 calls the provider's revocation, which revokes the whole grant for that client and user. W1's
  next refresh gets `invalid_grant`, and W1 shows "Reconnect required" with nothing done in W1.
  Because of F2, a reconnect in W1 then gets no refresh token either. Any admin of any workspace can
  break every other workspace's connection to that account just by disconnecting.
- Smallest fix: add an optional hook port `isGrantSharedElsewhere({ accountId })`. The host
  implements it over its cross-workspace record index. When it returns true, disconnect deletes
  locally, skips remote revocation, and reports `not-needed`, or better a new value such as
  `shared` that the host explains. Otherwise, document the cross-workspace effect and have the
  owner accept it.
- Failing-test idea: two services with the same client over a shared fake provider; disconnecting
  W2 → W1 `getAccessToken` still works (or the documented outcome is asserted).

=====================================================================================================
## LOW

### F4. `expectedAccountId` is checked before the token is read, so a confirm-switch race can serve the new account's token to a frozen job
- Where: access-token.ts:61-69. `assertServable` checks the record, then `refresher.getAccessToken`
  reads the live generation in vault-token-store.ts:158-165. install-credential.ts:24-31 can land
  the new account's tokens in between.
- Failure: a job frozen to account A passes the check. `confirmSwitchAccount` installs B at g+1, and
  the load returns B's token. The owner rule "frozen jobs never silently change account" is broken
  for that window, which is a few milliseconds.
- Fix: after getting the token, re-read the record. When `generation`, `status` or the account
  changed, throw `account-changed` (or `attempt-superseded`). Test: a record-store fake that runs
  confirm between the two reads → `account-changed`.

### F5. The error-token scan does not fail closed past depth 2 or on non-enumerable error fields
- Where: lifecycle/tools/capabilities.ts:123-126 (`errorProbe`: `{...error}` misses the
  non-enumerable `AggregateError.errors`; at depth 0 the cause is `String(cause)`, so a depth-3
  cause or a plain-object cause is never scanned) and :156-158. The node probe confirmed both
  misses.
- Failure: plugin code that throws `AggregateError` (`Promise.any`), or that wraps three times,
  around an error holding `Authorization: Bearer <token>` passes `sanitize` unchanged. The admin
  dispatcher's `onHandlerError`, and any host that logs the tool error, receives the whole chain.
- Fix: include `errors` (and `Object.getOwnPropertyNames`) in the probe. When the depth limit is hit
  and a cause still exists, treat it as "mentions a token" and withhold. Test: an `AggregateError`
  over a token-bearing error → `WITHHELD_ERROR_MESSAGE`.

### F6. Tool `describeAffectedResources` output is not token-scanned
- Where: projection.ts:438-446. `checkedResources` checks only shape. The text goes into the
  confirmation prompt and transcript, and plugin module scope can hold a token from an earlier call
  (the M5 threat).
- Fix: run `required.issuedTokens.forPlugin({pluginId})` through `mentionsToken` on the list and
  refuse it with the invalid-list error. Test: a module that returns a remembered token as a
  resource → refused.

### F7. A bootstrap access token is handed to the frame without a signed-in actor, and stays valid after disable
- Where: surface-handlers.ts:205-216 (`bootstrapData`), surface-capabilities.ts:196-198
  (`getAccessToken` needs no actor, unlike the account actions at :191-193 and delivery bindings at
  delivery-bindings.ts:104-107). The 60 s TTL (sandbox.ts:111) is enforced only by the frame's own
  client (surface-client.ts:135-140). The real access token lives about an hour, and disabling the
  plugin cannot recall it.
- Fix: refuse `getAccessToken` inside a surface session when no actor is present. README: say that
  disabling a product does not invalidate a token already given to an open frame (up to its expiry),
  and that disconnect does, through revocation. Test: `bootstrapData` without `principalId` →
  refused, and the host port is never called.

### F8. A request to the loopback with a wrong state burns the one callback slot (local DoS)
- Where: oauth/src/loopback-receiver.ts:270-278 ("Consume before any check").
- Failure: any local process, or a web page that scans 127.0.0.1 ports, can send `GET /callback`
  and end the sign-in with a failure. The state has 256 bits, so consuming on a mismatch adds no
  protection against guessing.
- Fix: consume only when `secureEquals(state)` passes; answer a mismatch 400 and keep listening.
  The timeout still bounds the listener. Test: a wrong-state request, then the real callback →
  resolves.

### F9. Tools address connections by `connectionRef`, surfaces by `connectionId`
- Where: lifecycle/tools/capabilities.ts:39 versus admin-surfaces/surface-capabilities.ts:81. The
  Tovu plugin uses both (lib/http.mjs:44 and lib/picker-flow.mjs:78).
- Why it matters: refs encode the workspace id, and plugin code has to obtain them and keep them
  (in state or bindings). The surface design states the reason ids are safer: "the host resolves
  the ref, so a plugin can never name another plugin's connection". Proposal: tools take
  `connectionId` too, and the host resolves it for the calling plugin and workspace. Tovu shape:
  yes, the capability port and the plugin's lib/http.mjs.

### F10. Revocation failures are swallowed with no diagnostic
- Where: account-actions.ts:69-75 (a bare `catch {}`). An operator cannot tell a provider 5xx from a
  bad hook. Fix: an optional `onRevocationError({ connectionRef, error })` in the deps, for
  server-side logging only. Test: a hook that throws → the callback receives the error, and the
  result is still `pending`.

### F11. Delivery-binding `formIds` absent means "every form" (fail-open default for PII routing)
- Where: delivery-bindings.ts:25,75. A plugin handler that leaves out `formIds` sends every current
  and future form's submissions to its destination.
- Fix: make `formIds` required on the surface port, with an explicit `allForms: true` for the broad
  case, so a plugin bug can never widen the routing. Test: a save without formIds → refused.

### F12. Overbuilding / naming
- `ADMIN_SURFACE_ACTION_INTENTS` (surface-capabilities.ts:40-43) keeps four actions for two
  intents; `reconnect` and `add-scopes` are aliases of `connect`. This is the M6 residue. Acceptable,
  but `connect|switch` would be smaller.
- No other options without callers were found. Every new value export has a Tovu production
  consumer (checked with -w over apps/website/src, apps/admin/src and the plugin).

=====================================================================================================
## Verified fixed (prior phase-B High/Medium, /tmp/gw-phaseB-jini.md)
- H1 (lock-out): fixed. `deleteOnce` reads only the revision (vault-token-store.ts:143-155);
  `install` overwrites a row sealed for another clientId or a malformed row
  (record.ts:333-346, `readReplaceableGeneration`); `revokeStoredCredential` deletes an unreadable
  row and reports `pending` with status `disconnected` (account-actions.ts:58-67, :132-135);
  `keepRefreshToken` tolerates an unreadable row (finish-authorization.ts:78-81).
- M1: fixed (`account-unchanged`, finish-authorization.ts:111-114).
- M2: fixed (`state` is host-only and `attemptId` is separate, authorization.ts:23-34, :92-100; it
  round-trips through `CompletedAuthorization.attemptId`).
- M3: fixed (the descriptor imports `MAX_CALLBACK_FIELDS`, `MAX_CALLBACK_FIELD_LENGTH` and
  `isCallbackFieldName` from oauth, descriptor.ts:8,21-23).
- M4: fixed (`workspaceId` is required, and `isOwnedRecord` checks it, records.ts:30-39,
  status.ts:36).
- M5: fixed (per-plugin bounded memory shared by tools and surfaces, capabilities.ts:70-107).
- M6: mostly fixed. Revocation is `confirmed|pending|not-needed` and the field is `status`; the
  action aliases are kept behind the intent map (F12).
- M7: fixed (the staged check is in `currentRecord`, finish-authorization.ts:64-69).
- Lows also verified: L9 (README init-once), L10 (public `offline-access-required`), L11
  (dispatcher payload cap), L4/L5/L6 trims.
- Sound, no finding: PKCE S256; attempt consumed before the check and bound to TTL, redirect and
  generation; loopback binds 127.0.0.1 with Host pinning; no-store bootstrap headers; sandbox
  exactly `allow-scripts` plus a CSP `sandbox` directive; the surface client posts only to the
  learned origin; the external-link gate (https only, declared origin, no userinfo, normalized
  href); cross-origin redirects strip Authorization (platform guarded client.ts:211-214); the token
  endpoint uses `redirect: "error"`; `destructive` only adds confirmation; delivery bindings check
  allowlists and ownership.
