import { buildPostPreviewRegistrations as build, postPreviewDerivedRisk, type PostPreviewInput } from "@jini-ai/cms/posts/preview-tool";
import type { ToolContributor } from "@jini-ai/core";
import type { AuthorizeFn } from "@jini-ai/core/contracts/events";
import type { PostRepoPort } from "@jini-ai/cms/posts/post";
import { readPageBodyOptions, shapePageBody } from "@jini-ai/diagnostics/web-evidence/page-body";
import { readPostTemplateOptions, type PostTemplateDeps } from "./template-options.js";

/** Renderer injected at the server composition root; the feature has no server/assistant value edge. */
export interface PostPreviewToolDeps extends PostTemplateDeps { authorize: AuthorizeFn; postRepo: PostRepoPort }
export interface PostPreviewRenderer {
  renderPostPreview({ deps, input }: { deps: PostPreviewToolDeps; input: PostPreviewInput }, optional?: Record<string, never>): Promise<{ html: string; templateChoice: string | null }>;
}
export const postPreviewAgentToolCatalog = [{
  name: "content_post_preview",
  description: "Renders a post or page by id (or slug; postId is a legacy alias) — including a draft, or edits you haven't saved — through its theme template. Preview a draft by entry ID. Use available browser widths for actual visual checks and report those widths. A public-route screenshot checks only the page served at that address. Use before publishing to check a draft, or to try a different template. Changes nothing. For a published page as visitors get it, use fetch_published_page (local) or fetch_live_url (live). Returns postId, title, status, templateChoice, availableTemplates, bodyBytes, truncated and body, or matches with offsets/snippets and matchCount when find is supplied. Set a saved template with content_post_update's template field using one of availableTemplates. Pass textOnly for text without markup. Refuses an unknown id/slug, invalid options, or a template preview when no theme is active.",
  sideEffects: "none" as const, authorization: { permission: "content.read" },
  inputSchema: { type: "object", additionalProperties: false, anyOf: [{ required: ["id"] }, { required: ["postId"] }], properties: {
    id: { type: "string", minLength: 1, description: "Post/page id or slug, any status except Trash. Takes precedence over postId." },
    postId: { type: "string", minLength: 1, description: "Legacy alias for id. Prefer id." },
    templateChoice: { type: "string", description: "Optional pending choice. Omit to use the saved choice; empty string opts out of a template." },
    bodyJson: { type: "object", description: "Optional unsaved document body." },
    bodyHtml: { type: "string", description: "Optional unsaved HTML body for an HTML-format page." },
    find: { type: "string", minLength: 1, maxLength: 200 }, textOnly: { type: "boolean" },
    maxBytes: { type: "integer", minimum: 1, maximum: 1000000 },
  } },
}];

export function buildPostPreviewRegistrations({ deps, renderer }: { deps: PostPreviewToolDeps; renderer: PostPreviewRenderer }, _optional: Record<string, never> = {}) {
  return build({ deps: { ...deps, catalog: postPreviewAgentToolCatalog, readPermission: "content.read", readPageBodyOptions, shapePageBody,
    readPostTemplateOptions: ({ kind }) => readPostTemplateOptions({ deps, kind }),
    missingPostMessage: postId => `content_post_preview: no post or page with id or slug '${postId}'. Use content_read.content_post to find it.`,
  }, renderer: { renderPostPreview: ({ input }) => renderer.renderPostPreview({ deps, input }) } });
}

/** Contributes under its own domain, preserving all of post's existing tools. */
export function contributePostPreviewTools(renderer: PostPreviewRenderer, _optional: Record<string, never> = {}): ToolContributor<PostPreviewToolDeps, unknown> {
  return { domain: "post-preview", build: deps => buildPostPreviewRegistrations({ deps, renderer }), risk: postPreviewDerivedRisk };
}
