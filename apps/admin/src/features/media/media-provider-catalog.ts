import {
  IMAGE_MODELS,
  MEDIA_PROVIDERS,
  VIDEO_MODELS,
  AUDIO_MODELS_BY_KIND,
} from "@jini-ai/integrations/media-providers/catalog";
import type { MediaProviderOption } from "@jini-ai/ui";

/**
 * @file The provider roster the Media → "Media providers" tab renders, adapted from the real
 * vendor catalogue in `@jini-ai/integrations/media-providers`.
 *
 * ## Why not `@jini-ai/ui`'s own `DEFAULT_MEDIA_PROVIDER_CATALOG`
 *
 * That one is a small curated sample the package ships as a starting point, and it spells provider
 * ids differently from the engine that will eventually consume these credentials:
 * `xai-grok-imagine` vs `grok`, `nano-banana` vs `nanobanana`, `fal-ai` vs `fal`, `leonardo-ai` vs
 * `leonardo`, `custom-image-api` vs `custom-image`, `volcengine-ark` vs `volcengine`. The dispatch
 * engine and `PROVIDER_CREDENTIAL_ENV_VARS` both key off the LATTER, so a credential stored under a
 * UI-spelled id would be saved successfully and then never resolve at generation time — a silent
 * failure with no error anywhere. Keying the UI off the engine's own catalogue makes that
 * divergence unrepresentable rather than merely documented; the server rejects the UI spellings
 * too (`src/media/provider-credential-store.ts`), so both ends agree.
 *
 * ## Why the import is `/catalog` and not `/media-providers`
 *
 * The main `@jini-ai/integrations/media-providers` entry is a node-runtime barrel — it statically
 * reaches `node:crypto`/`node:fs`/`node:path`, `node:dns`, and `undici` through the dispatch
 * engine. `./media-providers/catalog` exists precisely so a browser bundle can take the vendor list
 * without any of that. Importing from the main entry here would drag the whole generation engine
 * into the admin SPA.
 */

/** Providers the operator can actually configure a credential for.
 *
 * Two exclusions, both deliberate:
 * - `settingsVisible === false` — the vendor's own catalogue entry says it has no settings surface
 *   (`hyperframes` is a local CLI renderer, not a REST endpoint with an API key).
 * - `stub` — the deterministic local placeholder renderer. It takes no credential and exists for
 *   tests; showing it as a configurable vendor would be noise.
 *
 * Everything else stays, INCLUDING vendors with `integrated: false`. Those are real services with
 * real API keys whose request-shape this workspace has not ported yet; an operator can legitimately
 * store the key ahead of that, and hiding them would misrepresent the catalogue as smaller than it
 * is. */
function isConfigurable(provider: (typeof MEDIA_PROVIDERS)[number]): boolean {
  return provider.settingsVisible !== false && provider.id !== "stub";
}

/** Model ids this provider advertises across every surface, de-duplicated and stably ordered.
 *
 * `MediaProviderOption.models` is a flat list with no surface dimension, so image, video, and audio
 * models for one vendor collapse into a single picker. That is the component's shape, not a lossy
 * choice made here — and it is why the list is de-duplicated: a model offered on two surfaces would
 * otherwise appear twice in the dropdown.
 *
 * @complexity O(m) over the catalogue's models, once per provider at module load. */
function modelIdsFor(providerId: string): string[] {
  const everyModel = [...IMAGE_MODELS, ...VIDEO_MODELS, ...Object.values(AUDIO_MODELS_BY_KIND).flat()];
  return [...new Set(everyModel.filter((model) => model.provider === providerId).map((model) => model.id))];
}

/**
 * The real vendor roster, in `MediaProvidersTab`'s own option shape.
 *
 * Computed once at module load: `MEDIA_PROVIDERS` is a frozen `as const` literal, so there is
 * nothing to recompute and a stable array identity keeps the tab from re-rendering on it.
 */
/** Owner-directed (2026-08-24): "Custom Media API" — the local/self-hosted-friendly, no-vendor-
 *  lock-in option — should always be the first card on this tab, not wherever the configured-
 *  first/alphabetical sort (`sortProvidersByConfigured`) happens to place it. Passed straight
 *  through to `MediaProvidersTab`'s `pinnedProviderIds` prop. */
export const PINNED_MEDIA_PROVIDER_IDS: readonly string[] = ["custom-image"];

export const MEDIA_PROVIDER_CATALOG: readonly MediaProviderOption[] = MEDIA_PROVIDERS.filter(isConfigurable).map(
  (provider) => {
    const models = modelIdsFor(provider.id);
    return {
      id: provider.id,
      label: provider.label,
      ...(provider.defaultBaseUrl ? { defaultBaseUrl: provider.defaultBaseUrl } : {}),
      ...(models.length > 0 ? { models } : {}),
    };
  }
);
