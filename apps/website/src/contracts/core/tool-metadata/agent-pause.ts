import type { ToolMetadataById } from "@jini-ai/core";
import type { ToolApprovalPolicy } from "@jini-ai/core/contracts/site/tool-metadata-approval-policy";

/** Agent-pause registration declarations (H4); shared placement rationale is in ./index.ts.
 *  `direct`: the tool holds its own call open for the approval card, so no second policy prompt. */
export const toolMetadata = {
  resume_agent_work: {
    search: {
      keywords: "resume agent work paused assistant switch webhooks scheduled posts publishes hold release approve",
      queries: ["Resume the agent work that was paused.", "Release the paused scheduled posts and webhooks."],
    },
    approval: { class: "edit", confirmation: "direct" },
  },
} as const satisfies ToolMetadataById<ToolApprovalPolicy>;
