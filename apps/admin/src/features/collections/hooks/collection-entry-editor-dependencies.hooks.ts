import { api, type AdminContentType, type AdminEntry, type AdminTaxonomyWithTerms } from "../../../lib/api";
import type { CollectionEntryEditorPort } from "./collection-entry-editor-port.hooks";

/**
 * @file The only place `use-collection-entry-editor.hooks.ts` reaches `lib/api` — see
 * `collection-entry-editor-port.hooks.ts` for why the split exists.
 */

/** The live implementation, as a module-level singleton. */
export const defaultCollectionEntryEditorPort: CollectionEntryEditorPort = {
  listContentTypes: () => api.listContentTypes(),
  listEntries: (options) => api.listEntries(options),
  listTaxonomies: () => api.listTaxonomies(),
  updateEntry: (target, patch) => api.updateEntry(target, patch),
  createEntry: (input, options) => api.createEntry(input, options),
  entryLifecycle: (input) => api.entryLifecycle(input),
};

function fakeEntry(overrides: Partial<AdminEntry> = {}): AdminEntry {
  return {
    id: overrides.id ?? "fake-entry-1",
    workspaceId: "fake-ws",
    type: "recipe",
    slug: "untitled",
    status: "draft",
    title: "Untitled",
    bodyJson: null,
    fieldsJson: { ext: { site: {} } },
    publishedAt: null,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    version: 1,
    ...overrides,
  };
}

/** Seed state for {@link createFakeCollectionEntryEditorPort}. */
export interface FakeCollectionEntryEditorPortOptions {
  types?: AdminContentType[];
  entries?: AdminEntry[];
  taxonomies?: AdminTaxonomyWithTerms[];
  /** When set, `listContentTypes()` rejects with this instead of resolving — for
   *  load-failure tests. */
  listContentTypesError?: Error;
  /** When set, `updateEntry()`/`createEntry()` rejects with this instead of resolving — for
   *  save-failure tests. */
  saveError?: Error;
  /** When set, `entryLifecycle()` rejects with this instead of resolving — for
   *  lifecycle-failure tests. */
  lifecycleError?: Error;
}

/**
 * An in-memory {@link CollectionEntryEditorPort} for tests — "every port gets a fake" (see
 * `assistant-chats-dependencies.hooks.ts`). `listTaxonomies` never rejects on its own (the real
 * hook already tolerates a failing taxonomy load via `.catch(() => ({ items: [] }))` at the call
 * site, so the port itself has no failure mode to simulate for it).
 */
export function createFakeCollectionEntryEditorPort(
  options: FakeCollectionEntryEditorPortOptions = {}
): CollectionEntryEditorPort & {
  /** Every entry currently in the fake's store, in list order. */
  readonly entries: AdminEntry[];
} {
  const types = options.types ?? [];
  const entries = [...(options.entries ?? [])];
  const taxonomies = options.taxonomies ?? [];

  return {
    entries,
    async listContentTypes() {
      if (options.listContentTypesError) throw options.listContentTypesError;
      return { items: types };
    },
    async listEntries(queryOptions) {
      return { items: queryOptions.type ? entries.filter((e) => e.type === queryOptions.type) : entries };
    },
    async listTaxonomies() {
      return { items: taxonomies };
    },
    async updateEntry({ id, expectedVersion }, patch) {
      if (options.saveError) throw options.saveError;
      const index = entries.findIndex((e) => e.id === id);
      if (index < 0) throw new Error(`fake entry not found: ${id}`);
      const updated = { ...entries[index]!, ...patch, version: expectedVersion + 1 } as AdminEntry;
      entries[index] = updated;
      return { entry: updated };
    },
    async createEntry(input, createOptions) {
      if (options.saveError) throw options.saveError;
      const created = fakeEntry({
        id: `fake-entry-${entries.length + 1}`,
        type: input.type,
        slug: input.slug,
        title: input.title,
        ...createOptions,
      });
      entries.push(created);
      return { entry: created };
    },
    async entryLifecycle({ id, op, expectedVersion }) {
      if (options.lifecycleError) throw options.lifecycleError;
      const index = entries.findIndex((e) => e.id === id);
      if (index < 0) throw new Error(`fake entry not found: ${id}`);
      const updated: AdminEntry = {
        ...entries[index]!,
        status: op === "publish" ? "published" : "unpublished",
        version: expectedVersion + 1,
      };
      entries[index] = updated;
      return { entry: updated };
    },
  };
}
