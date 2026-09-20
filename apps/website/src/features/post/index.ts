export {
  classifyStatusTransition,
  createPost,
  deletePost,
  isTrashed,
  getAdminPostById,
  getAdminPostByIdOrSlug,
  getPublishedPostBySlug,
  findPublishedPostById,
  listAdminPages,
  listAdminPosts,
  listPublishedPosts,
  listPublishedPostPreviews,
  restorePostForward,
  updatePost,
  DEFAULT_BODY_JSON,
  MAX_SLUG_LENGTH,
  MAX_TITLE_LENGTH,
  ROOT_SLUG,
  SLUG_FORMAT_PATTERN,
  PostConflictError,
  PostNotFoundError,
  PostValidationError,
  PostVersionConflictError,
  type PostRecord,
  type PostRepoPort,
  type PostBodyFormat,
  type PostKind,
  type PostStatus,
  type BeforeSaveHookPort,
  type UpdatePostInput,
  type PostAutosaveSnapshot,
} from "./post.js";
// The optimistic-concurrency boundary, shared by the admin HTTP route and the `content_post_update`
// agent tool — see `expected-version.ts` for why it is a module of its own rather than a copy in
// each arm.
export {
  parseExpectedVersion,
  versionConflictEnvelope,
  EXPECTED_VERSION_REJECTION,
  VERSION_CONFLICT_CODE,
} from "./expected-version.js";
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
} from "./search.js";
export { InMemoryPostRepo } from "./repo.memory.js";
export { SqlitePostRepo } from "./repo.sqlite.js";
export { InMemoryPostSearchIndex } from "./search-index.memory.js";
export { backfillPostSearchIndex, SqlitePostSearchIndex } from "./search-index.sqlite.js";
export { CONTENT_POST_DELETE_TOOL_ID } from "./delete-confirmation-ui.js";
export { createPostReverters, createPostRevertRegistry, type PostReverterDeps } from "./reverters.js";
