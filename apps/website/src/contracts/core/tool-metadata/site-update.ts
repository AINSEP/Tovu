import type { ToolMetadataById } from '@jini-ai/core';
import type { ToolApprovalPolicy } from '@jini-ai/core/contracts/site/tool-metadata-approval-policy';

/** site-update registration declarations; shared placement rationale is in ./index.ts. */
export const toolMetadata = {
  "site_update_check": {
    search: {
      keywords: "update upgrade new version available latest release check outdated",
      queries: ["Is there a newer version of the site software?", "Do I need to update?"],
    },
    approval: { class: 'read', confirmation: 'direct' },
  },
  // The handler's own card (approvalToolHandler) is the only way this runs; the click is redeemed on that card.
  "site_update_apply": {
    title: 'Update this site',
    summary: 'This replaces the site software with the newer version. The site is backed up first and put back if the new version does not work.',
    search: {
      keywords: "update upgrade install new version latest release apply software",
      queries: ["Update the site to the latest version.", "Install the new version."],
    },
    approval: { class: 'publish', confirmation: 'policy' },
    mcpUi: { redeemable: true, exchangeOnly: true },
  },
} as const satisfies ToolMetadataById<ToolApprovalPolicy>;
