import type { AdminContentType, AdminEntry } from "@/lib/api";

/**
 * @file What `use-collection-entry-editor.hooks.ts` needs from the outside world, as an interface
 * rather than a direct `lib/api` import. Follows the `useX(dependencies)` / `useWiredX()` pair
 * documented in `development/docs/architecture/wired-hooks-convention.md`.
 */
export interface CollectionEntryEditorPort {
  listContentTypes(): Promise<{ items: AdminContentType[] }>;
  listEntries(options: { type?: string }, optional?: Record<string, never>): Promise<{ items: AdminEntry[] }>;
  updateEntry(
    required: { target: { id: string; expectedVersion: number }; patch: { title?: string; fieldsJson?: unknown; bodyJson?: unknown } },
    optional?: Record<string, never>
  ): Promise<{ entry: AdminEntry }>;
  createEntry(
    required: { input: { type: string; slug: string; title: string }; options: { fieldsJson?: unknown; bodyJson?: unknown } },
    optional?: Record<string, never>
  ): Promise<{ entry: AdminEntry }>;
  entryLifecycle(input: {
    id: string;
    op: "publish" | "unpublish";
    expectedVersion: number;
  }, optional?: Record<string, never>): Promise<{ entry: AdminEntry }>;
}
