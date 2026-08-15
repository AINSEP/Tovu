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
  /**
   * Post-template-picker feature (2026-08-10) — NEW field, additive and OPTIONAL, same migration-
   * safety pattern as `ext` above: the `pages/*.html` filename (of the active static theme's
   * `theme.json` `postTemplate` array) this post renders through. `toHeadlessPost` always populates
   * a real value (`post.templateChoice ?? null`) on every live response, so a consumer only ever
   * sees `undefined` in a hand-built test fixture that predates this field, never from the real API.
   * `null` and `""` are NOT interchangeable — see `PostRecord.templateChoice` for the tri-state.
   */
  templateChoice?: string | null;
  /**
   * Slug-collision override (2026-08-10, tri-state 2026-08-15) — NEW field, additive and OPTIONAL,
   * same pattern as `templateChoice` above: `null` means this post never had an explicit opinion set
   * (the resolver's current default policy applies), `true`/`false` is a permanent explicit author
   * choice. `toHeadlessPost` always populates a real value (`post.overridesThemePage ?? null`) on
   * every live response; `undefined` only appears in a pre-feature test fixture.
   */
  overridesThemePage?: boolean | null;
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

/**
 * ADR-020 capability tier, mirrored locally from `features/theme`'s `ThemeTier` for the same
 * decoupling reason as `HeadlessEntryKind` above — the wire contract doesn't import feature
 * internals. Kept in lockstep by `toAdminPresentationResponse`, the only place that populates it.
 */
export type HeadlessThemeTier = "declarative" | "templated" | "handlebars" | "static" | "code";

export interface HeadlessThemeSummary {
  id: HeadlessThemeId;
  tier: HeadlessThemeTier;
}

export interface AdminPresentation {
  settings: {
    workspaceId: string;
    activeThemeId: HeadlessThemeId;
    updatedAt: string;
  };
  availableThemeIds: HeadlessThemeId[];
  /**
   * Themes admin screen (2026-08-10) — every available theme's id plus its ADR-020 capability
   * tier, so the Themes screen can group cards by tier without a second round trip. Same id set
   * as `availableThemeIds` above (that field stays for callers that only need ids); this is the
   * superset callers that need tier read instead.
   */
  availableThemes: HeadlessThemeSummary[];
  /**
   * Template-picker feature (2026-08-10, unified 2026-08-11) — the active theme's `theme.json`
   * `templates` array (e.g. `["blog-post.html", "page-shell.html"]`), or `[]` when the active theme
   * doesn't declare one. BOTH the Post editor's and the Pages editor's picker read this SAME field to
   * populate their options — was two separate fields (`activeThemePostTemplates`/
   * `activeThemePageTemplates`) until the unified `content` marker removed the reason they needed to
   * differ (see `ThemeManifest.templates`'s own doc, `features/theme/theme.ts`, for the full
   * reasoning and what it does NOT solve — template applicability). An empty array means a picker has
   * nothing to offer and stays hidden, not broken.
   */
  activeThemeTemplates: string[];
  /**
   * Slug-collision override (2026-08-10) — every page id (`theme.pages` key) the active theme ships,
   * or `[]` for a non-`static`-tier theme. The Post editor uses this to warn an author when a post's
   * slug matches one of these — that slug's route currently belongs to the theme's own page, not the
   * post, unless the post's `overridesThemePage` is set.
   */
  activeThemeStaticPageIds: string[];
}

export interface ContentPostPayload {
  post: ContentPost;
  presentation: {
    activeThemeId: HeadlessThemeId;
  };
}
