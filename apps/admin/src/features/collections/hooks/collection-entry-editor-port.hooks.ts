import type { AdminContentType, AdminEntry, AdminTaxonomyWithTerms } from "../../../lib/api";

/**
 * @file What `use-collection-entry-editor.hooks.ts` needs from the outside world, as an interface
 * rather than a direct `lib/api` import. Follows the `useX(dependencies)` / `useWiredX()` pair
 * documented in `development/docs/architecture/wired-hooks-convention.md`.
 */
export interface CollectionEntryEditorPort {
  listContentTypes(): Promise<{ items: AdminContentType[] }>;
  listEntries(options: { type?: string }): Promise<{ items: AdminEntry[] }>;
  listTaxonomies(): Promise<{ items: AdminTaxonomyWithTerms[] }>;
  updateEntry(
    target: { id: string; expectedVersion: number },
    patch: { title?: string; fieldsJson?: unknown; bodyJson?: unknown }
  ): Promise<{ entry: AdminEntry }>;
  createEntry(
    input: { type: string; slug: string; title: string },
    options: { fieldsJson?: unknown; bodyJson?: unknown }
  ): Promise<{ entry: AdminEntry }>;
  entryLifecycle(input: {
    id: string;
    op: "publish" | "unpublish";
    expectedVersion: number;
  }): Promise<{ entry: AdminEntry }>;
}
