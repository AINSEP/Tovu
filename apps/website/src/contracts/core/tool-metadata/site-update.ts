import type { ToolMetadataById } from '@jini-ai/core';
import type { ToolApprovalPolicy } from '@jini-ai/core/contracts/site/tool-metadata-approval-policy';

/** site-update registration declarations; shared placement rationale is in ./index.ts. */
export const toolMetadata = {
  "site_update_check": {
    search: {
      keywords: "update upgrade new version available latest release check outdated",
      queries: ["Is there a newer version of the site software?", "Do I need to update?"],
    },
    approval: { class: 'read', confirmation: 'direct' },
  },
} as const satisfies ToolMetadataById<ToolApprovalPolicy>;
