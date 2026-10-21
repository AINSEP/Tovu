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
import { isMailDeliveryAvailable, MAIL_DELIVERY_UNAVAILABLE_NOTE, mailSenderIdentityFor, type MailerPort, type MailSenderIdentityPort } from "../../platform/mail/index.js";
import type { MailProviderControl, MailStatusReport } from "../../platform/mail/mail-status.js";
import { mailStatusAgentToolCatalog } from "./agent-tools.js";

export interface MailStatusToolDeps {
  authorize: AuthorizeFn; workspaceId: string; mailer: MailerPort;
  /** Lanes, providers and warnings (`server/runtime/boot/resolve-mailer.ts`); absent in hermetic roots. */
  mailStatus?: () => Promise<MailStatusReport>;
  /** Provider selection for `mail_set_provider`; absent, that tool refuses and changes nothing. */
  mailProviderControl?: MailProviderControl;
  /** The operator's account, for `mail_send_test`'s only recipient. */
  userRepo?: Pick<UserRepoPort, "findByPrincipalId">;
  /** The site's system-mail From (`platform/mail/sender-identity.ts`). */
  mailSenderIdentity?: MailSenderIdentityPort;
}
export const mailStatusDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> mailer.capabilities() only; the adapter may refresh configuration, but sends/writes nothing.
  ["system_get_mail_status", "none"],
  // -> mailProviderControl.select: one settings-ledger write of core.mail.provider.
  ["mail_set_provider", "mutates-durable-state"],
  // -> mailer.send: one delivery (ledger row, provider call) to the operator's own address.
  ["mail_send_test", "mutates-durable-state"],
]);

/** Placeholder From for a non-delivering mailer; a real provider gets the site's configured sender. */
const TEST_FALLBACK_SENDER = { email: "no-reply@mail.local", name: "Tovu" } as const;

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

/**
 * The signed-in operator's own address: the account email, else a username that is an address.
 * @throws {ToolInputError} When the account has no address, so no test can go anywhere else.
 */
async function operatorAddress(deps: MailStatusToolDeps, principalId: string): Promise<string> {
  const user = await deps.userRepo?.findByPrincipalId({ workspaceId: deps.workspaceId, principalId });
  const address = [user?.email, user?.username].find((value) => typeof value === "string" && value.includes("@"));
  if (!address) throw new ToolInputError({ message: "Your account has no email address, so there is nowhere to send a test. Add one to your user profile first. Nothing was sent." });
  return address;
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
      requireInputRecord({ input: ctx.input });
      await permission(deps, ctx, "admin.forms.manage");
      const mailDeliveryAvailable = isMailDeliveryAvailable(deps.mailer);
      const status = deps.mailStatus ? await deps.mailStatus() : {};
      return { mailDeliveryAvailable, driver: deps.mailer.capabilities().driver, note: mailDeliveryAvailable ? "Email sending is configured." : MAIL_DELIVERY_UNAVAILABLE_NOTE, ...status };
    },
    // No rememberKey: a provider switch redirects every email the site sends, so it always asks.
    mail_set_provider: approvalToolHandler({ surfaces,
      prepare: async ({ ctx }) => {
        const providerId = readProviderId(ctx.input);
        await permission(deps, ctx, "settings.workspace.write");
        const check = await providerControl(deps).check({ id: providerId });
        if (!check.ok) throw new ToolInputError({ message: `Cannot switch to ${check.reason}. Nothing was changed.` });
        return { providerId, label: check.label };
      },
      describe: ({ prepared }) => ({ toolId: "mail_set_provider", errorCode: "MAIL", title: `Send this site's email through ${prepared.label}?`,
        details: [{ label: "Provider", value: `${prepared.label} (${prepared.providerId})` }, { label: "Applies to", value: "Transactional and bulk mail" }],
        warning: "From the next message on, every email this site sends (sign-in links, confirmations, form notifications, newsletters) goes through this provider.", confirmLabel: "Switch provider" }),
      run: async ({ ctx, prepared }) => {
        // The card may sit open for minutes: recheck the grant at the moment of the write.
        await permission(deps, ctx, "settings.workspace.write");
        await providerControl(deps).select({ id: prepared.providerId, principalId: ctx.principal.id });
        return { set: true, providerId: prepared.providerId };
      },
    }, { flag: "set" }),
    mail_send_test: approvalToolHandler({ surfaces,
      prepare: async ({ ctx }) => {
        requireInputRecord({ input: ctx.input });
        await permission(deps, ctx, "admin.forms.manage");
        return { to: await operatorAddress(deps, ctx.principal.id) };
      },
      describe: ({ prepared }) => ({ toolId: "mail_send_test", errorCode: "MAIL", title: `Send a test email to ${prepared.to}?`,
        details: [{ label: "To", value: prepared.to }, { label: "Through", value: deps.mailer.capabilities().driver }], confirmLabel: "Send test email" }),
      run: async ({ ctx, prepared }) => {
        await permission(deps, ctx, "admin.forms.manage");
        const senderIdentity = mailSenderIdentityFor({ mailer: deps.mailer }, deps.mailSenderIdentity ? { senderIdentity: deps.mailSenderIdentity } : {});
        const from = await senderIdentity.resolve({ workspaceId: deps.workspaceId, fallback: TEST_FALLBACK_SENDER });
        const result = await deps.mailer.send(
          { workspaceId: deps.workspaceId, to: { email: prepared.to }, from, subject: "Test email from your site", text: "This is a test email sent at your request. If you can read it, your site can deliver email." },
          // The operator is waiting on this message: transactional, interactive lane.
          { idempotencyKey: `mail:test:${ctx.executionId}`, workspaceId: deps.workspaceId, sourceContext: { module: "mail", ref: ctx.executionId }, purpose: "transactional", lane: "interactive" },
        );
        return result.ok
          ? { sent: true, to: prepared.to, providerMessageId: result.providerMessageId }
          : { sent: false, to: prepared.to, errorCode: result.errorCode, message: result.message };
      },
    }, { flag: "sent" }),
  }, rules: [forbiddenRule({ domainPrefix: "MAIL_STATUS", error: ForbiddenError })] }) });
}

/** Keeps the diagnostic and its controls under a unique contributor domain. */
export function contributeMailStatusTools(): ToolContributor {
  return { domain: "system-mail", build: buildMailStatusRegistrations, risk: mailStatusDerivedRisk };
}
