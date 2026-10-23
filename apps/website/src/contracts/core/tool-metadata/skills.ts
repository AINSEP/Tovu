import type { ToolMetadataById } from '@jini-ai/core';
import type { ToolApprovalPolicy } from '../../headless/assistant-tool-approval-policy.js';

/** skills registration declarations; shared placement rationale is in ./index.ts. */
export const toolMetadata = {
  "skills_install": {
    search: {
      keywords: "skill skills install add new repo repository url agent skill SKILL.md from",
    },
    approval: { class: 'edit', confirmation: 'direct' },
  },
} as const satisfies ToolMetadataById<ToolApprovalPolicy>;
