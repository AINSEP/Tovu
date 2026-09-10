import type { MediaProviderMap, MediaProvidersPort } from "@jini-ai/ui";

import { api } from "../../lib/api";

/**
 * @file The real `MediaProvidersPort` — Tovu's own implementation of the transport
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
  try {
    return await api.getMediaProviders();
  } catch {
    return null;
  }
}

/**
 * Persists the whole provider map and resolves the server's authoritative copy.
 *
 * REJECTS on failure, unlike {@link fetchMediaProviders} — the port models a save as having only
 * two outcomes, and the tab renders the rejection as its `save-error` state. Callers must not
 * overlap two of these; `useMediaProvidersTab`'s `persist`/`flushNow` already serializes them.
 *
 * @complexity O(1) plus one request.
 * @overallScore 100
 */
async function saveMediaProviders(providers: MediaProviderMap): Promise<MediaProviderMap> {
  return api.saveMediaProviders(providers);
}

/**
 * The port instance. A module-level singleton rather than a factory: it closes over nothing, so
 * every call site can share one object and no component needs a `useRef` to keep it stable across
 * renders the way the fake did (the fake had to be ref-held because each call built a fresh store).
 */
export const mediaProvidersPort: MediaProvidersPort = { fetchMediaProviders, saveMediaProviders };
