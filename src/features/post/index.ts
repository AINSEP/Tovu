export {
  classifyStatusTransition,
  createPost,
  deletePost,
  isTrashed,
  getAdminPostById,
  getPublishedPostBySlug,
  listAdminPages,
  listAdminPosts,
  listPublishedPosts,
  updatePost,
  DEFAULT_BODY_JSON,
  MAX_SLUG_LENGTH,
  MAX_TITLE_LENGTH,
  SLUG_FORMAT_PATTERN,
  PostConflictError,
  PostNotFoundError,
  PostValidationError,
  type PostRecord,
  type PostRepoPort,
  type PostBodyFormat,
  type PostKind,
  type PostStatus,
} from "./post";
// Pages live in `features/pages`, not here. A Page is a bespoke HTML document and a Post is a
// Tiptap one; they are separate features that happen to share a table. Nothing Pages-specific
// should be re-exported from this barrel.
export {
  extractPostPlainText,
  searchAdminPosts,
  toPostSearchDocument,
  toSearchTerms,
  DEFAULT_POST_SEARCH_LIMIT,
  MAX_INDEXED_BODY_CHARS,
  MAX_POST_SEARCH_LIMIT,
  type PostSearchDocument,
  type PostSearchHit,
  type PostSearchPort,
  type PostSearchQuery,
} from "./search";
export { InMemoryPostRepo } from "./repo.memory";
export { SqlitePostRepo } from "./repo.sqlite";
export { InMemoryPostSearchIndex } from "./search-index.memory";
export { backfillPostSearchIndex, SqlitePostSearchIndex } from "./search-index.sqlite";
