import type { ToolMetadataById } from '@jini-ai/core';
import type { ToolApprovalPolicy } from '../../headless/assistant-tool-approval-policy.js';

/** agent-plugins registration declarations; shared placement rationale is in ./index.ts. */
export const toolMetadata = {
  
  // OAuth-authenticated Agent Plugins use the generic connection card.
  "agent_plugin_connect": {
    search: {
      keywords: "connect sign in signin login link account database setup set up enable activate authorize authorization oauth plugin",
    },
    approval: { class: 'edit', confirmation: 'direct', input: 'human-form' },
    mcpUi: { redeemable: true },
  },
  "agent_plugin_write_note": {
    approval: { class: 'edit', confirmation: 'direct' },
  },
  "agent_plugins_install": {
    search: {
      keywords: "agent plugin plugins install add upload attachment zip folder package agent-plugins plugin.json upgrade replace version",
    },
    approval: { class: 'edit', confirmation: 'direct' },
  },
  // --- agent plugins (agent-plugins.org packages — a DIFFERENT system from .tovu-plugin above) -----------
  // Search vocabulary targets discovery intent before an operator knows manifest terminology.
  "search_agent_plugin_local": {
    search: {
      keywords: "agent plugin plugins agent-plugin agent-plugins search find looking for do I have installed capability capabilities skill skills addon add-on package packages extension extensions bundle available covers supports mcp server marketplace",
      queries: [
        "Is there a plugin for deploying to fly.io?",
        "What agent plugins do I have installed?",
        "Do we already have something installed that handles GDPR or cookie consent?",
        "Find a plugin that can help with accessibility review.",
        "Is there an installed plugin that declares an MCP server, and what does it cover?",
      ],
    },
    approval: { class: 'read', confirmation: 'direct' },
  },
} as const satisfies ToolMetadataById<ToolApprovalPolicy>;
