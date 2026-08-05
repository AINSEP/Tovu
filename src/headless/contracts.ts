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

/**
 * SPEC-047/ADR-056 Decision 3 — discriminates which body an `AdminPost` actually carries. Declared
 * locally rather than importing `features/post`'s `PostBodyFormat`, for the same reason
 * `HeadlessEntryKind` is declared locally just above: `headless` is the wire-contract layer and
 * stays decoupled from feature internals; `toHeadlessPost` is the only place the two are kept in
 * lockstep.
 */
export type HeadlessBodyFormat = "doc" | "html";

interface AdminPostFields {
  id: string;
  workspaceId: string;
  /** SPEC-002 api.spec.md §5 — NEW field, additive (no existing field removed/renamed). */
  kind: HeadlessEntryKind;
  title: string;
  slug: string;
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

/**
 * SPEC-047/ADR-056 Decision 3 / REQ-3 — a discriminated union, not one loose type with two optional
 * body fields. The trap this closes: TipTap silently discards markup outside its node vocabulary and
 * saves the loss with no error, so "never build a TipTap editor's props from an `html`-format row"
 * cannot be left to a runtime `if` a future refactor can quietly delete. Narrowing on `bodyFormat`
 * (e.g. `if (post.bodyFormat === "doc")`) is the only way to reach a non-null `bodyJson` — a caller
 * that does not narrow, or narrows on the wrong field, gets a type error, not a runtime surprise. See
 * `admin-post-response.type.test.ts` for the compile-time proof.
 */
export type AdminPost =
  | (AdminPostFields & { bodyFormat: "doc"; bodyJson: Record<string, unknown>; bodyHtml: null })
  | (AdminPostFields & { bodyFormat: "html"; bodyJson: null; bodyHtml: string });

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
