# Media generation as plugin-contributed providers — design (2026-10-21)

Status: decided (unattended build, owner-approved scope). Builds on the shared provider registry
(`@jini-ai/core/provider-registry`, Jini `ddc1e606`, merged into this branch) — no TEMP copies.

## Problem (AUDIT row "media-generation")
- `features/media-generation/tool-registrations.ts:143` builds `createBuiltinVendorAdapterRegistry()`
  on every generation call.
- The catalogue is a closed set of consts (`MEDIA_PROVIDERS`, `IMAGE_MODELS`, … in Jini
  `media-providers/providers.ts`) and the engine (`dispatch/engine.ts` `resolveCatalogModel`)
  rejects any model not in them, so a plugin cannot add a vendor even if it ships an adapter.
- Provider, models and adapters are registered in three different places.

## Contract (Jini, generic — `media-providers/dispatch/media-provider-registry.ts`)
```ts
interface MediaProviderModel extends MediaModel { surface: MediaSurface; audioKind?: AudioKind; order?: number }
interface MediaProviderContribution {               // ONE unit per vendor
  provider: MediaProvider;                          // public id unchanged (e.g. 'custom-image')
  models: readonly MediaProviderModel[];            // every model.provider === provider.id
  adapters: Readonly<Record<string, VendorAdapter<never>>>; // routeKey ('image','audio:speech',…) -> adapter
}
createMediaProviderRegistry({}, { contributions = builtinMediaProviderContributions() })
  -> MediaProviderRegistry  // = VendorAdapterLookup + MediaModelCatalog + .providers (shared registry)
```
- Backed by `createProviderRegistry<MediaProviderContribution>({ contract: 'media' })`.
  Core/builtin `register` throws; plugin `contribute` never throws and records refusals.
- **Id grammar** (the doc's open question): the shared grammar forbids hyphens, media ids have one
  (`custom-image`). Decision: the registry key is `mediaProviderRegistryId(id)` = canonical id with
  `-`→`_`; the *public* id (`provider.id`, saved credential rows, env-var map, settings JSON) is
  unchanged. Lookups canonicalise (aliases) then map, so no persisted value changes.
- `validate` rejects: model whose `provider` ≠ contribution provider id; model id already owned by
  another provider for the same surface; adapter without `buildRequest`/`parseResponse`; empty
  provider label.
- `MediaModelCatalog` = `{ findModel, findProvider, modelsForSurface }` — same semantics as today's
  free functions, read from the live registry. Ordering: `order` (builtins carry their catalogue
  index) then registration order, so default-model resolution order is byte-for-byte unchanged.

## Built-ins become the default contribution
`builtinMediaProviderContributions()` groups today's consts + the adapters collected from the
existing `registerVendorAdapters` functions (via a collecting `register`) into one contribution per
provider. Consts stay exported (browser `catalog` subpath, UI defaults, tests) — they are the data
the default contribution is made from, no longer the enforcement point.

## Engine
`createMediaDispatchEngine({ registry, httpClient }, { catalog? })`: model/provider validation reads
`catalog` (default: the static functions, so existing callers are unchanged). A `MediaProviderRegistry`
is both the `registry` and the `catalog`. The `custom-image` override path is untouched.

## Plugin loader (Tovu — `features/media-generation/media-provider-registry.ts`)
Mirrors the mail adapters (`features/agent-plugins/mail-adapter-registry.ts`) but on the shared
`defineProviderContribution({ contract: 'media', filename: 'tovu-media-providers.json' })`:
`{ schemaVersion: 1, providers: [{ id, module, label? }] }`; `module` is a contained `.mjs` whose
default export is a `MediaProviderContribution`. Same trust gates (active plugin, bundled digest,
contained path). Descriptor `id` must equal `mediaProviderRegistryId(provider.id)`. Every fault is a
refusal line logged once, never a throw. Plugins never import each other or core vendor code; they
get guarded HTTP via the engine's `RenderContext.httpClient` like the builtins.

## Composition — build ONCE
`createSiteRouteDeps` / `app.ts` call `loadMediaProviderRegistry({ workspaceId }, { loadContributions })`
once and put `mediaProviderRegistry` on `RouteDeps`. `defaultGenerateMedia` reuses it (only the
engine — a cheap closure — is per call, because credentials are resolved per call).

## Tool model enum from the live registry
`agent-tools.ts` exports `buildMediaGenerationAgentToolCatalog({ imageModelIds })` and
`imageModelIdsFrom({ catalog })` (integrated providers' image models, catalogue order). The static
`mediaGenerationAgentToolCatalog`/`IMAGE_MODEL_IDS` remain as the builtin-only projection for
metadata/manifest code that runs with no deps. `buildMediaGenerationRegistrations(deps)` builds the
catalog + validation enum from `deps.mediaProviderRegistry`, so a plugin model is advertised and
accepted. `findMediaModel`/`findProvider` calls in the tool become `registry.findModel/findProvider`.

## Credentials — unchanged
Saved workspace credential first, env fallback (`PROVIDER_CREDENTIAL_ENV_VARS`, builtins only) second.
Plugin vendors get saved credentials only (no env names are trusted from plugin data). Adapters
receive only the pre-resolved `ProviderCredentials` for their own provider; the registry stores no
secrets. Credential rows keep the public id.

## Migration of existing callers
| caller | change |
|---|---|
| Tovu `media-generation/tool-registrations.ts` | per-call registry → `deps.mediaProviderRegistry`; catalog lookups via registry |
| Tovu `agent-tools.ts` | enum builder from catalog; static export kept for builtin projection |
| Tovu `deps.ts`, `app.ts`, `routes/types.ts` | one `mediaProviderRegistry` field, built at composition |
| Jini `createBuiltinVendorAdapterRegistry`, `mediaVendorRegistry` | kept (deprecated) for API compat; not used by Tovu any more |
| `providers-tools.ts` (provider listing) | follow-up lot if time: list from the registry |
Saved settings: none change — public ids and credential keys are untouched.

## Lots
J1 registry + builtin contribution + tests · J2 engine `catalog` option + tests ·
T1 plugin loader + tests · T2 composition + tool wiring + enum + tests · T3 providers-tools listing.

## Risks
- Plugin activation after boot needs a restart to appear (registry is built once). Accepted; same
  trade every build-once registry makes. Refusals are logged at boot.
- Hyphen→underscore key mapping could collide (`a-b` vs `a_b`) — the registry's duplicate refusal
  catches it; builtins have no such pair (test asserts).
- A plugin model id equal to a builtin id is refused (validate), so a plugin cannot hijack
  `gpt-image-2` routing.
- Plugin `.mjs` runs in-process: identical exposure to mail adapters, same digest gate.
- Default-model order must not shift (test pins `IMAGE_MODEL_IDS` equality builtin vs registry).
