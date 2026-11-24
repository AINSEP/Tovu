# media-generation

## Wiring

- `loadMediaProviderRegistry` / `parseMediaProvidersFile` live in
  `@jini-ai/cms/media/site-generation/media-provider-registry`. The host binds them once in
  `server/runtime/composition/deps.ts`: `filename: "tovu-media-providers.json"` (product-named manifest),
  `contract`/`createRegistry`/`registryId` from `@jini-ai/integrations/media-providers`, and
  `defineProviderContribution` (pinned to `<ProviderContributionDescriptor, MediaProviderContribution>`) +
  `contributeProviders` from `@jini-ai/agent-plugins/lifecycle`, plus the lifecycle's `loadPluginContributions`.
