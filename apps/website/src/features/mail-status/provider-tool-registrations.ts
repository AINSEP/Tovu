import { toolMetadata } from "../../contracts/core/tool-metadata/mail-status.js";
import { buildDomainRegistrations, indexCatalogById, requireInputRecord, ToolInputError, type AgentToolSideEffect, type DerivedRiskByToolId, type ToolExecutionContext, type ToolRegistration } from "@jini-ai/core";
import { adaptLegacyAuthorize, ForbiddenError, requireToolPermission } from "@jini-ai/cms/core";
import { forbiddenRule, withModelFacingErrors } from "@jini-ai/core/model-facing-tool-errors";
import type { ToolContributor } from "#src/assistant/index";
import { issueCredentialSetup } from "#src/contracts/core/tool-failure-diagnostics";
import type { AuthorizeFn } from "../../contracts/core/commands/index.js";
import type { MailProviderControl, MailProviderConfigurationReport } from "../../platform/mail/mail-status.js";
import { mailProviderAgentToolCatalog } from "./provider-agent-tools.js";
import { MailProviderOperationError, planMailProviderCredential, readMailProviderConfigurations, type MailProviderCredentialPlan } from "./provider-operations.js";

/**
 * @file Assistant adapters for the shared provider operations (`./provider-operations.ts`), the
 * same ones the admin `system/mail-providers` routes call. Kept apart from `./tool-registrations.ts`
 * so the provider configuration slice and the status/test-send slice evolve independently.
 */

export interface MailProviderToolDeps {
  authorize: AuthorizeFn; workspaceId: string;
  /** Absent in hermetic roots: both tools refuse and change nothing. */
  mailProviderControl?: MailProviderControl;
}

export const mailProviderDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> mailProviderControl.describe: one catalog load and one credential-row list; no decrypt.
  ["mail_list_providers", "none"],
  // -> the same read; the key itself is written later by credential_save's human form.
  ["mail_configure_provider", "none"],
]);

/** Runs a shared operation; its refusal reaches the model as a plain input error. */
export async function asToolInputError<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof MailProviderOperationError) throw new ToolInputError({ message: err.message });
    throw err;
  }
}

/** The lanes before a switch, when this root can describe them; a describe fault hides only this detail. */
export async function readCurrentLanes(required: { control: MailProviderControl }): Promise<MailProviderConfigurationReport["setting"] | undefined> {
  if (!required.control.describe) return undefined;
  return (await required.control.describe().catch(() => undefined))?.setting;
}

/** A split-lane setup is shown before it is flattened, never silently. */
export function currentLanesDetail(required: { current?: MailProviderConfigurationReport["setting"] }): { label: string; value: string }[] {
  const current = required.current;
  if (!current || current.transactional === current.bulk) return [];
  return [{ label: "Currently", value: `Transactional: ${current.transactional ?? "none"}; bulk: ${current.bulk ?? "none"}. Both lanes will use the new provider.` }];
}

/** credential_save's non-secret prefill: create with the exact label/category, or rotate by label. */
function credentialPrefill(plan: MailProviderCredentialPlan): Record<string, string> {
  const { action, label, category, baseUrl } = plan.credential;
  if (action === "rotate") return { kind: "api", target: label };
  return { kind: "api", label, category, ...(baseUrl ? { baseUrl } : {}) };
}

function permission(deps: MailProviderToolDeps, ctx: ToolExecutionContext, name: string): Promise<unknown> {
  return requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: name }, { entityType: "mail" });
}

function readProviderId(input: unknown): string {
  const record = requireInputRecord({ input });
  const providerId = typeof record.providerId === "string" ? record.providerId.trim() : "";
  if (!providerId) throw new ToolInputError({ message: "providerId must be an installed provider id from mail_list_providers." });
  return providerId;
}

/**
 * `mail_list_providers` and `mail_configure_provider`.
 * @param deps - Site scope, authorization and the provider control seam.
 * @returns The two registrations.
 * @throws {ToolInputError} For malformed input, a refusal or a denied permission.
 * @complexity One catalog load and one credential list per call.
 */
export function buildMailProviderRegistrations(deps: MailProviderToolDeps): ToolRegistration[] {
  return buildDomainRegistrations({ metadata: toolMetadata, domain: "system-mail-providers", catalogModule: "features/mail-status/provider-agent-tools.ts", catalog: indexCatalogById({ catalog: mailProviderAgentToolCatalog }), derivedRisk: mailProviderDerivedRisk, handlers: withModelFacingErrors({ handlers: {
    mail_list_providers: async (ctx) => {
      requireInputRecord({ input: ctx.input });
      await permission(deps, ctx, "admin.forms.manage");
      return asToolInputError(() => readMailProviderConfigurations({ control: deps.mailProviderControl }));
    },
    mail_configure_provider: async (ctx) => {
      const providerId = readProviderId(ctx.input);
      await permission(deps, ctx, "custom-credentials.write");
      const plan = await asToolInputError(() => planMailProviderCredential({ control: deps.mailProviderControl, providerId }));
      return { activated: false, ...plan, credentialSetup: issueCredentialSetup({ setupToolId: "credential_save", prefill: credentialPrefill(plan) }, {}) };
    },
  }, rules: [forbiddenRule({ domainPrefix: "MAIL_PROVIDERS", error: ForbiddenError })] }) });
}

/** Registers the provider configuration tools under their own contributor domain. */
export function contributeMailProviderTools(): ToolContributor {
  return { domain: "system-mail-providers", build: buildMailProviderRegistrations, risk: mailProviderDerivedRisk };
}
