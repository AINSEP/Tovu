import type { ToolMetadataById } from '@jini-ai/core';
import type { ToolApprovalPolicy } from '@jini-ai/core/contracts/site/tool-metadata-approval-policy';

/** storage (ST-15c) registration declarations; shared placement rationale is in ./index.ts. */
export const toolMetadata = {
  "site_storage_report": {
    search: {
      keywords: "storage disk space usage size bytes how much room databases uploads screenshots shares old copies logs cleanup report",
      queries: ["How much disk space is my site using?", "What is taking up storage on this site?"],
    },
    approval: { class: 'read', confirmation: 'direct' },
  },
  // A live cleanup runs only from the handler's own card (approvalToolHandler, never remembered); a dry run asks nothing.
  "site_storage_cleanup": {
    title: 'Clean up site storage',
    summary: 'This permanently removes expired share files, old pre-migration copies beyond the newest five and leftover temporary folders. Chats, revisions, screenshots and media are never touched.',
    search: {
      keywords: "storage cleanup clean up free disk space delete old copies expired shares temporary files reclaim bytes prune",
      queries: ["Free up some disk space on my site.", "Clean up old copies and temporary files."],
    },
    approval: { class: 'delete', confirmation: 'plan' },
  },
} as const satisfies ToolMetadataById<ToolApprovalPolicy>;
