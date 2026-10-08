import { toolMetadata } from '../../contracts/core/tool-metadata/post.js';
import { adaptLegacyAuthorize } from "@jini-ai/cms/core";
import { ToolInputError } from "@jini-ai/core";
import { buildDomainRegistrations, indexCatalogById, requireInputRecord, type DerivedRiskByToolId, type ToolRegistration } from "@jini-ai/core";
import { type JsonObject } from "@jini-ai/core/primitives";
import { requireToolPermission, type AuthorizeFn } from "@jini-ai/cms/core";
import type { ToolContributor } from "#src/assistant/index";
import { getAdminPostByIdOrSlug, PostNotFoundError, type PostRecord, type PostRepoPort } from "./post.js";
import { readPageBodyOptions, shapePageBody, type ShapedPageBody } from "#src/features/site-inspection/page-body";

/** Renderer injected at the server composition root; the feature has no server/assistant value edge. */
export interface PostPreviewToolDeps { workspaceId: string; authorize: AuthorizeFn; postRepo: PostRepoPort }
export interface PostPreviewInput { post: PostRecord; templateChoice?: string | null | undefined; bodyJson?: JsonObject | undefined; bodyHtml?: string | undefined }
export interface PostPreviewRenderer {
  renderPostPreview(deps: PostPreviewToolDeps, input: PostPreviewInput): Promise<{ html: string; templateChoice: string | null }>;
}
export const postPreviewAgentToolCatalog = [{
  name: "content_post_preview",
  description: "Renders a post or page — including a draft, or edits you haven't saved — through its theme template, exactly as it would look once published. Use before publishing to check a draft, or to try a different template. Changes nothing. For a published page as visitors get it, use fetch_published_page (local) or fetch_live_url (live). Returns postId, title, status, templateChoice, bodyBytes, truncated and body, or matches with offsets/snippets and matchCount when find is supplied. Pass textOnly for text without markup. Refuses an unknown id/slug, invalid options, or a template preview when no theme is active.",
  sideEffects: "none" as const, authorization: { permission: "content.read" },
  inputSchema: { type: "object", additionalProperties: false, required: ["postId"], properties: {
    postId: { type: "string", minLength: 1, description: "Post/page id or slug, any status except Trash." },
    templateChoice: { type: "string", description: "Optional pending choice. Omit to use the saved choice; empty string opts out of a template." },
    bodyJson: { type: "object", description: "Optional unsaved document body." },
    bodyHtml: { type: "string", description: "Optional unsaved HTML body for an HTML-format page." },
    find: { type: "string", minLength: 1, maxLength: 200 }, textOnly: { type: "boolean" },
    maxBytes: { type: "integer", minimum: 1, maximum: 1000000 },
  } },
}];
export const postPreviewDerivedRisk: DerivedRiskByToolId = new Map([
  // -> getAdminPostByIdOrSlug + injected renderer: reads and in-memory clones only, no saves.
  ["content_post_preview", "none"],
]);
const CATALOG = indexCatalogById({ catalog: postPreviewAgentToolCatalog });

/** Explicit field checks preserve empty HTML/template opt-outs, while refusing malformed edits. */
function readPreviewInput(input: Record<string, unknown>): { postId: string; overrides: Omit<PostPreviewInput, "post"> } {
  if (typeof input.postId !== "string" || input.postId.length === 0) throw new ToolInputError({ message: "content_post_preview: postId must be a non-empty id or slug." });
  for (const key of ["templateChoice", "bodyHtml"] as const) if (input[key] !== undefined && typeof input[key] !== "string") throw new ToolInputError({ message: `content_post_preview: ${key} must be a string.` });
  if (input.bodyJson !== undefined && (typeof input.bodyJson !== "object" || input.bodyJson === null || Array.isArray(input.bodyJson))) throw new ToolInputError({ message: "content_post_preview: bodyJson must be a JSON object." });
  const overrides: Omit<PostPreviewInput, "post"> = {};
  if (input.templateChoice !== undefined) overrides.templateChoice = input.templateChoice as string;
  if (input.bodyHtml !== undefined) overrides.bodyHtml = input.bodyHtml as string;
  if (input.bodyJson !== undefined) overrides.bodyJson = input.bodyJson as JsonObject;
  return { postId: input.postId, overrides };
}

/** Builds the read-only preview handler; authorization precedes lookup and any render read. */
export function buildPostPreviewRegistrations(deps: PostPreviewToolDeps, renderer: PostPreviewRenderer): ToolRegistration[] {
  return buildDomainRegistrations({ metadata: toolMetadata, domain: "post-preview", catalogModule: "features/post/preview-tool.ts", catalog: CATALOG, derivedRisk: postPreviewDerivedRisk, handlers: {
    content_post_preview: async ctx => {
      const input = requireInputRecord({ input: ctx.input });
      const { postId, overrides } = readPreviewInput(input);
      const options = readPageBodyOptions(input);
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: "content.read" }, { entityType: "post" });
      let post: PostRecord;
      try { ({ post } = await getAdminPostByIdOrSlug({ deps: { repo: deps.postRepo }, input: { workspaceId: deps.workspaceId, idOrSlug: postId } })); }
      catch (error) {
        if (error instanceof PostNotFoundError) throw new ToolInputError({ message: `content_post_preview: no post or page with id or slug '${postId}'. Use content_read.content_post to find it.` });
        throw error;
      }
      const rendered = await renderer.renderPostPreview(deps, { post, ...overrides });
      const shaped: ShapedPageBody = shapePageBody(rendered.html, options);
      return { postId: post.id, title: post.title, status: post.status, templateChoice: rendered.templateChoice, ...shaped };
    },
  } });
}
/** Contributes under its own domain, preserving all of post's existing tools. */
export function contributePostPreviewTools(renderer: PostPreviewRenderer): ToolContributor {
  return { domain: "post-preview", build: deps => buildPostPreviewRegistrations(deps, renderer), risk: postPreviewDerivedRisk };
}
