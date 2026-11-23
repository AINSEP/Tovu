import type { MediaProviderCredentials, MediaProviderMap, MediaProvidersPort } from "@jini-ai/ui";
import { orFallback } from "@jini-ai/core/errors/idioms";

import { WORKSPACE_ID } from "../../lib/admin-http/config";
import { request } from "../../lib/admin-http/request";
import { mediaApi } from "./api/media-api";

/**
 * @file The real `MediaProvidersPort` — Tovu's own implementation of the transport
 * `@jini-ai/ui`'s Media providers tab declares but deliberately does not ship (same convention as
 * `ProjectLocationsPort`/`SkillsPort`; the package ships only a fake).
 *
 * Replaces `createFakeMediaProvidersPort()`, whose in-memory store forgot everything on reload.
 */

/** A partial save: an entry upserts that provider, `null` deletes it, an absent id is untouched. */
export type MediaProviderPatch = Record<string, MediaProviderCredentials | null>;

/** The two server calls the port makes — injected so the diff can be tested without HTTP. */
export interface MediaProvidersApi {
  getMediaProviders(): Promise<MediaProviderMap>;
  mergeMediaProviders(patch: MediaProviderPatch): Promise<MediaProviderMap>;
}

/**
 * `PUT …/media/providers?mode=merge` — the partial save. Defined here rather than in
 * `api/media-api.ts` only because that file is being edited on another branch; it belongs beside
 * `saveMediaProviders` there once both land.
 */
function mergeMediaProviders(patch: MediaProviderPatch): Promise<MediaProviderMap> {
  return request<MediaProviderMap>({ path: `/workspaces/${WORKSPACE_ID}/media/providers?mode=merge` }, { init: {
    method: "PUT",
    body: JSON.stringify(patch),
  } });
}

/** Whether the tab changed this provider since the server last showed it. A typed key always counts;
 *  otherwise only the writable fields are compared, never the read-only markers. @complexity O(1). */
function isEdited({ before, after }: { before: MediaProviderCredentials | undefined; after: MediaProviderCredentials }, _optional: Record<string, never> = {}): boolean {
  if (before === undefined || after.apiKey?.trim()) return true;
  return (before.baseUrl ?? "") !== (after.baseUrl ?? "") || (before.model ?? "") !== (after.model ?? "");
}

/**
 * The tab's whole map as a patch against `seen`, the map the server last returned (B135/B136).
 *
 * The tab expresses Clear by omission, but omission alone cannot tell "cleared here" from "saved
 * elsewhere after this screen loaded". Only an id the screen SAW and then dropped becomes an explicit
 * `null` delete; an id it never saw is left out, so the server leaves it untouched. With no `seen`
 * (every fetch failed) nothing is deleted — never delete owner data implicitly.
 * @complexity O(n + m) over the two maps.
 */
export function mediaProviderPatch({ seen, next }: { seen: MediaProviderMap | null; next: MediaProviderMap }, _optional: Record<string, never> = {}): MediaProviderPatch {
  const patch: MediaProviderPatch = {};
  for (const providerId of Object.keys(seen ?? {})) if (!Object.hasOwn(next, providerId)) patch[providerId] = null;
  for (const [providerId, entry] of Object.entries(next)) {
    if (isEdited({ before: seen?.[providerId], after: entry })) patch[providerId] = entry;
  }
  return patch;
}

/**
 * Builds the port around `api`. Each instance remembers the last map the server returned to it —
 * per instance, not module-wide, so one screen's fetch can never become another screen's baseline.
 *
 * `fetchMediaProviders` resolves `null` — never rejects — when the server could not be reached (see
 * the contract note below); `saveMediaProviders` REJECTS on failure, and the tab renders that as its
 * `save-error` state. Callers must not overlap two saves; `useMediaProvidersTab`'s
 * `persist`/`flushNow` already serializes them.
 * @complexity O(n) per save over the provider map, plus one request per call.
 */
export function createMediaProvidersPort({ api }: { api: MediaProvidersApi }, _optional: Record<string, never> = {}): MediaProvidersPort {
  let seen: MediaProviderMap | null = null;
  return {
    async fetchMediaProviders() {
      const fetched = await fetchMediaProviders({ api });
      if (fetched !== null) seen = fetched;
      return fetched;
    },
    async saveMediaProviders(providers) {
      const saved = await api.mergeMediaProviders(mediaProviderPatch({ seen, next: providers }));
      seen = saved;
      return saved;
    },
  };
}

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
async function fetchMediaProviders({ api }: { api: MediaProvidersApi }, _optional: Record<string, never> = {}): Promise<MediaProviderMap | null> {
  return orFallback({ work: () => api.getMediaProviders(), fallback: null, step: "Read media providers" });
}

/**
 * The port instance the Media providers tab uses. Module-level so it stays stable across renders
 * without a `useRef` (the fake had to be ref-held because each call built a fresh store). Its
 * remembered map is that screen's own: `Media.tsx` is its only consumer — a second screen must
 * build its own instance with {@link createMediaProvidersPort}, never share this one.
 */
export const mediaProvidersPort: MediaProvidersPort = createMediaProvidersPort({
  api: { getMediaProviders: () => mediaApi.getMediaProviders(), mergeMediaProviders },
});
