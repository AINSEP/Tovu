import { type ContentKernel, contentKernel } from "../../platform/db/content-kernel.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";
import type { Kysely } from "kysely";
import type { ContentDatabase } from "../../platform/db/content-database.generated.js";
import type { PagesHtmlDocumentStoreScope } from "@jini-ai/core/contracts/site/page-html-store";
import { SqlPagesHtmlDocumentStore, type PagesHtmlDocumentStoreDeps, type PageHtmlStatements } from "@jini-ai/cms/pages/html-document-store";
import { warnUnindexedEntryRef } from "../../contracts/core/entry-refs/unindexed-ref-warning.js";
import { restoredEntryRefs } from "@jini-ai/cms/pages/html-inverse";

export function createPageHtmlStatements({ kernel }: { kernel: ContentKernel }, _optional: Record<string, never> = {}): PageHtmlStatements {
  const thisRow = (db: Kysely<ContentDatabase>, scope: Pick<PagesHtmlDocumentStoreScope, "workspaceId" | "postId">) =>
    db.selectFrom("posts").where("workspace_id", "=", scope.workspaceId).where("id", "=", scope.postId);
  return {
    readBody: ({ scope }) => kernel.run(db => thisRow(db, scope).select(["kind", "body_html", "body_format", "version", "deleted_at"]).limit(1).executeTakeFirst()),
    readForConversion: ({ scope }) => kernel.run(db => thisRow(db, scope).select(["id", "workspace_id", "kind", "status", "publish_at", "updated_at", "deleted_at", "body_format", "version"]).limit(1).executeTakeFirst()),
    readForWrite: ({ scope }) => kernel.run(db => thisRow(db, scope).select(["id", "workspace_id", "kind", "status", "publish_at", "updated_at", "deleted_at", "body_html", "body_format", "version"]).limit(1).executeTakeFirst()),
    readDeletedAt: ({ scope }) => kernel.run(db => thisRow(db, scope).select("deleted_at").limit(1).executeTakeFirst()),
    update: async ({ scope, allowedKinds, set, guard }) => {
      const result = await kernel.run((db) => {
        let update = db
          .updateTable("posts")
          .set(set)
          .where("workspace_id", "=", scope.workspaceId)
          .where("id", "=", scope.postId)
          .where("version", "=", guard.version)
          .where("kind", "in", [...allowedKinds]);
        if (guard.liveHtmlOnly) update = update.where("body_format", "=", "html").where("deleted_at", "is", null);
        return update.executeTakeFirst();
      });
      return Number(result.numUpdatedRows);
    },
    transaction: ({ fn }) => kernel.transaction(fn),
  };
}

/**
 * @file Pages' `HtmlDocumentStore` on a site's SQLite `content.db`: {@link SqlPagesHtmlDocumentStore}
 * (the one Kysely query body, `html-document-store.ts`), kept under the `PagesHtmlDocumentStore` name
 * so the composition root that builds it from the content db handle stays as it is.
 */
export class PagesHtmlDocumentStore extends SqlPagesHtmlDocumentStore {
  /** `deps.db` is the connection's kernel, or the content db handle it is derived from. */
  constructor(scope: PagesHtmlDocumentStoreScope, deps: Omit<PagesHtmlDocumentStoreDeps, "statements" | "reportUnindexedRef" | "restoredEntryRefs"> & { db: ContentKernel | ContentDb }) {
    const { db, ...rest } = deps;
    super({ scope, deps: { ...rest, statements: createPageHtmlStatements({ kernel: contentKernel({ store: db }) }), reportUnindexedRef: warnUnindexedEntryRef, restoredEntryRefs: (required: Omit<Parameters<typeof restoredEntryRefs>[0], "report">) => restoredEntryRefs({ ...required, report: warnUnindexedEntryRef })} });
  }
}
