import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { requireInputRecord, requireString } from "@jini-ai/core";
import { adaptLegacyAuthorize, requireToolPermission } from "@jini-ai/cms/core";

import type { AuthorizeFn } from "../../contracts/core/commands/index.js";
import type { DbOpsPort } from "#src/contracts/core/gated-mutations/ports";
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
import type { CredentialedRepositoryTarget, InspectBackupRepositoryResult, SourceControlProvider } from "../source-control/provider-module.js";
import { buildSourceControlProviders, findReservedPath, pickSourceControlProviderForApi, type LoadSourceControlProviders } from "../source-control/provider-registry.js";
import { resolveDefaultForSourceControl, SourceControlCredentialSecretStoreUnconfiguredError } from "../source-control/store.js";
import type { SourceControlCredentialSetRepoPort, SourceControlProviderId } from "../source-control/types.js";
import type { SiteImportBackend } from "./import-backend.js";
import type { SiteShareBackend } from "./share-backend.js";
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
 * @file The site-backup service behind the agent tools `site_backup_plan` (read-only) and
 * `site_backup_push` (authorized, immediate) AND the admin Git backup route
 * (`admin-http/routes/system/site-backups.ts`): one code path, so the screen and the assistant run
 * the same checks under the same permissions. Together they put the site's content — the database, media, themes, plugins
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
 * Out of scope: restoring from a backup, and scheduled backups.
 */

export const SITE_BACKUP_DOMAIN = "site-backup";
const DOMAIN = SITE_BACKUP_DOMAIN;
export const PLAN_TOOL_ID = "site_backup_plan";
export const SITE_BACKUP_PUSH_TOOL_ID = "site_backup_push";
/** The one permission that names this feature. Not in any built-in role but the owner's `*`. */
export const PUSH_PERMISSION = "site-backup.push";
/** Also required: the push sends a saved credential's token to its provider, which is exactly what
 *  `custom_credential_write_files` gates on this permission. */
const CREDENTIAL_WRITE_PERMISSION = "custom-credentials.write";
/** The restore-point name the database snapshot is captured under, so an orphan is recognizable. */
const SNAPSHOT_SCOPE_ID = "site-backup";

/** What one plan or push call carries: the caller's raw input, who is calling, and when to stop. A
 *  tool's `ToolExecutionContext` is one; the admin route builds one from the request. */
export interface SiteBackupCall {
  readonly input: unknown;
  readonly principal: { readonly id: string };
  readonly signal: AbortSignal;
}

/** The slice of the route-deps bag these tools read. Structural, so this module never imports
 *  `server/routes/types`. */
export interface SiteBackupToolDeps {
  readonly siteImportBackend?: SiteImportBackend;
  readonly authorize: AuthorizeFn;
  readonly workspaceId: string;
  readonly customCredentialSetRepo: CustomCredentialSetRepoPort;
  /** The connections chat's "Connect <host>" form saves (`credential_save with kind source-control`); a
   *  host's default one is used when no custom credential points at it. `RouteDeps` has it. */
  readonly sourceControlCredentialSetRepo?: SourceControlCredentialSetRepoPort;
  readonly siteAssistantSecretSealer: SecretSealerPort;
  readonly customCredentialsHttpClient: HttpClientPort;
  /** The client a backup talks to its host with (`SITE_BACKUP_EGRESS_POLICY`: a 2-minute idle
   *  ceiling for large blob uploads); {@link customCredentialsHttpClient} when absent. */
  readonly siteBackupHttpClient?: HttpClientPort;
  /** The git-host providers a backup pushes through (the installed, enabled Agent Plugins supplied by
   *  composition — the bundled `github` one today). */
  readonly loadSourceControlProviders: LoadSourceControlProviders;
  /** `RouteDeps.observability`: a backup's raw git-host calls are outbound spans. */
  readonly observability?: ObservabilityPort;
  readonly dbOps: DbOpsPort;
  /** Where this site's files live. Absent in the in-memory `app.ts` runtime, which has no site
   *  folder — both tools then answer `UNAVAILABLE`. */
  readonly siteBackupSources?: SiteBackupSources;
  readonly siteShareBackend?: SiteShareBackend;
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
    load: deps.loadSourceControlProviders,
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
      message: `no saved credential points at ${where} (${labelList(labels)}). Connect ${providers.map((provider) => provider.label).join(" or ")} with credential_save with kind source-control (a form in this chat), or save a token on the Access Tokens page ('Add custom provider', base URL ${where}), or name one with 'credential'.`,
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
    const lookup = await findHostConnection({ deps, repo, provider, providerId: provider.id });
    if (!lookup.ok) return lookup;
    if (lookup.found && (requested === undefined || requested === lookup.found.label)) return hostCredential({ found: lookup.found, provider });
  }
  return null;
}

type HostConnection = NonNullable<Awaited<ReturnType<typeof resolveDefaultForSourceControl>>>;

/** One host's default saved connection (or null); an unconfigured store is the safe CREDENTIAL_UNREADABLE diagnosis. */
async function findHostConnection(required: {
  deps: SiteBackupToolDeps;
  repo: SourceControlCredentialSetRepoPort;
  provider: SourceControlProvider;
  providerId: SourceControlProviderId;
}): Promise<{ ok: true; found: HostConnection | null } | Refusal> {
  const { deps, provider } = required;
  try {
    return { ok: true, found: await resolveDefaultForSourceControl({ repo: required.repo, sealer: deps.siteAssistantSecretSealer }, { workspaceId: deps.workspaceId, providerId: required.providerId }) };
  } catch (err) {
    if (err instanceof SourceControlCredentialSecretStoreUnconfiguredError) return { ok: false, code: "CREDENTIAL_UNREADABLE", message: unreadableCredentialMessage(deps, `${provider.label} connection`) };
    throw err;
  }
}

/** A saved host connection as the backup's credential: its token, plus the username when one was saved. */
function hostCredential(required: { found: HostConnection; provider: SourceControlProvider }): ResolvedBackupCredential {
  const { found, provider } = required;
  const { token } = found.connection;
  const connection: CustomProviderConnectionInput = "username" in found.connection ? { token, username: found.connection.username } : { token };
  return { ok: true, label: found.label, baseUrl: provider.apiOrigin, connection, provider };
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
  const include = readIncludeSwitches({ raw: requireIncludeRecord({ value }) });
  if (!SITE_BACKUP_SCOPES.some((scope) => include[scope])) throw new CustomCredentialValidationError("'include' switches everything off; there would be nothing to back up");
  return include;
}

/** The `include` object itself: a plain object whose keys are all known scopes. */
function requireIncludeRecord(required: { value: unknown }): Record<string, unknown> {
  const { value } = required;
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new CustomCredentialValidationError("'include' must be an object of true/false switches");
  const raw = value as Record<string, unknown>;
  const unknownKeys = Object.keys(raw).filter((key) => !(SITE_BACKUP_SCOPES as readonly string[]).includes(key));
  if (unknownKeys.length > 0) throw new CustomCredentialValidationError(`'include' has unknown switch(es): ${unknownKeys.join(", ")} (known: ${SITE_BACKUP_SCOPES.join(", ")})`);
  return raw;
}

/** Each scope's switch, true when absent; a non-boolean is refused by name. */
function readIncludeSwitches(required: { raw: Record<string, unknown> }): SiteBackupInclude {
  const include = {} as Record<(typeof SITE_BACKUP_SCOPES)[number], boolean>;
  for (const scope of SITE_BACKUP_SCOPES) {
    const flag = required.raw[scope];
    if (flag !== undefined && typeof flag !== "boolean") throw new CustomCredentialValidationError(`'include.${scope}' must be true or false`);
    include[scope] = flag ?? true;
  }
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

async function requireBackupPermissions(deps: SiteBackupToolDeps, ctx: SiteBackupCall): Promise<void> {
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
 * The plan (`site_backup_plan` and `POST …/site-backups/plan`): every check that can fail, in the order that wastes the least — validate, permissions,
 * credential, repository (so a public repository is refused before a snapshot is taken), database
 * snapshot, disk files, limits — then the in-memory plan.
 *
 * @complexity O(site files) for the walk, O(database size) for the snapshot, four GETs.
 */
export async function planSiteBackup(required: { deps: SiteBackupToolDeps; call: SiteBackupCall }, _optional: Record<string, never> = {}): Promise<unknown> {
  const { deps, call: ctx } = required;
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

  return planResult(await savePlan({ deps, ctx, sources, input, folderName, content: { credentialLabel: credential.label, owner, repo: repoName, folder, repository: repo.state, ...prepared.content } }));
}

/**
 * Stores the checked plan under the caller's principal: stamps its creation time, the site's name,
 * schema and version, and the default commit message when none was given.
 */
async function savePlan(required: {
  deps: SiteBackupToolDeps;
  ctx: SiteBackupCall;
  sources: SiteBackupSources;
  input: ParsedPlanInput;
  folderName: string;
  content: Pick<SiteBackupPlan, "credentialLabel" | "owner" | "repo" | "folder" | "repository"> & PreparedContent;
}): Promise<SiteBackupPlan> {
  const { deps, input, content } = required;
  const createdAt = (deps.siteBackupNow?.() ?? new Date()).toISOString();
  const siteName = await readSiteName(required.sources.siteDir);
  return (deps.siteBackupPlanStore ?? DEFAULT_PLAN_STORE).save({
    principalId: required.ctx.principal.id,
    workspaceId: deps.workspaceId,
    content: {
      target: { kind: "repository" },
      credentialLabel: content.credentialLabel,
      owner: content.owner,
      repo: content.repo,
      folder: content.folder,
      commitMessage: input.commitMessage ?? `Tovu site backup: ${siteName} (${createdAt})`,
      repository: content.repository,
      include: input.include,
      database: content.database,
      files: content.files,
      skipped: content.skipped,
      scopeNotes: content.scopeNotes,
      totalBytes: content.totalBytes,
      site: { name: siteName, folderName: required.folderName },
      schema: runtimeSchemaVersion(),
      tovuVersion: required.sources.tovuVersion,
      createdAt,
    },
  });
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

function pushWaitBudget({ deps, waitMs }: { deps: SiteBackupToolDeps; waitMs: number | undefined }, _options = {}): number {
  return waitMs ?? deps.siteBackupPushWaitMs ?? PUSH_WAIT_MS;
}

/**
 * The push (`site_backup_push` and `POST …/site-backups/push`): consume the principal-bound plan and start its job — or, for a planId whose job is
 * still running, wait on that job — then report its outcome or its progress.
 *
 * @complexity O(1) plan and job lookup; then see {@link pushPlannedBackup}.
 */
export async function pushSiteBackup(
  required: { deps: SiteBackupToolDeps; call: SiteBackupCall },
  optional: { waitMs?: number } = {}
): Promise<PushResult> {
  const { deps, call: ctx } = required;
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

  const waited = await jobs.wait(job, { signal: ctx.signal, budgetMs: pushWaitBudget({ deps, waitMs: optional.waitMs }) });
  if (waited.state === "done") return waited.result;
  if (waited.state === "abandoned") return { pushed: false, cancelled: false, reason: "abandoned" };
  return inProgressResult(planId, waited.progress, waited.elapsedMs);
}
