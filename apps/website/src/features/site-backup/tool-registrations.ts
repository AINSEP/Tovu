import type { SiteShareBackend } from "./share-backend.js";
import { SiteShareRefusal } from "./share-policy.js";
import { toolMetadata } from '../../contracts/core/tool-metadata/site-backup.js';
import { parseSiteImportInput } from "./import-backend.js";

import { buildDomainRegistrations, indexCatalogById, requireInputRecord, requireString, type AgentToolSideEffect, type DerivedRiskByToolId, type ToolHandler, type ToolRegistration } from "@jini-ai/core";
import { adaptLegacyAuthorize, requireToolPermission } from "@jini-ai/cms/core";
// `ToolInputError` specifically — the marker `@jini-ai/daemon`'s `ToolExecutor` reads to classify a
// rejection as the caller's to fix instead of redacting it into a message-stripped 500.
import { type ToolExecutionContext } from "@jini-ai/core";

import { ForbiddenError } from "@jini-ai/cms/core";
import { forbiddenRule } from "@jini-ai/core/model-facing-tool-errors";
import { withModelFacingErrors, type ModelFacingErrorRule } from "@jini-ai/core/model-facing-tool-errors";
import { type AssistantSurfaceDeps } from "@jini-ai/daemon/surface-exchanges";
import type { ToolContributor } from "#src/assistant/index";
import { CustomCredentialValidationError } from "../custom-credentials/index.js";
import {
  PLAN_TOOL_ID,
  planSiteBackup,
  PUSH_PERMISSION,
  pushSiteBackup,
  SITE_BACKUP_DOMAIN as DOMAIN,
  SITE_BACKUP_PUSH_TOOL_ID,
  type SiteBackupToolDeps,
} from "./backup-service.js";

// Re-exported for the callers that imported them from here before the service was extracted.
export { PUSH_WAIT_MS, SITE_BACKUP_PUSH_TOOL_ID, type PushResult, type SiteBackupToolDeps } from "./backup-service.js";

/**
 * @file The site-backup domain's agent tools: Git backup (`site_backup_plan`/`site_backup_push`, whose
 * logic and safety rules live in `backup-service.ts`, shared with the admin Git backup route), site
 * shares (`site_share_*`) and imports (`site_import_*`). This module is the catalog, the risk map and
 * the thin handlers.
 */

interface AgentToolDefinition {
  name: string;
  description: string;
  sideEffects: AgentToolSideEffect;
  authorization: { permission: string };
  inputSchema?: Readonly<Record<string, unknown>>;
}

const INCLUDE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  description: "Which parts of the site to back up. Every switch defaults to true; set one to false to leave it out.",
  properties: {
    database: { type: "boolean", description: "The whole site database (content, members, form submissions, admin accounts, encrypted credentials)." },
    media: { type: "boolean", description: "Uploaded media files (not chat attachments)." },
    themes: { type: "boolean", description: "Installed themes." },
    plugins: { type: "boolean", description: "Installed agent plugins and skills (never plugin OAuth data)." },
    settings: { type: "boolean", description: "The site's config.json and .site-meta.json." },
  },
} as const;

const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["owner", "repo"],
  properties: {
    credential: {
      type: "string",
      description: "Label of the saved custom credential or host connection to push with. Optional when exactly one saved custom credential points at a host's apiOrigin (source_control_get_capabilities lists each host's apiOrigin), or when none does and the host has a saved connection.",
    },
    owner: { type: "string", description: "Owner or organization (the account) of the target repository on the host." },
    repo: { type: "string", description: "Target repository name. It must be PRIVATE and already have at least one commit." },
    branch: { type: "string", description: "Branch to commit to. Optional; defaults to the repository's default branch. Must already exist." },
    folder: {
      type: "string",
      description: "Repository-relative folder the backup is written to; it is REPLACED as a whole by each backup. Optional; defaults to the site's folder name.",
    },
    include: INCLUDE_SCHEMA,
    commitMessage: { type: "string", description: "Commit message. Optional; defaults to 'Tovu site backup: <site name> (<time>)'." },
  },
} as const;

const PUSH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["planId"],
  properties: { planId: { type: "string", description: "The planId site_backup_plan returned. Single-use; valid for 10 minutes." } },
} as const;

export const siteBackupAgentToolCatalog: AgentToolDefinition[] = [
  {
    name: "site_import_backup",
    description: "Install a Tovu site from a share URL or uploaded .tovu.zip into a NEW separate site. Use when the user says ‘install the site at this link’. Existing sites are never overwritten. Returns owner setup and opening instructions.",
    sideEffects: "mutates-durable-state", authorization: { permission: "system.write" },
    inputSchema: { type: "object", additionalProperties: false, oneOf: [{ required: ["url"] }, { required: ["uploadId"] }], properties: { url: { type: "string", description: "Public HTTPS share URL." }, uploadId: { type: "string", description: "ID from the authenticated application/zip upload endpoint; never a filesystem path." }, displayName: { type: "string", maxLength: 200 }, requestId: { type: "string", maxLength: 128, description: "Reuse for a retry of the same import. Omit for a separate import." } } },
  },
  {
    name: "site_import_list", description: "List your private import history: date, source, new site, status and opening/setup instructions. Does not include other principals' imports or credentials.",
    sideEffects: "none", authorization: { permission: "system.read" }, inputSchema: { type: "object", additionalProperties: false, properties: {} },
  },
  {
    name: PLAN_TOOL_ID,
    description:
      "Plans a BACKUP OF THIS SITE to a private repository on a git host a turned-on Agent Plugin provides (source_control_get_capabilities lists each host with its label, apiOrigin and maxFileBytes) — the site's database (content, members, form submissions, admin accounts, credentials encrypted), media, themes, installed plugins and skills, and settings — as one folder, through the host's connection saved with credential_save with kind source-control or a saved custom credential (Access Tokens page -> 'Add custom provider', base URL = that host's apiOrigin). With no connection yet, tell the person the repository rules below and ask which repository first, then open that form. Use this to back up or keep a copy of the site itself; to publish the RENDERED site to a repository use source_control_execute_commit instead. Read-only: it writes nothing anywhere. It checks the credential, that the repository is PRIVATE (public and internal repositories are refused, because the database holds user data), that the credential can push, that the branch exists (defaults to the repository's default branch; an empty repository is refused — it needs a first commit such as a README), snapshots the database, lists every file with its size, and checks the limits (a media, theme or plugin file over the host's maxFileBytes is left out and listed in skipped; the database over it fails the plan; at most 3000 files and 1 GiB). Returns {planned: true, planId, expiresAt, credential, repository, visibility, branch, folder, folderExists, include, fileCount, totalBytes, totalSize, files: [{path, bytes}], skipped, notes, nextStep}, or {planned: false, code, message} naming what to fix (codes: CREDENTIAL_NOT_FOUND, CREDENTIAL_AMBIGUOUS, CREDENTIAL_UNREADABLE, REPOSITORY_NOT_FOUND, REPOSITORY_NOT_PRIVATE, NO_PUSH_PERMISSION, REPOSITORY_EMPTY, BRANCH_NOT_FOUND, FOLDER_IS_FILE, DATABASE_SNAPSHOT_FAILED, LIMIT_EXCEEDED, PROVIDER_ERROR, NETWORK_UNREACHABLE, UNAVAILABLE). Show the human the plan (repository, branch, folder, what is included, file count and size, anything skipped), then call site_backup_push with the planId.",
    sideEffects: "none",
    authorization: { permission: PUSH_PERMISSION },
    inputSchema: PLAN_SCHEMA,
  },
  {
    name: SITE_BACKUP_PUSH_TOOL_ID,
    description:
      "Pushes the single-use plan from site_backup_plan immediately in one non-force Git commit. Requires the original permissions and principal binding, and re-checks that the repository is private, the branch is unchanged and the planned files are fresh. Replaces only the backup folder; previous contents remain recoverable in Git history. Returns {pushed:true, commitSha, commitUrl, repository, branch, folder, filesWritten, totalBytes}. A large backup can take longer than one call: then it returns {pushed:false, cancelled:false, inProgress:true, planId, progress:{filesDone, filesTotal, bytesDone, bytesTotal}, message} while the upload keeps running; tell the human how far it is and call site_backup_push again with the SAME planId to keep waiting (it never starts a second upload). Failures return {pushed:false, cancelled:false, code, message}, including expired/missing plans, changed branches or files, public repositories and credential/provider/network errors; a failed upload names the file. Transient network errors, host errors and rate limits are already retried with backoff, so do not retry NETWORK_UNREACHABLE in a loop. Plan again after PLAN_STALE, DIVERGED_BRANCH or plan expiry.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: PUSH_PERMISSION },
    inputSchema: PUSH_SCHEMA,
  },
  {
    name: "site_share_create",
    description: "Export THIS SITE to a portable .tovu.zip share: all pages/posts including drafts, scheduled content and autosaves, media (including object storage), themes, menus, portable plugins and settings. Accounts, sessions, API keys, vault/legacy credentials, chats and operational history are excluded by a fresh-database allowlist. Anyone with the link receives unpublished content; revocation cannot recall downloads. Uses persistent running-server storage or the configured S3-compatible artifact capability. With no public storage it returns a ZIP download and setup instructions, never a localhost share link. V1 caps: 300 MiB expanded/archive, 2,000 files; unsupported populated plugin tables and secret-bearing content are refused by name. Returns {shareId,url,bytes,sha256,downloadUrl}, or {jobId,phase,progress}; poll using that SAME jobId to resume without creating another export.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: PUSH_PERMISSION },
    inputSchema: { type: "object", additionalProperties: false, properties: { jobId: { type: "string", description: "Only when polling: the jobId returned by this same create operation." } } },
  },
  {
    name: "site_share_list",
    description: "List THIS SITE's private export registry, including active, failed and revoked exports: shareId, site, creation/revocation dates, bytes, sha256, status, link and ZIP download path. Requires site-backup.push; there is no anonymous export index. Does not create an export or reveal storage credentials.",
    sideEffects: "none",
    authorization: { permission: PUSH_PERMISSION },
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
  },
  {
    name: "site_share_revoke",
    description: "Revoke THIS SITE's export by shareId. Disables its public token first, deletes the ZIP from private and remote storage, and verifies remote disappearance. Revoked entries remain in site_share_list. Cleanup/purge failures are reported and retrying the same shareId retries deletion. Already downloaded copies cannot be recalled.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: PUSH_PERMISSION },
    inputSchema: { type: "object", additionalProperties: false, required: ["shareId"], properties: { shareId: { type: "string" } } },
  },
];

const CATALOG_BY_ID = indexCatalogById({ catalog: siteBackupAgentToolCatalog });

/** This wiring layer's own risk classification, cross-checked against the catalog's `sideEffects`. */
export const siteBackupDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  ["site_import_backup", "mutates-durable-state"],
  ["site_import_list", "none"],
  // -> a non-decrypting credential list, one decrypting resolve, four read-only host GETs, a
  // database snapshot held in memory (its restore-point file deleted at once), a disk walk, and an
  // in-memory plan. Nothing durable is written anywhere.
  [PLAN_TOOL_ID, "none"],
  // -> blobs, trees, a commit and a non-force ref update in a
  // THIRD-PARTY repository — the same classification custom_credential_write_files carries.
  [SITE_BACKUP_PUSH_TOOL_ID, "mutates-durable-state"],
  ["site_share_create", "mutates-durable-state"],
  ["site_share_list", "none"],
  ["site_share_revoke", "mutates-durable-state"],
]);

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

/** One share tool's effect once authorized: its exact input contract, then the backend call. */
type ShareAction = (required: { backend: SiteShareBackend; raw: Record<string, unknown>; ctx: ToolExecutionContext }) => Promise<unknown>;

const SHARE_ACTIONS: Record<"create" | "list" | "revoke", ShareAction> = {
  list: async ({ backend, raw }) => {
    if (Object.keys(raw).length) throw new SiteShareRefusal({ code: "INVALID_INPUT", message: "site_share_list takes no fields." });
    return { shares: await backend.list({}) };
  },
  revoke: async ({ backend, raw }) => {
    if (Object.keys(raw).some(key => key !== "shareId")) throw new SiteShareRefusal({ code: "INVALID_INPUT", message: "Only shareId is accepted." });
    return await backend.revoke({ shareId: requireString({ input: raw, key: "shareId" }) });
  },
  create: async ({ backend, raw, ctx }) => {
    if (Object.keys(raw).some(key => key !== "jobId") || raw.jobId !== undefined && (typeof raw.jobId !== "string" || !/^[0-9a-f-]{36}$/.test(raw.jobId))) throw new SiteShareRefusal({ code: "INVALID_INPUT", message: "Only an optional share jobId is accepted." });
    return await backend.create({ principalId: ctx.principal.id, signal: ctx.signal, ...(typeof raw.jobId === "string" ? { jobId: raw.jobId } : {}) });
  },
};

/** Authorization stays on the existing backup contributor; backend effects are shared with HTTP. */
async function handleShare(required: { deps: SiteBackupToolDeps; ctx: ToolExecutionContext; action: "create" | "list" | "revoke" }, _optional: Record<string, never> = {}): Promise<unknown> {
  const { deps, ctx, action } = required;
  const raw = requireInputRecord({ input: ctx.input });
  await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: PUSH_PERMISSION }, { entityType: DOMAIN });
  if (!deps.siteShareBackend) return { ok: false, code: "UNAVAILABLE", message: "Site sharing requires a site folder and private storage." };
  try {
    return await SHARE_ACTIONS[action]({ backend: deps.siteShareBackend, raw, ctx });
  } catch (error) {
    if (error instanceof SiteShareRefusal) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

/**
 * Builds this domain's `ToolRegistration[]`.
 *
 * @complexity O(1) at registration.
 */
export function buildSiteBackupRegistrations(deps: SiteBackupToolDeps, _surfaces: AssistantSurfaceDeps): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {
    site_import_backup: ctx => handleImport({ deps, ctx, list: false }),
    site_import_list: ctx => handleImport({ deps, ctx, list: true }),
    [PLAN_TOOL_ID]: (ctx) => planSiteBackup({ deps, call: ctx }),
    [SITE_BACKUP_PUSH_TOOL_ID]: (ctx) => pushSiteBackup({ deps, call: ctx }),
    site_share_create: (ctx) => handleShare({ deps, ctx, action: "create" }),
    site_share_list: (ctx) => handleShare({ deps, ctx, action: "list" }),
    site_share_revoke: (ctx) => handleShare({ deps, ctx, action: "revoke" }),
  };
  return buildDomainRegistrations({ metadata: toolMetadata,
    domain: DOMAIN,
    catalogModule: "features/site-backup/tool-registrations.ts",
    catalog: CATALOG_BY_ID,
    handlers: withModelFacingErrors({ handlers, rules: SITE_BACKUP_MODEL_FACING_ERRORS }),
    derivedRisk: siteBackupDerivedRisk,
  });
}

/** Contributes the site-backup tools — called once by `server/runtime/composition/
 *  tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`. */
export function contributeSiteBackupTools(): ToolContributor {
  return { domain: DOMAIN, build: buildSiteBackupRegistrations, risk: siteBackupDerivedRisk };
}

/** Local creation permissions precede all download, upload consumption and registry effects. */
async function handleImport(required: { deps: SiteBackupToolDeps; ctx: ToolExecutionContext; list: boolean }, _options: Record<string, never> = {}): Promise<unknown> {
  const { deps, ctx, list } = required;
  await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: list ? "system.read" : "system.write" }, { entityType: "site-registry" });
  if (!deps.siteImportBackend) return { ok: false, code: "UNAVAILABLE", message: "Import requires local site creation and a configured sites home." };
  try {
    const input = requireInputRecord({ input: ctx.input });
    if (list) {
      if (Object.keys(input).length) throw new SiteShareRefusal({ code: "INVALID_INPUT", message: "site_import_list takes no fields." });
      return { imports: await deps.siteImportBackend.list({ principalId: ctx.principal.id }) };
    }
    return await deps.siteImportBackend.importBackup({ ...parseSiteImportInput({ input }), principalId: ctx.principal.id }, { signal: ctx.signal });
  } catch (error) {
    if (error instanceof SiteShareRefusal) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}
