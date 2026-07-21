import type { WorkspaceRecord } from "../../../features/workspace";

/**
 * @file Admin-facing workspace response DTO (SPEC-044, mirrors `admin/users.ts`'s pattern).
 *
 * Purpose:
 * `WorkspaceRecord` has no sensitive fields (unlike `UserRecord.passwordHash`), so this mapper is a
 * near-identity passthrough — kept as its own function anyway (rather than routes returning the raw
 * repo record directly) for the same reason `toAdminUserResponse`/`toAdminRoleResponse` exist: one
 * seam between the persistence shape and the wire shape, so the two can diverge later without
 * touching every route.
 */

/** Admin-facing shape of a workspace. */
export interface AdminWorkspaceResponse {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

/** Serialize a `WorkspaceRecord` to `AdminWorkspaceResponse`. @complexity O(1). @overallScore 100 */
export function toAdminWorkspaceResponse(workspace: WorkspaceRecord): AdminWorkspaceResponse {
  return { id: workspace.id, name: workspace.name, slug: workspace.slug, createdAt: workspace.createdAt };
}
