import express from "express";
import { templatePreviewGetRoute, templatePreviewPostRoute, type TemplatePreviewRouteDeps } from "@jini-ai/cms/admin-http/routes/posts/template-preview";
import { PostNotFoundError } from "@jini-ai/cms/posts/post";

import { getAdminPostByIdOrSlug } from "#src/features/post/index";
import { adminFailureResponse } from "#src/server/inbound/shared/admin-failure";
import { mountAdminRawRoute, type AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-raw-route-ports";
import { renderPostPreview, TemplatePreviewRenderError } from "./template-preview-render.js";
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
export const registerAdminPostTemplatePreviewRoute: ContentRouteRegistrar = ({ app, deps }, _options = {}) => {
  type Post = Awaited<ReturnType<typeof getAdminPostByIdOrSlug>>["post"];
  const previewDeps: TemplatePreviewRouteDeps<Post> & AdminJsonRoutePortDeps = {
    workspaceId: deps.workspaceId,
    authorize: deps.authorize,
    getPost: ({ workspaceId, idOrSlug }) => getAdminPostByIdOrSlug({ deps: { repo: deps.postRepo }, input: { workspaceId, idOrSlug } }),
    renderPreview: ({ post, templateChoice, bodyJson, bodyHtml }) => renderPostPreview({ deps, input: { post, templateChoice, bodyJson, bodyHtml } }),
    renderFailure: ({ error }) => (error instanceof TemplatePreviewRenderError ? { status: error.status, message: error.message } : undefined),
    isNotFound: ({ error }) => error instanceof PostNotFoundError,
  };
  const options = {
    authorization: "direct" as const,
    forbidden: ({ principalId, permission }: { principalId: string; permission: string }) => ({ status: 403, body: { error: `principal '${principalId}' is not authorized for '${permission}'` } }),
    refusalWriter: ({ res, error }: { res: express.Response; error: { response: { status: number; body: unknown } } }) => {
      res.status(error.response.status).type("text/plain").send((error.response.body as { error: string }).error);
    },
    failureWriter: ({ res, error }: { res: express.Response; error: unknown }) => {
      const failure = adminFailureResponse({ error, tracker: res.locals.adminFailureTracker }, { message: "preview render failed" });
      res.status(failure.status).type("text/plain").send(failure.body.error);
    },
  };
  const handlerName = "handlePreviewRequest";
  mountAdminRawRoute({ app, spec: templatePreviewGetRoute, deps: previewDeps, handlerName }, options);
  mountAdminRawRoute({ app, spec: templatePreviewPostRoute, deps: previewDeps, handlerName }, { ...options, bodyParsers: [express.urlencoded({ extended: false, limit: "15mb" })] });
};
