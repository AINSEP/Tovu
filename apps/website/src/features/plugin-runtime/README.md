# plugin-runtime

## Wiring

- `plugin-host-copy.ts` binds this host's product copy into the model-facing plugin text owned by
  `@jini-ai/plugins/runtime/*`: `PLUGIN_HOST_COPY` (`productName`, `sitePluginFormat`,
  `localInstallEnv`, `pluginListToolName`) goes to `createPluginAgentToolCatalog`, `createPluginSourceAgentToolCatalog`,
  `createInstallToolCatalog` (with `PLUGIN_INSTALL_SOURCE_SCHEMA` from `#src/contracts/headless`),
  `createPluginToolMessages` and `createPluginInstallMessages`; `createCapabilityCard` gets the Plugins
  admin path. `host-tool-binding.ts`, `install-tool-binding.ts` and `server/runtime/composition/site-guide.ts`
  read the bound values from there; `PLUGINS_SET_ENABLED_TOOL_ID`, `PluginFamily` and
  `PLUGINS_INSTALL_TOOL_ID` are imported straight from `@jini-ai/plugins/runtime/*`.
