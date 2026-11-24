# media-generation

## Wiring

- `loadMediaProviderRegistry` / `parseMediaProvidersFile` live in
  `@jini-ai/cms/media/site-generation/media-provider-registry`. The host binds them once in
  `server/runtime/composition/deps.ts`: `filename: "tovu-media-providers.json"` (product-named manifest),
  `contract`/`createRegistry`/`registryId` from `@jini-ai/integrations/media-providers`, and
  `defineProviderContribution` (pinned to `<ProviderContributionDescriptor, MediaProviderContribution>`) +
  `contributeProviders` from `@jini-ai/agent-plugins/lifecycle`, plus the lifecycle's `loadPluginContributions`.
Agent tools that generate images, video and audio through configured media providers.

## Wiring

- **Jini owns** the dispatch engine (`createMediaDispatchEngine` from
  `@jini-ai/integrations/media-providers`): catalogue validation, route lookup, vendor adapters and
  the outbound egress policy. The engine binds no transport of its own.
- **The host injects** the engine's three required ports in `tool-registrations.ts`'s
  `defaultGenerateMedia`: the provider `registry`, the guarded `httpClient` (from
  `MediaGenerationToolDeps`), and `guardedFetch: nodeMediaGuardedFetch` from
  `@jini-ai/integrations/media-providers/node`, which projects the client's bounded responses into
  fetch `Response`s for the vendor adapters. Tests replace the whole call with `generateMedia`.
