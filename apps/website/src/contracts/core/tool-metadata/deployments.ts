import type { ToolMetadataById } from '@jini-ai/core';
import type { ToolApprovalPolicy } from '../../headless/assistant-tool-approval-policy.js';

/** deployments registration declarations; shared placement rationale is in ./index.ts. */
export const toolMetadata = {
  "deployment_execute_static_publish": {
    search: {
      keywords: "deploy push ship go live make it live publish the site hosting netlify vercel cloudflare",
    },
    approval: { class: 'publish', confirmation: 'policy' },
  },
  "deployment_generate_bucket_hosting_setup": {
    search: {
      keywords: "instructions steps how to setup guide public website cloud storage host",
    },
    approval: { class: 'read', confirmation: 'direct' },
  },
  "deployment_get_dockerfile": {
    search: {
      keywords: "docker container read view current build file",
    },
    approval: { class: 'read', confirmation: 'direct' },
  },
  "deployment_get_export_status": {
    search: {
      keywords: "progress done finished check static site build",
    },
    approval: { class: 'read', confirmation: 'direct' },
  },
  // --- deployments / static publish -----------------------------------------------------------------------
  // Readiness wording and actual hosting targets keep publication distinct from observation tools.
  "deployment_get_static_publish_capabilities": {
    search: {
      keywords: "can I publish yet ready deploy hosting connected status providers where github pages vercel netlify cloudflare",
      queries: [
        "Which static publishing hosts are available?", "Can this site publish to Netlify?", "Where can I publish a static site?", "Which hosting credentials are connected?",
        // Questions express publication readiness rather than backstop-gap inspection.
        "Is my site ready to publish yet?", "Can I publish my site yet, or is hosting not set up?",
      ],
    },
    approval: { class: 'read', confirmation: 'direct' },
  },
  "deployment_preview_static_publish": {
    search: {
      keywords: "dry run check before deploy what would happen test",
    },
    approval: { class: 'read', confirmation: 'direct' },
  },
  "deployment_set_dockerfile": {
    search: {
      keywords: "docker container write edit update change build file",
    },
    approval: { class: 'edit', confirmation: 'direct' },
  },
  "deployment_trigger_export": {
    search: {
      keywords: "build generate export files download self host static site",
    },
    approval: { class: 'edit', confirmation: 'direct' },
  },
} as const satisfies ToolMetadataById<ToolApprovalPolicy>;
