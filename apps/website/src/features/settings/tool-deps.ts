import type { ToolExecutionContext, RememberedApprovalPort } from "@jini-ai/core";
import type { SettingsToolDeps as CoreSettingsToolDeps } from "@jini-ai/core/settings";
import type { AssistantAgentInventory } from "#src/assistant/agent-discovery";
import type { set } from "./site-title-write.js";

/** Native grants are bound to the invoking plugin's admitted identity/version/digest, never model input. */
export type SettingsToolDeps = CoreSettingsToolDeps & {
  assistantAgentInventory?: AssistantAgentInventory;
  /** The composed host writer applies title bounds and visitor-credential policy alike. */
  set?: typeof set;
  nativeApprovalMemory?: RememberedApprovalPort;
  approvalIdentityForRun?: (required: { ctx: ToolExecutionContext }) => Promise<{ key: string; label: string; version?: string }>;
};

