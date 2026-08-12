import type { AdminContentType } from "../../../lib/api";

/**
 * @file What `use-collections.hooks.ts` needs from the outside world, as an interface rather than a
 * direct `lib/api` import. Follows the `useX(dependencies)` / `useWiredX()` pair documented in
 * `development/docs/architecture/wired-hooks-convention.md`.
 */
export interface CollectionsPort {
  listContentTypes(): Promise<{ items: AdminContentType[] }>;
  contentTypeLifecycle(input: {
    key: string;
    op: "deprecate" | "reactivate" | "tombstone";
    expectedVersion: number;
  }): Promise<{ contentType: AdminContentType }>;
}
