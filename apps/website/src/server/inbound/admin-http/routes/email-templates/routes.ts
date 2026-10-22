import type { Request, Response } from "express";

import {
  createEmailTemplate,
  editEmailTemplate,
  EmailTemplateInputError,
  EmailTemplateNotFoundError,
  EmailTemplateVersionConflictError,
  getEmailTemplate,
  listEmailTemplates,
  previewEmailTemplate,
  readFieldValues,
  renameEmailTemplate,
  renderEmailTemplateForSend,
  type EmailTemplateDeps,
} from "#src/features/email-templates/index";
import { PAGES_EDIT_HTML_PERMISSION } from "#src/features/pages/index";
import { entityNotLiveResponse } from "#src/server/inbound/admin-http/http/entity-not-live";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { CONTENT_ENTRY_MAX_BODY_BYTES, rejectOversizedJsonBody } from "#src/server/inbound/shared/body-size-limit";
import type { ContentRouteDeps, ContentRouteRegistrar } from "../content/deps.js";

/**
 * @file Admin HTTP surface for HTML email templates. Each handler is a permission check plus ONE
 * shared operation from `features/email-templates/operations.ts` — the same call the
 * `email_template_*` assistant tools make — so the two surfaces cannot drift.
 *
 * Permissions are existing names: reading/previewing is `content.read` and writing raw HTML is
 * `pages.edit_html`, the Pages HTML gates (a template is raw HTML on Pages storage); the send
 * render is `admin.forms.manage`, the mail-status/test-send gate, because its output is what a
 * send path mails.
 *
 * The admin preview HTML keeps the template's scripts. Show it the way the Pages editor shows a
 * Page — in the sandboxed preview iframe WITHOUT `allow-same-origin` (admin `features/pages/
 * rules.ts`'s `PAGE_PREVIEW_IFRAME_SANDBOX`) — never inline in the admin document.
 */

const BASE = "/api/admin/v1/workspaces/:workspaceId/email-templates";

type Handler = (req: Request, res: Response, deps: EmailTemplateDeps) => Promise<unknown>;

/** Maps an operation failure onto its HTTP shape, mirroring `pages/update-html.ts`'s codes. */
function sendError(res: Response, err: unknown): void {
  const live = entityNotLiveResponse(err);
  if (live) {
    res.status(live.status).json(live.body);
    return;
  }
  if (err instanceof EmailTemplateNotFoundError) {
    res.status(404).json({ error: err.message, code: "ENTRY_NOT_FOUND" });
    return;
  }
  if (err instanceof EmailTemplateInputError) {
    res.status(400).json({ error: err.message, code: "VALIDATION_ERROR" });
    return;
  }
  if (err instanceof EmailTemplateVersionConflictError) {
    res.status(409).json({ error: err.message, code: "CONCURRENT_EDIT" });
    return;
  }
  res.status(500).json({ error: "internal error" });
}

/** The request body as a record; a missing or non-object body reads as `{}` so validation names the field. */
function body(req: Request): Record<string, unknown> {
  const value: unknown = req.body;
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Workspace check, then authorization BEFORE any body validation, then the operation. */
function route(deps: ContentRouteDeps, permission: string, handler: Handler, status = 200) {
  return async (req: Request, res: Response) => {
    if (String(req.params.workspaceId) !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }
    try {
      const principal = getAuthedPrincipal(res);
      if (!(await authorizeOrRespond(res, deps.authorize, { principalId: principal.id, permission, workspaceId: deps.workspaceId }))) return;
      res.status(status).json(await handler(req, res, deps));
    } catch (err) {
      sendError(res, err);
    }
  };
}

const actor = (res: Response) => getAuthedPrincipal(res).id;
const templateId = (req: Request) => String(req.params.templateId);

/**
 * - `GET    …/email-templates` (`content.read`) -> `{ templates: EmailTemplateSummary[] }`
 * - `POST   …/email-templates` (`pages.edit_html`) `{ name, html?, subject?, fields? }` -> 201 detail
 * - `POST   …/email-templates/preview` (`content.read`) `{ id? | html?, values?, mode? }` -> preview
 * - `GET    …/email-templates/:templateId` (`content.read`) -> detail
 * - `PUT    …/email-templates/:templateId/html` (`pages.edit_html`) `{ html, expectedVersion? }` -> detail
 * - `PATCH  …/email-templates/:templateId` (`pages.edit_html`) `{ name, expectedVersion? }` -> detail (rename; trash is the
 *   generic `POST …/trash/items {type: "post", id}`, a template being a `posts` row)
 * - `POST   …/email-templates/:templateId/render` (`admin.forms.manage`) `{ values? }` -> `{ subject, html, text, missingFields }`
 */
export const registerAdminEmailTemplateRoutes: ContentRouteRegistrar = (app, deps) => {
  const limit = rejectOversizedJsonBody({ maxBytes: CONTENT_ENTRY_MAX_BODY_BYTES });
  app.get(BASE, route(deps, "content.read", (req, _res, ops) => listEmailTemplates({ deps: ops, input: req.query })));
  app.post(BASE, limit, route(deps, PAGES_EDIT_HTML_PERMISSION, (req, res, ops) => createEmailTemplate({ deps: ops, input: body(req), actorId: actor(res) }), 201));
  // Before `/:templateId` routes only for readability: methods and segment counts already differ.
  app.post(`${BASE}/preview`, limit, route(deps, "content.read", (req, _res, ops) => previewEmailTemplate({ deps: ops, input: body(req) })));
  app.get(`${BASE}/:templateId`, route(deps, "content.read", (req, _res, ops) => getEmailTemplate({ deps: ops, id: templateId(req) })));
  app.put(`${BASE}/:templateId/html`, limit, route(deps, PAGES_EDIT_HTML_PERMISSION, (req, res, ops) => editEmailTemplate({ deps: ops, input: { ...body(req), id: templateId(req) }, actorId: actor(res) })));
  app.patch(`${BASE}/:templateId`, limit, route(deps, PAGES_EDIT_HTML_PERMISSION, (req, _res, ops) => renameEmailTemplate({ deps: ops, input: { ...body(req), id: templateId(req) } })));
  app.post(`${BASE}/:templateId/render`, limit, route(deps, "admin.forms.manage", (req, _res, ops) => renderEmailTemplateForSend({ deps: ops, id: templateId(req), values: readFieldValues({ value: body(req).values }) })));
};
