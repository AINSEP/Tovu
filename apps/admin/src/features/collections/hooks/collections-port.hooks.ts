import type { AdminContentType, ContentTypeLifecycleOp } from "@/lib/api";

/**
 * @file What `use-collections.hooks.ts` needs from the outside world, as an interface rather than a
 * direct `lib/api` import. Follows the `useX(dependencies)` / `useWiredX()` pair documented in
 * `development/docs/architecture/wired-hooks-convention.md`.
 */
export interface CollectionsPort {
  listContentTypes(): Promise<{ items: AdminContentType[] }>;
  contentTypeLifecycle(input: {
    key: string;
    op: ContentTypeLifecycleOp;
    expectedVersion: number;
  }): Promise<{ contentType: AdminContentType }>;
}
