# Agent Plugin admin surfaces (Tovu adapter)

A plugin can ship its own small admin screen (for example "Manage connection" or a resource
chooser). Jini (`@jini-ai/agent-plugins/admin-surfaces`) owns the rules: the contribution file
format, contained paths, the sandboxed-iframe attributes, the CSP and headers, the postMessage
protocol, the action dispatcher and the bootstrap envelope. This folder is Tovu's thin adapter.
Nothing here knows any provider.

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

## Extension points

- A second provider plugin adds a surface by shipping `tovu-admin-surfaces.json` and its static
  files; no Tovu change is needed to list, serve and mount it.
- Action handlers and bootstrap data come from an `AdminSurfaceHost` passed as
  `AgentPluginsRouteDeps.adminSurfaceHost`. Until a host supplies one, every declared action answers
  `action-unavailable` and bootstrap data is `null`.

## Rules

- Never put a secret in a surface file: the files route is public. Start data goes through the
  bootstrap, which is session-gated, never cached and short-lived; never a refresh token.
- Never add `allow-same-origin` to the frame.
