import type { MediaProviderFields, MediaProviderMap, MediaProviderRowsPort } from "@jini-ai/ui";
import { orFallback } from "@jini-ai/core/errors/idioms";

import { mediaApi } from "./api/media-api";

/**
 * @file The real media-providers port — Tovu's own implementation of the transport
 * `@jini-ai/ui`'s Media providers tab declares but deliberately does not ship (same convention as
 * `ProjectLocationsPort`/`SkillsPort`; the package ships only a fake).
 *
 * Replaces `createFakeMediaProvidersPort()`, whose in-memory store forgot everything on reload.
 */

/**
 * Reads the workspace's stored provider credentials.
 *
 * Resolves `null` — never rejects — when the server could not be reached, because that is what the
 * port's contract requires and `mergeDaemonProviders` treats `null` and `{}` very differently:
 * `null` leaves local edits untouched, while `{}` is a real answer that can legitimately drop stale
 * local markers. Collapsing an unreachable server to `{}` would make a transient network blip read
 * as "the server manages nothing" and wipe edits only `null` protects — the exact failure the
 * contract calls out.
 *
 * The catch is therefore intentionally broad: every failure to obtain an answer is "unreachable",
 * including a 500 or a 403. None of them are evidence about what the server manages, which is the
 * only question this method's return value is allowed to assert.
 *
 * @complexity O(1) plus one request.
 * @overallScore 100
 */
async function fetchMediaProviders(): Promise<MediaProviderMap | null> {
  return orFallback({ work: () => mediaApi.getMediaProviders(), fallback: null, step: "Read media providers" });
}

/**
 * Saves ONE provider's fields (PATCH to its own row) and resolves the server's authoritative map.
 *
 * Per-provider rather than the whole-map `saveMediaProviders`: a whole map from this tab omits any key
 * another window saved since it loaded, and omission deleted it. Naming one provider can never undo a
 * write to another. REJECTS on failure, unlike {@link fetchMediaProviders} — the tab renders the
 * rejection as its `save-error` state; `useMediaProvidersTab` issues one write at a time.
 *
 * @complexity O(1) plus one request.
 */
async function patchProvider({ providerId, fields }: { providerId: string; fields: MediaProviderFields }, _optional: Record<string, never> = {}): Promise<MediaProviderMap> {
  return mediaApi.patchMediaProvider({ providerId, fields });
}

/**
 * Removes exactly one provider's stored credentials (DELETE on its own row) — including a plugin
 * vendor's key whose plugin is no longer in the catalog — and resolves the authoritative map.
 * Rejects on failure, like {@link patchProvider}.
 *
 * @complexity O(1) plus one request.
 */
async function removeProvider({ providerId }: { providerId: string }, _optional: Record<string, never> = {}): Promise<MediaProviderMap> {
  return mediaApi.removeMediaProvider({ providerId });
}

/**
 * The port instance. A module-level singleton rather than a factory: it closes over nothing, so
 * every call site can share one object and no component needs a `useRef` to keep it stable across
 * renders the way the fake did (the fake had to be ref-held because each call built a fresh store).
 */
export const mediaProvidersPort: MediaProviderRowsPort = { fetchMediaProviders, patchProvider, removeProvider };
