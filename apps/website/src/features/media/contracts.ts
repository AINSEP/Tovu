/**
 * Hands one asset's removal to whoever owns removal in this composition.
 *
 * Structurally typed ON PURPOSE — this file imports nothing from `features/trash`, exactly as
 * `post.ts`'s `RemovePostFn` and the comments write-service's `RemoveCommentFn` do not. The
 * composition root binds the real implementation, already bound to this domain's entity type.
 */
export type RemoveMediaFn = (required: {
  workspaceId: string;
  id: string;
  display: { title: string; subtitle?: string | null };
  at: string;
  expectedVersion: number | null;
  actor: { principalId: string; pluginId?: string | null };
}) => Promise<{ ok: true; version: number | null } | { ok: false; reason: "not-found" | "version-changed" }>;

