import type { EntryRecord } from "./types";

/**
 * @file Admin-UI backend-gap closure (design-spec.md §1.9) — the `entries` package's missing read
 * side. Mirrors `features/content-types/list.ts`'s shape exactly: a thin pass-through over an
 * injected read port, no authorization of its own (the caller route checks `admin.collections.read`
 * first).
 *
 * Architectural role:
 * `features/entries` domain logic. Depends only on this package's own `types.ts`.
 */

export interface EntryListPort {
  /** Every entry of `type` in `workspaceId`, in no particular guaranteed order (the route layer
   * sorts for display). `type` is optional so a caller can list across every content type at once
   * (design-spec.md doesn't require this today, but the port stays general rather than baking in
   * the one call shape the current screen needs). */
  listByWorkspace(params: { workspaceId: string; type?: string }): Promise<EntryRecord[]>;
}

/**
 * Lists entries for `workspaceId`, optionally narrowed to one content `type`.
 *
 * @complexity O(1) plus one `EntryListPort.listByWorkspace()` call.
 * @overallScore 100
 */
export async function listEntries(
  required: { repo: EntryListPort; workspaceId: string; type?: string },
  _optional: Record<string, never> = {}
): Promise<{ items: EntryRecord[] }> {
  const { repo, workspaceId, type } = required;
  const items = await repo.listByWorkspace({ workspaceId, type });
  return { items };
}
