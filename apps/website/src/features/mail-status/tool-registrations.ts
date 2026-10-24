import { toolMetadata } from '../../contracts/core/tool-metadata/mail-status.js';
import { buildDomainRegistrations, indexCatalogById, requireInputRecord, ToolInputError, type AgentToolSideEffect, type DerivedRiskByToolId, type ToolExecutionContext, type ToolRegistration } from "@jini-ai/core";
import { adaptLegacyAuthorize, requireToolPermission } from "@jini-ai/cms/core";
import type { AssistantSurfaceDeps } from "@jini-ai/daemon/surface-exchanges";
import type { UserRepoPort } from "@jini-ai/user-management";
import type { ToolContributor } from "#src/assistant/index";
import { approvalToolHandler } from "#src/contracts/core/human-confirm";
import { ForbiddenError } from "@jini-ai/cms/core";
import { forbiddenRule, withModelFacingErrors } from "@jini-ai/core/model-facing-tool-errors";
import type { AuthorizeFn } from "../../contracts/core/commands/index.js";
import { isMailDeliveryAvailable, MAIL_DELIVERY_UNAVAILABLE_NOTE, type MailerPort, type MailSenderIdentityPort } from "../../platform/mail/index.js";
import type { MailProviderControl, MailStatusReport } from "../../platform/mail/mail-status.js";
import { mailStatusAgentToolCatalog } from "./agent-tools.js";
import { planMailTestSend, readTestRecipient, runMailTestSend, type MailTestSendDeps, type MailTestSendPlan } from "./test-send.js";
import { activateMailProvider, checkMailProvider } from "./provider-operations.js";
import { asToolInputError, currentLanesDetail, readCurrentLanes } from "./provider-tool-registrations.js";

export interface MailStatusToolDeps {
  authorize: AuthorizeFn; workspaceId: string; mailer: MailerPort;
  /** Lanes, providers and warnings (`server/runtime/boot/resolve-mailer.ts`); absent in hermetic roots. */
  mailStatus?: (optional?: { refresh?: boolean }) => Promise<MailStatusReport>;
  /** Provider selection for `mail_set_provider`; absent, that tool refuses and changes nothing. */
  mailProviderControl?: MailProviderControl;
  /** The operator's account, for `mail_send_test`'s default recipient. */
  userRepo?: Pick<UserRepoPort, "findByPrincipalId">;
  /** The site's system-mail From (`platform/mail/sender-identity.ts`). */
  mailSenderIdentity?: MailSenderIdentityPort;
  /** Shared with the admin test-send route (`features/mail-status/test-send.ts`). */
  mailTestSendLimiter?: MailTestSendDeps["mailTestSendLimiter"];
  mailTestMode?: MailTestSendDeps["mailTestMode"];
  mailTestProvider?: MailTestSendDeps["mailTestProvider"];
  mailLaneReady?: MailTestSendDeps["mailLaneReady"];
  mailTestRequests?: MailTestSendDeps["mailTestRequests"];
}
export const mailStatusDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> mailer.capabilities() only; the adapter may refresh configuration, but sends/writes nothing.
  ["system_get_mail_status", "none"],
  // -> mailProviderControl.select: one settings-ledger write of core.mail.provider.
  ["mail_set_provider", "mutates-durable-state"],
  // -> mailer.send: one delivery (ledger row, provider call) to the operator's own or a chosen address.
  ["mail_send_test", "mutates-durable-state"],
]);

function permission(deps: MailStatusToolDeps, ctx: ToolExecutionContext, name: string): Promise<unknown> {
  return requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: name }, { entityType: "mail" });
}

/** The selection seam, or a refusal when this root has none (hermetic roots, peer sites). */
function providerControl(deps: MailStatusToolDeps): MailProviderControl {
  if (!deps.mailProviderControl) throw new ToolInputError({ message: "Mail provider selection is unavailable on this server. Nothing was changed." });
  return deps.mailProviderControl;
}

/** The provider id the model asked for; the card and the write both use this frozen value. */
function readProviderId(input: unknown): string {
  const record = requireInputRecord({ input });
  const providerId = typeof record.providerId === "string" ? record.providerId.trim() : "";
  if (!providerId) throw new ToolInputError({ message: "providerId must be an installed provider id from system_get_mail_status." });
  return providerId;
}

/** Test mode rewrites or keeps the message: the card says so before the person confirms. */
function testModeDetails(plan: MailTestSendPlan): { label: string; value: string }[] {
  if (plan.redirectTo !== undefined) return [{ label: "Test mode", value: `Redirected to ${plan.redirectTo}` }];
  return plan.capture ? [{ label: "Test mode", value: "Captured on this server; nothing is sent" }] : [];
}

/** Reads delivery configuration after the admin route's permission check, and offers the two
 * approval-gated controls (`mail_set_provider`, `mail_send_test`).
 * @param deps - Site scope, authorization, mailer and the optional status/selection seams.
 * @param surfaces - The authenticated card transport for the approval cards.
 * @returns The three registrations.
 * @throws {ToolInputError} For malformed input or a denied permission.
 * @example buildMailStatusRegistrations(deps, surfaces)[0].handler(ctx)
 * @complexity O(1) per call; a test send is one delivery.
 */
export function buildMailStatusRegistrations(deps: MailStatusToolDeps, surfaces: AssistantSurfaceDeps): ToolRegistration[] {
  return buildDomainRegistrations({ metadata: toolMetadata, domain: "system-mail", catalogModule: "features/mail-status/agent-tools.ts", catalog: indexCatalogById({ catalog: mailStatusAgentToolCatalog }), derivedRisk: mailStatusDerivedRisk, handlers: withModelFacingErrors({ handlers: {
    system_get_mail_status: async ctx => {
      const refresh = requireInputRecord({ input: ctx.input }).refresh === true;
      await permission(deps, ctx, "admin.forms.manage");
      const mailDeliveryAvailable = isMailDeliveryAvailable(deps.mailer);
      const status = deps.mailStatus ? await deps.mailStatus({ refresh }) : {};
      return { mailDeliveryAvailable, driver: deps.mailer.capabilities().driver, note: mailDeliveryAvailable ? "Email sending is configured." : MAIL_DELIVERY_UNAVAILABLE_NOTE, ...status };
    },
    // No rememberKey: a provider switch redirects every email the site sends, so it always asks.
    mail_set_provider: approvalToolHandler({ surfaces,
      prepare: async ({ ctx }) => {
        const providerId = readProviderId(ctx.input);
        await permission(deps, ctx, "settings.workspace.write");
        const control = providerControl(deps);
        const { label } = await asToolInputError({ run: () => checkMailProvider({ control, providerId }) });
        return { providerId, label, current: await readCurrentLanes({ control }) };
      },
      describe: ({ prepared }) => ({ toolId: "mail_set_provider", errorCode: "MAIL", title: `Send this site's email through ${prepared.label}?`,
        details: [{ label: "Provider", value: `${prepared.label} (${prepared.providerId})` }, { label: "Applies to", value: "Transactional and bulk mail" }, ...currentLanesDetail(prepared)],
        warning: "From the next message on, every email this site sends (sign-in links, confirmations, form notifications, newsletters) goes through this provider.", confirmLabel: "Switch provider" }),
      run: async ({ ctx, prepared }) => {
        // The card may sit open for minutes: recheck the grant at the moment of the write.
        await permission(deps, ctx, "settings.workspace.write");
        // The shared activation re-checks the provider too: a key deleted meanwhile refuses, unchanged.
        await asToolInputError({ run: () => activateMailProvider({ control: providerControl(deps), providerId: prepared.providerId, principalId: ctx.principal.id }) });
        return { set: true, providerId: prepared.providerId };
      },
    }, { flag: "set" }),
    mail_send_test: approvalToolHandler({ surfaces,
      prepare: async ({ ctx }) => {
        const to = readTestRecipient({ value: requireInputRecord({ input: ctx.input }).to });
        await permission(deps, ctx, "admin.forms.manage");
        const plan = await planMailTestSend({ ...{ principalId: ctx.principal.id, ...(to === undefined ? {} : { to }) }, deps: deps });
        // Display metadata must not prevent preparing a send when the catalog read is unavailable.
        const providers = await deps.mailProviderControl?.describe?.().catch(() => undefined);
        return { ...plan, providerLabel: providers?.providers.find(provider => provider.id === plan.approval.providerId)?.label ?? plan.driver };
      },
      describe: ({ prepared }) => ({ toolId: "mail_send_test", errorCode: "MAIL", title: `Send a test email to ${prepared.to}?`,
        details: [{ label: "From", value: prepared.approval.from.email }, { label: "To", value: prepared.to }, { label: "Through", value: prepared.providerLabel }, ...testModeDetails(prepared)], confirmLabel: "Send test email" }),
      run: async ({ ctx, prepared }) => {
        await permission(deps, ctx, "admin.forms.manage");
        const result = await runMailTestSend({ deps, principalId: ctx.principal.id, plan: prepared, ref: ctx.executionId });
        // `sent` means it left for its recipient; a capture or a refusal did not. Never "delivered".
        return { sent: result.outcome === "accepted" || result.outcome === "redirected", ...result };
      },
    }, { flag: "sent" }),
  }, rules: [forbiddenRule({ domainPrefix: "MAIL_STATUS", error: ForbiddenError })] }) });
}

/** Keeps the diagnostic and its controls under a unique contributor domain. */
export function contributeMailStatusTools(): ToolContributor {
  return { domain: "system-mail", build: buildMailStatusRegistrations, risk: mailStatusDerivedRisk };
}
