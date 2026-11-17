/** SPEC-044 (Workspace Administration) — mirrors `apps/website/src/server/inbound/admin-http/http/workspace.ts`'s DTO. */
export interface AdminWorkspace {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}
