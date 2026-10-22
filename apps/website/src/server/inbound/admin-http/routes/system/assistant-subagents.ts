import { fullCliEnvLock, isHostedAssistantRuntime, resolveAssistantCliPermissions } from "#src/contracts/core/assistant-native-fallbacks";
import { resolveBundledHostSignals } from "#src/features/agent-plugins/host-signals";
import { readAssistantCliPermissions } from "#src/assistant/subagent-settings";
import { ASSISTANT_SUBAGENTS_NAMESPACE, ASSISTANT_CLI_PERMISSIONS_KEY, ASSISTANT_SUBAGENTS_WRITE_REASON,
  ASSISTANT_CLI_CAPABILITIES, assistantCliPermissions, type AssistantCliCapability } from "#src/contracts/headless/assistant-subagents-policy";
import { rejectSettingsRequest } from "../settings/shared.js";
import { registerAssistantOwnerGrantRoutes, type AssistantOwnerGrantDeps } from "./assistant-owner-grant.js";
import type { Express } from "express";

/** Owner/site-scoped CLI permissions through the existing authenticated, audited grant owner.
 * The master writes all defaults; explicit item choices survive until the master is changed.
 * @complexity O(1), fixed capability payload and one atomic ledger revision per write.
 */
export function registerAdminAssistantSubagentsRoutes(required: { app: Express; deps: AssistantOwnerGrantDeps }, _optional = {}): void {
  registerAssistantOwnerGrantRoutes({ ...required,
    path: "/api/admin/v1/workspaces/:workspaceId/system/assistant-full-cli",
    namespace: ASSISTANT_SUBAGENTS_NAMESPACE, key: ASSISTANT_CLI_PERMISSIONS_KEY,
    writeReason: ASSISTANT_SUBAGENTS_WRITE_REASON,
    validationError: "enabled and capability values must be booleans.",
    read: async () => readAssistantCliPermissions({ ...required.deps, principalId: await required.deps.ownerPrincipalId,
      settingsReady: required.deps.settingsUiTabsReady }, { readFailure: "throw" }),
    canEdit: ({ isOwner }) => isOwner && !isHostedAssistantRuntime({ env: process.env }, { hostSignals: resolveBundledHostSignals({ env: process.env }) }),
    // An env lock keeps canEdit (the owner's stored choice still saves) but must say why every
    // switch reads OFF; without a reason the dock showed clickable switches that snapped back.
    projectRead: ({ settings, isOwner }) => {
      const envLock = fullCliEnvLock({ env: process.env });
      const hostSignals = resolveBundledHostSignals({ env: process.env });
      return { ...resolveAssistantCliPermissions({ isOwner, env: process.env, settings }, { hostSignals }),
        ...(isHostedAssistantRuntime({ env: process.env }, { hostSignals }) ? { unavailableReason: "Not available on hosted sites" }
          : !isOwner ? { unavailableReason: "Only the owner can change agent permissions." }
          : envLock ? { unavailableReason: `Turned off on this computer by ${envLock}.` } : {}) };
    },
    parse: body => {
      const overrides = body.capabilities;
      if (overrides !== undefined && (!overrides || typeof overrides !== "object" || Array.isArray(overrides) ||
        Object.entries(overrides).some(([key, value]) => !ASSISTANT_CLI_CAPABILITIES.some(item => item.key === key) || typeof value !== "boolean"))) {
        rejectSettingsRequest({ status: 400, code: "VALIDATION_ERROR", error: "Unknown capability or non-boolean value." });
      }
      return assistantCliPermissions({ enabled: body.enabled as boolean,
        ...(overrides ? { capabilities: overrides as Partial<Record<AssistantCliCapability, boolean>> } : {}) });
    },
    value: settings => ({ enabled: settings.enabled, capabilities: { ...settings.capabilities } }),
  }, { requireAcknowledgment: false, scope: "user" });
}
