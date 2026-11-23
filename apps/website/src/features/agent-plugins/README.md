## Wiring

`mail-adapter-registry.ts` binds the host's default credential label and the bundled-plugin source
walk into `@jini-ai/agent-plugins/lifecycle/mail`. It forwards nothing: callers take the
`MailAdapterRegistry` type from `@jini-ai/agent-plugins/lifecycle/mail`.

`supersession.ts` now lives at `@jini-ai/agent-plugins/site/supersession`; `lifecycle.ts` binds
its manifest readers (`readInstalled`, and `createBundledSourceManifestReader` with this build's
`bundledSourceRoot`). The admin-surface `deliveryBindings` port lives at
`@jini-ai/agent-plugins/site/admin-surfaces/delivery-bindings`; the composition root
(`server/runtime/composition/agent-plugin-connections.ts`) injects the forms list, the settings-backed
`FormDeliveryBindingsStore` and `deriveConnectionRef: deriveApiConnectionKey`
(`@jini-ai/integrations/api-connections`). `connect-destination.ts`, `card-host-bindings.ts` and
`admin-surfaces/issued-sign-ins.ts` stay here as this product's bindings (card identity, UI, copy,
hosted sign-in path).

## Wiring (forwarding lines removed)

`access-token-tool.ts`, `connect-tool.ts`, `import-access-token.ts`, `switch-on-saved-token.ts`,
`tool-registrations.ts` and `write-note-tool.ts` re-export nothing from `@jini-ai/agent-plugins/*`: callers
take `AgentPluginConnectResult`, `ResolvedAgentPluginForConnect`, `InstalledAgentPluginServers`,
`TokenImportLog`, `WRITE_PLUGIN_NOTE`, `pluginNoteRisk` and the other moved names from
`@jini-ai/agent-plugins/connect` / `@jini-ai/agent-plugins/lifecycle/host-tools` directly. `set-enabled.ts`
keeps its three error re-exports (`AgentPluginNotReadyError`, `AgentPluginLinkedError`,
`AgentPluginNotInstalledError`) only because the route registration
`server/inbound/admin-http/routes/agent-plugins/set-enabled.ts` still imports them from here.

## Wiring (uninstall branch)

The Agent Plugin branch of `plugins_uninstall` lives at `@jini-ai/agent-plugins/site/uninstall-tool`
(`runAgentPluginUninstall`). `server/runtime/composition/agent-plugin-uninstall-host.ts` binds `agentPluginUninstallHost`: this host's
lifecycle preview/uninstall owner (`lifecycle.ts`), approval owner and not-confirmed result
(`contracts/core/human-confirm.ts`), dialog (`uninstall-confirmation-ui.ts`) and model-facing copy
(product name from `plugin-runtime/plugin-host-copy.ts`, `PLUGINS_UNINSTALL_TOOL_ID`, the External MCP
settings path). The composition root (`server/runtime/composition/plugin-host.ts`) adds it to the deps
bag as `uninstallHost` at its one call site.
