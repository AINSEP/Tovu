import type { JsonValue } from "@jini-ai/core/primitives";
import { ensureSettingDefinitions, getEffective, SCOPE_BIT, type EnsureSettingDefinitionsDeps, type SetValueRequired, type SettingsRepoPort } from "@jini-ai/core/settings";
import type { MailProviderSetting } from "@jini-ai/platform/mail";

import { set } from "./site-title-write.js";

/**
 * @file Which mail provider each delivery lane uses, and the site's mail test mode, on the existing
 * settings ledger next to the sender (`mail-sender.ts`, same `core.mail` namespace):
 *
 * - `core.mail.provider` = Jini `MailProviderSetting` `{transactional, bulk}`; `null` per lane is the
 *   explicit `unconfigured` state. Unset (the registered default) means "never decided": boot writes
 *   the provider the old implicit chain picked, once (`server/runtime/boot/resolve-mailer.ts`).
 * - `core.mail.testMode` = `{mode: "off"}` | `{mode: "redirect", to}` | `{mode: "capture"}`.
 *
 * A malformed stored value fails closed: an invalid provider reads as both lanes unconfigured (never
 * as "unset", which would re-run the first-boot migration), an invalid test mode as `off`.
 */

export const MAIL_PROVIDER_NAMESPACE = "core.mail";
export const MAIL_PROVIDER_KEY = "provider";
export const MAIL_TEST_MODE_KEY = "testMode";

export type MailTestModeSetting = { mode: "off" } | { mode: "redirect"; to: string } | { mode: "capture" };

const UNCONFIGURED: MailProviderSetting = { transactional: null, bulk: null };

/**
 * Registers both definitions without replacing stored values. The provider default `{}` is never read as a value: an unstored setting is "unset".
 * @complexity O(1), two definitions.
 */
export function ensureMailProviderSettings(
  required: { deps: EnsureSettingDefinitionsDeps; systemPrincipalId: string },
  _optional: Record<string, never> = {}
): Promise<void> {
  return ensureSettingDefinitions(required.deps, { namespace: MAIL_PROVIDER_NAMESPACE, systemPrincipalId: required.systemPrincipalId, definitions: [
    { key: MAIL_PROVIDER_KEY, schema: { type: "json" }, defaultValue: {}, scopes: SCOPE_BIT.workspace },
    { key: MAIL_TEST_MODE_KEY, schema: { type: "json" }, defaultValue: { mode: "off" }, scopes: SCOPE_BIT.workspace },
  ] });
}

function isLaneValue(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && value !== "");
}

/**
 * The stored provider setting, or `null` when no value was ever stored (or the definition is not
 * registered). Pure. @complexity O(1).
 */
export function parseMailProviderSetting(required: { value: JsonValue | undefined }, _optional: Record<string, never> = {}): MailProviderSetting {
  const { value } = required;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return UNCONFIGURED;
  const record = value as Record<string, unknown>;
  if (!isLaneValue(record.transactional) || !isLaneValue(record.bulk)) return UNCONFIGURED;
  return { transactional: record.transactional, bulk: record.bulk };
}

/**
 * Reads `core.mail.provider` fresh. `null` = never stored (first boot).
 * @throws Propagates ledger failures.
 * @complexity One effective setting read.
 */
export async function readMailProviderSetting(
  required: { settingsRepo: SettingsRepoPort; workspaceId: string },
  _optional: Record<string, never> = {}
): Promise<MailProviderSetting | null> {
  const found = await getEffective({ repo: required.settingsRepo }, { namespace: MAIL_PROVIDER_NAMESPACE, key: MAIL_PROVIDER_KEY, scopeContext: { workspaceId: required.workspaceId } });
  if (!found || found.sourceLayer === "default") return null;
  return parseMailProviderSetting({ value: found.value });
}

/**
 * Writes both lanes through the host settings chokepoint (authorization is the caller's `deps`).
 * @complexity One settings write.
 */
export async function writeMailProviderSetting(
  required: { deps: SetValueRequired["deps"]; workspaceId: string; callerPrincipalId: string; value: MailProviderSetting },
  _optional: Record<string, never> = {}
): Promise<void> {
  await set({ deps: required.deps, input: {
    namespace: MAIL_PROVIDER_NAMESPACE, key: MAIL_PROVIDER_KEY, scope: "workspace", workspaceId: required.workspaceId,
    authWorkspaceId: required.workspaceId, callerPrincipalId: required.callerPrincipalId,
    value: { transactional: required.value.transactional, bulk: required.value.bulk },
  } });
}

/** Parses a stored test mode; anything unrecognised is `off`. Pure. @complexity O(1). */
export function parseMailTestMode(required: { value: JsonValue | undefined }, _optional: Record<string, never> = {}): MailTestModeSetting {
  const { value } = required;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return { mode: "off" };
  const record = value as Record<string, unknown>;
  if (record.mode === "capture") return { mode: "capture" };
  if (record.mode === "redirect" && typeof record.to === "string" && record.to.includes("@")) return { mode: "redirect", to: record.to.trim() };
  return { mode: "off" };
}

/**
 * Reads `core.mail.testMode` fresh, so switching it applies to the next send.
 * @complexity One effective setting read.
 */
export async function readMailTestMode(
  required: { settingsRepo: SettingsRepoPort; workspaceId: string },
  _optional: Record<string, never> = {}
): Promise<MailTestModeSetting> {
  const found = await getEffective({ repo: required.settingsRepo }, { namespace: MAIL_PROVIDER_NAMESPACE, key: MAIL_TEST_MODE_KEY, scopeContext: { workspaceId: required.workspaceId } });
  return parseMailTestMode({ value: found?.value });
}
