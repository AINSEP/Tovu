import type { ToolMetadataById } from '@jini-ai/core';
import type { ToolApprovalPolicy } from '../../headless/assistant-tool-approval-policy.js';

/** mail-status registration declarations; shared placement rationale is in ./index.ts. */
export const toolMetadata = {
  "system_get_mail_status": {
    search: {
      keywords: "email mail not arriving didn't get email sending configured smtp provider delivery magic link",
      queries: [
        "Why is my email not arriving?",
        "I didn't get the sign-in email; is sending configured?",
        "Check which mail provider or SMTP driver is active.",
        "Can this site deliver real email or does it print to the console?",
        "Why didn't my magic link arrive?",
      ],
    },
    approval: { class: 'read', confirmation: 'direct' },
  },
} as const satisfies ToolMetadataById<ToolApprovalPolicy>;
