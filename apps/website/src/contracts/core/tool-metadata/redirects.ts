import type { ToolMetadataById } from '@jini-ai/core';
import type { ToolApprovalPolicy } from '../../headless/assistant-tool-approval-policy.js';

/** redirects registration declarations; shared placement rationale is in ./index.ts. */
export const toolMetadata = {
  // --- redirects ---------------------------------------------------------------------------
  "redirects_create": {
    search: {
      keywords: "url urls link links redirect forward point moved old new address route vanity short redirect blog url path forward 301 302 moved",
      queries: [
        "Can you set up a new redirect from the old URL to the new one?",
        "How do I create a redirect — will it stop me from making a loop?",
        "Can you add a redirect rule, or will it reject an unsafe target?",
        "I need a new URL forwarding rule.",
        "What happens if I try to create a duplicate redirect for the same source?",
      ],
    },
    approval: { class: 'edit', confirmation: 'direct' },
  },
  "redirects_get": {
    search: {
      keywords: "url link redirect read view details one specific existing",
      queries: [
        "Can you show me the details of this one redirect rule?",
        "I have a redirect id, pull up its info.",
        "What does this specific redirect rule point to?",
        "Show me one redirect's source and target.",
        "Can you fetch a single redirect by id?",
      ],
    },
    approval: { class: 'read', confirmation: 'direct' },
  },
  "redirects_get_hits": {
    search: {
      keywords: "url link redirect hits traffic clicks visits how many people broken followed",
      queries: [
        "How many times has this redirect actually been used?",
        "When was the last time someone hit this redirect?",
        "I want to see traffic stats for a specific redirect.",
        "Has anyone even used this redirect rule?",
        "Can you show me the hit count for this redirect?",
      ],
    },
    approval: { class: 'read', confirmation: 'direct' },
  },
  // Deliberately UNWIRED (never agent-callable, bulk write — see file header); entry added for
    // consistency, same reasoning as backup_execute_restore above.
  "redirects_import": {
    search: {
      keywords: "url urls link links redirect redirects import bulk upload csv batch add many rules all at once migrate old urls",
    },
    approval: { class: 'edit', confirmation: 'direct' },
  },
  "redirects_list": {
    search: {
      keywords: "url urls link links redirect redirects forward list existing",
      queries: [
        "What redirects do we have set up on the site?",
        "Can you show me only the active redirect rules?",
        "I need to see redirects filtered by source URL.",
        "List all our URL redirect rules.",
        "What redirects are currently disabled?",
      ],
    },
    approval: { class: 'read', confirmation: 'direct' },
  },
  "redirects_tombstone": {
    search: {
      keywords: "url link redirect delete remove disable",
      queries: [
        "Can you disable this redirect rule?",
        "How do I turn off a redirect without deleting its history?",
        "I want to soft-delete a redirect we don't need anymore.",
        "What happens if I try to disable a redirect that's already disabled?",
        "Can you retire an old redirect rule for audit purposes?",
      ],
    },
    approval: { class: 'trash', confirmation: 'policy' },
  },
  "redirects_update": {
    search: {
      keywords: "url link redirect change edit update destination target",
      queries: [
        "Can you change where this redirect points to?",
        "I need to edit just the target URL on an existing redirect.",
        "How do I update a redirect rule's status?",
        "Can you fix a broken redirect without recreating it?",
        // Keep preservation vocabulary about redirect fields: generic "leave the rest alone"
        // makes URL routing compete with page-section edits in the full catalog's BM25 index.
        "Can I change a redirect's destination while keeping its source URL and status code unchanged?",
      ],
    },
    approval: { class: 'edit', confirmation: 'direct' },
  },
} as const satisfies ToolMetadataById<ToolApprovalPolicy>;
