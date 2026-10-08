import type { ToolMetadataById } from '@jini-ai/core';
import type { ToolApprovalPolicy } from '../../headless/assistant-tool-approval-policy.js';

/** members registration declarations; shared placement rationale is in ./index.ts. */
export const toolMetadata = {
  "members_disable": {
    search: {
      keywords: "member block ban suspend revoke deactivate lock out",
      queries: [
        "Can you revoke this member's access?",
        "How do I kick a member out and end their sessions?",
        "I want to disable a member's account.",
        "Can I re-enable a member after disabling them?",
        "What happens if I disable a member who's already disabled?",
      ],
    },
    approval: { class: 'edit', confirmation: 'direct' },
  },
  "members_get_by_id": {
    search: {
      keywords: "member lookup find details profile",
      queries: [
        "Can you pull up this one member's full details?",
        "I have the member id, show me their info.",
        "What does this specific member's record look like?",
        "Can you show me one member's account details?",
        "I want to check a single member's status.",
      ],
    },
    approval: { class: 'read', confirmation: 'direct' },
  },
  // --- members ------------------------------------------------------------------------------
  "members_list": {
    search: {
      keywords: "members subscribers customers audience people registered signed up",
      queries: [
        "Who are our site members right now?",
        "Can you show me pending, active, and disabled members?",
        "I need a member's id before I can look at their details.",
        "List everyone who's signed up as a member.",
        "Show me our member roster.",
      ],
    },
    approval: { class: 'read', confirmation: 'direct' },
  },
  "members_request_magic_link": {
    search: {
      keywords: "login link sign in passwordless magic email member access send",
      queries: [
        "Can you resend the sign-in link to this member?",
        "This member says they can't log in, can you send them a fresh link?",
        "How do I trigger a passwordless login email for a member?",
        "Can you resend a magic link even if I'm not sure the email is registered?",
        "Is there a rate limit on resending sign-in links?",
      ],
    },
    approval: { class: 'edit', confirmation: 'direct' },
  },
} as const satisfies ToolMetadataById<ToolApprovalPolicy>;
