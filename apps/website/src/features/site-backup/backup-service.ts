import { SOURCE_CONTROL_CREDENTIAL_DEPS } from "#src/features/source-control/store";
import { requireShareSecretFree } from "./share-file-policy.js";
import { readPlannedFile, SITE_BACKUP_MANIFEST_PATH } from "./sources.js";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { createSiteBackupService, type PushResult, type SiteBackupRequestDeps } from "@jini-ai/devops/backup/site/backup-service";
import type { HttpClientPort } from "../../platform/http/index.js";
import { runtimeSchemaVersion } from "../../platform/site-dir/index.js";
import { resolveRuntimeMode } from "#src/contracts/core/runtime-mode";
import {
  CustomCredentialSecretStoreUnconfiguredError,
  CustomCredentialValidationError,
  listCustomCredentials,
  resolveCustomCredentialByLabel,
  type CustomCredentialSetRepoPort,
} from "../custom-credentials/index.js";
import { buildAuthorizationHeader } from "@jini-ai/integrations/credentialed-http";
import { normalizeWriteFilePath, validateBranch, validateCommitMessage } from "@jini-ai/integrations/custom-credentials/write-files-validation";
import { validateRepositoryTarget } from "../custom-credentials/repository-target.js";
import type { SecretSealerPort } from "@jini-ai/integrations/secrets";
import { inspectSiteKeyMaterial } from "../webhooks/keyring.env.js";
import { siteKeySources, siteKeySourcesForSiteDir } from "../webhooks/site-key-read-bindings.js";
import { buildSourceControlProviders, pickSourceControlProviderForApi, type LoadSourceControlProviders } from "../source-control/provider-registry.js";
import { resolveDefaultForSourceControl, SourceControlCredentialSecretStoreUnconfiguredError } from "@jini-ai/devops/source-control/site/store";
import type { SourceControlCredentialSetRepoPort } from "@jini-ai/core/contracts/site/source-control-credentials";
import { type ShareDatabaseSanitizer } from "./share-policy.js";
import { siteBackupPlanStore as DEFAULT_PLAN_STORE, type SiteBackupPlanContent } from "./plan-content.js";
import { commitBackupPlan, initialPushProgress, uploadBackupPlan } from "@jini-ai/devops/backup/site/push-content";
import { backupPushUploadPolicy, CANCELLED } from "./push-manifest.js";
import { SiteBackupPushJobs } from "@jini-ai/devops/backup/push-jobs";
import { captureDatabaseSnapshot, checkSiteBackupLimits, collectSiteBackupFiles, type SiteBackupSources } from "./sources.js";
import { formatByteSize, SITE_BACKUP_DATABASE_PATH, SITE_BACKUP_SCOPES, skipOversizedFiles } from "@jini-ai/devops/backup/site/sources";
import { sanitizeShareDatabase } from "#src/server/runtime/composition/site-portability";

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
 * held in memory with the plan (`plan-content.ts`), and each disk file is re-read and refused if it
 * changed since (`readPlannedFile`).
 *
 * A large backup outlasts one tool call: the push runs as a job (`push-jobs.ts`), the call waits for
 * it up to {@link PUSH_WAIT_MS} and otherwise returns its progress; calling the push again with the
 * same planId keeps waiting on the same job. The upload itself is Jini's `backup/site/push-content`.
 *
 * Safety rules, each re-checked at push time where the world can change in between:
 * - The database is the share projection ({@link captureBackupDatabase}): content, themes and
 *   settings, never accounts, members, RBAC, sessions or secrets.
 * - Private repositories only (public and "internal" both refused), because the database holds
 *   unpublished content. Re-checked before pushing.
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

/** The slice of the route-deps bag these tools read. Structural, so this module never imports
 *  `server/routes/types`. */
export interface SiteBackupToolDeps extends SiteBackupRequestDeps<SiteBackupSources, SiteBackupPlanContent> {
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
  /** Composition binds the same trusted catalogue and sanitizer as share/export. */
  readonly siteBackupSanitize: ShareDatabaseSanitizer;
}

const CREDENTIAL_MESSAGES = {
  active: ({ label }: { label: string }) => (
    `the credential '${label}' is saved but cannot be decrypted with this server's Site key: it differs from the one the credential was saved under, ` +
    "or the stored row is corrupted. Check Secrets → Site key in the admin, or save the credential again."
  ),
  invalid: ({ label }: { label: string }) => `the credential '${label}' is saved but cannot be decrypted: this server's Site key (TOVU_SITE_KEY or its key file) is set but malformed. Fix it under Secrets → Site key.`,
  missing: ({ label }: { label: string }) => (
    `the credential '${label}' is saved but cannot be decrypted: this server has no Site key (TOVU_SITE_KEY is not set and there is no key file). ` +
    "Start Tovu with it (`npm run dev` from the repo root, or `npm run desktop`)."
  ),
};

const DEFAULT_COMMIT_MESSAGE = ({ siteName, createdAt }: { siteName: string; createdAt: string }) => `Tovu site backup: ${siteName} (${createdAt})`;

export const { planSiteBackup, pushSiteBackup } = createSiteBackupService<SiteBackupSources, SiteBackupPlanContent, SiteBackupToolDeps>({
  deps: { CustomCredentialValidationError, normalizeWriteFilePath, validateBranch, validateCommitMessage, buildAuthorizationHeader },
  siteBackupSanitize: sanitizeShareDatabase,
  siteBackupPlanStore: DEFAULT_PLAN_STORE,
  createSiteBackupPushJobs: () => new SiteBackupPushJobs<PushResult>({}),
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
  siteBackupSiteKeyStatus: ({ siteDir }) => inspectSiteKeyMaterial({ sources: siteKeySourcesForSiteDir({ siteDir, mode: resolveRuntimeMode(), env: process.env, home: homedir(), cwd: process.cwd() }) }),
  serverSiteKeyStatus: () => inspectSiteKeyMaterial({ sources: siteKeySources({ mode: resolveRuntimeMode(), env: process.env, home: homedir(), cwd: process.cwd() }) }),
  siteBackupFailureLog: (line) => console.warn(line),
  siteBackupNow: () => new Date(),
  listCustomCredentials: ({ deps }, input) => listCustomCredentials({ repo: deps.customCredentialSetRepo }, input),
  resolveCustomCredentialByLabel: ({ deps }, input) => resolveCustomCredentialByLabel({ repo: deps.customCredentialSetRepo, sealer: deps.siteAssistantSecretSealer }, input),
  resolveDefaultForSourceControl: ({ deps }, input) => resolveDefaultForSourceControl({ repo: deps.sourceControlCredentialSetRepo!, sealer: deps.siteAssistantSecretSealer, deps: SOURCE_CONTROL_CREDENTIAL_DEPS }, input),
  isSourceControlCredentialSecretStoreUnconfiguredError: (err) => err instanceof SourceControlCredentialSecretStoreUnconfiguredError,
  isCustomCredentialSecretStoreUnconfiguredError: (err) => err instanceof CustomCredentialSecretStoreUnconfiguredError,
  credentialMessages: CREDENTIAL_MESSAGES,
  buildSourceControlProviders: ({ deps }) => buildSourceControlProviders({
    load: deps.loadSourceControlProviders,
    workspaceId: deps.workspaceId,
    httpClient: deps.siteBackupHttpClient ?? deps.customCredentialsHttpClient,
    observability: deps.observability,
    ...(deps.siteBackupSleep ? { sleep: deps.siteBackupSleep } : {}),
  }),
  pickSourceControlProviderForApi: ({ providers, baseUrl, noProviderMessage }) => pickSourceControlProviderForApi({ providers, baseUrl }, { noProviderMessage }),
  completePlanContent: ({ content: { createdAt, ...content }, sources }) => ({ ...content, tovuVersion: sources.tovuVersion, createdAt }),
  validateRepositoryTarget,
  siteFolderName: ({ siteDir }) => path.basename(siteDir),
  readConfigText: ({ siteDir }) => readFile(path.join(siteDir, "config.json"), "utf8"),
  runtimeSchemaVersion,
  defaultCommitMessage: DEFAULT_COMMIT_MESSAGE,
  manifestName: SITE_BACKUP_MANIFEST_PATH,
  captureDatabaseSnapshot,
  collectSiteBackupFiles,
  checkSiteBackupLimits,
  readPlannedFile,
  requireShareSecretFree,
  backupPushUploadPolicy,
  initialPushProgress,
  uploadBackupPlan,
  commitBackupPlan,
  formatByteSize,
  skipOversizedFiles,
  siteBackupDatabasePath: SITE_BACKUP_DATABASE_PATH,
  siteBackupScopes: SITE_BACKUP_SCOPES,
  cancelled: CANCELLED,
}, {});
