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
} from "./html-document-store.sqlite.js";
export { InMemoryPagesHtmlDocumentStore } from "./html-document-store.memory.js";
export { DEFAULT_PAGE_SKELETON, PAGE_SKELETON_REGIONS, type PageSkeletonRegion } from "./skeleton.js";
/**
 * SPEC-047 REQ-9. Importing this name is also what registers the permission-migration pair that
 * grants it — see `permissions.ts`'s "Ordering" note. Anything that gates on raw-HTML authoring must
 * reach for this constant rather than spelling the string, so the gate and the refusal body cannot
 * drift apart.
 */
export { PAGES_EDIT_HTML_PERMISSION } from "./permissions.js";
