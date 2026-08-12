import type { AdminContentType, AdminEntry } from "../../../lib/api";

/**
 * @file What `use-collection-entries.hooks.ts` needs from the outside world, as an interface rather
 * than a direct `lib/api` import. Follows the `useX(dependencies)` / `useWiredX()` pair documented
 * in `development/docs/architecture/wired-hooks-convention.md`.
 */
export interface CollectionEntriesPort {
  listContentTypes(): Promise<{ items: AdminContentType[] }>;
  listEntries(options: { type?: string }): Promise<{ items: AdminEntry[] }>;
}
