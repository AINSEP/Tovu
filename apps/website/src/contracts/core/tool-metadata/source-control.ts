import type { ToolMetadataById } from '@jini-ai/core';
import type { ToolApprovalPolicy } from '../../headless/assistant-tool-approval-policy.js';

/** source-control registration declarations; shared placement rationale is in ./index.ts. */
export const toolMetadata = {
  "source_control_execute_commit": {
    search: {
      keywords: "commit my site to a git repository push the site code export to repo commit changes github gitlab",
    },
    approval: { class: 'publish', confirmation: 'policy', rule: 'export-commit' },
  },
  // --- source control --------------------------------------------------------------------------------------
  // Connection-status questions distinguish source-control capabilities from deployment operations.
  "source_control_get_capabilities": {
    search: {
      keywords: "git source control connected ready can I commit repository credentials setup github gitlab bitbucket",
      queries: [
        "Is GitHub connected for source control?", "Is git set up for this site yet?", "Which repository host is connected?", "Are my source control credentials ready?",
      ],
    },
    approval: { class: 'read', confirmation: 'direct' },
  },
} as const satisfies ToolMetadataById<ToolApprovalPolicy>;
