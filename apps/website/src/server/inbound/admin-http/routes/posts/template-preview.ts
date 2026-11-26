import express from "express";
import { renderAuthorizedTemplatePreview as renderSharedTemplatePreview, templatePreviewGetRoute, templatePreviewPostRoute, type TemplatePreviewRouteDeps } from "@jini-ai/cms/admin-http/routes/posts/template-preview";
import { PostNotFoundError } from "@jini-ai/cms/posts/post";

import { getAdminPostByIdOrSlug } from "#src/features/post/index";
import { adminFailureResponse } from "#src/server/inbound/shared/admin-failure";
import type { AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import { mountAdminRawRoute } from "#src/server/inbound/admin-http/admin-raw-route-ports";
import { renderPostPreview } from "./template-preview-render.js";
import { TemplatePreviewRenderError } from "@jini-ai/cms/admin-http/routes/posts/template-preview-render";
// Clone/draft/theme-branch rationale lives beside renderPostPreview in template-preview-render.ts.
import type { ContentRouteRegistrar } from "#src/server/runtime/composition/modules/content";

/**
 * `GET`/`POST .../posts/:postId/template-preview`: the Jini raw specs behind the admin ports. The route's rationale
 * (pending template choice and body, the `text/html` answer) lives with the specs. This host keeps the legacy
 * `text/plain` wire: the workspace 404, the `content.read` 403 (checked directly, never from a publishing grant, as
 * before) and the redacted 500 are written as plain text by the mount's refusal/failure writers. Both registrations
 * keep the `handlePreviewRequest` name, and the POST keeps its own `express.urlencoded` (15 MiB) in the same
 * registration, so the route-table pin is unchanged.
 */
type ContentDeps = Parameters<ContentRouteRegistrar>[0]["deps"];
type Post = Awaited<ReturnType<typeof getAdminPostByIdOrSlug>>["post"];

/** The Jini spec's deps, bound to this host's post lookup and renderer. @complexity O(1). */
function templatePreviewDeps({ deps }: { deps: ContentDeps }, _optional: Record<string, never> = {}): TemplatePreviewRouteDeps<Post> {
  return {
    workspaceId: deps.workspaceId,
    getPost: ({ workspaceId, idOrSlug }) => getAdminPostByIdOrSlug({ deps: { repo: deps.postRepo }, input: { workspaceId, idOrSlug } }),
    renderPreview: ({ post, templateChoice, bodyJson, bodyHtml }) => renderPostPreview({ deps, input: { post, templateChoice, bodyJson, bodyHtml } }),
    renderFailure: ({ error }) => (error instanceof TemplatePreviewRenderError ? { status: error.status, message: error.message } : undefined),
    isNotFound: ({ error }) => error instanceof PostNotFoundError,
  };
}

/** What {@link renderAuthorizedTemplatePreview} needs: the raw request values, never the request. */
export interface AuthorizedTemplatePreviewInput {
  deps: ContentDeps;
  postId: string;
  rawTemplateChoice: unknown;
  body: unknown;
}

/**
 * The one draft render both preview surfaces share: the HTML preview below and the JSON embed inspection route
 * (`modules/content.ts`), through the Jini spec's own `renderAuthorizedTemplatePreview`, so the inspection sees exactly
 * the document the sandboxed iframe shows. **It does not authorize**: every caller must already have passed the
 * type-free, id-free `content.read` check.
 * @throws PostNotFoundError, TemplatePreviewRenderError — each caller maps them to its own reply.
 * @complexity One post lookup plus one template render.
 */
export async function renderAuthorizedTemplatePreview(
  { deps, postId, rawTemplateChoice, body }: AuthorizedTemplatePreviewInput,
  _optional: Record<string, never> = {},
): Promise<{ html: string }> {
  return await renderSharedTemplatePreview({ deps: templatePreviewDeps({ deps }), postId, rawTemplateChoice, body });
}

export const registerAdminPostTemplatePreviewRoute: ContentRouteRegistrar = ({ errors, app, deps }, _options = {}) => {
  const previewDeps: TemplatePreviewRouteDeps<Post> & AdminJsonRoutePortDeps = {
    ...templatePreviewDeps({ deps }),
    authorize: deps.authorize,
  };
  const options = {
    authorization: "direct" as const,
    forbidden: ({ principalId, permission }: { principalId: string; permission: string }) => ({ status: 403, body: { error: `principal '${principalId}' is not authorized for '${permission}'` } }),
    refusalWriter: ({ res, error }: { res: express.Response; error: { response: { status: number; body: unknown } } }) => {
      res.status(error.response.status).type("text/plain").send((error.response.body as { error: string }).error);
    },
    failureWriter: ({ res, error }: { res: express.Response; error: unknown }) => {
      const failure = adminFailureResponse({ error, tracker: res.locals.adminFailureTracker, reporter: errors.reporter }, { message: "preview render failed" });
      res.status(failure.status).type("text/plain").send(failure.body.error);
    },
  };
  const handlerName = "handlePreviewRequest";
  mountAdminRawRoute({ errors, app, spec: templatePreviewGetRoute, deps: previewDeps, handlerName }, options);
  mountAdminRawRoute({ errors, app, spec: templatePreviewPostRoute, deps: previewDeps, handlerName }, { ...options, bodyParsers: [express.urlencoded({ extended: false, limit: "15mb" })] });
};
