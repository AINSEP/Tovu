import { ensureSettingDefinitions, getEffective, SCOPE_BIT, type EnsureSettingDefinitionsDeps, type SettingsRepoPort } from '@jini-ai/core/settings';
import type { PaymentMode } from '@jini-ai/commerce/payments/kernel';

/** Public selection only; provider credentials stay in the existing sealed provider settings. */
export interface CommerceConfiguration {
  providerId: string;
  accountId: string;
  mode: PaymentMode;
  publicOrigin: string;
}

/** Register one optional selection in the existing settings ledger; no commerce tables are created.
 * @complexity One bounded settings-definition operation. */
export async function ensureCommerceSetting({ deps, systemPrincipalId }: {
  deps: EnsureSettingDefinitionsDeps; systemPrincipalId: string;
}, _optional = {}): Promise<void> {
  await ensureSettingDefinitions(deps, { namespace: 'core.commerce', systemPrincipalId,
    definitions: [{ key: 'configuration', schema: { type: 'json' }, defaultValue: {}, scopes: SCOPE_BIT.workspace }] });
}

/** A complete explicit merchant selection; absent/invalid settings keep checkout unavailable.
 * @complexity One settings-ledger read, O(1) application space. */
export async function readCommerceConfiguration({ settingsRepo, workspaceId }: {
  settingsRepo: SettingsRepoPort; workspaceId: string;
}, _optional = {}): Promise<CommerceConfiguration | null> {
  const resolved = await getEffective({ repo: settingsRepo }, {
    namespace: 'core.commerce', key: 'configuration', scopeContext: { workspaceId },
  });
  const value = resolved?.value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { providerId, accountId, mode, publicOrigin } = value;
  if (typeof providerId !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(providerId)) return null;
  if (typeof accountId !== 'string' || !accountId.trim()) return null;
  if (mode !== 'test' && mode !== 'live') return null;
  if (typeof publicOrigin !== 'string' || !publicOrigin.trim()) return null;
  return { providerId, accountId, mode, publicOrigin };
}
