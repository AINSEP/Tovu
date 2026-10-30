import type { ToolMetadataById } from '@jini-ai/core';
import type { ToolApprovalPolicy } from './approval-policy.js';

/** One copy recipe surface; site files reuse the exact-batch fs writer approval exchange. */
export const toolMetadata = {
  files_copy: {
    search: {
      keywords: "files copy import assets folder picked custom local site theme media url glob overwrite rename fonts images transfer save library private document documents markdown pdf docx brand",
      queries: [
        "Copy images from the picked folder into my theme.",
        "Import local assets into the site without Bash.",
        "Copy a folder of fonts and images with a glob.",
        "Download an image URL into the media library.",
        "Save documents from the picked folder to the private Library.",
        "Save a site file to the assistant Library.",
      ],
    },
    approval: { class: 'edit', confirmation: 'policy' },
  },
} as const satisfies ToolMetadataById<ToolApprovalPolicy>;
