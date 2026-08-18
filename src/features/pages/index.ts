/**
 * @file The Pages feature — bespoke, AI-generated HTML pages.
 *
 * **Pages are not Posts.** A Post is a formulaic Tiptap/ProseMirror document; a Page is a bespoke
 * HTML document authored conversationally, with region-scoped edits and a live preview. They serve
 * different purposes and are separate features, and nothing here should be reached for when working
 * on Posts (or vice versa).
 *
 * The one thing they still physically share is the `posts` table — a Page is a row with
 * `kind: "page"` and `body_format: "html"`. That is storage, not design: the write paths are
 * disjoint by construction. `features/post`'s `createPost`/`updatePost` chokepoint can only ever
 * produce `"doc"`-format rows (ADR-056 CIC-3), and {@link PagesHtmlDocumentStore} is the only writer
 * of `"html"`-format rows anywhere in the codebase. Splitting the table itself is a migration this
 * feature does not need and has not asked for.
 */
export {
  PageConcurrentEditError,
  PageKindMismatchError,
  PageNotFoundError,
  PagesHtmlDocumentStore,
  type PagesHtmlDocumentStoreDeps,
  type PagesHtmlDocumentStoreFactory,
  type PagesHtmlDocumentStorePort,
  type PagesHtmlDocumentStoreScope,
} from "./html-document-store.sqlite";
export { InMemoryPagesHtmlDocumentStore } from "./html-document-store.memory";
export { DEFAULT_PAGE_SKELETON, PAGE_SKELETON_REGIONS, type PageSkeletonRegion } from "./skeleton";
