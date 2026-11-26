import { createPostPreviewAgentToolCatalog, bindPostPreviewTools, type PostPreviewInput } from "@jini-ai/cms/posts/preview-tool";
import type { AuthorizeFn } from "@jini-ai/core/contracts/events";
import type { PostRepoPort } from "@jini-ai/cms/posts/post";
import { readPageBodyOptions, shapePageBody } from "@jini-ai/diagnostics/web-evidence/page-body";
import { readPostTemplateOptions, type PostTemplateDeps } from "./template-options.js";

/** Renderer injected at the server composition root; the feature has no server/assistant value edge. */
export interface PostPreviewToolDeps extends PostTemplateDeps { authorize: AuthorizeFn; postRepo: PostRepoPort }
export interface PostPreviewRenderer {
  renderPostPreview({ deps, input }: { deps: PostPreviewToolDeps; input: PostPreviewInput }, optional?: Record<string, never>): Promise<{ html: string; templateChoice: string | null }>;
}
export const postPreviewAgentToolCatalog = createPostPreviewAgentToolCatalog({ fetchPublishedPageToolId: "fetch_published_page", fetchLiveUrlToolId: "fetch_live_url" });

export const { buildPostPreviewRegistrations, contributePostPreviewTools } = bindPostPreviewTools({
  catalog: postPreviewAgentToolCatalog, readPermission: "content.read", readPageBodyOptions, shapePageBody,
  readPostTemplateOptions, contentPostReadToolId: "content_read.content_post",
});
