import type { ToolMetadataById } from '@jini-ai/core';
import type { ToolApprovalPolicy } from '../../headless/assistant-tool-approval-policy.js';

/** One copy recipe surface; site files reuse the exact-batch fs writer approval exchange. */
export const toolMetadata = {
  files_copy: {
    search: {
      keywords: "files copy import assets folder picked custom local site theme media url glob overwrite rename fonts images transfer",
      queries: [
        "Copy images from the picked folder into my theme.",
        "Import local assets into the site without Bash.",
        "Copy a folder of fonts and images with a glob.",
        "Download an image URL into the media library.",
      ],
    },
    approval: { class: 'edit', confirmation: 'policy' },
  },
} as const satisfies ToolMetadataById<ToolApprovalPolicy>;
