import { toolMetadata } from '../../contracts/core/tool-metadata/mail-status.js';
import { buildDomainRegistrations, indexCatalogById, requireInputRecord, type AgentToolSideEffect, type DerivedRiskByToolId, type ToolRegistration } from "@jini-ai/core";
import { adaptLegacyAuthorize, requireToolPermission } from "@jini-ai/cms/core";
import type { ToolContributor } from "#src/assistant/index";
import { ForbiddenError } from "@jini-ai/cms/core";
import { forbiddenRule, withModelFacingErrors } from "@jini-ai/core/model-facing-tool-errors";
import type { AuthorizeFn } from "../../contracts/core/commands/index.js";
import { isMailDeliveryAvailable, MAIL_DELIVERY_UNAVAILABLE_NOTE, type MailerPort } from "../../platform/mail/index.js";
import { mailStatusAgentToolCatalog } from "./agent-tools.js";

import type { MailStatusReport } from "../../platform/mail/mail-status.js";

export interface MailStatusToolDeps {
  authorize: AuthorizeFn; workspaceId: string; mailer: MailerPort;
  /** Lanes, providers and warnings (`server/runtime/boot/resolve-mailer.ts`); absent in hermetic roots. */
  mailStatus?: () => Promise<MailStatusReport>;
}
export const mailStatusDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> mailer.capabilities() only; the adapter may refresh configuration, but sends/writes nothing.
  ["system_get_mail_status", "none"],
]);

/** Reads delivery configuration after the admin route's permission check.
 * @param deps - Site scope, authorization and mailer.
 * @returns One read-only registration exposing availability, driver and recovery note.
 * @throws {ToolInputError} For malformed input or denied admin.forms.manage.
 * @example buildMailStatusRegistrations(deps)[0].handler(ctx)
 * @complexity O(1); no message is sent.
 */
export function buildMailStatusRegistrations(deps: MailStatusToolDeps): ToolRegistration[] {
  return buildDomainRegistrations({ metadata: toolMetadata, domain: "system-mail", catalogModule: "features/mail-status/agent-tools.ts", catalog: indexCatalogById({ catalog: mailStatusAgentToolCatalog }), derivedRisk: mailStatusDerivedRisk, handlers: withModelFacingErrors({ handlers: {
    system_get_mail_status: async ctx => {
      requireInputRecord({ input: ctx.input });
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: "admin.forms.manage" }, { entityType: "mail" });
      const mailDeliveryAvailable = isMailDeliveryAvailable(deps.mailer);
      const status = deps.mailStatus ? await deps.mailStatus() : {};
      return { mailDeliveryAvailable, driver: deps.mailer.capabilities().driver, note: mailDeliveryAvailable ? "Email sending is configured." : MAIL_DELIVERY_UNAVAILABLE_NOTE, ...status };
    },
  }, rules: [forbiddenRule({ domainPrefix: "MAIL_STATUS", error: ForbiddenError })] }) });
}

/** Keeps the diagnostic under a unique contributor domain. */
export function contributeMailStatusTools(): ToolContributor {
  return { domain: "system-mail", build: buildMailStatusRegistrations, risk: mailStatusDerivedRisk };
}
