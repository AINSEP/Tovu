import type { PublicPostKind } from "@jini-ai/cms/core";

/**
 * Storage kinds sharing the bespoke `posts` table: the public kinds (`PublicPostKind`, a blog-style
 * post or a standalone page) plus `email-template`. Email templates share storage through the Pages
 * HTML store but belong only to mail authoring; public, theme, SEO and widget readers accept
 * `PublicPostKind`. Fixed at creation; v1 has no kind-conversion path.
 */
export type PostKind = PublicPostKind | "email-template";
