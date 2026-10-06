import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { buildDomainRegistrations, indexCatalogById, requireInputRecord, requireString, type AgentToolSideEffect, type DerivedRiskByToolId, type ToolHandler, type ToolRegistration } from "@jini-ai/core";
import { adaptLegacyAuthorize, requireToolPermission } from "@jini-ai/cms/core";
// `ToolInputError` specifically — the marker `@jini-ai/daemon`'s `ToolExecutor` reads to classify a
// rejection as the caller's to fix instead of redacting it into a message-stripped 500.
import { type ToolExecutionContext } from "@jini-ai/core";

import type { AuthorizeFn } from "../../contracts/core/commands/index.js";
import type { DbOpsPort } from "#src/contracts/core/gated-mutations/ports";
import { forbiddenRule } from "../../contracts/core/model-facing-tool-errors.js";
import { withModelFacingErrors, type ModelFacingErrorRule } from "@jini-ai/core/model-facing-tool-errors";
import { type AssistantSurfaceDeps } from "../../contracts/core/tool-surface-exchanges.js";
import type { ToolContributor } from "#src/assistant/index";
import type { HttpClientPort } from "../../platform/http/index.js";
import type { ObservabilityPort } from "../../platform/observability/index.js";
import { runtimeSchemaVersion } from "../../platform/site-dir/index.js";
import { resolveRuntimeMode } from "#src/contracts/core/runtime-mode";
import {
  CustomCredentialSecretStoreUnconfiguredError,
  CustomCredentialValidationError,
  listCustomCredentials,
  resolveCustomCredentialByLabel,
  type CustomCredentialSetRepoPort,
  type CustomProviderConnectionInput,
} from "../custom-credentials/index.js";
import { buildAuthorizationHeader } from "@jini-ai/integrations/credentialed-http";
import { normalizeWriteFilePath, validateBranch, validateCommitMessage, validateRepositoryTarget } from "../custom-credentials/write-files-validation.js";
import type { SecretSealerPort } from "../webhooks/index.js";
import { inspectSiteKeyMaterial } from "../webhooks/keyring.env.js";
import { siteKeySources, siteKeySourcesForSiteDir } from "../webhooks/site-key-sources.js";
import { SITE_BACKUP_PUSH_TOOL_ID } from "./confirmation-ui.js";
import type { CredentialedRepositoryTarget, InspectBackupRepositoryResult, SourceControlProvider } from "../source-control/provider-module.js";
import { buildSourceControlProviders, findReservedPath, pickSourceControlProviderForApi, type LoadSourceControlProviders } from "../source-control/provider-registry.js";
import { isSourceControlProviderId, resolveDefaultForSourceControl, SourceControlCredentialSecretStoreUnconfiguredError } from "../source-control/store.js";
import type { SourceControlCredentialSetRepoPort } from "../source-control/types.js";
import { siteBackupPlanStore as DEFAULT_PLAN_STORE, type SiteBackupPlan, type SiteBackupPlanStore } from "./plan-store.js";
import { CANCELLED, initialPushProgress, uploadPlannedContent, type SiteBackupPushProgress } from "./push-engine.js";
import { SiteBackupPushJobs } from "./push-jobs.js";
import {
  captureDatabaseSnapshot,
  checkSiteBackupLimits,
  collectSiteBackupFiles,
  formatByteSize,
  SITE_BACKUP_DATABASE_PATH,
  SITE_BACKUP_SCOPES,
  skipOversizedFiles,
  type SiteBackupHostLimit,
  type SiteBackupInclude,
  type SiteBackupSources,
} from "./sources.js";

/**
 * @file The two site-backup agent tools: `site_backup_plan` (read-only) and `site_backup_push`
 * (authorized, immediate). Together they put the site's content — the database, media, themes, plugins
 * and settings — into ONE folder of a private repository on a plugin-provided git host, in one commit, through a saved
 * custom credential (the same credentials `custom_credential_write_files` uses).
 *
 * Why two calls: the plan does every check that can fail (credential, repository visibility and
 * permissions, branch, folder, database snapshot, sizes) and returns what WOULD be written, so the
 * model can report the planned backup. The push uploads exactly what was planned: the database snapshot is
 * held in memory with the plan (`plan-store.ts`), and each disk file is re-read and refused if it
 * changed since (`readPlannedFile`).
 *
 * A large backup outlasts one tool call: the push runs as a job (`push-jobs.ts`), the call waits for
 * it up to {@link PUSH_WAIT_MS} and otherwise returns its progress; calling the push again with the
 * same planId keeps waiting on the same job. The upload itself is `push-engine.ts`.
 *
 * Safety rules, each re-checked at push time where the world can change in between:
 * - Private repositories only (public and "internal" both refused), because the database holds
 *   members, form submissions and admin accounts. Re-checked before pushing.
 * - Never a force push, and never a surprise overwrite: the push commits on the PLAN's tip, and a
 *   branch that moved since is refused (`DIVERGED_BRANCH`) before a single blob is uploaded, and
 *   again by the host itself on the non-force ref update.
 * - The token never leaves the server: not in any result, dialog or log line.
 *
 * Credential errors are split so an operator can act on them: a label with no saved row is
 * `CREDENTIAL_NOT_FOUND` (with the labels that do exist), and a saved row this server cannot decrypt
 * is `CREDENTIAL_UNREADABLE`, whose message says WHICH problem it is from THIS SITE's own site key
 * status (`inspectSiteKeyMaterial` run over `siteKeySourcesForSiteDir`'s site-aware source ordering —
 * site-key plan §A3b, the same composed helper the admin site key route reuses, so an active
 * per-site key file is never mistaken for "no site key" — see `unreadableCredentialMessage`) —
 * never from the decrypt error's own text, which can quote plaintext. (The same "unreadable reads as
 * missing" confusion `ADS-memory/.local-artifacts/reports/2026-09-21-byok-triage.md` traced for BYOK
 * keys.)
 *
 * Out of scope: restoring from a backup, an admin UI, and scheduled backups.
 */

interface AgentToolDefinition {
  name: string;
  description: string;
  sideEffects: AgentToolSideEffect;
  authorization: { permission: string };
  inputSchema?: Readonly<Record<string, unknown>>;
}

const DOMAIN = "site-backup";
const PLAN_TOOL_ID = "site_backup_plan";
/** The one permission that names this feature. Not in any built-in role but the owner's `*`. */
const PUSH_PERMISSION = "site-backup.push";
/** Also required: the push sends a saved credential's token to its provider, which is exactly what
 *  `custom_credential_write_files` gates on this permission. */
const CREDENTIAL_WRITE_PERMISSION = "custom-credentials.write";
/** The restore-point name the database snapshot is captured under, so an orphan is recognizable. */
const SNAPSHOT_SCOPE_ID = "site-backup";

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
    name: PLAN_TOOL_ID,
    description:
      "Plans a BACKUP OF THIS SITE to a private repository on a git host a turned-on Agent Plugin provides (source_control_get_capabilities lists each host with its label, apiOrigin and maxFileBytes) — the site's database (content, members, form submissions, admin accounts, credentials encrypted), media, themes, installed plugins and skills, and settings — as one folder, through the host's connection saved with source_control_propose_credential or a saved custom credential (Access Tokens page -> 'Add custom provider', base URL = that host's apiOrigin). With no connection yet, tell the person the repository rules below and ask which repository first, then open that form. Use this to back up or keep a copy of the site itself; to publish the RENDERED site to a repository use source_control_execute_commit instead. Read-only: it writes nothing anywhere. It checks the credential, that the repository is PRIVATE (public and internal repositories are refused, because the database holds user data), that the credential can push, that the branch exists (defaults to the repository's default branch; an empty repository is refused — it needs a first commit such as a README), snapshots the database, lists every file with its size, and checks the limits (a media, theme or plugin file over the host's maxFileBytes is left out and listed in skipped; the database over it fails the plan; at most 3000 files and 1 GiB). Returns {planned: true, planId, expiresAt, credential, repository, visibility, branch, folder, folderExists, include, fileCount, totalBytes, totalSize, files: [{path, bytes}], skipped, notes, nextStep}, or {planned: false, code, message} naming what to fix (codes: CREDENTIAL_NOT_FOUND, CREDENTIAL_AMBIGUOUS, CREDENTIAL_UNREADABLE, REPOSITORY_NOT_FOUND, REPOSITORY_NOT_PRIVATE, NO_PUSH_PERMISSION, REPOSITORY_EMPTY, BRANCH_NOT_FOUND, FOLDER_IS_FILE, DATABASE_SNAPSHOT_FAILED, LIMIT_EXCEEDED, PROVIDER_ERROR, NETWORK_UNREACHABLE, UNAVAILABLE). Show the human the plan (repository, branch, folder, what is included, file count and size, anything skipped), then call site_backup_push with the planId.",
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
];

const CATALOG_BY_ID = indexCatalogById({ catalog: siteBackupAgentToolCatalog });

/** This wiring layer's own risk classification, cross-checked against the catalog's `sideEffects`. */
export const siteBackupDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> a non-decrypting credential list, one decrypting resolve, four read-only host GETs, a
  // database snapshot held in memory (its restore-point file deleted at once), a disk walk, and an
  // in-memory plan. Nothing durable is written anywhere.
  [PLAN_TOOL_ID, "none"],
  // -> blobs, trees, a commit and a non-force ref update in a
  // THIRD-PARTY repository — the same classification custom_credential_write_files carries.
  [SITE_BACKUP_PUSH_TOOL_ID, "mutates-durable-state"],
]);

/** The slice of the route-deps bag these tools read. Structural, so this module never imports
 *  `server/routes/types`. */
export interface SiteBackupToolDeps {
  readonly authorize: AuthorizeFn;
  readonly workspaceId: string;
  readonly customCredentialSetRepo: CustomCredentialSetRepoPort;
  /** The connections chat's "Connect <host>" form saves (`source_control_propose_credential`); a
   *  host's default one is used when no custom credential points at it. `RouteDeps` has it. */
  readonly sourceControlCredentialSetRepo?: SourceControlCredentialSetRepoPort;
  readonly siteAssistantSecretSealer: SecretSealerPort;
  readonly customCredentialsHttpClient: HttpClientPort;
  /** The client a backup talks to its host with (`SITE_BACKUP_EGRESS_POLICY`: a 2-minute idle
   *  ceiling for large blob uploads); {@link customCredentialsHttpClient} when absent. */
  readonly siteBackupHttpClient?: HttpClientPort;
  /** The git-host providers a backup pushes through (the installed, enabled Agent Plugins when
   *  omitted — the bundled `github` one today). */
  readonly loadSourceControlProviders?: LoadSourceControlProviders;
  /** `RouteDeps.observability`: a backup's raw git-host calls are outbound spans. */
  readonly observability?: ObservabilityPort;
  readonly dbOps: DbOpsPort;
  /** Where this site's files live. Absent in the in-memory `app.ts` runtime, which has no site
   *  folder — both tools then answer `UNAVAILABLE`. */
  readonly siteBackupSources?: SiteBackupSources;
  /** Test-only; defaults to the process-wide store. */
  readonly siteBackupPlanStore?: SiteBackupPlanStore;
  /** Test-only; defaults to {@link siteAwareSiteKeyStatus} (site-aware — see that function's doc). */
  readonly siteBackupSiteKeyStatus?: () => { readonly active: boolean; readonly invalid?: boolean };
  /** Test-only; defaults to `console.warn`. Receives only lines built here — never a token. */
  readonly siteBackupFailureLog?: (line: string) => void;
  /** Test-only; defaults to the real clock. */
  readonly siteBackupNow?: () => Date;
  /** Test-only; defaults to the process-wide job registry. */
  readonly siteBackupPushJobs?: SiteBackupPushJobs<PushResult>;
  /** Test-only; defaults to {@link PUSH_WAIT_MS}. */
  readonly siteBackupPushWaitMs?: number;
  /** Test-only; replaces the host's retry timer. */
  readonly siteBackupSleep?: (ms: number) => Promise<void>;
}

/** Every refusal both tools return, as `{code, message}`. */
interface Refusal {
  readonly ok: false;
  readonly code: string;
  readonly message: string;
}

function failureLog(deps: SiteBackupToolDeps): (line: string) => void {
  return deps.siteBackupFailureLog ?? ((line: string) => console.warn(line));
}

/** Logs a failure's server-only detail (a network failure's class and code). Never the token. */
function logFailureDetail(deps: SiteBackupToolDeps, toolId: string, failure: { readonly code: string; readonly logDetail?: string }): void {
  if (failure.logDetail !== undefined) failureLog(deps)(`[site-backup] ${toolId}: failed code=${failure.code} detail=${failure.logDetail}`);
}

// ---------------------------------------------------------------------------
// Credential
// ---------------------------------------------------------------------------

interface ResolvedBackupCredential {
  readonly ok: true;
  readonly label: string;
  readonly baseUrl: string;
  readonly connection: CustomProviderConnectionInput;
  /** The plugin provider for the credential's host. */
  readonly provider: SourceControlProvider;
}

/** A resolved credential's repository target: its API plus the `Authorization` header built from it. */
function backupTarget(credential: ResolvedBackupCredential, owner: string, repo: string): CredentialedRepositoryTarget {
  return { baseUrl: credential.baseUrl, authorization: buildAuthorizationHeader({ connection: credential.connection, schemes: [] }), owner, repo };
}

/** Every git-host provider an enabled plugin ships, or the refusal when there is none. */
async function loadBackupProviders(deps: SiteBackupToolDeps): Promise<{ ok: true; providers: readonly SourceControlProvider[]; noProviderMessage: string } | Refusal> {
  const built = await buildSourceControlProviders({
    ...(deps.loadSourceControlProviders ? { load: deps.loadSourceControlProviders } : {}),
    workspaceId: deps.workspaceId,
    httpClient: deps.siteBackupHttpClient ?? deps.customCredentialsHttpClient,
    observability: deps.observability,
    ...(deps.siteBackupSleep ? { sleep: deps.siteBackupSleep } : {}),
  });
  for (const refusal of built.refusals) failureLog(deps)(`[site-backup] ${refusal}`);
  if (built.providers.length === 0) {
    return { ok: false, code: "NO_PROVIDER", message: built.noProviderMessage };
  }
  return { ok: true, providers: built.providers, noProviderMessage: built.noProviderMessage };
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function labelList(labels: readonly string[]): string {
  return labels.length === 0 ? "none are saved" : `saved labels: ${labels.map((label) => `'${label}'`).join(", ")}`;
}

/**
 * Picks the credential's label: the one named, or — when none is — the single saved credential
 * pointing at a provider's API origin. A pure list read; nothing is decrypted here.
 *
 * @complexity O(saved credentials).
 */
async function pickCredentialLabel(deps: SiteBackupToolDeps, providers: readonly SourceControlProvider[], requested: string | undefined): Promise<{ ok: true; label: string } | Refusal> {
  const saved = await listCustomCredentials({ repo: deps.customCredentialSetRepo }, { workspaceId: deps.workspaceId });
  const labels = saved.map((credential) => credential.label);
  if (requested !== undefined) {
    if (labels.includes(requested)) return { ok: true, label: requested };
    return { ok: false, code: "CREDENTIAL_NOT_FOUND", message: `no saved credential is labeled '${requested}' (${labelList(labels)})` };
  }
  const apiOrigins = providers.map((provider) => provider.apiOrigin);
  const where = apiOrigins.join(" or ");
  const matching = saved.filter((credential) => apiOrigins.includes(originOf(credential.baseUrl) ?? "")).map((credential) => credential.label);
  if (matching.length === 1) return { ok: true, label: matching[0]! };
  if (matching.length === 0) {
    return {
      ok: false,
      code: "CREDENTIAL_NOT_FOUND",
      message: `no saved credential points at ${where} (${labelList(labels)}). Connect ${providers.map((provider) => provider.label).join(" or ")} with source_control_propose_credential (a form in this chat), or save a token on the Access Tokens page ('Add custom provider', base URL ${where}), or name one with 'credential'.`,
    };
  }
  return { ok: false, code: "CREDENTIAL_AMBIGUOUS", message: `${matching.length} saved credentials point at ${where} (${labelList(matching)}); name one with 'credential'.` };
}

/**
 * This site's own site key status ({@link inspectSiteKeyMaterial}), resolved over THIS site's
 * site-aware source ordering ({@link siteKeySourcesForSiteDir} — site-key plan §A3b, the same
 * composed helper the admin site key route's `resolveSiteKeySources` reuses) rather than the
 * module-wide env-then-legacy-file default `inspectSiteKeyMaterial()` falls back to when called
 * bare. That default cannot see a per-site key file at all (`~/.tovu/site-keys/<id>.hex`), so a site
 * whose OWN key is active but has no env var and no legacy shared file would be reported `active:
 * false` — the exact gap {@link unreadableCredentialMessage} used to surface as "this server has no
 * site key" for a site that in fact has one.
 *
 * Falls back to the bare, non-site-aware status only when this runtime has no site folder at all
 * (`deps.siteBackupSources` absent — the in-memory `app.ts` runtime; in practice the plan tool's own
 * `UNAVAILABLE` check already refuses before this is ever reached for that case, but the push path
 * re-resolves the credential independently and must not throw if it ever is).
 *
 * @complexity O(1) — one `.site-meta.json` read plus a fixed-size source list, matching
 *   {@link inspectSiteKeyMaterial}'s own cost.
 */
function siteAwareSiteKeyStatus(deps: SiteBackupToolDeps): { active: boolean; invalid?: boolean } {
  const siteDir = deps.siteBackupSources?.siteDir;
  if (siteDir === undefined) return inspectSiteKeyMaterial({ sources: siteKeySources({ mode: resolveRuntimeMode(), env: process.env, home: homedir(), cwd: process.cwd() }) });
  const sources = siteKeySourcesForSiteDir({ siteDir, mode: resolveRuntimeMode(), env: process.env, home: homedir(), cwd: process.cwd() });
  return inspectSiteKeyMaterial({ sources });
}

/** Why a saved credential could not be decrypted, from THIS SITE's own site key status
 *  ({@link siteAwareSiteKeyStatus}) — never the bare, env/legacy-only default (see that function's
 *  own doc for why that used to misreport an active per-site key as "no site key"). */
function unreadableCredentialMessage(deps: SiteBackupToolDeps, label: string): string {
  const status = (deps.siteBackupSiteKeyStatus ?? (() => siteAwareSiteKeyStatus(deps)))();
  if (status.active) {
    return (
      `the credential '${label}' is saved but cannot be decrypted with this server's Site key: it differs from the one the credential was saved under, ` +
      "or the stored row is corrupted. Check Secrets → Site key in the admin, or save the credential again."
    );
  }
  if (status.invalid) {
    return `the credential '${label}' is saved but cannot be decrypted: this server's Site key (TOVU_SITE_KEY or its key file) is set but malformed. Fix it under Secrets → Site key.`;
  }
  return (
    `the credential '${label}' is saved but cannot be decrypted: this server has no Site key (TOVU_SITE_KEY is not set and there is no key file). ` +
    "Start Tovu with it (`npm run dev` from the repo root, or `npm run desktop`)."
  );
}

/**
 * The host's default connection saved through chat's "Connect <host>" form, when no custom
 * credential points at the host. Demo dry run 2026-10-05: that form saves into the source-control
 * store, which this tool never read, so a person who had just filled it in was still told
 * CREDENTIAL_NOT_FOUND. A named `credential` matches the connection's label, which is also how the
 * push re-resolves the plan's credential.
 *
 * @complexity O(providers) repo reads, at most one decrypt each.
 */
async function resolveHostConnection(deps: SiteBackupToolDeps, providers: readonly SourceControlProvider[], requested: string | undefined): Promise<ResolvedBackupCredential | Refusal | null> {
  const repo = deps.sourceControlCredentialSetRepo;
  if (!repo) return null;
  for (const provider of providers) {
    if (!isSourceControlProviderId(provider.id)) continue;
    let found;
    try {
      found = await resolveDefaultForSourceControl({ repo, sealer: deps.siteAssistantSecretSealer }, { workspaceId: deps.workspaceId, providerId: provider.id });
    } catch (err) {
      if (err instanceof SourceControlCredentialSecretStoreUnconfiguredError) return { ok: false, code: "CREDENTIAL_UNREADABLE", message: unreadableCredentialMessage(deps, `${provider.label} connection`) };
      throw err;
    }
    if (!found || (requested !== undefined && requested !== found.label)) continue;
    const { token } = found.connection;
    const connection: CustomProviderConnectionInput = "username" in found.connection ? { token, username: found.connection.username } : { token };
    return { ok: true, label: found.label, baseUrl: provider.apiOrigin, connection, provider };
  }
  return null;
}

/**
 * Resolves the credential the backup pushes with. A missing row and an undecryptable one are
 * different codes; the decrypt error's own text is never used (it can quote plaintext).
 *
 * @complexity O(saved credentials) plus one decrypt.
 */
async function resolveBackupCredential(deps: SiteBackupToolDeps, requested: string | undefined): Promise<ResolvedBackupCredential | Refusal> {
  const providers = await loadBackupProviders(deps);
  if (!providers.ok) return providers;
  const picked = await pickCredentialLabel(deps, providers.providers, requested);
  if (!picked.ok) {
    if (picked.code !== "CREDENTIAL_NOT_FOUND") return picked;
    return (await resolveHostConnection(deps, providers.providers, requested)) ?? picked;
  }
  let resolved;
  try {
    resolved = await resolveCustomCredentialByLabel({ repo: deps.customCredentialSetRepo, sealer: deps.siteAssistantSecretSealer }, { workspaceId: deps.workspaceId, label: picked.label });
  } catch (err) {
    if (err instanceof CustomCredentialSecretStoreUnconfiguredError) return { ok: false, code: "CREDENTIAL_UNREADABLE", message: unreadableCredentialMessage(deps, picked.label) };
    throw err;
  }
  if (!resolved) return { ok: false, code: "CREDENTIAL_NOT_FOUND", message: `the credential '${picked.label}' was deleted while the backup was being prepared` };
  const provider = pickSourceControlProviderForApi(providers.providers, resolved.baseUrl, providers.noProviderMessage);
  if (!provider.ok) return { ok: false, code: "NO_PROVIDER", message: provider.message };
  return { ok: true, label: picked.label, baseUrl: resolved.baseUrl, connection: resolved.connection, provider: provider.provider };
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

const INSPECT_CODES: Record<string, string> = {
  "repo-not-found": "REPOSITORY_NOT_FOUND",
  "repo-not-private": "REPOSITORY_NOT_PRIVATE",
  "no-push-permission": "NO_PUSH_PERMISSION",
  "repo-empty": "REPOSITORY_EMPTY",
  "branch-not-found": "BRANCH_NOT_FOUND",
  "folder-is-file": "FOLDER_IS_FILE",
  "provider-error": "PROVIDER_ERROR",
  "network-unreachable": "NETWORK_UNREACHABLE",
  diverged: "DIVERGED_BRANCH",
};

/** A provider failure as this tool's `{code, message}`, logging any server-only detail. */
function providerRefusal(deps: SiteBackupToolDeps, toolId: string, failure: { readonly code: string; readonly message: string; readonly logDetail?: string }): Refusal {
  logFailureDetail(deps, toolId, failure);
  return { ok: false, code: INSPECT_CODES[failure.code] ?? "PROVIDER_ERROR", message: failure.message };
}

async function inspect(
  deps: SiteBackupToolDeps,
  provider: SourceControlProvider,
  toolId: string,
  input: CredentialedRepositoryTarget & { branch?: string; folder: string }
): Promise<Extract<InspectBackupRepositoryResult, { ok: true }> | Refusal> {
  const result = await provider.inspectBackupRepository(input);
  return result.ok ? result : providerRefusal(deps, toolId, result);
}

// ---------------------------------------------------------------------------
// site_backup_plan
// ---------------------------------------------------------------------------

interface ParsedPlanInput {
  readonly credential: string | undefined;
  /** Checked against the host's rules once the credential names it ({@link validateRepositoryTarget}). */
  readonly owner: unknown;
  readonly repo: unknown;
  readonly branch: string | undefined;
  readonly folder: string | undefined;
  readonly include: SiteBackupInclude;
  readonly commitMessage: string | undefined;
}

function optionalString(raw: Record<string, unknown>, field: string): string | undefined {
  const value = raw[field];
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new CustomCredentialValidationError(`'${field}' must be a string`);
  return value;
}

/** Every switch defaults to true; anything but a boolean for a known scope is refused. */
function parseInclude(value: unknown): SiteBackupInclude {
  if (value === undefined) return { database: true, media: true, themes: true, plugins: true, settings: true };
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new CustomCredentialValidationError("'include' must be an object of true/false switches");
  const raw = value as Record<string, unknown>;
  const unknownKeys = Object.keys(raw).filter((key) => !(SITE_BACKUP_SCOPES as readonly string[]).includes(key));
  if (unknownKeys.length > 0) throw new CustomCredentialValidationError(`'include' has unknown switch(es): ${unknownKeys.join(", ")} (known: ${SITE_BACKUP_SCOPES.join(", ")})`);
  const include = {} as Record<(typeof SITE_BACKUP_SCOPES)[number], boolean>;
  for (const scope of SITE_BACKUP_SCOPES) {
    const flag = raw[scope];
    if (flag !== undefined && typeof flag !== "boolean") throw new CustomCredentialValidationError(`'include.${scope}' must be true or false`);
    include[scope] = flag ?? true;
  }
  if (!SITE_BACKUP_SCOPES.some((scope) => include[scope])) throw new CustomCredentialValidationError("'include' switches everything off; there would be nothing to back up");
  return include;
}

/** The backup folder: repository-relative, never `.git`. The host's own reserved folders
 *  ({@link requireUnreservedFolder}) are checked once the credential names the host. */
function parseFolder(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  return normalizeWriteFilePath(raw);
}

/**
 * Refuses a backup folder inside one the host reserves (`SourceControlHostFacts.reservedPaths`; the
 * `github` plugin declares `.github`, where GitHub runs workflows from). Before any network call.
 *
 * @throws {CustomCredentialValidationError} naming the reserved folder.
 * @complexity O(r) reserved paths.
 */
function requireUnreservedFolder(folder: string, provider: SourceControlProvider): void {
  const reserved = findReservedPath(folder, provider.reservedPaths);
  if (reserved !== undefined) throw new CustomCredentialValidationError(`the backup folder must not be inside '${reserved}': '${folder}'`);
}

/** @throws {CustomCredentialValidationError} Any malformed field — before any permission check,
 *  decrypt or network call. Owner and repo are the host's to judge, after the credential is resolved. */
function parsePlanInput(rawInput: unknown): ParsedPlanInput {
  const raw = requireInputRecord({ input: rawInput });
  const branch = optionalString(raw, "branch");
  const commitMessage = optionalString(raw, "commitMessage");
  return {
    credential: optionalString(raw, "credential"),
    owner: raw.owner,
    repo: raw.repo,
    branch: branch === undefined ? undefined : validateBranch(branch),
    folder: parseFolder(optionalString(raw, "folder")),
    include: parseInclude(raw.include),
    commitMessage: commitMessage === undefined ? undefined : validateCommitMessage(commitMessage),
  };
}

async function requireBackupPermissions(deps: SiteBackupToolDeps, ctx: ToolExecutionContext): Promise<void> {
  await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: PUSH_PERMISSION }, { entityType: DOMAIN });
  await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: CREDENTIAL_WRITE_PERMISSION }, { entityType: "custom-credentials" });
}

const UNAVAILABLE: Refusal = { ok: false, code: "UNAVAILABLE", message: "site backup is not available in this runtime: it has no site folder on disk" };

/** The site's display name from its `config.json`, falling back to the folder name. */
async function readSiteName(siteDir: string): Promise<string> {
  try {
    const config = JSON.parse(await readFile(path.join(siteDir, "config.json"), "utf8")) as { name?: unknown };
    if (typeof config.name === "string" && config.name.trim() !== "") return config.name;
  } catch {
    // A missing or unreadable config.json only costs the nicer name.
  }
  return path.basename(siteDir);
}

/** What the plan tool returns on success: every fact the human should see before confirming. */
function planResult(plan: SiteBackupPlan): Record<string, unknown> {
  const files = [...(plan.database ? [{ path: SITE_BACKUP_DATABASE_PATH, bytes: plan.database.bytes.length }] : []), ...plan.files.map((file) => ({ path: file.path, bytes: file.bytes }))];
  return {
    planned: true,
    planId: plan.planId,
    expiresAt: new Date(plan.expiresAtMs).toISOString(),
    credential: plan.credentialLabel,
    repository: `${plan.owner}/${plan.repo}`,
    visibility: "private",
    branch: plan.repository.branch,
    folder: plan.folder,
    folderExists: plan.repository.folderExists,
    include: plan.include,
    fileCount: files.length,
    totalBytes: plan.totalBytes,
    totalSize: formatByteSize(plan.totalBytes),
    files,
    skipped: plan.skipped,
    notes: SITE_BACKUP_SCOPES.flatMap((scope) => (plan.scopeNotes[scope] ? [plan.scopeNotes[scope]] : [])),
    nextStep:
      `Show the human this plan: ${plan.owner}/${plan.repo}, branch '${plan.repository.branch}', folder '${plan.folder}' ` +
      `(${plan.repository.folderExists ? "its current contents will be replaced" : "new"}), ${files.length} files (${formatByteSize(plan.totalBytes)}), plus anything skipped. ` +
      "Then call site_backup_push with this planId within 10 minutes; it pushes the planned backup immediately (a large one may return inProgress: call it again with the same planId). A tovu-backup.json manifest is added at push time.",
  };
}

/**
 * The plan: every check that can fail, in the order that wastes the least — validate, permissions,
 * credential, repository (so a public repository is refused before a snapshot is taken), database
 * snapshot, disk files, limits — then the in-memory plan.
 *
 * @complexity O(site files) for the walk, O(database size) for the snapshot, four GETs.
 */
async function handlePlan(deps: SiteBackupToolDeps, ctx: ToolExecutionContext): Promise<unknown> {
  const input = parsePlanInput(ctx.input);
  await requireBackupPermissions(deps, ctx);
  const sources = deps.siteBackupSources;
  if (!sources) return { planned: false, code: UNAVAILABLE.code, message: UNAVAILABLE.message };

  const credential = await resolveBackupCredential(deps, input.credential);
  if (!credential.ok) return { planned: false, code: credential.code, message: credential.message };

  const folderName = path.basename(sources.siteDir);
  const folder = input.folder ?? normalizeWriteFilePath(folderName);
  const { owner, repo: repoName } = validateRepositoryTarget({ owner: input.owner, repo: input.repo }, credential.provider.validateTarget);
  requireUnreservedFolder(folder, credential.provider);
  const target = backupTarget(credential, owner, repoName);
  const repo = await inspect(deps, credential.provider, PLAN_TOOL_ID, { ...target, ...(input.branch !== undefined ? { branch: input.branch } : {}), folder });
  if (!repo.ok) return { planned: false, code: repo.code, message: repo.message };

  const prepared = await prepareContent(deps, sources, input.include, credential.provider);
  if (!prepared.ok) return { planned: false, code: prepared.code, message: prepared.message };

  const createdAt = (deps.siteBackupNow?.() ?? new Date()).toISOString();
  const siteName = await readSiteName(sources.siteDir);
  const plan = (deps.siteBackupPlanStore ?? DEFAULT_PLAN_STORE).save({
    principalId: ctx.principal.id,
    workspaceId: deps.workspaceId,
    content: {
      credentialLabel: credential.label,
      owner,
      repo: repoName,
      folder,
      commitMessage: input.commitMessage ?? `Tovu site backup: ${siteName} (${createdAt})`,
      repository: repo.state,
      include: input.include,
      ...prepared.content,
      site: { name: siteName, folderName },
      schema: runtimeSchemaVersion(),
      tovuVersion: sources.tovuVersion,
      createdAt,
    },
  });
  return planResult(plan);
}

type PreparedContent = Pick<SiteBackupPlan, "database" | "files" | "skipped" | "scopeNotes" | "totalBytes">;

/**
 * The bytes a plan holds: the database snapshot (when included), the disk files, and the limit
 * check over both.
 *
 * @complexity O(database size + site files).
 */
async function prepareContent(deps: SiteBackupToolDeps, sources: SiteBackupSources, include: SiteBackupInclude, host: SiteBackupHostLimit): Promise<{ ok: true; content: PreparedContent } | Refusal> {
  let database: PreparedContent["database"] = null;
  if (include.database) {
    const snapshot = await captureDatabaseSnapshot({ dbOps: deps.dbOps, scopeId: SNAPSHOT_SCOPE_ID });
    if (!snapshot.ok) {
      logFailureDetail(deps, PLAN_TOOL_ID, { code: "database-snapshot", ...(snapshot.logDetail !== undefined ? { logDetail: snapshot.logDetail } : {}) });
      return { ok: false, code: "DATABASE_SNAPSHOT_FAILED", message: snapshot.message };
    }
    database = { bytes: snapshot.bytes, watermarkAtCapture: snapshot.watermarkAtCapture };
  }
  const collected = await collectSiteBackupFiles({ sources, include });
  const fitting = skipOversizedFiles(collected.files, host);
  const limits = checkSiteBackupLimits([...(database ? [{ path: SITE_BACKUP_DATABASE_PATH, bytes: database.bytes.length }] : []), ...fitting.files], host);
  if (!limits.ok) return { ok: false, code: "LIMIT_EXCEEDED", message: limits.message };
  return { ok: true, content: { database, files: fitting.files, skipped: [...collected.skipped, ...fitting.skipped], scopeNotes: collected.scopeNotes, totalBytes: limits.totalBytes } };
}

// ---------------------------------------------------------------------------
// site_backup_push
// ---------------------------------------------------------------------------

export type PushResult =
  | { pushed: true; commitSha: string; commitUrl: string; repository: string; branch: string; folder: string; filesWritten: number; totalBytes: number }
  | { pushed: false; cancelled: true }
  | { pushed: false; cancelled: false; reason: "expired" | "abandoned" }
  | { pushed: false; cancelled: false; inProgress: true; planId: string; progress: SiteBackupPushProgress; message: string }
  | { pushed: false; cancelled: false; code: string; message: string };

function pushRefusal(refusal: Refusal): PushResult {
  return refusal.code === CANCELLED.code ? { pushed: false, cancelled: false, reason: "abandoned" } : { pushed: false, cancelled: false, code: refusal.code, message: refusal.message };
}

/**
 * The authorized push: re-resolve the credential, re-check the repository (still
 * private, branch not moved), upload, commit on the PLAN's parent. Stopping (`signal`) takes effect
 * between files and before the commit, never half-way through one.
 *
 * @complexity O(total bytes); see `push-engine.ts` for the uploads, plus a few fixed tree writes,
 *   one commit and one ref update.
 */
async function pushPlannedBackup(deps: SiteBackupToolDeps, plan: SiteBackupPlan, run: { signal: AbortSignal; progress: SiteBackupPushProgress }): Promise<PushResult> {
  const credential = await resolveBackupCredential(deps, plan.credentialLabel);
  if (!credential.ok) return pushRefusal(credential);
  const target = backupTarget(credential, plan.owner, plan.repo);

  const repo = await inspect(deps, credential.provider, SITE_BACKUP_PUSH_TOOL_ID, { ...target, branch: plan.repository.branch, folder: plan.folder });
  if (!repo.ok) return pushRefusal(repo);
  if (repo.state.parentCommitSha !== plan.repository.parentCommitSha) {
    return pushRefusal({
      ok: false,
      code: "DIVERGED_BRANCH",
      message: `branch '${plan.repository.branch}' moved since the backup was planned (someone pushed to it). Nothing was written. Call site_backup_plan again.`,
    });
  }

  const uploaded = await uploadPlannedContent({
    provider: credential.provider,
    target,
    plan,
    signal: run.signal,
    progress: run.progress,
    toRefusal: (failure) => providerRefusal(deps, SITE_BACKUP_PUSH_TOOL_ID, failure),
  });
  if (!uploaded.ok) return pushRefusal(uploaded);
  if (run.signal.aborted) return pushRefusal(CANCELLED);

  const committed = await credential.provider.commitBackupTree({
    ...target,
    branch: plan.repository.branch,
    folder: plan.folder,
    commitMessage: plan.commitMessage,
    parentCommitSha: plan.repository.parentCommitSha,
    baseTreeSha: plan.repository.baseTreeSha,
    htmlUrl: plan.repository.htmlUrl,
    entries: uploaded.entries,
  });
  if (!committed.ok) return pushRefusal(providerRefusal(deps, SITE_BACKUP_PUSH_TOOL_ID, committed));
  return {
    pushed: true,
    commitSha: committed.commitSha,
    commitUrl: committed.commitUrl,
    repository: `${plan.owner}/${plan.repo}`,
    branch: plan.repository.branch,
    folder: plan.folder,
    filesWritten: uploaded.entries.length,
    totalBytes: uploaded.entries.reduce((sum, entry) => sum + entry.bytes, 0),
  };
}

const PLAN_TAKE_MESSAGES = {
  PLAN_NOT_FOUND: "no backup plan with that planId is waiting (a planId works once, for this principal, and a server restart drops plans). Call site_backup_plan again.",
  PLAN_EXPIRED: "that backup plan expired (plans last 10 minutes). Call site_backup_plan again.",
} as const;

/** How long one push call waits for its job before reporting progress: under the 6-minute cut-off
 *  of a delegated tool call (`push-jobs.ts`), with room for the checks before the upload. */
export const PUSH_WAIT_MS = 4 * 60 * 1000;

const DEFAULT_PUSH_JOBS = new SiteBackupPushJobs<PushResult>();

/** What a call returns while its job is still uploading. */
function inProgressResult(planId: string, progress: SiteBackupPushProgress, elapsedMs: number): PushResult {
  return {
    pushed: false,
    cancelled: false,
    inProgress: true,
    planId,
    progress,
    message:
      `Still uploading after ${Math.round(elapsedMs / 1000)} s: ${progress.filesDone} of ${progress.filesTotal} files (${formatByteSize(progress.bytesDone)} of ${formatByteSize(progress.bytesTotal)}). ` +
      "Nothing is committed until every file is up. Call site_backup_push again with the same planId to keep waiting; it does not start a second upload.",
  };
}

/**
 * The push: consume the principal-bound plan and start its job — or, for a planId whose job is
 * still running, wait on that job — then report its outcome or its progress.
 *
 * @complexity O(1) plan and job lookup; then see {@link pushPlannedBackup}.
 */
async function handlePush(deps: SiteBackupToolDeps, surfaces: AssistantSurfaceDeps, ctx: ToolExecutionContext): Promise<PushResult> {
  const planId = requireString({ input: requireInputRecord({ input: ctx.input }), key: "planId" });
  await requireBackupPermissions(deps, ctx);
  if (ctx.signal.aborted) return { pushed: false, cancelled: false, reason: "abandoned" };

  const jobs = deps.siteBackupPushJobs ?? DEFAULT_PUSH_JOBS;
  const key = { planId, principalId: ctx.principal.id, workspaceId: deps.workspaceId };
  let job = jobs.find(key);
  if (!job) {
    const taken = (deps.siteBackupPlanStore ?? DEFAULT_PLAN_STORE).take(key);
    if (!taken.ok) return { pushed: false, cancelled: false, code: taken.code, message: PLAN_TAKE_MESSAGES[taken.code] };
    job = jobs.start(key, initialPushProgress(taken.plan), (signal, progress) => pushPlannedBackup(deps, taken.plan, { signal, progress }));
  }

  const waited = await jobs.wait(job, { signal: ctx.signal, budgetMs: deps.siteBackupPushWaitMs ?? PUSH_WAIT_MS });
  if (waited.state === "done") return waited.result;
  if (waited.state === "abandoned") return { pushed: false, cancelled: false, reason: "abandoned" };
  return inProgressResult(planId, waited.progress, waited.elapsedMs);
}

/**
 * What reaches the model with its real reason instead of a redacted `INTERNAL_ERROR`. Input
 * validation (`CustomCredentialValidationError`) names a field and a rule, never a secret.
 * `CustomCredentialSecretStoreUnconfiguredError` is deliberately absent: it is caught and turned into
 * `CREDENTIAL_UNREADABLE` above, and its own text must never be published.
 */
const SITE_BACKUP_MODEL_FACING_ERRORS: readonly ModelFacingErrorRule[] = [
  forbiddenRule("SITE_BACKUP"),
  { error: CustomCredentialValidationError, code: "SITE_BACKUP_INVALID_INPUT" },
];

/**
 * Builds this domain's `ToolRegistration[]`.
 *
 * @complexity O(1) at registration.
 */
export function buildSiteBackupRegistrations(deps: SiteBackupToolDeps, surfaces: AssistantSurfaceDeps): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {
    [PLAN_TOOL_ID]: (ctx) => handlePlan(deps, ctx),
    [SITE_BACKUP_PUSH_TOOL_ID]: (ctx) => handlePush(deps, surfaces, ctx),
  };
  return buildDomainRegistrations({
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
