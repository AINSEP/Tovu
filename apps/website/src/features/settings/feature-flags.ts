/** Tovu boolean rollouts use the existing audited settings ledger, with no second store/cache. */
import { evaluateFeatureFlag, type FeatureFlagDecision } from '@jini-ai/core';
import { ensureSettingDefinitions, getEffective, SCOPE_BIT, type EnsureSettingDefinitionsDeps, type SettingsRepoPort } from '@jini-ai/core/settings';

export const FEATURE_FLAGS_NAMESPACE = 'core.feature-flags';
export interface FeatureFlagDefinition { key: string; environmentKey: string; defaultEnabled?: boolean }

/** Register one host-declared flag via the canonical settings owner. Existing values survive boot.
 * @complexity O(1) repository work; ledger failures propagate.
 */
export function ensureFeatureFlag(
  { deps, flag, systemPrincipalId }: { deps: EnsureSettingDefinitionsDeps; flag: FeatureFlagDefinition; systemPrincipalId: string },
  _options: Record<string, never> = {},
): Promise<void> {
  return ensureSettingDefinitions(deps, { namespace: FEATURE_FLAGS_NAMESPACE, systemPrincipalId,
    definitions: [{ key: flag.key, schema: { type: 'boolean' }, defaultValue: flag.defaultEnabled ?? false, scopes: SCOPE_BIT.workspace }],
  });
}

/** Resolve the current workspace at call time; environment/runtime overrides need no storage read.
 * Environment is supplied by the composition caller, never read from process globals here.
 * @returns A disabled decision for missing/invalid values; repository failures propagate.
 * @complexity O(1), at most the settings resolver's bounded indexed reads. No writes.
 */
export async function readFeatureFlag(
  { settingsRepo, workspaceId, flag, env }: { settingsRepo: SettingsRepoPort; workspaceId: string; flag: FeatureFlagDefinition; env: Readonly<Record<string, string | undefined>> },
  { runtime }: { runtime?: boolean } = {},
): Promise<FeatureFlagDecision> {
  const environment = env[flag.environmentKey];
  if (environment !== undefined || runtime !== undefined) return evaluateFeatureFlag({ key: flag.key }, { environment, runtime });
  const resolved = await getEffective({ repo: settingsRepo }, { namespace: FEATURE_FLAGS_NAMESPACE, key: flag.key, scopeContext: { workspaceId } });
  return evaluateFeatureFlag({ key: flag.key }, {
    ...(resolved && resolved.sourceLayer !== 'default' ? { workspace: resolved.value } : {}),
    defaultEnabled: flag.defaultEnabled ?? false,
  });
}
