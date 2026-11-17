# K-04 SEO agent tools -> `@jini-ai/cms/seo` (one run, est 160k)
files: `K-04.files.tsv` (`seo/agent-tools.ts`, `seo/tool-registrations.ts`; `agent-tools.ts` is in `BLOB-DRIFT.tsv`: 11 lines differ between the two merges, regenerate first). tools: `K-04.tools.tsv` = 6 (round 1 said 7), longest 22. pkg: cms. THIRD_PARTY_ALLOWED: none. tests: `apps/website/src/features/seo/**/*.test.ts`.
over the limit: `buildSeoRegistrations` 88, `getSeoAgentToolCatalog` 51 (same split as K-01: one module const per entry).
BINDINGS:
| import | class | action |
|---|---|---|
| `toolMetadata` (`tool-metadata/seo.js`) | host | `withToolMetadata` |
| `getSeoSettings`, `setSeoSettings` (`./settings.js`, STAY) | port | `deps.seoSettings: { get(input), set(input) }`: types = the second parameter and return type of the two functions today; Tovu binding closes over the settings deps the handler builds today |
| `PostRepoPort`, `SettingsRepoPort`, four media ports, `PrincipalRepoPort` (type-only) | structural | declared locally ONLY if a handler calls a member; a port only forwarded into `seoSettings`/host bindings leaves the Jini deps type |
| `SeoHostBindings` (`./index.js`) | host | stays a Tovu type; Jini gets the resolved values as fields (list them in the report) |
| `OriginRegistryPort`, `@jini-ai/core/*` | core | as is |
| `@jini-ai/cms/seo`, `@jini-ai/cms/core` | own | leaf files |
no surfaces (`ToolContributor<SeoToolDeps, unknown>`).
S0 extra: (f) the settings tool refuses an unknown key with the same message; (g) a write with a stale `expectedVersion` returns the same version-conflict envelope.
changeset: cms minor.
