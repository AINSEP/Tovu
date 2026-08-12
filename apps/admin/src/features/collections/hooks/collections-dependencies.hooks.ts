import { api, type AdminContentType } from "../../../lib/api";
import type { CollectionsPort } from "./collections-port.hooks";

/**
 * @file The only place `use-collections.hooks.ts` reaches `lib/api` — see `collections-
 * port.hooks.ts` for why the split exists.
 */

/** The live implementation, as a module-level singleton. */
export const defaultCollectionsPort: CollectionsPort = {
  listContentTypes: () => api.listContentTypes(),
  contentTypeLifecycle: (input) => api.contentTypeLifecycle(input),
};

/** Seed state for {@link createFakeCollectionsPort}. */
export interface FakeCollectionsPortOptions {
  types?: AdminContentType[];
  /** When set, `contentTypeLifecycle()` rejects with this instead of resolving — for
   *  action-failure tests. */
  lifecycleError?: Error;
}

/**
 * An in-memory {@link CollectionsPort} for tests — "every port gets a fake" (see
 * `assistant-chats-dependencies.hooks.ts`). `contentTypeLifecycle` mutates the fake's own store in
 * place, matching the real route's read-your-writes shape (a subsequent `listContentTypes()` sees
 * the update) so a test can drive `load()`'s re-fetch the same way `runLifecycle` does in
 * production.
 */
export function createFakeCollectionsPort(options: FakeCollectionsPortOptions = {}): CollectionsPort & {
  /** Every content type currently in the fake's store, in list order. */
  readonly types: AdminContentType[];
} {
  const types = [...(options.types ?? [])];

  return {
    types,
    async listContentTypes() {
      return { items: [...types] };
    },
    async contentTypeLifecycle({ key, op, expectedVersion }) {
      if (options.lifecycleError) throw options.lifecycleError;
      const index = types.findIndex((t) => t.key === key);
      if (index < 0) throw new Error(`fake content type not found: ${key}`);
      const nextStatus = op === "reactivate" ? "active" : op === "deprecate" ? "deprecated" : "tombstone";
      const updated: AdminContentType = { ...types[index]!, status: nextStatus, version: expectedVersion + 1 };
      types[index] = updated;
      return { contentType: updated };
    },
  };
}
