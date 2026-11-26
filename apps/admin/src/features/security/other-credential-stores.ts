import type { OtherCredentialStoreInfo } from "@jini-ai/integrations/react/credentials/other-credential-stores";

/**
 * The four Tier-2 stores, in the order this page renders them within each category. The two
 * Composio rows left on 2026-09-27 with the core Composio integration (now the `composio` agent
 * plugin, whose sign-in lives in the `external-mcp` row).
 */
export const OTHER_CREDENTIAL_STORES: readonly OtherCredentialStoreInfo[] = [
  {
    id: "site-assistant",
    label: "Site assistant model key",
    category: "ai",
    purposeLabel: "AI",
    supportsReplace: true,
    screenLabel: "AI Assistant",
    screenPath: "/ai-assistant",
  },
  {
    id: "admin-byok",
    label: "Admin AI Assistant key (BYOK)",
    category: "ai",
    purposeLabel: "AI",
    supportsReplace: true,
    screenLabel: "Settings · AI agent",
    screenPath: "/settings?tab=execution",
  },
  {
    id: "media-provider",
    label: "Media provider keys",
    category: "media",
    purposeLabel: "Media",
    supportsReplace: true,
    screenLabel: "Media · External Providers",
    screenPath: "/media?tab=external-providers",
  },
  {
    id: "external-mcp",
    label: "External MCP servers",
    category: "ai",
    purposeLabel: "AI",
    supportsReplace: false,
    screenLabel: "Providers · External MCP",
    screenPath: "/addons/integrations?tab=external-mcp",
  },
] as const;

