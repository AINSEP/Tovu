import type { ToolMetadataById } from '@jini-ai/core';
import type { ToolApprovalPolicy } from '../../headless/assistant-tool-approval-policy.js';

/** site-backup registration declarations; shared placement rationale is in ./index.ts. */
export const toolMetadata = {
  // --- site backup ------------------------------------------------------------------------------------------
  "site_backup_plan": {
    search: {
      keywords: "backup back up save copy snapshot archive keep safe my site database content github repository private repo",
      queries: [
        "Can you back up my site to a private GitHub repository?", "Save a backup of my site in GitHub.", "Plan a site backup without changing remote files.", "Archive my content and database into a repository.",
      ],
    },
    approval: { class: 'read', confirmation: 'direct' },
  },
  "site_backup_push": {
    search: {
      keywords: "backup back up save copy snapshot archive site database github repository confirm push",
    },
    approval: { class: 'edit', confirmation: 'direct' },
  },
} as const satisfies ToolMetadataById<ToolApprovalPolicy>;
