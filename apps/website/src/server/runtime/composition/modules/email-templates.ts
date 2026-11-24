import { emailTemplateCreateRoute } from "@jini-ai/cms/admin-http/routes/email-templates/create";
import { emailTemplateEditHtmlRoute } from "@jini-ai/cms/admin-http/routes/email-templates/edit-html";
import { emailTemplateGetRoute } from "@jini-ai/cms/admin-http/routes/email-templates/get";
import { emailTemplateListRoute } from "@jini-ai/cms/admin-http/routes/email-templates/list";
import { emailTemplatePreviewRoute } from "@jini-ai/cms/admin-http/routes/email-templates/preview";
import { emailTemplateRenameRoute } from "@jini-ai/cms/admin-http/routes/email-templates/rename";
import { emailTemplateRenderRoute } from "@jini-ai/cms/admin-http/routes/email-templates/render";
import { CONTENT_ENTRY_MAX_BODY_BYTES } from "@jini-ai/cms/admin-http/limits";
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
import { emailTemplateStore } from "#src/features/email-templates/index";
import { PAGES_EDIT_HTML_PERMISSION } from "#src/features/pages/index";
import { mountAdminJsonRoute, type AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import type { ContentRouteDeps, ContentRouteRegistrar } from "./content.js";
import { rejectOversizedJsonBody } from "#src/server/inbound/shared/body-size-limit";
import { cappedApp } from "./capped-route-app.js";

/**
 * @file K1 (RT-K1-adm-email-templates): the HTML email-template admin routes are Jini route specs
 * (`@jini-ai/cms/admin-http/routes/email-templates/*`) mounted behind the admin ports. Each handler is a
 * permission check plus ONE shared operation from `@jini-ai/platform/mail/email-template-operations` (the
 * same call the `email_template_*` assistant tools make, so the two surfaces cannot drift). `@jini-ai/cms`
 * does not depend on that package, so each mount binds the operation to this host's template store and
 * injects the operation's error classes as predicates.
 *
 * All seven routes asked `authorizeOrRespond` (a publishing credential answers from its grant), so all
 * seven mount `"guarded"`. Registered in the order the hand-written file registered them.
 */

/** The two port fields every email-templates mount passes. `authorize` is read per request, as the
 *  hand-written routes read `deps.authorize`, so a later reassignment of it is still honoured. It drops
 *  the spec's `entityType`: these routes never named one, and forwarding it would let a resource-scoped
 *  grant match — an authorization change, not part of a move (same rule as the posts/pages reads). */
function emailTemplatePortDeps({ deps }: { deps: ContentRouteDeps }, _optional: Record<string, never> = {}): AdminJsonRoutePortDeps {
  return { workspaceId: deps.workspaceId, authorize: ({ entityType: _entityType, ...params }) => deps.authorize(params) };
}

/** The host's recognizers for the operation errors every route of this family maps. */
const templateErrorDeps = {
  isTemplateNotFound: ({ err }: { err: unknown }) => err instanceof EmailTemplateNotFoundError,
  isTemplateInput: ({ err }: { err: unknown }) => err instanceof EmailTemplateInputError,
  isTemplateVersionConflict: ({ err }: { err: unknown }) => err instanceof EmailTemplateVersionConflictError,
};

/** The unexpected-failure copy key (`sendAdminFailure`'s operation) every route of this family used. */
const MOUNT_OPTIONS = { authorization: "guarded" as const, failure: { operation: "routes/email-templates/routes", code: "INTERNAL_ERROR" } };

export const registerAdminEmailTemplateRoutes: ContentRouteRegistrar = ({ app, deps }, _options = {}) => {
  const capped = cappedApp({ app, limit: rejectOversizedJsonBody({ maxBytes: CONTENT_ENTRY_MAX_BODY_BYTES }) });
  const base = { ...emailTemplatePortDeps({ deps }), ...templateErrorDeps };
  // The store is built per call from `deps`, as the hand-written handlers did, so a test that swaps a repo method after boot is honoured.
  const store = () => emailTemplateStore({ deps });
  const editHtmlPermission = PAGES_EDIT_HTML_PERMISSION;
  mountAdminJsonRoute({ app, spec: emailTemplateListRoute, deps: { ...base, listTemplates: ({ input }) => listEmailTemplates({ store: store(), input }) } }, MOUNT_OPTIONS);
  mountAdminJsonRoute({ app: capped, spec: emailTemplateCreateRoute, deps: { ...base, editHtmlPermission, createTemplate: ({ input, actorId }) => createEmailTemplate({ store: store(), input, actorId }) } }, MOUNT_OPTIONS);
  // Before `/:templateId` routes only for readability: methods and segment counts already differ.
  mountAdminJsonRoute({ app: capped, spec: emailTemplatePreviewRoute, deps: { ...base, previewTemplate: ({ input }) => previewEmailTemplate({ store: store(), input }) } }, MOUNT_OPTIONS);
  mountAdminJsonRoute({ app, spec: emailTemplateGetRoute, deps: { ...base, getTemplate: ({ id }) => getEmailTemplate({ store: store(), id }) } }, MOUNT_OPTIONS);
  mountAdminJsonRoute({ app: capped, spec: emailTemplateEditHtmlRoute, deps: { ...base, editHtmlPermission, editTemplate: ({ input, actorId }) => editEmailTemplate({ store: store(), input, actorId }) } }, MOUNT_OPTIONS);
  mountAdminJsonRoute({ app: capped, spec: emailTemplateRenameRoute, deps: { ...base, editHtmlPermission, renameTemplate: ({ input }) => renameEmailTemplate({ store: store(), input }) } }, MOUNT_OPTIONS);
  mountAdminJsonRoute({ app: capped, spec: emailTemplateRenderRoute, deps: { ...base, renderTemplate: ({ id, values }) => renderEmailTemplateForSend({ store: store(), id, values: readFieldValues({ value: values }) }) } }, MOUNT_OPTIONS);
};
