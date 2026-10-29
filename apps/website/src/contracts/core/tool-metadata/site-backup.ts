import type { ToolMetadataById } from '@jini-ai/core';
import type { ToolApprovalPolicy } from './approval-policy.js';

/** site-backup registration declarations; shared placement rationale is in ./index.ts. */
export const toolMetadata = {
  site_import_backup: { search: { keywords: "install import site share url link zip new separate restore", queries: ["Install the site at this link", "Import a Tovu ZIP"] }, approval: { class: 'edit', confirmation: 'direct' } },
  site_import_list: { search: { keywords: "list past site imports history open imported sites" }, approval: { class: 'read', confirmation: 'direct' } },
  // --- site backup ------------------------------------------------------------------------------------------
  "site_backup_plan": {
    search: {
      keywords: "backup back up save copy snapshot archive keep safe my site database content repository private repo",
      queries: [
        "Can you back up my site to a private git repository?", "Save a backup of my site in a repository.", "Plan a site backup without changing remote files.", "Archive my content and database into a repository.",
      ],
    },
    approval: { class: 'read', confirmation: 'direct' },
  },
  "site_backup_push": {
    search: {
      keywords: "backup back up save copy snapshot archive site database repository confirm push",
    },
    approval: { class: 'edit', confirmation: 'direct' },
  },
  site_share_create: { search: { keywords: "share export site zip portable link download drafts", queries: ["Share this site", "Export this site as a Tovu ZIP"] }, approval: { class: 'edit', confirmation: 'direct' } },
  site_share_list: { search: { keywords: "list site exports shares links archive downloads" }, approval: { class: 'read', confirmation: 'direct' } },
  site_share_revoke: { search: { keywords: "revoke remove delete site export share link" }, approval: { class: 'edit', confirmation: 'direct' } },
} as const satisfies ToolMetadataById<ToolApprovalPolicy>;
