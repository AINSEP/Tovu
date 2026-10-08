import type { ToolMetadataById } from '@jini-ai/core';
import type { ToolApprovalPolicy } from '../../headless/assistant-tool-approval-policy.js';

/** change-sets registration declarations; shared placement rationale is in ./index.ts. */
export const toolMetadata = {
  // Undo for post/page edits and deletes (F7b option A, S6).
  "change_sets_list": {
    search: {
      keywords: "change set history recent edits undo list revert log",
    },
    approval: { class: 'read', confirmation: 'direct' },
  },
  "change_sets_revert": {
    search: {
      keywords: "change set undo revert restore rollback previous version post page edit",
    },
    approval: { class: 'restore-over-existing', confirmation: 'policy' },
  },
} as const satisfies ToolMetadataById<ToolApprovalPolicy>;
