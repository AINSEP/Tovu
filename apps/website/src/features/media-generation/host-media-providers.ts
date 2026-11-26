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

import type { HttpClientPort } from "@jini-ai/core/primitives";
import { createMediaDispatchEngine, type MediaGenerationRequest, type MediaGenerationResult, type ProviderCredentials } from "@jini-ai/integrations/media-providers";
import { nodeMediaGuardedFetch } from "@jini-ai/integrations/media-providers/node";


/** {@link MediaGenerationToolDeps.generateMedia}'s real, production implementation — a fresh engine
 *  per call because credentials are resolved fresh per call too (a rotated key must never reuse a
 *  stale boot-time singleton's credentials). `createMediaDispatchEngine` itself does no I/O to
 *  construct — only `.generate()` does. The registry is the composition-built one (no per-call
 *  rebuild since 2026-10-21) and is also the engine's catalogue, so plugin models validate; the host's
 *  guarded HTTP client serves both generation and asset downloads.
 *  @complexity O(1) setup, plus generation I/O. */
export async function defaultGenerateMedia(
  { request, credentials, options }: {
    request: MediaGenerationRequest;
    credentials: ProviderCredentials;
    options: { providerId: string; allowStubFallback: boolean; httpClient: HttpClientPort; registry: MediaProviderRegistry };
  },
  optional: { signal?: AbortSignal } = {}
): Promise<MediaGenerationResult> {
  const { registry } = options;
  const engine = createMediaDispatchEngine({ registry, httpClient: options.httpClient, guardedFetch: nodeMediaGuardedFetch }, {
    catalog: registry,
    credentials: { [options.providerId]: credentials },
    allowStubFallback: options.allowStubFallback,
  });
  const { surface, model, ...optionalRequest } = request;
  return engine.generate(
    { surface, model },
    { ...optionalRequest, ...(optional.signal ? { signal: optional.signal } : {}) },
  );
}


/**
 * Builds the "no credential configured" rejection for `providerId` — NOT a shape problem (retrying
 * the identical input can never fix it), so this is a plain `Error`, never schema-decorated, pointing
 * the caller at the one place a human can actually fix it. Names the vendor's own catalogue label
 * (e.g. "OpenAI", "Nano Banana") so the message stays meaningful for any provider, not just the one
 * this tool used to hardcode.
 *
 * @complexity O(1).
 */
export function buildNoCredentialError({ providerId, registry }: { providerId: string; registry: MediaProviderRegistry }, _optional = {}): Error {
  const label = registry.findProvider({ id: providerId })?.label ?? providerId;
  const envCandidates = MEDIA_PROVIDER_ENV_VARS[providerId] ?? [];
  const envNote = envCandidates.length > 0 ? ` (also checked ${envCandidates.join(", ")} in this process's environment — none were set)` : "";
  return new Error(
    `media_generate_asset: no ${label} media-provider credential is configured for this workspace${envNote}. ` +
      "Call credential_save with kind media-provider to open a human key form, or an operator can add one in the admin under Media -> \"Media providers\" (Access Tokens' " +
      "counterpart for generation vendors) then retry this tool once with the same model. " +
      "this will not resolve without that credential being added."
  );
}
