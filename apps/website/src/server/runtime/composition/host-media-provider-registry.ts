import {
  buildOpenAIImageUrl, builtinMediaProviderContributions, bytesFromOpenAICompatibleData, catalogMediaProviderContribution,
  createMediaProviderRegistry, createRawBytesParser, dispatchVendorRequest, jsonPostInit, parseOpenAICompatibleJson,
  requireApiKey, sniffImageExt, standardImageAspectFor,
  type MediaProviderContribution, type MediaProviderRegistry, type RenderContext,
} from "@jini-ai/integrations/media-providers";
import { createXaiMediaContribution, type XaiMediaKit } from "@jini-ai/provider-plugins/xai/media";

/**
 * The dispatch helpers the xAI vendor plugin is built from. Why injected here: a provider plugin may import
 * only core and protocol, so the host binds the media-dispatch helpers from `@jini-ai/integrations`.
 */
const XAI_MEDIA_KIT: XaiMediaKit<RenderContext, MediaProviderContribution> = {
  requireApiKey, createRawBytesParser, jsonPostInit, buildOpenAIImageUrl, parseOpenAICompatibleJson,
  bytesFromOpenAICompatibleData, sniffImageExt, standardImageAspectFor, dispatchVendorRequest, catalogMediaProviderContribution,
};

/**
 * The host's media-provider registry: Jini's built-in vendors plus the xAI vendor plugin's `media`
 * contribution. Why here: the engine no longer ships Grok, so Tovu keeps Grok availability by contributing
 * it at composition (the one seam every registry in this host is built through).
 * @returns A fresh registry; built-in registration throws on a malformed or duplicate contribution.
 * @complexity O(p + m) over providers and models.
 */
export function createHostMediaProviderRegistry(_required: Record<string, never> = {}): MediaProviderRegistry {
  return createMediaProviderRegistry({}, { contributions: [...builtinMediaProviderContributions(), createXaiMediaContribution({ kit: XAI_MEDIA_KIT })] });
}
