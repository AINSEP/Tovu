import type { ToolMetadataById } from '@jini-ai/core';
import type { ToolApprovalPolicy } from '../../headless/assistant-tool-approval-policy.js';

/** site-evidence registration declarations; shared placement rationale is in ./index.ts. */
export const toolMetadata = {

  "site_collect_page_evidence": {
    search: {
      keywords: "evidence audit check compliance verify rendered really does prove tracking consent",
    },
    approval: { class: 'read', confirmation: 'direct' },
  },
} as const satisfies ToolMetadataById<ToolApprovalPolicy>;
