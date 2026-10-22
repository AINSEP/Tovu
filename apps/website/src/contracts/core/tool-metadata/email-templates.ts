import type { ToolMetadataById } from '@jini-ai/core';
import type { ToolApprovalPolicy } from '../../headless/assistant-tool-approval-policy.js';

/** email-templates registration declarations; shared placement rationale is in ./index.ts. */
export const toolMetadata = {
  "email_template_list": {
    search: {
      keywords: "email template templates list html email transactional message design",
      queries: ["What email templates does my site have?", "Show my email templates."],
    },
    approval: { class: 'read', confirmation: 'direct' },
  },
  "email_template_get": {
    search: {
      keywords: "email template read open html subject fields",
      queries: ["Open the order confirmation email template.", "Show me the HTML of my welcome email."],
    },
    approval: { class: 'read', confirmation: 'direct' },
  },
  "email_template_create": {
    search: {
      keywords: "create new email template html email design welcome confirmation fields placeholders",
      queries: ["Make a welcome email template.", "Design an HTML email with a {{name}} field."],
    },
    approval: { class: 'edit', confirmation: 'direct' },
  },
  "email_template_edit": {
    search: {
      keywords: "edit change update email template html subject fields layout",
      queries: ["Change the subject of my welcome email.", "Make the email template's button blue."],
    },
    approval: { class: 'edit', confirmation: 'direct' },
  },
  "email_template_preview": {
    search: {
      keywords: "preview email template render fields values sample what will be sent plain text",
      queries: ["Preview the welcome email for Ada.", "What will this email look like when it is sent?"],
    },
    approval: { class: 'read', confirmation: 'direct' },
  },
} as const satisfies ToolMetadataById<ToolApprovalPolicy>;
