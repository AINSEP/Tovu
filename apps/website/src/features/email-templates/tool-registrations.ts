import { buildEmailTemplatesRegistrations as buildWithPorts, emailTemplatesDerivedRisk } from '@jini-ai/platform/mail/email-template-tool-registrations';
import { createEmailTemplatesAgentToolCatalog } from '@jini-ai/platform/mail/email-template-agent-tools';
import { EmailTemplateNotFoundError } from '@jini-ai/platform/mail/email-template-operations';
import { emailTemplateStore, type EmailTemplateDeps } from '@jini-ai/cms/posts/email-template-store';
import { adaptLegacyAuthorize, ForbiddenError, requireToolPermission } from '@jini-ai/cms/core';
import type { AuthorizeFn } from '@jini-ai/core/contracts/events';
import { PAGES_EDIT_HTML_PERMISSION } from '../pages/index.js';

/** The email-template tool catalog, bound once with this host's Pages HTML edit permission. */
export const emailTemplatesAgentToolCatalog = createEmailTemplatesAgentToolCatalog({ copy: { editHtmlPermission: PAGES_EDIT_HTML_PERMISSION } });
export interface EmailTemplatesToolDeps extends Omit<EmailTemplateDeps, 'EmailTemplateNotFoundError'> { authorize: AuthorizeFn }

export function buildEmailTemplatesRegistrations(deps: EmailTemplatesToolDeps) {
  return buildWithPorts({ workspaceId: deps.workspaceId, editHtmlPermission: PAGES_EDIT_HTML_PERMISSION,
    catalog: emailTemplatesAgentToolCatalog, ForbiddenError,
    emailTemplateStore: () => emailTemplateStore({ deps: { ...deps, EmailTemplateNotFoundError } }),
    requirePermission: ({ ctx, name }) => requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }),
      workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: name }, { entityType: 'email-template' }),
  });
}
export function contributeEmailTemplatesTools() {
  return { domain: 'email-templates', build: buildEmailTemplatesRegistrations, risk: emailTemplatesDerivedRisk };
}
