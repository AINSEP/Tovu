import type { ContentDb } from "../infra/sqlite/content-db";
import { workspaces } from "../infra/db/schema";
import type { WorkspaceRecord } from "../features/workspace";
import { SiteCorruptError, ValidationError } from "./errors";

/**
 * @file SPEC-003 C-005 — `resolveWorkspace`, the single source of truth for resolving which
 * workspace row a content.db's boot/serve path should use.
 *
 * Purpose:
 * Both `server/deps.ts`'s changed `createSqliteRouteDeps` default path (CIC U-001) and
 * `site-dir/boot-site-dir.ts`'s `serve` boot path (BR-05 step 6) call this instead of
 * re-implementing the same workspace selector twice.
 *
 * How it relates to the project:
 * A content.db can hold more than one workspace row (ADR-007: workspaces are a real multi-site
 * tenancy primitive; SPEC-044's admin CRUD lets an operator create additional ones). When a
 * caller doesn't name one explicitly, the oldest row (by `createdAt`) is the default — this keeps
 * every existing single-workspace install byte-identical (there's only one candidate row) while
 * letting an install that has grown a second workspace keep booting instead of refusing to start
 * (B1 fix — a >1-row content.db used to be treated as corruption; it no longer is).
 *
 * Architectural role:
 * `site-dir` domain logic. Pure read (one SELECT), no imports from `cli/**` or `express`.
 */

export interface ResolveWorkspaceRequired {
  db: ContentDb;
}

export interface ResolveWorkspaceOptions {
  /** Resolve this exact workspace id instead of the default (oldest) — `tovu serve --workspace <id>`. */
  workspaceId?: string;
}

/**
 * Resolve which workspace row a content.db's boot/serve path should use.
 *
 * @param required.db - an already-open content.db handle.
 * @param options.workspaceId - when supplied, resolve exactly this workspace id; otherwise the
 *   oldest row (by `createdAt`, ties broken by `id`) is returned.
 * @returns the resolved `WorkspaceRecord`.
 * @throws {SiteCorruptError} the `workspaces` table has zero rows.
 * @throws {ValidationError} `options.workspaceId` was supplied but matches no row.
 * @complexity O(n log n) in the row count, only to break ties deterministically when no id is
 *   given — a real install has a handful of workspaces at most, never a caller-controlled
 *   collection.
 * @overallScore 100
 */
export function resolveWorkspace(required: ResolveWorkspaceRequired, options: ResolveWorkspaceOptions = {}): WorkspaceRecord {
  const { db } = required;
  const rows = db.select().from(workspaces).all();

  if (rows.length === 0) {
    throw new SiteCorruptError("resolveWorkspace: the content.db has zero workspace rows (expected at least one)");
  }

  if (options.workspaceId !== undefined) {
    const match = rows.find((row) => row.id === options.workspaceId);
    if (!match) {
      throw new ValidationError(`resolveWorkspace: no workspace with id "${options.workspaceId}" exists in this content.db`);
    }
    return match;
  }

  if (rows.length === 1) {
    return rows[0];
  }

  const [primary, ...rest] = [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  // eslint-disable-next-line no-console
  console.warn(
    `resolveWorkspace: content.db has ${rows.length} workspace rows; defaulting to the oldest (id="${primary.id}"). ` +
      `Pass --workspace <id> (tovu serve) to pick a different one — other ids: ${rest.map((w) => w.id).join(", ")}.`
  );
  return primary;
}
