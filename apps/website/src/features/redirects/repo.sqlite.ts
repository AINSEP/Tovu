import { type ContentKernel, contentKernel } from "../../platform/db/content-kernel.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";
import { redirectRepoFor, type RedirectSqlRequired } from "@jini-ai/cms/redirects/sql";

/** The generic SQL repository with Tovu's connection and byte-identical table names. */
export type SqliteRedirectRepo = ReturnType<typeof redirectRepoFor>;

/** Tovu owns these persisted names; SQL, Trash and publish coverage use the same wiring. */
export const REDIRECT_TABLES = {
  redirects: "redirects",
  revisions: "redirect_revisions",
  hits: "redirect_hits",
} as const;

/**
 * Build the redirect repository on a site's SQLite `content.db`.
 * The single Kysely query body lives in Jini `packages/cms/src/redirects/sql/repo.ts`.
 * Kept under the composition's existing name; all query behavior belongs to Jini.
 * @param required The connection's kernel, or the content db handle it is derived from.
 * @param _optional Reserved options.
 * @returns The repository bound to this site's connection and schema.
 */
export function SqliteRedirectRepo(
  { store }: { store: ContentKernel | ContentDb },
  _optional: Record<string, never> = {},
): SqliteRedirectRepo {
  return redirectRepoFor({
    // Erase the host schema only: Jini supplies each query's table view on this same kernel.
    kernel: contentKernel(store) as unknown as RedirectSqlRequired["kernel"],
    tables: { redirects: REDIRECT_TABLES.redirects, revisions: REDIRECT_TABLES.revisions },
  }, {});
}
