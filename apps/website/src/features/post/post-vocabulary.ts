export type PostStatus = "draft" | "published";

/**
 * Storage kinds sharing the bespoke `posts` table. A post is a blog-style entry; a page is a
 * standalone document (About, Contact, …). They share their record shape, repository and editor,
 * with separate admin lists. Email templates share storage through the Pages HTML store but
 * belong only to mail authoring; public, theme, SEO and widget readers accept PublicPostKind.
 * Fixed at creation; v1 has no kind-conversion path.
 */
export type PostKind = "post" | "page" | "email-template";
export type PublicPostKind = Exclude<PostKind, "email-template">;
