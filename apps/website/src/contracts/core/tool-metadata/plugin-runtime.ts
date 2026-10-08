import type { ToolMetadataById } from '@jini-ai/core';
import type { ToolApprovalPolicy } from '../../headless/assistant-tool-approval-policy.js';

/** plugin-runtime registration declarations; shared placement rationale is in ./index.ts. */
export const toolMetadata = {
  "plugins_install": {
    search: {
      keywords: "plugin plugins install add new upload folder zip attachment local package upgrade replace version site plugin tovu-plugin extension addon add-on",
    },
    approval: { class: 'edit', confirmation: 'direct' },
  },
  "plugins_list": {
    search: {
      keywords: "plugin plugins extensions installed available list have installed my",
      queries: [
        "What plugins are installed on the site?",
        "Can you show me which plugins are enabled versus disabled?",
        "Is there a plugin with a validation error I should know about?",
        "What's the trust tier on this third-party plugin?",
        "Show me every discovered plugin, built-in and site-installed.",
      ],
    },
    approval: { class: 'read', confirmation: 'direct' },
  },
  // --- plugins -------------------------------------------------------------------------------------------
  // Enable vocabulary covers both site and Agent Plugins; finding a plugin is a separate action.
  "plugins_set_enabled": {
    search: {
      keywords: "plugin plugins agent plugin agent-plugin agent-plugins enable disable turn on off activate deactivate switch on switch off " +
        "extension addon add-on skill skills capability use it install it already installed not active inactive",
      queries: [
        "Can you turn on this plugin?",
        "How do I disable a plugin we don't want running?",
        "Why won't this plugin enable — is it invalid or incompatible?",
        "Will enabling this plugin change our database schema?",
        "Can you toggle this plugin off?",
      ],
    },
    approval: { class: 'escalation', confirmation: 'plan', rule: 'plugin-enable' },
  },
  // Uninstall covers both plugin families, including agent-plugin, skill and package vocabulary.
  "plugins_uninstall": {
    search: {
      keywords: "plugin plugins uninstall remove delete trash extension get rid of agent plugin agent-plugin agent-plugins " +
        "skill skills package packages permanently",
    },
    approval: { class: 'trash', confirmation: 'plan' },
  },
} as const satisfies ToolMetadataById<ToolApprovalPolicy>;
