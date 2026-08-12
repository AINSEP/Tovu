import type { AdminWorkspace } from "../../../lib/api";

/**
 * @file What `use-workspace.hooks.ts` needs from the outside world, as an interface rather than a
 * direct `lib/api` import. Follows the `useX(dependencies)` / `useWiredX()` pair documented on
 * `assistant-chats-port.hooks.ts` (the canonical reference in this workspace) and the shape
 * `redirects-port.hooks.ts` uses for a single-hook feature.
 *
 * `describeApiError` is deliberately NOT part of this port — a pure error-message rule with no
 * I/O, imported directly per the pattern's own carve-out (see `redirects-port.hooks.ts`'s
 * identical note).
 */
export interface WorkspacePort {
  getWorkspace(): Promise<{ workspace: AdminWorkspace }>;
  updateWorkspace(patch: { name?: string; slug?: string }): Promise<{ workspace: AdminWorkspace }>;
}
