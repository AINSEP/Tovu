import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import {
  buildDomainRegistrations,
  indexCatalogById,
  requireInputRecord,
  requireString,
  requireToolPermission,
  type AgentToolSideEffect,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
} from "@jini-ai/cms/core";
// `ToolInputError` specifically — the marker `@jini-ai/daemon`'s `ToolExecutor` reads to classify a
// rejection as the caller's to fix instead of redacting it into a message-stripped 500.
import { ToolInputError, type ToolExecutionContext } from "@jini-ai/core";
import type { UIResource } from "@jini-ai/ui/mcp-ui/surfaces";

import type { AuthorizeFn } from "../../contracts/core/commands/index.js";
import type { DbOpsPort } from "#src/contracts/core/gated-mutations/ports";
import { forbiddenRule, withModelFacingErrors, type ModelFacingErrorRule } from "../../contracts/core/model-facing-tool-errors.js";
import { resolveConfirmationDecision, type AssistantSurfaceDeps, type SurfaceExchange } from "../../contracts/core/tool-surface-exchanges.js";
import type { ToolContributor } from "#src/assistant/index";
import type { HttpClientPort } from "../../platform/http/index.js";
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
import { normalizeWriteFilePath, validateBranch, validateCommitMessage, validateOwner, validateRepo } from "../custom-credentials/write-files-validation.js";
import type { SecretSealerPort } from "../webhooks/index.js";
import { inspectRootKeyMaterial } from "../webhooks/keyring.env.js";
import { siteKeySourcesForSiteDir } from "../webhooks/site-key-sources.js";
import { buildConfirmationSurface, SITE_BACKUP_PUSH_TOOL_ID } from "./confirmation-ui.js";
import { commitBackupTree, inspectBackupRepository, uploadBackupBlob, type BackupRepositoryTarget, type InspectBackupRepositoryResult, type UploadedBackupBlob } from "./github-push.js";
import { siteBackupPlanStore as DEFAULT_PLAN_STORE, type SiteBackupPlan, type SiteBackupPlanStore } from "./plan-store.js";
import {
  buildSiteBackupManifest,
  captureDatabaseSnapshot,
  checkSiteBackupLimits,
  collectSiteBackupFiles,
  formatByteSize,
  readPlannedFile,
  SITE_BACKUP_DATABASE_PATH,
  SITE_BACKUP_MANIFEST_PATH,
  SITE_BACKUP_SCOPES,
  type SiteBackupInclude,
  type SiteBackupSources,
} from "./sources.js";

/**
 * @file The two site-backup agent tools: `site_backup_plan` (read-only) and `site_backup_push`
 * (human-confirmed). Together they put the site's content — the database, media, themes, plugins
 * and settings — into ONE folder of a private GitHub repository, in one commit, through a saved
 * custom credential (the same credentials `custom_credential_write_files` uses).
 *
 * Why two calls: the plan does every check that can fail (credential, repository visibility and
 * permissions, branch, folder, database snapshot, sizes) and returns what WOULD be written, so the
 * model can show the human before anything is asked of them. The push then raises the same held-open
 * in-chat confirmation every external GitHub write here uses (`custom_credential_write_files`,
 * `source_control_execute_commit`) and uploads exactly what was planned: the database snapshot is
 * held in memory with the plan (`plan-store.ts`), and each disk file is re-read and refused if it
 * changed since (`readPlannedFile`).
 *
 * Safety rules, each re-checked at push time where the world can change in between:
 * - Private repositories only (public and "internal" both refused), because the database holds
 *   members, form submissions and admin accounts. Re-checked after the human confirms.
 * - Never a force push, and never a surprise overwrite: the push commits on the PLAN's tip, and a
 *   branch that moved since is refused (`DIVERGED_BRANCH`) before a single blob is uploaded, and
 *   again by GitHub itself on the non-force ref update.
 * - The token never leaves the server: not in any result, dialog or log line.
 *
 * Credential errors are split so an operator can act on them: a label with no saved row is
 * `CREDENTIAL_NOT_FOUND` (with the labels that do exist), and a saved row this server cannot decrypt
 * is `CREDENTIAL_UNREADABLE`, whose message says WHICH problem it is from THIS SITE's own Site Token
 * status (`inspectRootKeyMaterial` run over `siteKeySourcesForSiteDir`'s site-aware source ordering —
 * site-key plan §A3b, the same composed helper the admin Site Token route reuses, so an active
 * per-site key file is never mistaken for "no Site Token" — see `unreadableCredentialMessage`) —
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
/** Where a credential saved for github.com points. Used only to pick a credential when none is named. */
const GITHUB_API_ORIGIN = "https://api.github.com";
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
      description: "Label of the saved custom credential to push with. Optional when exactly one saved credential points at https://api.github.com.",
    },
    owner: { type: "string", description: "GitHub owner or organization of the target repository." },
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
      "Plans a BACKUP OF THIS SITE to a private GitHub repository — the site's database (content, members, form submissions, admin accounts, credentials encrypted), media, themes, installed plugins and skills, and settings — as one folder, through a saved custom credential (Access Tokens page -> 'Add custom provider', base URL https://api.github.com). Use this to back up or keep a copy of the site itself; to publish the RENDERED site to a repository use source_control_execute_commit instead. Read-only: it writes nothing anywhere. It checks the credential, that the repository is PRIVATE (public and internal repositories are refused, because the database holds user data), that the credential can push, that the branch exists (defaults to the repository's default branch; an empty repository is refused — it needs a first commit such as a README), snapshots the database, lists every file with its size, and checks the limits (no file over GitHub's 100 MiB, at most 3000 files and 1 GiB). Returns {planned: true, planId, expiresAt, credential, repository, visibility, branch, folder, folderExists, include, fileCount, totalBytes, totalSize, files: [{path, bytes}], skipped, notes, nextStep}, or {planned: false, code, message} naming what to fix (codes: CREDENTIAL_NOT_FOUND, CREDENTIAL_AMBIGUOUS, CREDENTIAL_UNREADABLE, REPOSITORY_NOT_FOUND, REPOSITORY_NOT_PRIVATE, NO_PUSH_PERMISSION, REPOSITORY_EMPTY, BRANCH_NOT_FOUND, FOLDER_IS_FILE, DATABASE_SNAPSHOT_FAILED, LIMIT_EXCEEDED, PROVIDER_ERROR, NETWORK_UNREACHABLE, UNAVAILABLE). Show the human the plan (repository, branch, folder, what is included, file count and size, anything skipped), then call site_backup_push with the planId.",
    sideEffects: "none",
    authorization: { permission: PUSH_PERMISSION },
    inputSchema: PLAN_SCHEMA,
  },
  {
    name: SITE_BACKUP_PUSH_TOOL_ID,
    description:
      "Pushes a backup planned by site_backup_plan to GitHub, in ONE commit. HUMAN-GATED: this one call shows an in-chat confirmation naming the repository, branch, folder, what is included and every file, and WAITS for the human; there is no second call to make. The backup folder is REPLACED as a whole (files no longer on the site disappear from it); nothing outside the folder changes; never a force push. On confirm it re-checks the repository is still private and the branch has not moved, uploads exactly what was planned, and returns {pushed: true, commitSha, commitUrl, repository, branch, folder, filesWritten, totalBytes}. Cancel returns {pushed: false, cancelled: true}; no answer returns {pushed: false, cancelled: false, reason: 'expired' | 'abandoned'}. Failures return {pushed: false, cancelled: false, code, message}: PLAN_NOT_FOUND or PLAN_EXPIRED (a planId works once, for 10 minutes — call site_backup_plan again), DIVERGED_BRANCH (someone pushed to the branch since the plan; nothing was written — plan again), PLAN_STALE (a file changed since the plan — plan again), REPOSITORY_NOT_PRIVATE, CREDENTIAL_NOT_FOUND, CREDENTIAL_UNREADABLE, PROVIDER_ERROR, NETWORK_UNREACHABLE. Do not re-call while a call is pending.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: PUSH_PERMISSION },
    inputSchema: PUSH_SCHEMA,
  },
];

const CATALOG_BY_ID = indexCatalogById(siteBackupAgentToolCatalog);

/** This wiring layer's own risk classification, cross-checked against the catalog's `sideEffects`. */
export const siteBackupDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> a non-decrypting credential list, one decrypting resolve, four read-only GitHub GETs, a
  // database snapshot held in memory (its restore-point file deleted at once), a disk walk, and an
  // in-memory plan. Nothing durable is written anywhere.
  [PLAN_TOOL_ID, "none"],
  // -> on human confirmation only: blobs, trees, a commit and a non-force ref update in a
  // THIRD-PARTY repository — the same classification custom_credential_write_files carries.
  [SITE_BACKUP_PUSH_TOOL_ID, "mutates-durable-state"],
]);

/** The slice of the route-deps bag these tools read. Structural, so this module never imports
 *  `server/routes/types`. */
export interface SiteBackupToolDeps {
  readonly authorize: AuthorizeFn;
  readonly workspaceId: string;
  readonly customCredentialSetRepo: CustomCredentialSetRepoPort;
  readonly siteAssistantSecretSealer: SecretSealerPort;
  readonly customCredentialsHttpClient: HttpClientPort;
  readonly dbOps: DbOpsPort;
  /** Where this site's files live. Absent in the in-memory `app.ts` runtime, which has no site
   *  folder — both tools then answer `UNAVAILABLE`. */
  readonly siteBackupSources?: SiteBackupSources;
  /** Test-only; defaults to the process-wide store. */
  readonly siteBackupPlanStore?: SiteBackupPlanStore;
  /** Test-only; defaults to {@link siteAwareRootKeyStatus} (site-aware — see that function's doc). */
  readonly siteBackupRootKeyStatus?: () => { readonly active: boolean; readonly invalid?: boolean };
  /** Test-only; defaults to `console.warn`. Receives only lines built here — never a token. */
  readonly siteBackupFailureLog?: (line: string) => void;
  /** Test-only; defaults to the real clock. */
  readonly siteBackupNow?: () => Date;
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
 * pointing at github.com. A pure list read; nothing is decrypted here.
 *
 * @complexity O(saved credentials).
 */
async function pickCredentialLabel(deps: SiteBackupToolDeps, requested: string | undefined): Promise<{ ok: true; label: string } | Refusal> {
  const saved = await listCustomCredentials({ repo: deps.customCredentialSetRepo }, { workspaceId: deps.workspaceId });
  const labels = saved.map((credential) => credential.label);
  if (requested !== undefined) {
    if (labels.includes(requested)) return { ok: true, label: requested };
    return { ok: false, code: "CREDENTIAL_NOT_FOUND", message: `no saved credential is labeled '${requested}' (${labelList(labels)})` };
  }
  const github = saved.filter((credential) => originOf(credential.baseUrl) === GITHUB_API_ORIGIN).map((credential) => credential.label);
  if (github.length === 1) return { ok: true, label: github[0]! };
  if (github.length === 0) {
    return {
      ok: false,
      code: "CREDENTIAL_NOT_FOUND",
      message: `no saved credential points at ${GITHUB_API_ORIGIN} (${labelList(labels)}). Save a GitHub token on the Access Tokens page ('Add custom provider'), or name one with 'credential'.`,
    };
  }
  return { ok: false, code: "CREDENTIAL_AMBIGUOUS", message: `${github.length} saved credentials point at ${GITHUB_API_ORIGIN} (${labelList(github)}); name one with 'credential'.` };
}

/**
 * This site's own Site Token status ({@link inspectRootKeyMaterial}), resolved over THIS site's
 * site-aware source ordering ({@link siteKeySourcesForSiteDir} — site-key plan §A3b, the same
 * composed helper the admin Site Token route's `resolveSiteTokenSources` reuses) rather than the
 * module-wide env-then-legacy-file default `inspectRootKeyMaterial()` falls back to when called
 * bare. That default cannot see a per-site key file at all (`~/.tovu/site-keys/<id>.hex`), so a site
 * whose OWN key is active but has no env var and no legacy shared file would be reported `active:
 * false` — the exact gap {@link unreadableCredentialMessage} used to surface as "this server has no
 * Site Token" for a site that in fact has one.
 *
 * Falls back to the bare, non-site-aware status only when this runtime has no site folder at all
 * (`deps.siteBackupSources` absent — the in-memory `app.ts` runtime; in practice the plan tool's own
 * `UNAVAILABLE` check already refuses before this is ever reached for that case, but the push path
 * re-resolves the credential independently and must not throw if it ever is).
 *
 * @complexity O(1) — one `.site-meta.json` read plus a fixed-size source list, matching
 *   {@link inspectRootKeyMaterial}'s own cost.
 */
function siteAwareRootKeyStatus(deps: SiteBackupToolDeps): { active: boolean; invalid?: boolean } {
  const siteDir = deps.siteBackupSources?.siteDir;
  if (siteDir === undefined) return inspectRootKeyMaterial();
  const sources = siteKeySourcesForSiteDir({ siteDir, mode: resolveRuntimeMode(), env: process.env, home: homedir(), cwd: process.cwd() });
  return inspectRootKeyMaterial({ sources });
}

/** Why a saved credential could not be decrypted, from THIS SITE's own Site Token status
 *  ({@link siteAwareRootKeyStatus}) — never the bare, env/legacy-only default (see that function's
 *  own doc for why that used to misreport an active per-site key as "no Site Token"). */
function unreadableCredentialMessage(deps: SiteBackupToolDeps, label: string): string {
  const status = (deps.siteBackupRootKeyStatus ?? (() => siteAwareRootKeyStatus(deps)))();
  if (status.active) {
    return (
      `the credential '${label}' is saved but cannot be decrypted with this server's Site Token: it differs from the one the credential was saved under, ` +
      "or the stored row is corrupted. Check Secrets → Site Token in the admin, or save the credential again."
    );
  }
  if (status.invalid) {
    return `the credential '${label}' is saved but cannot be decrypted: this server's Site Token (TOVU_INTEGRATIONS_ROOT_KEY or its key file) is set but malformed. Fix it under Secrets → Site Token.`;
  }
  return (
    `the credential '${label}' is saved but cannot be decrypted: this server has no Site Token (TOVU_INTEGRATIONS_ROOT_KEY is not set and there is no key file). ` +
    "Start Tovu with it (`npm run dev` from the repo root, or `npm run desktop`)."
  );
}

/**
 * Resolves the credential the backup pushes with. A missing row and an undecryptable one are
 * different codes; the decrypt error's own text is never used (it can quote plaintext).
 *
 * @complexity O(saved credentials) plus one decrypt.
 */
async function resolveBackupCredential(deps: SiteBackupToolDeps, requested: string | undefined): Promise<ResolvedBackupCredential | Refusal> {
  const picked = await pickCredentialLabel(deps, requested);
  if (!picked.ok) return picked;
  let resolved;
  try {
    resolved = await resolveCustomCredentialByLabel({ repo: deps.customCredentialSetRepo, sealer: deps.siteAssistantSecretSealer }, { workspaceId: deps.workspaceId, label: picked.label });
  } catch (err) {
    if (err instanceof CustomCredentialSecretStoreUnconfiguredError) return { ok: false, code: "CREDENTIAL_UNREADABLE", message: unreadableCredentialMessage(deps, picked.label) };
    throw err;
  }
  if (!resolved) return { ok: false, code: "CREDENTIAL_NOT_FOUND", message: `the credential '${picked.label}' was deleted while the backup was being prepared` };
  return { ok: true, label: picked.label, baseUrl: resolved.baseUrl, connection: resolved.connection };
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

/** A `github-push.ts` failure as this tool's `{code, message}`, logging any server-only detail. */
function githubRefusal(deps: SiteBackupToolDeps, toolId: string, failure: { readonly code: string; readonly message: string; readonly logDetail?: string }): Refusal {
  logFailureDetail(deps, toolId, failure);
  return { ok: false, code: INSPECT_CODES[failure.code] ?? "PROVIDER_ERROR", message: failure.message };
}

async function inspect(
  deps: SiteBackupToolDeps,
  toolId: string,
  input: BackupRepositoryTarget & { branch?: string; folder: string }
): Promise<Extract<InspectBackupRepositoryResult, { ok: true }> | Refusal> {
  const result = await inspectBackupRepository({ httpClient: deps.customCredentialsHttpClient }, input);
  return result.ok ? result : githubRefusal(deps, toolId, result);
}

// ---------------------------------------------------------------------------
// site_backup_plan
// ---------------------------------------------------------------------------

interface ParsedPlanInput {
  readonly credential: string | undefined;
  readonly owner: string;
  readonly repo: string;
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

/** The backup folder: repository-relative, never `.git`/`.github` (GitHub reads workflows there). */
function parseFolder(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const folder = normalizeWriteFilePath(raw);
  const lower = folder.toLowerCase();
  if (lower === ".github" || lower.startsWith(".github/")) throw new CustomCredentialValidationError(`the backup folder must not be inside '.github': '${raw}'`);
  return folder;
}

/** @throws {CustomCredentialValidationError} Any malformed field — before any permission check,
 *  decrypt or network call. */
function parsePlanInput(rawInput: unknown): ParsedPlanInput {
  const raw = requireInputRecord(rawInput);
  const branch = optionalString(raw, "branch");
  const commitMessage = optionalString(raw, "commitMessage");
  return {
    credential: optionalString(raw, "credential"),
    owner: validateOwner(raw.owner),
    repo: validateRepo(raw.repo),
    branch: branch === undefined ? undefined : validateBranch(branch),
    folder: parseFolder(optionalString(raw, "folder")),
    include: parseInclude(raw.include),
    commitMessage: commitMessage === undefined ? undefined : validateCommitMessage(commitMessage),
  };
}

async function requireBackupPermissions(deps: SiteBackupToolDeps, ctx: ToolExecutionContext): Promise<void> {
  await requireToolPermission(deps, { principalId: ctx.principal.id, permission: PUSH_PERMISSION, entityType: DOMAIN });
  await requireToolPermission(deps, { principalId: ctx.principal.id, permission: CREDENTIAL_WRITE_PERMISSION, entityType: "custom-credentials" });
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
      "Then call site_backup_push with this planId within 10 minutes; it raises its own confirmation dialog. A tovu-backup.json manifest is added at push time.",
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
  const target = { baseUrl: credential.baseUrl, connection: credential.connection, owner: input.owner, repo: input.repo };
  const repo = await inspect(deps, PLAN_TOOL_ID, { ...target, ...(input.branch !== undefined ? { branch: input.branch } : {}), folder });
  if (!repo.ok) return { planned: false, code: repo.code, message: repo.message };

  const prepared = await prepareContent(deps, sources, input.include);
  if (!prepared.ok) return { planned: false, code: prepared.code, message: prepared.message };

  const createdAt = (deps.siteBackupNow?.() ?? new Date()).toISOString();
  const siteName = await readSiteName(sources.siteDir);
  const plan = (deps.siteBackupPlanStore ?? DEFAULT_PLAN_STORE).save({
    principalId: ctx.principal.id,
    workspaceId: deps.workspaceId,
    content: {
      credentialLabel: credential.label,
      owner: input.owner,
      repo: input.repo,
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
async function prepareContent(deps: SiteBackupToolDeps, sources: SiteBackupSources, include: SiteBackupInclude): Promise<{ ok: true; content: PreparedContent } | Refusal> {
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
  const limits = checkSiteBackupLimits([...(database ? [{ path: SITE_BACKUP_DATABASE_PATH, bytes: database.bytes.length }] : []), ...collected.files]);
  if (!limits.ok) return { ok: false, code: "LIMIT_EXCEEDED", message: limits.message };
  return { ok: true, content: { database, files: collected.files, skipped: collected.skipped, scopeNotes: collected.scopeNotes, totalBytes: limits.totalBytes } };
}

// ---------------------------------------------------------------------------
// site_backup_push
// ---------------------------------------------------------------------------

type PushResult =
  | { pushed: true; commitSha: string; commitUrl: string; repository: string; branch: string; folder: string; filesWritten: number; totalBytes: number }
  | { pushed: false; cancelled: true }
  | { pushed: false; cancelled: false; reason: "expired" | "abandoned" }
  | { pushed: false; cancelled: false; code: string; message: string };

function pushRefusal(refusal: Refusal): PushResult {
  return { pushed: false, cancelled: false, code: refusal.code, message: refusal.message };
}

/**
 * Raises the confirmation and waits for the human. A cancelled run closes the dialog so no call is
 * left waiting on nobody.
 */
async function askToConfirm(ctx: ToolExecutionContext, surfaces: AssistantSurfaceDeps, plan: SiteBackupPlan, emitSurface: NonNullable<ToolExecutionContext["emitSurface"]>): Promise<{ confirmed: true } | { confirmed: false; result: PushResult }> {
  const exchange: SurfaceExchange = surfaces.surfaceExchanges.open({ toolId: SITE_BACKUP_PUSH_TOOL_ID, principalId: ctx.principal.id }, emitSurface);
  const ui: UIResource = buildConfirmationSurface({ plan, exchangeId: exchange.id });
  const closeOnAbort = () => exchange.close();
  ctx.signal.addEventListener("abort", closeOnAbort, { once: true });
  try {
    const outcome = await resolveConfirmationDecision(exchange, { channel: "mcp-ui", payload: { resource: ui } });
    if (outcome.confirmed) return { confirmed: true };
    if (outcome.reason === "declined") return { confirmed: false, result: { pushed: false, cancelled: true } };
    return { confirmed: false, result: { pushed: false, cancelled: false, reason: outcome.reason } };
  } finally {
    ctx.signal.removeEventListener("abort", closeOnAbort);
  }
}

/** Uploads bytes once per distinct content: a second file with the same sha256 reuses the blob. */
class BlobUploader {
  private readonly shaByHash = new Map<string, string>();
  readonly blobs: UploadedBackupBlob[] = [];
  constructor(
    private readonly deps: SiteBackupToolDeps,
    private readonly target: BackupRepositoryTarget
  ) {}

  /** @complexity O(bytes) to hash; one POST unless the content was already uploaded. */
  async add(file: { path: string; content: Uint8Array }): Promise<{ ok: true } | Refusal> {
    const sha256 = createHash("sha256").update(file.content).digest("hex");
    const existing = this.shaByHash.get(sha256);
    if (existing !== undefined) {
      this.blobs.push({ path: file.path, blobSha: existing, bytes: file.content.byteLength, sha256 });
      return { ok: true };
    }
    const uploaded = await uploadBackupBlob({ httpClient: this.deps.customCredentialsHttpClient }, this.target, file);
    if (!uploaded.ok) return githubRefusal(this.deps, SITE_BACKUP_PUSH_TOOL_ID, uploaded);
    this.shaByHash.set(sha256, uploaded.blob.blobSha);
    this.blobs.push(uploaded.blob);
    return { ok: true };
  }
}

/**
 * Uploads the plan's content — the in-memory database snapshot, each disk file re-read and refused
 * if it changed, then the manifest built from the uploaded files' sha256s.
 *
 * @complexity O(total bytes); one POST per distinct file content.
 */
async function uploadPlannedContent(deps: SiteBackupToolDeps, plan: SiteBackupPlan, target: BackupRepositoryTarget): Promise<{ ok: true; blobs: UploadedBackupBlob[] } | Refusal> {
  const uploader = new BlobUploader(deps, target);
  if (plan.database) {
    const added = await uploader.add({ path: SITE_BACKUP_DATABASE_PATH, content: plan.database.bytes });
    if (!added.ok) return added;
  }
  for (const file of plan.files) {
    const read = await readPlannedFile(file);
    if (!read.ok) return { ok: false, code: "PLAN_STALE", message: read.message };
    const added = await uploader.add({ path: file.path, content: read.bytes });
    if (!added.ok) return added;
  }
  const manifest = buildSiteBackupManifest({
    createdAt: plan.createdAt,
    tovuVersion: plan.tovuVersion,
    schema: plan.schema,
    site: plan.site,
    database: plan.database ? { watermarkAtCapture: plan.database.watermarkAtCapture } : null,
    include: plan.include,
    scopeNotes: plan.scopeNotes,
    files: uploader.blobs,
  });
  const added = await uploader.add({ path: SITE_BACKUP_MANIFEST_PATH, content: Buffer.from(manifest, "utf8") });
  if (!added.ok) return added;
  return { ok: true, blobs: uploader.blobs };
}

/**
 * The push after the human confirmed: re-resolve the credential, re-check the repository (still
 * private, branch not moved), upload, commit on the PLAN's parent.
 *
 * @complexity O(total bytes); one POST per distinct file plus four fixed writes.
 */
async function pushConfirmedPlan(deps: SiteBackupToolDeps, plan: SiteBackupPlan): Promise<PushResult> {
  const credential = await resolveBackupCredential(deps, plan.credentialLabel);
  if (!credential.ok) return pushRefusal(credential);
  const target = { baseUrl: credential.baseUrl, connection: credential.connection, owner: plan.owner, repo: plan.repo };

  const repo = await inspect(deps, SITE_BACKUP_PUSH_TOOL_ID, { ...target, branch: plan.repository.branch, folder: plan.folder });
  if (!repo.ok) return pushRefusal(repo);
  if (repo.state.parentCommitSha !== plan.repository.parentCommitSha) {
    return pushRefusal({
      ok: false,
      code: "DIVERGED_BRANCH",
      message: `branch '${plan.repository.branch}' moved since the backup was planned (someone pushed to it). Nothing was written. Call site_backup_plan again.`,
    });
  }

  const uploaded = await uploadPlannedContent(deps, plan, target);
  if (!uploaded.ok) return pushRefusal(uploaded);

  const committed = await commitBackupTree(
    { httpClient: deps.customCredentialsHttpClient },
    {
      ...target,
      branch: plan.repository.branch,
      folder: plan.folder,
      commitMessage: plan.commitMessage,
      parentCommitSha: plan.repository.parentCommitSha,
      baseTreeSha: plan.repository.baseTreeSha,
      htmlUrl: plan.repository.htmlUrl,
      blobs: uploaded.blobs,
    }
  );
  if (!committed.ok) return pushRefusal(githubRefusal(deps, SITE_BACKUP_PUSH_TOOL_ID, committed));
  return {
    pushed: true,
    commitSha: committed.commitSha,
    commitUrl: committed.commitUrl,
    repository: `${plan.owner}/${plan.repo}`,
    branch: plan.repository.branch,
    folder: plan.folder,
    filesWritten: uploaded.blobs.length,
    totalBytes: uploaded.blobs.reduce((sum, blob) => sum + blob.bytes, 0),
  };
}

const PLAN_TAKE_MESSAGES = {
  PLAN_NOT_FOUND: "no backup plan with that planId is waiting (a planId works once, for this principal, and a server restart drops plans). Call site_backup_plan again.",
  PLAN_EXPIRED: "that backup plan expired (plans last 10 minutes). Call site_backup_plan again.",
} as const;

/**
 * The push: take the plan (single-use), raise the dialog, and only on confirm touch GitHub.
 *
 * @complexity O(1) until confirmed; then see {@link pushConfirmedPlan}.
 */
async function handlePush(deps: SiteBackupToolDeps, surfaces: AssistantSurfaceDeps, ctx: ToolExecutionContext): Promise<PushResult> {
  const planId = requireString(requireInputRecord(ctx.input), "planId");
  await requireBackupPermissions(deps, ctx);
  if (!ctx.emitSurface) {
    throw new ToolInputError(
      "site_backup_push: this execution context has no interactive confirmation channel (no emitSurface), so a backup cannot be confirmed here. Nothing was pushed."
    );
  }

  const taken = (deps.siteBackupPlanStore ?? DEFAULT_PLAN_STORE).take({ planId, principalId: ctx.principal.id, workspaceId: deps.workspaceId });
  if (!taken.ok) return { pushed: false, cancelled: false, code: taken.code, message: PLAN_TAKE_MESSAGES[taken.code] };

  const decision = await askToConfirm(ctx, surfaces, taken.plan, ctx.emitSurface);
  if (!decision.confirmed) return decision.result;
  return pushConfirmedPlan(deps, taken.plan);
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
    handlers: withModelFacingErrors(handlers, SITE_BACKUP_MODEL_FACING_ERRORS),
    derivedRisk: siteBackupDerivedRisk,
  });
}

/** Contributes the site-backup tools — called once by `server/runtime/composition/
 *  tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`. */
export function contributeSiteBackupTools(): ToolContributor {
  return { domain: DOMAIN, build: buildSiteBackupRegistrations, risk: siteBackupDerivedRisk };
}
