import { createCustomCredential, updateCustomCredential, type CustomCredentialWriteDeps } from "#src/features/custom-credentials/index";
import type { MailProviderConfiguration, MailProviderConfigurationReport, MailProviderControl } from "#src/platform/mail/mail-status";

/**
 * @file The mail provider operations the admin HTTP routes (`server/inbound/admin-http/routes/system/
 * mail-providers.ts`) and the assistant tools (`./tool-registrations.ts`) share (email phase 2,
 * 2026-10-22), so UI and assistant can never disagree about what a provider needs or whether a
 * switch is allowed. Callers authorize first; these functions only decide and act.
 *
 * Configuring and activating are separate on purpose: saving a key never changes which provider
 * sends, and a switch always re-checks availability at the moment it writes, so a refused switch
 * leaves the current setup exactly as it was. Credentials are written through the existing
 * custom-credentials store (label + category from the provider catalog) — never a second store.
 */

/** Custom-credential category mail keys are filed under (mirrors `mail-provider-catalog.ts`). */
const MAIL_CREDENTIAL_CATEGORY = "ops";

export type MailProviderOperationCode = "MAIL_PROVIDER_CONTROL_UNAVAILABLE" | "MAIL_PROVIDER_NOT_FOUND" | "MAIL_PROVIDER_KEYLESS" | "MAIL_PROVIDER_REFUSED" | "MAIL_PROVIDER_INPUT";

/** A refusal with a caller-safe message; nothing was changed when one is thrown. */
export class MailProviderOperationError extends Error {
  readonly code: MailProviderOperationCode;
  constructor(required: { code: MailProviderOperationCode; message: string }) {
    super(required.message);
    this.name = "MailProviderOperationError";
    this.code = required.code;
  }
}

/** What saving this provider's key takes: the exact label and category, and create vs rotate. */
export interface MailProviderCredentialPlan {
  readonly provider: MailProviderConfiguration;
  readonly credential: {
    readonly action: "create" | "rotate";
    readonly label: string;
    readonly category: typeof MAIL_CREDENTIAL_CATEGORY;
    /** The setup form's non-secret default endpoint, when the provider declares one. */
    readonly baseUrl?: string;
    readonly credentialId?: string;
  };
}

function requireControl(control: MailProviderControl | undefined): MailProviderControl & Required<Pick<MailProviderControl, "describe">> {
  if (!control?.describe) throw new MailProviderOperationError({ code: "MAIL_PROVIDER_CONTROL_UNAVAILABLE", message: "Mail provider configuration is unavailable on this server. Nothing was changed." });
  return control as MailProviderControl & Required<Pick<MailProviderControl, "describe">>;
}

/**
 * Every installed provider's safe configuration (no secrets).
 * @throws {MailProviderOperationError} When this root has no provider control.
 * @complexity One catalog load and one credential list.
 */
export async function readMailProviderConfigurations(required: { control: MailProviderControl | undefined }, _optional: Record<string, never> = {}): Promise<MailProviderConfigurationReport> {
  return requireControl(required.control).describe();
}

/**
 * The credential a provider needs before it can be activated. Changes nothing.
 * @throws {MailProviderOperationError} Unknown provider, or one that reads no saved key.
 * @complexity One {@link readMailProviderConfigurations}.
 */
export async function planMailProviderCredential(required: { control: MailProviderControl | undefined; providerId: string }, _optional: Record<string, never> = {}): Promise<MailProviderCredentialPlan> {
  const report = await readMailProviderConfigurations({ control: required.control });
  const provider = report.providers.find((entry) => entry.id === required.providerId);
  if (!provider) throw new MailProviderOperationError({ code: "MAIL_PROVIDER_NOT_FOUND", message: `'${required.providerId}' is not an installed mail provider (installed: ${report.providers.map((entry) => entry.id).join(", ")}).` });
  const label = provider.credential.label;
  if (!provider.credential.required || label === undefined) throw new MailProviderOperationError({ code: "MAIL_PROVIDER_KEYLESS", message: `'${provider.id}' needs no saved key; it can be selected directly.` });
  const baseUrl = provider.setup.fields.find((field) => field.key === "baseUrl")?.defaultValue;
  const credentialId = provider.credential.credentialId;
  return { provider, credential: {
    action: credentialId ? "rotate" : "create", label, category: MAIL_CREDENTIAL_CATEGORY,
    ...(baseUrl ? { baseUrl } : {}), ...(credentialId ? { credentialId } : {}),
  } };
}

/** Non-secret and secret parts of a key save; every part optional on a rotation. */
export interface MailProviderCredentialInput {
  readonly token?: string;
  readonly username?: string;
  readonly baseUrl?: string;
}

/**
 * Saves (creates or rotates) a provider's key WITHOUT activating it, then drops the resolver's
 * cached mailers so the next send uses it. HTTP only: assistant tools never carry a secret and
 * use `credential_save` with {@link planMailProviderCredential}'s label instead.
 * @returns The provider's fresh configuration.
 * @throws {MailProviderOperationError} Plan refusals, or a create without a token; store
 *   validation errors (`CustomCredentialValidationError`, duplicates) propagate unchanged.
 * @complexity One plan, one store write, one describe.
 */
export async function saveMailProviderCredential(
  required: { control: MailProviderControl | undefined; credentials: CustomCredentialWriteDeps; workspaceId: string; providerId: string; input: MailProviderCredentialInput },
  _optional: Record<string, never> = {}
): Promise<MailProviderConfiguration> {
  const { control, credentials, workspaceId, input } = required;
  const plan = await planMailProviderCredential({ control, providerId: required.providerId });
  if (plan.credential.credentialId) await rotate({ credentials, workspaceId, id: plan.credential.credentialId, input });
  else await create({ credentials, workspaceId, plan, input });
  control!.invalidate?.();
  const fresh = await readMailProviderConfigurations({ control });
  return fresh.providers.find((entry) => entry.id === plan.provider.id) ?? plan.provider;
}

async function create(required: { credentials: CustomCredentialWriteDeps; workspaceId: string; plan: MailProviderCredentialPlan; input: MailProviderCredentialInput }): Promise<void> {
  const { input, plan } = required;
  if (!input.token) throw new MailProviderOperationError({ code: "MAIL_PROVIDER_INPUT", message: `token is required to save the first key for '${plan.provider.id}'.` });
  await createCustomCredential(required.credentials, {
    workspaceId: required.workspaceId, label: plan.credential.label, category: plan.credential.category,
    baseUrl: input.baseUrl ?? plan.credential.baseUrl, connection: { token: input.token, ...(input.username ? { username: input.username } : {}) },
  });
}

/** Replacing the token resets the stored username unless one is passed, so the current one is carried. */
async function rotate(required: { credentials: CustomCredentialWriteDeps; workspaceId: string; id: string; input: MailProviderCredentialInput }): Promise<void> {
  const { credentials, workspaceId, id, input } = required;
  const existing = input.token && input.username === undefined ? await credentials.repo.findById({ workspaceId, id }) : null;
  const username = input.username ?? existing?.username;
  await updateCustomCredential(credentials, {
    workspaceId, id, ...(input.token ? { connection: { token: input.token } } : {}),
    ...(username !== undefined ? { username } : {}), ...(input.baseUrl ? { baseUrl: input.baseUrl } : {}),
  });
}

/**
 * Switches BOTH lanes to `providerId`. Re-checks availability first (the key may have been deleted
 * while an approval card sat open); a refused check or a failed write changes nothing.
 * @throws {MailProviderOperationError} No control, or the provider cannot send now.
 * @complexity One check (credential decrypt), one setting write.
 */
export async function activateMailProvider(
  required: { control: MailProviderControl | undefined; providerId: string; principalId: string },
  _optional: Record<string, never> = {}
): Promise<{ set: true; providerId: string; label: string }> {
  const { control, providerId } = required;
  if (!control) throw new MailProviderOperationError({ code: "MAIL_PROVIDER_CONTROL_UNAVAILABLE", message: "Mail provider selection is unavailable on this server. Nothing was changed." });
  const check = await checkMailProvider({ control, providerId });
  await control.select({ id: providerId, principalId: required.principalId });
  control.invalidate?.();
  return { set: true, providerId, label: check.label };
}

/**
 * Whether `providerId` could be activated now. Sends nothing, writes nothing.
 * @throws {MailProviderOperationError} With the refusal reason.
 */
export async function checkMailProvider(required: { control: MailProviderControl; providerId: string }, _optional: Record<string, never> = {}): Promise<{ label: string }> {
  const check = await required.control.check({ id: required.providerId });
  if (!check.ok) throw new MailProviderOperationError({ code: "MAIL_PROVIDER_REFUSED", message: `Cannot switch to ${check.reason}. Nothing was changed.` });
  return { label: check.label };
}
