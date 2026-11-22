import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";
import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";
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
} from "@jini-ai/platform/mail/email-template-operations";
import { emailTemplateStore, type EmailTemplateDeps } from "#src/features/email-templates/index";
import { PAGES_EDIT_HTML_PERMISSION } from "#src/features/pages/index";
import { entityNotLiveResponse } from "#src/server/inbound/admin-http/http/entity-not-live";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { CONTENT_ENTRY_MAX_BODY_BYTES, rejectOversizedJsonBody } from "#src/server/inbound/shared/body-size-limit";
import type { ContentRouteDeps, ContentRouteRegistrar } from "../content/deps.js";

/**
 * @file Admin HTTP surface for HTML email templates. Each handler is a permission check plus ONE
 * shared operation from `@jini-ai/platform/mail/email-template-operations` — the same call the
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
function sendError({ res, err }: { res: Response; err: unknown }, _optional = {}): void {
  const live = entityNotLiveResponse({ err });
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
  sendAdminFailure({ res, error: err }, { operation: "routes/email-templates/routes", code: "INTERNAL_ERROR" });
}

/** The request body as a record; a missing or non-object body reads as `{}` so validation names the field. */
function body(req: Request): Record<string, unknown> {
  const value: unknown = req.body;
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Workspace check, then authorization BEFORE any body validation, then the operation. */
function route({ deps, permission, handler }: { deps: ContentRouteDeps; permission: string; handler: Handler }, { status = 200 }: { status?: number } = {}) {
  return async (req: Request, res: Response) => {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;
    try {
      const principal = getAuthedPrincipal(res);
      if (!(await authorizeOrRespond({ res, authorize: deps.authorize, params: { principalId: principal.id, permission, workspaceId: deps.workspaceId } }))) return;
      res.status(status).json(await handler(req, res, deps));
    } catch (err) {
      sendError({ res, err });
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
 *   generic `POST …/trash/items {type: "email-template", id}` on the scoped Trash registration)
 * - `POST   …/email-templates/:templateId/render` (`admin.forms.manage`) `{ values? }` -> `{ subject, html, text, missingFields }`
 */
export const registerAdminEmailTemplateRoutes: ContentRouteRegistrar = ({ app, deps }, _options = {}) => {
  const limit = rejectOversizedJsonBody({ maxBytes: CONTENT_ENTRY_MAX_BODY_BYTES });
  app.get(BASE, route({ deps, permission: "content.read", handler: (req, _res, ops) => listEmailTemplates({ store: emailTemplateStore({ deps: ops }), input: req.query }) }));
  app.post(BASE, limit, route({ deps, permission: PAGES_EDIT_HTML_PERMISSION, handler: (req, res, ops) => createEmailTemplate({ store: emailTemplateStore({ deps: ops }), input: body(req), actorId: actor(res) }) }, { status: 201 }));
  // Before `/:templateId` routes only for readability: methods and segment counts already differ.
  app.post(`${BASE}/preview`, limit, route({ deps, permission: "content.read", handler: (req, _res, ops) => previewEmailTemplate({ store: emailTemplateStore({ deps: ops }), input: body(req) }) }));
  app.get(`${BASE}/:templateId`, route({ deps, permission: "content.read", handler: (req, _res, ops) => getEmailTemplate({ store: emailTemplateStore({ deps: ops }), id: templateId(req) }) }));
  app.put(`${BASE}/:templateId/html`, limit, route({ deps, permission: PAGES_EDIT_HTML_PERMISSION, handler: (req, res, ops) => editEmailTemplate({ store: emailTemplateStore({ deps: ops }), input: { ...body(req), id: templateId(req) }, actorId: actor(res) }) }));
  app.patch(`${BASE}/:templateId`, limit, route({ deps, permission: PAGES_EDIT_HTML_PERMISSION, handler: (req, _res, ops) => renameEmailTemplate({ store: emailTemplateStore({ deps: ops }), input: { ...body(req), id: templateId(req) } }) }));
  app.post(`${BASE}/:templateId/render`, limit, route({ deps, permission: "admin.forms.manage", handler: (req, _res, ops) => renderEmailTemplateForSend({ store: emailTemplateStore({ deps: ops }), id: templateId(req), values: readFieldValues({ value: body(req).values }) }) }));
};
