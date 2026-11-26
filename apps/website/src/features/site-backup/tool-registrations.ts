import { bindSiteBackupTools } from "@jini-ai/devops/backup/site/tool-registrations";
import { parseSiteImportListQuery } from "@jini-ai/cms/admin-http/routes/system/site-imports";
import { siteBackupToolMetadata as toolMetadata } from "../../contracts/core/tool-metadata/index.js";
import { parseSiteImportInput } from "@jini-ai/devops/backup/site/import-backend";
import { ForbiddenError } from "@jini-ai/cms/core";
import { forbiddenRule, type ModelFacingErrorRule } from "@jini-ai/core/model-facing-tool-errors";
// `ToolInputError` specifically — the marker `@jini-ai/daemon`'s `ToolExecutor` reads to classify a
// rejection as the caller's to fix instead of redacting it into a message-stripped 500.
import { CustomCredentialValidationError } from "../custom-credentials/index.js";
import { planSiteBackup, pushSiteBackup, type SiteBackupToolDeps } from "./backup-service.js";
import { parseStaticExportInput } from "./static-export-selection.js";

/**
 * What reaches the model with its real reason instead of a redacted `INTERNAL_ERROR`. Input
 * validation (`CustomCredentialValidationError`) names a field and a rule, never a secret.
 * `CustomCredentialSecretStoreUnconfiguredError` is deliberately absent: it is caught and turned into
 * `CREDENTIAL_UNREADABLE` in `backup-service.ts`, and its own text must never be published.
 */
const SITE_BACKUP_MODEL_FACING_ERRORS: readonly ModelFacingErrorRule[] = [
  forbiddenRule({ domainPrefix: "SITE_BACKUP", error: ForbiddenError }),
  { error: CustomCredentialValidationError, code: "SITE_BACKUP_INVALID_INPUT" },
];

/** Contributes the site-backup tools — called once by `server/runtime/composition/
 *  tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`. */
export const { siteBackupAgentToolCatalog, buildSiteBackupRegistrations, contributeSiteBackupTools } = bindSiteBackupTools({
  importDescription: "Install a Tovu site from a share URL or uploaded .tovu.zip into a NEW separate site. Use when the user says ‘install the site at this link’. Existing sites are never overwritten. Returns owner setup and opening instructions.",
  commitDescription: "Commit message. Optional; defaults to 'Tovu site backup: <site name> (<time>)'.",
  shareDescription: "Export THIS SITE to a portable .tovu.zip share: all pages/posts including drafts, scheduled content and autosaves, media (including object storage), themes, menus, portable plugins and settings. Rendered HTML is a separate download through site_export_static. Accounts, sessions, API keys, vault/legacy credentials, chats and operational history are excluded by a fresh-database allowlist. Anyone with the link receives unpublished content; revocation cannot recall downloads. Uses persistent running-server storage or the configured S3-compatible artifact capability. With no public storage it returns a ZIP download and setup instructions, never a localhost share link. Caps: 300 MiB expanded/archive, 2,000 files; unsupported populated plugin tables are refused by name. Credential-looking content is included verbatim in owner downloads; credentialWarnings lists only paths and match kinds. When needsAcknowledgement is true, show the warnings and direct the person to acknowledge in Exports before downloading. Provider delivery refuses exports with credential warnings. Returns {shareId,url,bytes,sha256,downloadUrl,credentialWarnings,needsAcknowledgement}, or {jobId,phase,progress}; poll using that SAME jobId to resume without creating another export.",
  toolMetadata,
  catalogModule: "features/site-backup/tool-registrations.ts",
  modelFacingErrors: SITE_BACKUP_MODEL_FACING_ERRORS,
  parseStaticExportInput,
  parseSiteImportInput,
  parseSiteImportListQuery,
  planSiteBackup,
  pushSiteBackup,
  resolveDeps: ({ deps }: { deps: SiteBackupToolDeps }) => deps,
}, {});
