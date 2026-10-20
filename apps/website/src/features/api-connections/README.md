# API connections (Tovu adapters)

## Purpose

Lets an Agent Plugin declare "sign in to this service" for its own REST calls, and runs that sign-in
through Jini's generic lifecycle (`@jini-ai/integrations/api-connections`: PKCE, attempts, grant
checks, reconnect, switch, revoke, refresh). This folder is only the Tovu side: storage, plugin
loading, runtime choice, the chat entry point, the public callback and the host capabilities. It
names no provider.

## Files

| File | What it does |
|---|---|
| `vault-stores.ts` | All state in the secrets vault, kind `api-connection` (migration 0020): token sets (Jini's vault token store, fenced `install` for sign-in), connection records (revision CAS), single-use sign-in attempts (revision-checked delete; expired ones swept). Labels are unique per row (key, plus a state digest for attempts). |
| `contribution.ts` | Loads `tovu-connections.json` through the lifecycle's executable trust gate; Jini parses the descriptor; the hooks module default-exports `createHooks({ http })`. |
| `budgets.ts` | Plugin-declared request budgets: `parseConnectionBudgets` (clamps to `HOST_BUDGET_MAXIMUM`, 240/min + burst 40), `createConnectionBudgets({ clock }).charge(target)` over the real http-kit limiter, and `ConnectionBudgetExceededError` (`rate-limited`). |
| `host.ts` | `createApiConnectionHost(deps)` per workspace: `listConnections`, `serviceFor`, `statusOf`, `requestedScopes`, `hostedCallbackUrl`, `accessTokensFor({ pluginId }).getAccessToken({ connectionRef })` (the plugin host capability), and `toolConnections` (the same rule as the executable-tool / admin-surface connection port, plus `readAccount`). |
| `byo-client.ts` | Bring-your-own OAuth client: `byoClientLabel({ pluginId, connectionId })` (the custom-credential label an admin saves it under) and `resolveByoClient({ credentials, workspaceId, connection })` (the saved client, an actionable refusal, or none). |
| `hook-http.ts` | `createConnectionHookHttp({ http, connection })`: the HTTP a connection's hooks get, limited to its declared `apiOrigins` plus its token endpoint's origin (exact origin match; anything else is refused before it is sent). |
| `connect.ts` | The API-connection branch of `agent_plugin_connect`: hosted waits for the public callback; desktop uses Jini's 127.0.0.1 loopback receiver and completes itself. `startApiConnectionSignIn` is the shared start (declared start parameters; desktop completion returns the declared callback fields). |
| `surface-connections.ts` | The admin-surface `connections` port by connection id (status, begin, confirm/cancel switch, disconnect with verbatim revocation, `takeCallbackFields` keyed by the service's attempt id). `status.lastSignInAttempt` is `{ code, nextAction: 'reconnect' }` after a desktop sign-in failed once the browser had opened (our own code, from `host.lastSignInAttempts`), `null` otherwise; a later successful desktop sign-in clears it. |
| `plugin-state.ts` | Plugin settings: JSON per key, per workspace + plugin, sealed rows in the same vault kind (no migration); 128 keys and 16 KiB per value; `forPlugin` (surfaces, read-write) and `readerFor` (tools, form delivery: `get` only). |
| `form-delivery-connection.ts` | OAuth `FormDeliveryConnectionPort`, composed ahead of saved custom credentials (`server/runtime/composition/form-delivery-deliverer.ts`): the token plus the connection's declared `apiOrigins` as `baseUrl` (first) and `additionalHosts` (the rest, exact origins); the job's frozen `binding.config.accountId` is the only account it serves; first-read refusals become delivery codes (`authorization-required`, `rate-limited`, `configuration-invalid` for a binding with no account). |
| `../../server/inbound/public-http/routes/api-connections/oauth-callback.ts` | `GET /api/agent-plugins/connections/oauth/callback`, cookie-less, rate-limited, renders the shared fixed-copy callback page; after a successful exchange it deposits the declared callback fields in `host.callbackInbox`. |

## The plugin side

```json
{ "schemaVersion": 1, "connections": [ {
  "id": "account", "module": "lib/connection.mjs", "label": "Acme Office",
  "authorizationEndpoint": "https://…", "tokenEndpoint": "https://…",
  "authorizationParams": { "public": {}, "confidential": {} }, "startParams": [], "callbackFields": [],
  "budgets": [{ "scope": "connection", "perMinute": 45 }, { "scope": "instance", "perMinute": 240 }],
  "scopeSets": ["files"], "apiOrigins": ["https://api.example.com"], "byoClient": true,
  "clients": {
    "web": { "clientIdEnv": "TOVU_ACME_OAUTH_WEB_CLIENT_ID", "clientSecretEnv": "TOVU_ACME_OAUTH_WEB_CLIENT_SECRET", "redirectOrigins": ["https://…"] },
    "desktop": { "clientIdEnv": "TOVU_ACME_OAUTH_DESKTOP_CLIENT_ID" }
  } } ] }
```

`scopeSets` (optional, at most 16 ids) lists the scope-set ids the plugin's `resolveScopes` accepts,
so a surface's `status` can report which are granted. `apiOrigins` (optional, at most 8 bare
`https://` origins) is where the plugin's API calls with this connection go; form delivery allows
exactly those hosts. Neither reaches Jini's descriptor.

`createHooks({ http })` returns Jini's `ApiConnectionHooks` (`resolveScopes`, `readAccount`,
`revoke`). Its `http` reaches only the connection's `apiOrigins` and its `tokenEndpoint`'s origin, so
a provider's revocation endpoint must be on one of those (`hook-http.ts`). Client ids are host config the plugin only names (`TOVU_…_CLIENT_ID` / `_SECRET`). The web
client is confidential and must have its secret. The desktop client is public (PKCE, loopback); it
may name a secret when the provider issues installed apps one, which is sent with
`client_secret_post` but still kept in host config only, never in output, logs or the vault. A second
provider needs only its own plugin files (see the `acme-office` test fixture).

## Bring your own OAuth client

A declaration with `"byoClient": true` lets a workspace admin sign in with their own OAuth client
instead of the host's. It is saved through the existing secure credential capture (Admin → Access
Tokens → "Add custom provider", or the chat `custom_credential_create` card: masked field, sealed in
the vault, never chat text or a tool argument) as a custom credential with:

- label `<pluginId>/<connectionId> OAuth client` (`byoClientLabel`), in the same workspace;
- base URL on the connection's token endpoint origin (the only place its secret may go; a credential
  whose allowed origins miss it is refused, not ignored);
- username = the client id (not a secret), token = the client secret.

The host resolves it on every `listConnections` and keeps the client in a per-host `WeakMap` keyed by
the loaded declaration, so it never becomes a serializable field and never crosses workspaces. It
then replaces the host client for that runtime (`public` on desktop, `confidential` hosted, both
`client_secret_post`). A hosted BYO web client returns to this site's own public origin (the admin
registered `<origin>/api/agent-plugins/connections/oauth/callback`), with no configured origin list;
no public origin still fails closed. A declaration without `byoClient` ignores any such credential.

Client switch: tokens are sealed for the client id that issued them. When the client changes (BYO
saved, replaced or removed), `records.read`, `statusOf`, `toolConnections.readAccount` and token reads
find the connected record's tokens unreadable and durably move it to `reconnect-required` (revision
CAS); token reads then refuse with `reconnect-required`. A reconnect issues tokens for the current
client. Rotating the secret under the same client id keeps the connection. A second provider plugin
gets all of this by declaring `byoClient: true`.

## Rules the host keeps

- The callback is authenticated by the attempt its `state` names (single use, 10 minutes, bound to
  workspace, actor, connection, scopes and exact callback URL) plus the provider's one-time code;
  its page never echoes request or provider data; logs carry error codes only.
- `getAccessToken` serves only refs of connections the calling plugin declares in this workspace;
  every other ref gets the same refusal. Only access tokens leave; refresh tokens stay sealed.
- Attempts (they hold the PKCE verifier) live sealed in the vault, never in the exportable ledger.

## Request budgets

A connection may declare `budgets`: at most one per scope, `{ "scope": "instance" | "connection",
"perMinute": n, "burst"?: n }`. `connection` is one signed-in account (one `connectionRef`);
`instance` is this site's share across every account of that declared connection. The host charges
them on every `getAccessToken` (the capability rule is one token read per authenticated request),
so chat tools, admin-surface actions and form delivery all spend the same budgets without the plugin
pacing itself. How the host keeps them:

- Keys are scope + workspace + plugin + connection id (+ the ref for `connection`), NUL-separated, so
  a plugin never spends another plugin's, another connection's or the host's budget.
- Only an owned ref is charged: a forged ref is refused first, so it neither drains a budget nor
  creates counters. The per-account budget is checked first, so a busy account's refused calls do
  not spend the instance budget its siblings share.
- Values are clamped to `HOST_BUDGET_MAXIMUM` (240/min, burst 40); a connection that declares no
  instance budget gets that maximum. A malformed entry refuses the whole declaration (never unbounded).
- A refusal is `ConnectionBudgetExceededError`: `code: "rate-limited"`, `retryable: true`,
  `retryAfterMs` (from the limiter's window), `outcome: "not-applied"`; nothing was sent, so a
  caller (form delivery) waits and retries rather than dropping work. A provider's own Retry-After
  and jittered backoff stay the plugin's job.
- Counters live in memory, PER PROCESS: each process that composes the host (the API server and the
  agent daemon each do) holds its own, so the real ceiling is the declared budget times the number
  of such processes, and a restart resets it. Declare budgets below the provider's quota with that
  in mind; a shared budget would need a distributed atomic store, which http-kit does not provide.

Separately, the `limiter` capability (`AGENT_PLUGIN_OUTBOUND_BUDGET`) is a plugin's own pacing tool:
whatever it checks there, the declared budgets above still apply.

## Wiring (done in G6b)

`server/runtime/composition/agent-plugin-connections.ts`'s `composeAgentPluginConnections` builds the
host once per site in both roots (`deps.ts` with the SQLite vault, `app.ts` with an in-memory one)
and puts it on `RouteDeps`:

1. `RouteDeps.apiConnections = { host }`: `agent_plugin_connect` reads it, and the `agent-plugins`
   server module registers the public callback (`GET /api/agent-plugins/connections/oauth/callback`).
2. `RouteDeps.agentPluginTools.connections` uses `host.toolConnections`; admin-surface handlers get
   `surface-connections.ts` over the same host (by connection id), `host.pluginState` (tools read
   the same store) and public config (`agent-plugins/admin-surfaces/capabilities.ts`).
3. Runtime: desktop when the server runs under the desktop shell's Electron Node
   (`ELECTRON_RUN_AS_NODE=1`), hosted otherwise. Desktop's OAuth guard admits the plaintext
   `http://127.0.0.1` redirect (the transport still refuses private addresses). The hosted callback
   origin is `TOVU_PUBLIC_URL`, else the listener origin. Hosted sign-in fails closed: the origin
   must be in `TOVU_API_CONNECTION_CALLBACK_ORIGINS` (comma-separated origins the operator
   registered with the shared web clients; a placeholder, not a secret) or the client's own
   `redirectOrigins`. With neither, every hosted sign-in (and token read) is refused with a
   configuration message instead of the provider's redirect-mismatch page.

Form delivery (G14b): an OAuth binding names the account it was set up with as `config.accountId`;
that binding is frozen into every job, so after a confirmed account switch the old jobs are refused
(`authorization-required`, kept in the ledger) instead of delivering to the new account. Re-pointing
a binding at the new account is an explicit binding edit.