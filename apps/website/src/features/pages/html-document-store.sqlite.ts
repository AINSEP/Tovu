import { type ContentKernel, contentKernel } from "../../platform/db/content-kernel.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";
import {
  type PagesHtmlDocumentStoreDeps,
  type PagesHtmlDocumentStoreScope,
  SqlPagesHtmlDocumentStore,
} from "./html-document-store.js";

export {
  PageConcurrentEditError,
  PageKindMismatchError,
  PageNotFoundError,
  SqlPagesHtmlDocumentStore,
  type PagesHtmlDocumentStoreDeps,
  type PagesHtmlDocumentStoreFactory,
  type PagesHtmlDocumentStorePort,
  type PagesHtmlDocumentStoreScope,
} from "./html-document-store.js";

/**
 * @file Pages' `HtmlDocumentStore` on a site's SQLite `content.db`: {@link SqlPagesHtmlDocumentStore}
 * (the one Kysely query body, `html-document-store.ts`), kept under the `PagesHtmlDocumentStore` name
 * so the composition root that builds it from the content db handle stays as it is.
 */
export class PagesHtmlDocumentStore extends SqlPagesHtmlDocumentStore {
  /** `deps.db` is the connection's kernel, or the content db handle it is derived from. */
  constructor(scope: PagesHtmlDocumentStoreScope, deps: Omit<PagesHtmlDocumentStoreDeps, "kernel"> & { db: ContentKernel | ContentDb }) {
    const { db, ...rest } = deps;
    super(scope, { ...rest, kernel: contentKernel(db) });
  }
}
