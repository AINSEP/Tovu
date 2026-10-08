import type { ToolMetadataById } from '@jini-ai/core';
import type { ToolApprovalPolicy } from '../../headless/assistant-tool-approval-policy.js';

/** fs-files registration declarations; shared placement rationale is in ./index.ts. */
export const toolMetadata = {
  // Folder-content questions must discover filesystem tools (SPEC-053).
  "fs_list_files": {
    search: {
      keywords: "folder directory local computer machine desktop dropped path browse inside contents list files explore",
      queries: [
        "What's in this folder on my computer?",
        "Can you look inside the folder I just dropped into the chat?",
        "What files are in a directory on my machine?",
        "Browse a local folder that isn't part of the site.",
        "Show me what a website folder on my desktop contains.",
      ],
    },
    approval: { class: 'read', confirmation: 'direct' },
  },
  "fs_read_file": {
    search: {
      keywords: "folder directory local computer machine desktop dropped path open view read show file contents text",
      queries: [
        "Can you open a file from the folder I dropped?",
        "Read this file on my computer and tell me what it says.",
        "Show me the contents of a local HTML file.",
        "What does the index.html in that folder contain?",
        "Read a text file from a directory on my machine.",
      ],
    },
    approval: { class: 'read', confirmation: 'direct' },
  },
} as const satisfies ToolMetadataById<ToolApprovalPolicy>;
