# media-generation

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
