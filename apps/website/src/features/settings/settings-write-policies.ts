import type { JsonValue } from "@jini-ai/core/primitives";
import { ForbiddenError, ValueValidationFailedError, type ClearValueRequired, type ResetNamespaceRequired, type SetValueRequired } from "@jini-ai/core/settings";
import {
  clear as clearWithPolicies, dedicatedSettingsWriters, refuseDedicatedSettingClear as refuseClearWithPolicies,
  refuseDedicatedSettingReset as refuseResetWithPolicies, resetNamespace as resetWithPolicies, set as setWithPolicies,
  type SiteSettingsSetFn, type SiteSettingsWritePolicies,
} from "@jini-ai/cms/settings/site/site-title-write";

import type { VisitorToolsHostContract } from "@jini-ai/cms/settings/site/visitor-tools-contract";

import {
  parseVisitorToolPolicy, resolveVisitorToolChoice, visitorToolsObject, VisitorToolPolicyValidationError, VISITOR_TOOL_CALLS_PER_TURN,
  VISITOR_TOOL_DEFAULT_LIMITS, VISITOR_TOOLS_PERMISSION, VISITOR_TOOLS_SETTING, VISITOR_TOOLS_WRITE_REASON,
} from "../../contracts/site-assistant/visitor-tools.js";

/**
 * @file This host's settings write policy, bound once into the package chokepoint
 * (`@jini-ai/cms/settings/site/site-title-write`): the visitor-tools dedicated writer and its
 * stored-policy validation stay host contracts. Every host write path imports `set`/`clear`/
 * `resetNamespace` from this directory's barrel, so binding here keeps each caller's call shape.
 */

/** A dedicated permission cannot authorize a personal/global policy or invalid stored JSON. */
function validateVisitorToolsWrite({ required }: { required: SetValueRequired }, _options = {}): SetValueRequired {
  if (required.input.scope !== "workspace") throw new ForbiddenError(VISITOR_TOOLS_WRITE_REASON);
  try {
    const policy = parseVisitorToolPolicy({ value: required.input.value });
    return { ...required, input: { ...required.input, value: policy as unknown as JsonValue } };
  } catch {
    throw new ValueValidationFailedError("Invalid visitor-tools policy.");
  }
}

/** This host's visitor-tools policy contract, bound once for the package's visitor-tools management
 * (`@jini-ai/cms/settings/site/visitor-tools-*`): the parser, its error, coordinates and limits stay host contracts. */
export const VISITOR_TOOLS_HOST: VisitorToolsHostContract = {
  setting: VISITOR_TOOLS_SETTING, permission: VISITOR_TOOLS_PERMISSION,
  defaultLimits: VISITOR_TOOL_DEFAULT_LIMITS, callsPerTurn: VISITOR_TOOL_CALLS_PER_TURN,
  ValidationError: VisitorToolPolicyValidationError, object: visitorToolsObject,
  parsePolicy: parseVisitorToolPolicy, resolveChoice: resolveVisitorToolChoice,
};

/** The host's dedicated writers, passed on every chokepoint call and to the writers that wrap it. */
export const SETTINGS_WRITE_POLICIES: SiteSettingsWritePolicies = {
  dedicatedWriters: [
    { ...VISITOR_TOOLS_SETTING, permissionOverride: VISITOR_TOOLS_PERMISSION, reason: VISITOR_TOOLS_WRITE_REASON, normalize: validateVisitorToolsWrite },
  ],
};

/** Every generic path's refused coordinates: the package's comments provider, then this host's. */
export const DEDICATED_SETTINGS_WRITERS = dedicatedSettingsWriters({ writePolicies: SETTINGS_WRITE_POLICIES });

/** The package chokepoint `set` with this host's write policy bound. @complexity As the package `set`. */
export const set: SiteSettingsSetFn = (required, optional = {}) => setWithPolicies({ ...required, writePolicies: SETTINGS_WRITE_POLICIES }, optional);

/** The guarded `clear` with this host's write policy bound. @complexity As the package `clear`. */
export function clear(required: ClearValueRequired, _optional = {}): Promise<{ revisionSeq: number }> {
  return clearWithPolicies({ ...required, writePolicies: SETTINGS_WRITE_POLICIES });
}

/** The guarded namespace reset with this host's write policy bound. @complexity As the package reset. */
export function resetNamespace(required: ResetNamespaceRequired & { keysInNamespace: string[] }, _optional = {}): ReturnType<typeof resetWithPolicies> {
  return resetWithPolicies({ ...required, writePolicies: SETTINGS_WRITE_POLICIES });
}

/** Refuse a generic clear of any dedicated writer's setting. @complexity One bounded alias resolution. */
export function refuseDedicatedSettingClear(required: Omit<Parameters<typeof refuseClearWithPolicies>[0], "writePolicies">, _optional = {}): Promise<void> {
  return refuseClearWithPolicies({ ...required, writePolicies: SETTINGS_WRITE_POLICIES });
}

/** Refuse a namespace reset that would clear a dedicated writer's key. @complexity O(d) definitions. */
export function refuseDedicatedSettingReset(required: Omit<Parameters<typeof refuseResetWithPolicies>[0], "writePolicies">, _optional = {}): Promise<void> {
  return refuseResetWithPolicies({ ...required, writePolicies: SETTINGS_WRITE_POLICIES });
}

// Keep existing host imports compatible while the one table guards both dedicated settings.
export { refuseDedicatedSettingClear as refuseCommentsProviderClear, refuseDedicatedSettingReset as refuseCommentsProviderReset };
