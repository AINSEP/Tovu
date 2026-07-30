/**
 * A theme id. Open string since SPEC-004: themes are discovered from disk, so
 * the valid set is dynamic (the built-in trio was the pre-SPEC-004 hardcode).
 * Clients read the current valid ids from `availableThemeIds`.
 */
export type HeadlessThemeId = string;

/**
 * SPEC-002 (content-entry-authoring) discriminates a blog-style `"post"` from a
 * standalone `"page"` over the same underlying record shape (see
 * `features/post/post.ts`'s `PostKind` doc). Declared locally rather than
 * importing `features/post`'s `PostKind` — `headless` is the wire-contract
 * layer and stays decoupled from feature internals (mirrors `HeadlessThemeId`'s
 * open-string precedent just above); the two are kept in lockstep by
 * `toHeadlessPost`/`toHeadlessContentPost`, the only callers that populate it.
 */
export type HeadlessEntryKind = "post" | "page";

export interface AdminPost {
  id: string;
  workspaceId: string;
  /** SPEC-002 api.spec.md §5 — NEW field, additive (no existing field removed/renamed). */
  kind: HeadlessEntryKind;
  title: string;
  slug: string;
  bodyJson: Record<string, unknown>;
  status: "draft" | "published";
  updatedAt: string;
  version: number;
  /**
   * SPEC-005 REQ-11/AC-14 — NEW field, additive and OPTIONAL: the plugin extension-field bag,
   * namespaced per plugin (`{ [pluginId]: { …declaredFields } }`). Present only when a plugin has
   * actually written to this entry; an entry with no contributing plugin carries no `ext` key at
   * all, and every pre-feature field above is unchanged.
   */
  ext?: Record<string, Record<string, unknown>>;
}

export interface AdminPostEnvelope {
  post: AdminPost;
}

export interface ContentPost {
  id: string;
  /** SPEC-002 api.spec.md §5 (`CONTENT_ENTRY_BY_SLUG`) — NEW field, additive. */
  kind: HeadlessEntryKind;
  title: string;
  slug: string;
  bodyJson: Record<string, unknown>;
  updatedAt: string;
}

export interface AdminPresentation {
  settings: {
    workspaceId: string;
    activeThemeId: HeadlessThemeId;
    updatedAt: string;
  };
  availableThemeIds: HeadlessThemeId[];
}

export interface ContentPostPayload {
  post: ContentPost;
  presentation: {
    activeThemeId: HeadlessThemeId;
  };
}
