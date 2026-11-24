import type { PostSearchHostConfig } from "@jini-ai/cms/posts/sql";

/**
 * @file The two names this host's post search persists, handed to the `@jini-ai/cms/posts/sql` adapters:
 * the `tovu_search` text-search configuration (migration step `0001_post_search`) and the reserved
 * `setting_values_global` row that records the projection version a site's rows were written with.
 */
export const POST_SEARCH_HOST: PostSearchHostConfig = {
  searchConfig: "tovu_search",
  projectionVersionSettingId: "tovu.internal.post_search.projection_version",
};
