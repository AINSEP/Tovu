# Codex (gpt-5.6-sol, high) verdict — generalized composer tooling layer

Dispatched: 2026-08-21 by Claude Opus 5 (1M), Coordinator — Review Mode.
Question: the owner wants one `/`-typeahead layer over MCP servers + plugins + agent plugins,
with the chip tagged by kind. Owner asked explicitly: "is there an easier way?"

Verified by the dispatcher BEFORE relaying (all three confirmed against source):
- `federatedToolId()` mints `mcp__<connectionId>__<tool>` — `src/assistant/mcp-federation/trust.ts:205`. CONFIRMED.
- `plugins_list` is already a registered read-only agent tool — `src/features/plugin-runtime/agent-tools.ts:92`. CONFIRMED.
- MCP admission is frozen at boot BY DESIGN (trust.ts R5 rug-pull guard), restart required —
  `src/server/agent-daemon/agent-daemon-server.ts:745`. CONFIRMED, and stronger than Codex framed it:
  it is a deliberate security property, not unfinished work.

Two of the dispatcher's own proposals were refuted by this and the refutations were verified as correct:
1. `pluginRefIds: string[]` -> `{kind,id}[]` — unnecessary ceremony + a wire compat break.
2. "one search tool for plugins + agent plugins" — partly redundant, `plugins_list` already exists.

---

Codex(Direct): **Yes. MCP does not need a daemon-resolved chip ref.** Federated MCP tools are attached to the existing registry before its searchable catalog is snapshotted ([agent-daemon-server.ts:781](/Users/la/Programming/Tovu/src/server/agent-daemon/agent-daemon-server.ts:781), [agent-daemon-server.ts:790](/Users/la/Programming/Tovu/src/server/agent-daemon/agent-daemon-server.ts:790)). Their IDs already encode the server as `mcp__<connectionId>__<tool>` ([trust.ts:205](/Users/la/Programming/Tovu/src/assistant/mcp-federation/trust.ts:205)), and descriptions include server provenance ([trust.ts:372](/Users/la/Programming/Tovu/src/assistant/mcp-federation/trust.ts:372)).

Therefore an MCP chip only needs:

- Local identity for rendering/removal.
- A short prompt hint: “Prefer registered tools whose id starts with `mcp__github__`; use `search_tools`, then `describe_tool`.”
- No MCP resolver, no new daemon field, and no MCP object on the wire.

The browser can fold that hint into `prompt` where `buildLocalCliContextRef` creates the envelope ([assistant-transport.ts:495](/Users/la/Programming/Tovu/apps/admin/src/lib/assistant-transport.ts:495)). This is small routing metadata, not expensive MCP content injection. Tool authorization remains server-side.

## Minimum viable change set

| Order | Change | Files / size | If skipped |
|---|---|---|---|
| 1 | Add live composer sources. Reuse `listPlugins()` and `listExternalMcpServers()`; filter to usable/enabled rows. Add a lightweight installed-agent-plugin catalog endpoint because the existing adapter explicitly has no browser transport. | New `plugin-composer-source.ts`, `mcp-composer-source.ts`: ~50–70 LOC each. Agent-plugin route/source: ~150–250 LOC. Existing routes: [plugins/list.ts:21](/Users/la/Programming/Tovu/src/server/routes/admin/plugins/list.ts:21), [external-mcp/list.ts:16](/Users/la/Programming/Tovu/src/server/routes/admin/external-mcp/list.ts:16). Missing transport: [agent-plugin-capability-adapter.ts:38](/Users/la/Programming/Tovu/apps/admin/src/features/plugins/agent-plugin-capability-adapter.ts:38). | Typeahead remains hardcoded and does not enumerate the three inventories. |
| 2 | Generalize only the browser’s pin model and tray. Store namespaced key, label, existing `item.kind`, and execution effect. Render `MCP`, `Plugin`, or `Agent Plugin` badge. | `composer-capabilities.ts`, `AssistantDock.hooks.tsx`, `AssistantDock.tsx`, rename/generalize `SelectedAgentPluginTray.tsx`: ~120–180 LOC. | Chips remain Agent-Plugin-specific and cannot show kind safely. |
| 3 | Route pin effects locally: agent-plugin effects continue producing legacy `pluginRefIds`; MCP/plugin effects produce short prompt hints. | `AssistantDock.hooks.tsx`, `assistant-transport.ts`: ~40–70 LOC. | MCP/plugin chips are decorative no-ops, or MCP IDs enter `pluginRefIds` and fail the run. |
| 4 | Compose all sources into `useComposerCapabilities` and add focused projection, selection, tray, and transport tests. | Hook at [AssistantDock.hooks.tsx:593](/Users/la/Programming/Tovu/apps/admin/src/components/AssistantDock/hooks/AssistantDock.hooks.tsx:593), tests: ~150–250 LOC. | The new sources never reach existing slash typeahead; collisions and prompt behavior regress silently. |

Do not send skill markdown through the catalog endpoint: the server projection currently reads it eagerly ([capability-projection.ts:103](/Users/la/Programming/Tovu/src/features/agent-plugins/capability-projection.ts:103)). Return metadata only.

## Where the proposal is over-built

Replacing `pluginRefIds` with `{kind,id}[]` is unnecessary ceremony and a compatibility break. The kinds are not symmetric:

- MCP: already-executable registry tools.
- Regular plugin: runtime extension; `plugins_list` is already a registered searchable agent tool ([agent-tools.ts:92](/Users/la/Programming/Tovu/src/features/plugin-runtime/agent-tools.ts:92)).
- Agent plugin: filesystem-backed instructions requiring special resolution.

“Per-kind resolvers” therefore creates a false abstraction. Keep `pluginRefIds` solely for its existing agent-plugin behavior. The current resolver deliberately treats every value as an installed Agent Plugin and fails closed otherwise ([resolve-agent-plugin-refs.ts:135](/Users/la/Programming/Tovu/src/features/agent-plugins/resolve-agent-plugin-refs.ts:135)).

Use a local behavior union instead:

```ts
type PinEffect =
  | { kind: "agent-plugin-ref"; pluginRefId: string }
  | { kind: "prompt-hint"; text: string };

interface ComposerPin {
  key: string; // `mcp:${id}`, `plugin:${id}`, etc.
  label: string;
  capabilityKind: string;
  effect: PinEffect;
}
```

A new combined plugin/agent-plugin search tool is also partly redundant: `plugins_list` already exists. Later, replace Agent Plugin bulk injection with an on-demand `agent_plugins_search`/`agent_plugin_read_skill` surface; that is worthwhile, but not required for this UX.

## Trap

The External MCP settings roster is not the live attached roster. Federation fails open per connection ([bootstrap.ts:149](/Users/la/Programming/Tovu/src/assistant/mcp-federation/bootstrap.ts:149)), and settings changes require daemon restart because admission is frozen at boot ([agent-daemon-server.ts:745](/Users/la/Programming/Tovu/src/server/agent-daemon/agent-daemon-server.ts:745)). A settings-backed chip can therefore name an enabled server whose tools are absent.

For MVP, label these “configured MCP” and let search report no match. For truthful “available MCP” semantics, expose the daemon’s successfully attached connection IDs later.
