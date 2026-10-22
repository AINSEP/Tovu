import { toolMetadata } from "../../contracts/core/tool-metadata/email-templates.js";
import { buildDomainRegistrations, indexCatalogById, requireInputRecord, type AgentToolSideEffect, type DerivedRiskByToolId, type ToolExecutionContext, type ToolRegistration } from "@jini-ai/core";
import { adaptLegacyAuthorize, ForbiddenError, requireToolPermission } from "@jini-ai/cms/core";
import { forbiddenRule, withModelFacingErrors } from "@jini-ai/core/model-facing-tool-errors";
import type { ToolContributor } from "#src/assistant/index";
import type { AuthorizeFn } from "../../contracts/core/commands/index.js";
import { PAGES_EDIT_HTML_PERMISSION } from "../pages/index.js";
import { emailTemplatesAgentToolCatalog } from "./agent-tools.js";
import {
  createEmailTemplate,
  editEmailTemplate,
  EmailTemplateInputError,
  EmailTemplateNotFoundError,
  EmailTemplateVersionConflictError,
  getEmailTemplate,
  listEmailTemplates,
  previewEmailTemplate,
  requireText,
  type EmailTemplateDeps,
} from "./operations.js";

export interface EmailTemplatesToolDeps extends EmailTemplateDeps {
  authorize: AuthorizeFn;
}

export const emailTemplatesDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> postRepo.list only.
  ["email_template_list", "none"],
  // -> postRepo.findById only.
  ["email_template_get", "none"],
  // -> postRepo.save + PagesHtmlDocumentStore.ensureHtmlFormat: one new draft row, its revisions.
  ["email_template_create", "mutates-durable-state"],
  // -> PagesHtmlDocumentStore.write: one compare-and-set body write plus its revision.
  ["email_template_edit", "mutates-durable-state"],
  // -> postRepo.findById at most; renders in memory and sends nothing.
  ["email_template_preview", "none"],
]);

function permission(deps: EmailTemplatesToolDeps, ctx: ToolExecutionContext, name: string): Promise<unknown> {
  return requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: name }, { entityType: "email-template" });
}

/**
 * The assistant half of email templates; every handler is a permission check plus one shared
 * operation from `operations.ts`, the same call the admin route makes.
 * @returns The five registrations.
 * @complexity O(1) per call beyond the operation's own cost.
 */
export function buildEmailTemplatesRegistrations(deps: EmailTemplatesToolDeps): ToolRegistration[] {
  return buildDomainRegistrations({ metadata: toolMetadata, domain: "email-templates", catalogModule: "features/email-templates/agent-tools.ts", catalog: indexCatalogById({ catalog: emailTemplatesAgentToolCatalog }), derivedRisk: emailTemplatesDerivedRisk, handlers: withModelFacingErrors({ handlers: {
    email_template_list: async ctx => {
      requireInputRecord({ input: ctx.input });
      await permission(deps, ctx, "content.read");
      return listEmailTemplates({ deps, input: requireInputRecord({ input: ctx.input }) });
    },
    email_template_get: async ctx => {
      const input = requireInputRecord({ input: ctx.input });
      await permission(deps, ctx, "content.read");
      return getEmailTemplate({ deps, id: requireText({ value: input.id, key: "id", max: 200 }) });
    },
    email_template_create: async ctx => {
      const input = requireInputRecord({ input: ctx.input });
      await permission(deps, ctx, PAGES_EDIT_HTML_PERMISSION);
      return createEmailTemplate({ deps, input, actorId: ctx.principal.id });
    },
    email_template_edit: async ctx => {
      const input = requireInputRecord({ input: ctx.input });
      await permission(deps, ctx, PAGES_EDIT_HTML_PERMISSION);
      return editEmailTemplate({ deps, input, actorId: ctx.principal.id });
    },
    email_template_preview: async ctx => {
      const input = requireInputRecord({ input: ctx.input });
      await permission(deps, ctx, "content.read");
      return previewEmailTemplate({ deps, input });
    },
  }, rules: [
    forbiddenRule({ domainPrefix: "EMAIL_TEMPLATES", error: ForbiddenError }),
    { error: EmailTemplateNotFoundError, code: "EMAIL_TEMPLATES_NOT_FOUND" },
    { error: EmailTemplateInputError, code: "EMAIL_TEMPLATES_INVALID_INPUT" },
    { error: EmailTemplateVersionConflictError, code: "EMAIL_TEMPLATES_VERSION_CONFLICT" },
  ] }) });
}

/** Contributes the email-template tools; registered once by `tool-catalog-manifest.ts`. */
export function contributeEmailTemplatesTools(): ToolContributor {
  return { domain: "email-templates", build: buildEmailTemplatesRegistrations, risk: emailTemplatesDerivedRisk };
}
