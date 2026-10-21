# Agent Plugin admin surfaces (Tovu adapter)

A plugin can ship its own small admin screen (for example "Manage connection" or a resource
chooser). Jini (`@jini-ai/agent-plugins/admin-surfaces`) owns the rules: the contribution file
format, contained paths, the sandboxed-iframe attributes, the CSP and headers, the postMessage
protocol, the action dispatcher and the bootstrap envelope. This folder is Tovu's thin adapter.
Nothing here knows any provider.

`forms.ts` binds the optional read-only `forms.list({})` handler capability to the existing form
definition repository. It refuses a foreign workspace or missing principal before reading, then
checks the same `admin.forms.manage` permission as the forms-list API. Only `{slug,title}` is
returned. Jini's capability session exposes it only to surfaces declaring `forms: ["list"]` and
caps the result at 200 choices (64-character slugs, 1024-character titles). The admin frame carries
these through declared action results; no additional browser capability endpoint is needed.

## How it fits

```
plugin root: tovu-admin-surfaces.json + surface files
   │  admitted by Jini's contribution loader (active plugin, shipped digest, contained paths)
   ▼
surfaces.ts  createAgentPluginAdminSurfaceSource ── list / readFile ──┐
   │                                                                  │
   ├─ public  GET /api/agent-plugin-surfaces/v1/:plugin/:surface/<path>   (public-http/routes/agent-plugin-surfaces/files.ts)
   │          declared entry + files only, Jini isolation headers, no session (sandboxed module scripts send no cookie)
   └─ admin   GET  /api/admin/v1/workspaces/:ws/agent-plugins/:plugin/surfaces                   (admin.plugins.read)
              POST .../surfaces/:surface/bootstrap   Cache-Control: no-store                    (admin.plugins.enable)
              POST .../surfaces/:surface/actions     Jini dispatcher → AdminSurfaceHost handlers (admin.plugins.enable)
              both POSTs: same-origin.ts CSRF gate + session credential only, before any lookup
admin page: AgentPluginDetailsModal → one tab per surface → AgentPluginSurfaceFrame
              (iframe sandbox="allow-scripts", nonce + origin + window gate, init once after first load)
```

## Public API

| export | file | what it is |
|---|---|---|
| `ADMIN_SURFACES_FILENAME` | `surfaces.ts` | `tovu-admin-surfaces.json`, the file a plugin ships |
| `createAgentPluginAdminSurfaceSource({ lifecycle })` | `surfaces.ts` | the lifecycle-backed `AdminSurfaceSource` |
| `findAdminSurface`, `readSurfaceFile`, `adminSurfaceFileUrl` | `surfaces.ts` | lookup by id, contained read with headers, the public file URL |
| `AdminSurfaceHost`, `NO_ADMIN_SURFACE_HOST` | `surfaces.ts` | the port that supplies action handlers and bootstrap data (none by default) |
| `isSameOriginAdminWrite` | `same-origin.ts` | the CSRF gate for the two POST routes |
| `createAgentPluginAdminSurfaceHandlers({ workspaceId, loadContributions, capabilities }, { signIns })` | `handlers.ts` | the real `AdminSurfaceHost`: plugin `handlerModule`s through Jini's handler host, plus `refresh()` |
| `createAdminSurfaceCapabilities({ tools, connectionsFor, stateFor, publicConfig })` | `capabilities.ts` | Tovu's `AdminSurfaceCapabilitiesPort`: the tool port's `http`/`limiter`/`artifacts` (when the tool port has one) plus surface-only `connections`, `state`, `publicConfig` |
| `createSurfaceDeliveryBindings({ pluginId, workspaceId, principalId, siteWorkspaceId, declaredConnectionIds, contributedAdapterIds, forms, bindings, newBindingId })` | `delivery-bindings.ts` | Tovu's `deliveryBindings` port: the plugin's own form-delivery bindings, written through `core.forms/deliveryBindings` |
| `createIssuedSignInCollector()` | `issued-sign-ins.ts` | per-request registry (AsyncLocalStorage) of the https sign-in links the connections port issued; the action route returns them as `hostSignIns` |
| `createAdminSurfacePublicConfig({ env })` | `public-config.ts` | `publicConfig.get({ name })` from host config; secret-shaped names refused; unset → `null` |

## Extension points

- A second provider plugin adds a surface by shipping `tovu-admin-surfaces.json` and its static
  files; no Tovu change is needed to list, serve and mount it.
- Action handlers and bootstrap data come from an `AdminSurfaceHost` passed as
  `AgentPluginsRouteDeps.adminSurfaceHost`. Both composition roots pass `handlers.ts`'s host (built
  in `server/runtime/composition/agent-plugin-connections.ts`), so a plugin answers its own declared
  actions with a `handlerModule` (`.mjs`, admitted by the executable trust gate). Its handlers get
  `capabilities.ts`'s port: the plugin's tools' guarded HTTP and limiter, plus
  - `connections` by connection id (`api-connections/surface-connections.ts`): the host resolves the
    id to its own ref for the scope's plugin and workspace (anything else is one refusal), account
    actions need the signed-in admin, `begin` passes declared start parameters through, `disconnect`
    reports `confirmed` / `pending` / `not-needed` verbatim, and `takeCallbackFields` reads
    the host's consume-once inbox the public callback filled (owner plugin only; attempt id = the
    service's own random attempt id, never the OAuth state);
  - `state`: the plugin's settings (`api-connections/plugin-state.ts`), read-write here and
    read-only for its tools (and later form delivery), keyed by plugin and workspace;
  - `publicConfig`: the declared public names, from host config; only `TOVU_…_APP_ID`, `_CLIENT_ID`,
    `_BROWSER_KEY` or `_PUBLIC_KEY` names are read (never the site's other settings).
  - `deliveryBindings` (only for a surface that declares `deliveryAdapters`; `delivery-bindings.ts`):
    list/save/remove of the site's form-delivery bindings whose adapter THIS plugin contributes
    (`tovu-form-destinations.json`) on one of ITS connections. The plugin names a connection by id and
    forms by slug; the host stores its own connection ref and the forms' row ids, assigns binding ids,
    and re-reads ownership inside every write (a binding that changed hands after the session's list
    is never overwritten or removed). Writes go through the forms build's binding owner
    (`writeFormDeliveryBindings`, the settings chokepoint) as the signed-in admin, so its validation
    and `settings.workspace.write` apply; the admin's click on the surface is the human action (the
    assistant's own writes of that setting still need a card). Refusal codes: `admin-required`,
    `adapter-not-owned`, `connection-not-declared`, `form-not-found`, `binding-not-found`,
    `delivery-binding-invalid` (the owner's validation message). Delivery itself stops for a disabled
    plugin (its adapter is absent from the active-only registry the deliverer reads per attempt:
    `adapter-unavailable`, retryable) and for a disabled product (the plugin's adapter checks it).
  Without a handler module, a declared action answers `action-unavailable` and bootstrap data is `null`.
- Sign-in links: the sandboxed frame cannot open popups, so a handler's `begin` result is opened by
  the HOST page. The connections port reports every link it issued to `issued-sign-ins.ts`; the
  action route returns those (and only those, only on success) as `hostSignIns`; the admin frame
  hook keeps them per mount until opened or expired and renders "Continue to sign-in" as a new tab
  with `rel="noopener noreferrer"` (the desktop shell sends it to the system browser). A URL in the
  plugin's own result is never opened.
- Handler modules load at boot (`deps.ts`) and again before every surface bootstrap. The admin frame
  always asks for its bootstrap when a surface opens, so a plugin enabled since the last load answers
  on the next open, whichever process or writer enabled it; disabling is enforced per request by the
  routes' active-only admission.

## Rules

- Never put a secret in a surface file: the files route is public. Start data goes through the
  bootstrap, which is session-gated, never cached and short-lived; never a refresh token.
- Never add `allow-same-origin` to the frame.
