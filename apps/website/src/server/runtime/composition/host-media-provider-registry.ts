import { builtinMediaProviderContributions, createMediaProviderRegistry, type MediaProviderRegistry } from "@jini-ai/integrations/media-providers";
import { createXaiMediaContribution } from "@jini-ai/provider-plugins/xai/media";

/**
 * The host's media-provider registry: Jini's built-in vendors plus the xAI vendor plugin's `media`
 * contribution. Why here: the engine no longer ships Grok, so Tovu keeps Grok availability by contributing
 * it at composition (the one seam every registry in this host is built through).
 * @returns A fresh registry; built-in registration throws on a malformed or duplicate contribution.
 * @complexity O(p + m) over providers and models.
 */
export function createHostMediaProviderRegistry(_required: Record<string, never> = {}): MediaProviderRegistry {
  return createMediaProviderRegistry({}, { contributions: [...builtinMediaProviderContributions(), createXaiMediaContribution()] });
}
