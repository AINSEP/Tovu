/** Backup guidance points to the existing owners; it never aggregates credentials or providers. */
import type { CapabilityCard } from "#src/features/site-guide/contracts";

export const capabilityCard = {
  id: "backup", title: "Backup and recovery",
  summary: "Restore points, portable exports and private full-site backups serve different needs.",
  explanation: "Restore points recover this installation. Portable .tovu.zip exports move a site through Admin → Sites → Export. Private full-site repository backups include the database and private site data; committing rendered static output is a publishing workflow, not a full-site backup.",
  permissions: ["backup.read"],
  pointers: [
    { label: "Inspect restore-point support", tool: "backup_get_capabilities", permissions: ["backup.read"] },
    { label: "List restore points", tool: "content_read.backup_restore_point", permissions: ["backup.read"] },
    { label: "Portable site export", href: "/admin/sites", permissions: ["site-backup.push"] },
    { label: "Discover installed source-control hosts", tool: "source_control_get_capabilities", permissions: ["source-control.read"] },
    { label: "Plan a private full-site backup", tool: "site_backup_plan", permissions: ["site-backup.push"] },
    { label: "Push an approved backup plan", tool: "site_backup_push", permissions: ["site-backup.push"] },
  ],
  workflows: [{
    title: "Back up this site to a private repository",
    steps: [
      "Call source_control_get_capabilities to discover installed source-control hosts, including disabled hosts, even when no credential is saved. Follow its guidance to turn on a disabled plugin; installed, enabled and credential-configured are separate states.",
      "Choose the private repository with the person. Use credential_save's secure card when a connection is needed; never put a token in chat.",
      "Call site_backup_plan, review its included private data, skipped files, repository, branch and size with the person, then call site_backup_push with the planId for human approval.",
      "Use source_control_execute_commit only for rendered static output, not a private full-site backup.",
    ],
    permissions: ["source-control.read", "site-backup.push"],
  }],
} as const satisfies CapabilityCard;
