import type { ContentKernel } from "./dialect-matrix.js";

/**
 * @file Parent rows a dialect-matrix suite needs before its repo can write (the content schema's
 * real FKs), inserted through the kernel so the same seed runs on SQLite and PGlite. Idempotent.
 */

const SEEDED_AT = "2026-01-01T00:00:00.000Z";

export async function seedWorkspaces(kernel: ContentKernel, ids: readonly string[]): Promise<void> {
  for (const id of ids) {
    await kernel.run((db) =>
      db
        .insertInto("workspaces")
        .values({ id, name: id, slug: id, created_at: SEEDED_AT })
        .onConflict((oc) => oc.doNothing())
        .execute()
    );
  }
}

/** Principals (kind `user`, active) in `workspaceId`, which is seeded too. */
export async function seedPrincipals(kernel: ContentKernel, workspaceId: string, ids: readonly string[]): Promise<void> {
  await seedWorkspaces(kernel, [workspaceId]);
  for (const id of ids) {
    await kernel.run((db) =>
      db
        .insertInto("principals")
        .values({ id, workspace_id: workspaceId, kind: "user", display_name: id, status: "active", created_at: SEEDED_AT })
        .onConflict((oc) => oc.doNothing())
        .execute()
    );
  }
}
