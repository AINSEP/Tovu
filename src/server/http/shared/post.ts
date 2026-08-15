import type { PostRecord } from "#src/features/post/index";
import type { AdminPost, ContentPost } from "#src/headless/index";

/**
 * Maps a post record into the richer admin-facing DTO shape.
 *
 * SPEC-005 REQ-11 (T022): `ext` is spread in only when the record actually carries one, so an
 * entry with no contributing plugin serializes with no `ext` key at all (AC-14) and every
 * pre-feature response field is untouched.
 *
 * SPEC-047/ADR-056 REQ-3: branches on `post.bodyFormat` and returns the matching `AdminPost` union
 * member, never a loose object with both `bodyJson`/`bodyHtml` optionally populated — this is the
 * one place `PostRecord`'s internal shape becomes the wire contract's discriminated union, so it is
 * the one place that can get the branch wrong. The `"html"` branch throwing on a null `bodyHtml`
 * (rather than coercing to `""`) is deliberate: the DB's `posts_body_format_shape` CHECK (REQ-2)
 * guarantees `bodyFormat: "html"` implies a non-null `bodyHtml`, so reaching this branch with a null
 * one is a genuine data-integrity violation this function should fail loudly on, not paper over.
 */
export function toHeadlessPost(post: PostRecord): AdminPost {
  const base = {
    id: post.id,
    workspaceId: post.workspaceId,
    kind: post.kind,
    title: post.title,
    slug: post.slug,
    status: post.status,
    updatedAt: post.updatedAt,
    version: post.version,
    templateChoice: post.templateChoice ?? null,
    // Tri-state (2026-08-15) — `?? null`, not `?? false`: a `PostRecord` that never had an opinion
    // set (`undefined`) must reach the wire as `null` ("never decided"), the same value a stored
    // database NULL round-trips as. Coalescing to `false` here would silently manufacture an explicit
    // "theme page wins" decision no author ever made. See `PostRecord.overridesThemePage`'s own doc.
    overridesThemePage: post.overridesThemePage ?? null,
    ...(post.ext !== undefined ? { ext: post.ext as Record<string, Record<string, unknown>> } : {}),
  };

  if (post.bodyFormat === "html") {
    if (post.bodyHtml === null) {
      throw new Error(`post '${post.id}' is body_format 'html' with a null body_html — data integrity violation`);
    }
    return { ...base, bodyFormat: "html", bodyJson: null, bodyHtml: post.bodyHtml };
  }

  return { ...base, bodyFormat: "doc", bodyJson: post.bodyJson, bodyHtml: null };
}

/**
 * Maps a post record into the narrower public content DTO shape.
 */
export function toHeadlessContentPost(post: PostRecord): ContentPost {
  return {
    id: post.id,
    kind: post.kind,
    title: post.title,
    slug: post.slug,
    bodyJson: post.bodyJson,
    updatedAt: post.updatedAt,
  };
}
