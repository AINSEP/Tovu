import type { ToolMetadataById } from "@jini-ai/core";
import type { ToolApprovalPolicy } from "./approval-policy.js";

/** Site-guide registration declarations; shared placement rationale is in ./index.ts. */
export const toolMetadata = {
  site_guide: {
    search: {
      keywords: "how tovu works site guide learn building blocks forms widgets markers themes members SEO deploy plugins Jini",
      queries: ["How does Tovu work?", "Design a planner directory site."],
    },
    approval: { class: "read", confirmation: "direct" },
  },
} as const satisfies ToolMetadataById<ToolApprovalPolicy>;
