import {
  builtinMediaProviderContributions,
  createMediaProviderRegistry,
  createMediaWire,
  mediaProviderRegistryId,
  PROVIDER_CREDENTIAL_ENV_VARS,
  type MediaProviderContribution,
  type MediaProviderRegistry,
} from "@jini-ai/integrations/media-providers";
import { createXaiMediaContribution, XAI_MEDIA_PROVIDER_ALIASES, XAI_MEDIA_PROVIDER_ID } from "@jini-ai/provider-plugins/xai/media";

/**
 * @file The host's media-generation vendor set: the engine's built-in vendors plus the provider
 * plugins this host mounts by default (xAI moved out of the engine's built-ins), with the public-id
 * aliases and environment-key fallbacks those plugins used to get for free. This is the ONE registry
 * factory the host builds: xAI is registered exactly once, under its persisted id `grok`, so a sealed
 * `grok` credential row keeps resolving; `xai-grok-imagine` is only a lookup alias.
 */

/** Alternate public provider ids accepted on lookups (alias -> registered id), owned by each plugin. */
export const MEDIA_PROVIDER_ALIASES: Readonly<Record<string, string>> = { ...XAI_MEDIA_PROVIDER_ALIASES };

/** The env-key fallback table: the engine's rows plus each host-mounted plugin vendor's own key. */
export const MEDIA_PROVIDER_ENV_VARS: Readonly<Record<string, readonly string[]>> = {
  ...PROVIDER_CREDENTIAL_ENV_VARS,
  [XAI_MEDIA_PROVIDER_ID]: ["XAI_API_KEY"],
};

/** Built-in contributions followed by the host-mounted plugin contributions. @complexity O(p + m). */
export function hostMediaProviderContributions(_required: Record<string, never> = {}, _optional: Record<string, never> = {}): MediaProviderContribution[] {
  return [...builtinMediaProviderContributions(), createXaiMediaContribution({ mediaWire: createMediaWire() })];
}

/** A fresh registry over {@link hostMediaProviderContributions}, resolving {@link MEDIA_PROVIDER_ALIASES}. */
export function createHostMediaProviderRegistry(_required: Record<string, never> = {}, _optional: Record<string, never> = {}): MediaProviderRegistry {
  return createMediaProviderRegistry({}, { contributions: hostMediaProviderContributions(), aliases: MEDIA_PROVIDER_ALIASES });
}

/** The registry key for a public id, legacy aliases included. @complexity O(n) in id length. */
export function hostMediaProviderRegistryId({ id }: { id: string }, _optional: Record<string, never> = {}): string {
  return mediaProviderRegistryId({ id }, { aliases: MEDIA_PROVIDER_ALIASES });
}
