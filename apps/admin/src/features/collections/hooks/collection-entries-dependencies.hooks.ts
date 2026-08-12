import { api, type AdminContentType, type AdminEntry } from "../../../lib/api";
import type { CollectionEntriesPort } from "./collection-entries-port.hooks";

/**
 * @file The only place `use-collection-entries.hooks.ts` reaches `lib/api` — see `collection-
 * entries-port.hooks.ts` for why the split exists.
 */

/** The live implementation, as a module-level singleton. */
export const defaultCollectionEntriesPort: CollectionEntriesPort = {
  listContentTypes: () => api.listContentTypes(),
  listEntries: (options) => api.listEntries(options),
};

/** Seed state for {@link createFakeCollectionEntriesPort}. */
export interface FakeCollectionEntriesPortOptions {
  types?: AdminContentType[];
  entries?: AdminEntry[];
  /** When set, `listContentTypes()` rejects with this instead of resolving — for
   *  load-failure tests. */
  listContentTypesError?: Error;
  /** When set, `listEntries()` rejects with this instead of resolving — for load-failure
   *  tests. */
  listEntriesError?: Error;
}

/**
 * An in-memory {@link CollectionEntriesPort} for tests — "every port gets a fake" (see
 * `assistant-chats-dependencies.hooks.ts`). `listEntries` filters its seeded rows by `options.type`
 * itself, matching the real route's own filtering, so a test can seed entries across several
 * content types and still assert only the requested one comes back.
 */
export function createFakeCollectionEntriesPort(options: FakeCollectionEntriesPortOptions = {}): CollectionEntriesPort {
  const types = options.types ?? [];
  const entries = options.entries ?? [];

  return {
    async listContentTypes() {
      if (options.listContentTypesError) throw options.listContentTypesError;
      return { items: types };
    },
    async listEntries(queryOptions) {
      if (options.listEntriesError) throw options.listEntriesError;
      return { items: queryOptions.type ? entries.filter((e) => e.type === queryOptions.type) : entries };
    },
  };
}
