# Executable Agent Plugin tools (Tovu adapter)

## Purpose

An installed, active Agent Plugin can ship assistant tools as plain-JS `.mjs` modules, declared in
`tovu-agent-tools.json` at its package root. Jini admits and projects them
(`@jini-ai/agent-plugins/lifecycle/tools`, see its README); this folder is Tovu's thin adapter that
puts them on the assistant's ToolRegistry, confirms external changes on Tovu's existing approval
owner, and supplies the host capabilities a tool module receives. Nothing here names a provider.

## How it fits

```
installed-extension pass (server/runtime/composition/installed-extension-tools.ts)
  └─ registerAgentPluginExecutableTools                      register.ts
       loader: lifecycle.loadPluginContributions             (active plugin, bundled digest, contained .mjs)
       Jini projection: schema check, revocable capabilities, describeAffectedResources
       plugin tool contract: p_<plugin>__<tool> ids, activation + permission recheck before the handler
       core registration scope on the assistant ToolRegistry (search_tools indexes it at boot)
       approval: contracts/headless/assistant-tool-approval-policy.ts families
                 + assistant/tool-approval-policy.ts card                       approval.ts
       capabilities: connections / guarded HTTP / limiter / artifacts          host-capabilities.ts
```

| Declared effect | Approval family | What happens |
|---|---|---|
| `read` | `agent-plugin-read` (read, direct) | Runs without a card; 30 s deadline. |
| `write` | `agent-plugin-write` (publish) | Card: tool, input, account, affected resources. |
| `destructive` | `agent-plugin-destructive` (delete, danger) | Same card, danger styling. |

A raw batch tool discloses every request kind through its own `describeAffectedResources`; the card
shows every line it returns (at most 50).

Before the card is shown the approval owner has detached the input (request and target), and the
disclosure step reads the account for each connection the projection disclosed (the validated input's
top-level string `connectionRef`, or none; a `connectionRef` nested in payload data is data) and freezes
them, always, even when there are none: at token time the accessor is asked for that exact account, so a
switched account is refused instead of silently used. Jini's capability session refuses any other ref
before Tovu is asked, so a call that names no connection gets no token at all. Activation and the `admin.assistant.use` permission are re-read right before the
handler runs; a plugin disabled during confirmation is refused.

## Public API

| export | what it is |
|---|---|
| `registerAgentPluginExecutableTools(required)` | Loads, projects and registers; returns `{ refusals, dispose }`. |
| `AgentPluginExecutableToolHost` | The ports the composition root binds: `loadContributions`, `connections`, `http`, `limiter`, `state` (the plugin settings reader, `api-connections/plugin-state.ts`), `apiOrigins` (each plugin's declared API origins), `issuedTokens` (the site's one `createIssuedTokenMemories()`, shared with the admin-surface handler host), optional `artifacts`. Tools get `state.get` only. |
| `AGENT_PLUGIN_TOOLS_FILENAME` | `tovu-agent-tools.json`. |
| `createAgentPluginToolCapabilities(required, optional)` | Tovu's `AgentPluginToolCapabilitiesPort`. |
| `AgentPluginConnectionAccess` | Port over the API-connection service: `readAccount`, `getAccessToken(…, { expectedAccountId })`. |
| `createAgentPluginDisclosure(required)` | Card rows + account freeze for one confirming call. |

## Host wiring (composition root)

`InstalledExtensionToolDeps.agentPluginTools` and `.surfaces` enable this family; without them it is
skipped. Both assistant processes pass `surfaces`, and both receive `agentPluginTools` through their
`routeDeps` spread (`RouteDeps.agentPluginTools`). Both composition roots build it with
`server/runtime/composition/agent-plugin-connections.ts`:

```ts
agentPluginTools: {
  loadContributions: agentPluginLifecycle.loadPluginContributions,
  connections: apiConnectionHost.toolConnections,  // refuses refs the plugin/workspace does not own
  http: guardedOutboundHttpClient,
  limiter: createRateLimiter({ profile: AGENT_PLUGIN_OUTBOUND_BUDGET, clock }),
  apiOrigins: apiConnectionHost.apiOriginsFor,      // union of the plugin's connections' apiOrigins
}
```

A plugin's `http` reaches only the https origins its own connections declare in
`tovu-connections.json` (`apiOrigins`); any other origin is refused before anything is sent, so a
URL built from tool input can never carry the plugin's token elsewhere. A plugin with no declared
origin can make no HTTP call from a tool or surface.

The same `connections`, `http` and `limiter` back plugin admin-surface handlers
(`../admin-surfaces/handlers.ts`). `createGuardedPluginHttp({ http })` is the `http` capability on
its own (no origin list: hooks also reach token and revocation endpoints), which API-connection
hooks receive.

## Extension points

A second provider plugin needs no change here: it ships its own `tovu-agent-tools.json`, modules and
connection, and receives the same ports. Provider endpoints, scopes and parsing stay in the plugin.

## Known limits (phase A)

- Tools are loaded once per boot; enabling a plugin later needs a restart to add its tools (disabling
  is enforced per call).
- No host artifact store is bound yet, so tools and surfaces get no `artifacts` capability at all (Jini's port is optional); a tool that needs one checks `capabilities.artifacts` first.
- One limiter profile (`AGENT_PLUGIN_OUTBOUND_BUDGET`, 240/min per plugin key) backs the `limiter`
  capability. Plugin-declared request budgets (per connection / per instance, `budgets` in
  `tovu-connections.json`) are charged by the host on every token read
  (`../../api-connections/budgets.ts`).
