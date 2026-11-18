import { rmSync } from "node:fs";
import { join } from "node:path";
import type { UUID } from "@jini-ai/core/primitives";
import * as sourceControl from "@jini-ai/devops/source-control";
import { describeErrorForLog } from "#src/contracts/core/model-facing-tool-errors";
import { prepareStaticReport } from "../site-backup/static-copy.js";
import { staticDownloadLayout } from "../site-backup/static-download-layout.js";
import { LANDING_FILE } from "../site-backup/static-download-landing.js";
import { claimArchivePaths } from "../site-backup/share-zip.js";
import { SiteShareRefusal } from "../site-backup/share-policy.js";
import { CREDENTIAL_MESSAGES } from "../../contracts/core/credential-token.js";
import type { KeyringPort, SecretSealerPort } from "../webhooks/index.js";
import type { ExportReport } from "#src/features/site-export/index";
import { validateCommitTarget } from "./commit-target.js";
import type { CommitFile, RepositoryTargetValidator, SourceControlProvider } from "./provider-module.js";
import { resolveDefaultForSourceControl } from "./store.js";
import type { SourceControlCredentialSetRepoPort, SourceControlProviderId } from "./types.js";

/**
 * @file Tovu's binding of `@jini-ai/devops/source-control`'s commit orchestration for `source_control_execute_commit`
 * (`tool-registrations.ts` owns the confirmation dialog and exchange park/resume, like `static-publish/adapter.ts`'s split from
 * `publish-agent-tools.ts`). The mechanism and its why-comments live in Jini; Tovu keeps the real static exporter (`exportSite`,
 * the engine every publish target drives), the static-download layout, the credential store and the sentences a person reads.
 * Destination: root or one chosen folder (owner decision 2026-10-30 plan-145). Shares nothing with `features/deployments/**`
 * (`source_control_credential_sets` is its own table, `store.ts`). Never throws for an expected outcome: the tool handler
 * assumes it, and its process (`agent-daemon-server.ts`) has no restart supervisor.
 */

/** Commit operations receive only the resolved token; saved provider metadata stays in the vault. */
export interface ResolvedSourceControlCredential { readonly token: string }
/** The one seam to the git host: one call, no pre-flight, so every repository, branch and network outcome is discovered after the human confirmed. */
export interface SourceControlCommitAdapter { commit: SourceControlProvider["commitSite"] }
/** Jini's outcome, whose success also names the folder and entry file. The post-confirm codes are never pre-dialog: the tool handler only pre-checks credential PRESENCE (failure-contract table: ADS-memory/reports/2026-08-16-source-control-tools.md). */
export type SourceControlCommitOutcome = Extract<sourceControl.SourceControlCommitOutcome, { ok: false }> | (Extract<sourceControl.SourceControlCommitOutcome, { ok: true }> & { folder: string; entryPath: string });
export interface CommitSiteDeps {
  readonly supportsFolder?: boolean;
  /** The host committed to: whose saved default credential is resolved, and whose plugin provider {@link gitAdapter} is. */
  readonly providerId: SourceControlProviderId;
  readonly credentialDeps: {
    repo: SourceControlCredentialSetRepoPort;
    sealer: SecretSealerPort;
    keyring?: KeyringPort;
    /** Opens a provider-declared saved API key only when no source-control identity exists; composition owns that reader. */
    resolveSavedApiKey?: (input: { workspaceId: UUID; providerId: SourceControlProviderId }, options?: {}) => Promise<ResolvedSourceControlCredential | null>;
  };
  /** The plugin provider's `commitSite`; tests inject a fake instead of touching `fetch`. Omitted, the commit fails loudly as a wiring bug. */
  readonly gitAdapter?: SourceControlCommitAdapter;
  /** The host plugin's own owner/repo check ({@link validateCommitTarget}), when it ships one. */
  readonly validateTarget?: RepositoryTargetValidator;
}
/** The composition-root-bound export call, NOT named like `RouteDeps.runExportSite` (that takes `routeDeps` every call; this has it closed over): mixing the two would still type-check. */
export type ExportSiteBoundFn = (options: { outputDir: string; clean?: boolean; basePath?: string; includeThemePreviews?: boolean; themeId?: string }) => Promise<ExportReport>;
/** Bound to the existing site/theme resolvers by composition, never inferred from output files. */
export type StaticSiteContextFn = () => Promise<{ name: string; slug: string; theme: string; themeId: string }>;
export interface CommitSiteInput {
  readonly folder?: string;
  readonly staticSiteContext: StaticSiteContextFn;
  readonly workspaceId: UUID;
  /** `RouteDeps.sourceControlExportRootDir`, threaded down rather than the whole `RouteDeps` bag. */
  readonly sourceControlExportRootDir: string;
  readonly idGen: { newId(): string };
  readonly exportSiteBound: ExportSiteBoundFn;
  readonly owner: string;
  readonly repo: string;
  readonly branch?: string;
  readonly commitMessage: string;
}

/** One run's isolated export directory, `<parent>/providerId/<runId>`. `parent` (`TOVU_SOURCE_CONTROL_EXPORT_DIR`, else `<site>/out/source-control-export`)
 *  is resolved ONCE by the composition root, never read from the process environment here: a test sets the field on its fake input. @complexity O(1). */
export function commitExportDir({ parent, providerId, runId }: { parent: string; providerId: string; runId: string }, _options = {}): string {
  return join(parent, providerId, runId);
}

/** Active-theme portable packaging: the static-download layout, destination paths claimed (a collision or alias refuses). `context` is the
 *  site identity pinned BEFORE rendering, so an owner changing the live selection mid-export cannot split it. */
function packageStaticSite({ context, report }: { context: Awaited<ReturnType<StaticSiteContextFn>>; report: ExportReport }, _optional = {}): CommitFile[] {
  const rendered = prepareStaticReport({ report });
  const files = staticDownloadLayout({ copy: { files: rendered.files, publicOrigin: rendered.publicOrigin, siteSlug: context.slug, themeId: context.themeId,
    metadata: { theme: context.theme, routes: rendered.routes, redirectFiles: rendered.redirectFiles, failed: rendered.failed, skipped: rendered.skipped },
    readme: { name: context.name } } }).map(file => ({ path: file.path, data: file.content }));
  claimArchivePaths({ entries: files }, { manifest: false });
  return files;
}

/** Each stage's refusal text: a packaging refusal is shown, vault, export and provider detail is not (the provider's goes to the log). */
function describeStageError({ error, stage }: { error: unknown; stage?: sourceControl.CommitErrorStage }, _optional = {}): string {
  if (stage === "credential") return CREDENTIAL_MESSAGES.storage;
  if (stage === "commit") { console.warn("[source-control] source control provider could not commit; the commit remains incomplete", describeErrorForLog({ err: error })); return "the source control provider failed while committing"; }
  if (stage === "arrange") {
    return error instanceof SiteShareRefusal && /collision|aliases/i.test(error.message)
      ? `Static site destination validation failed: ${error.message}` : "Static site packaging failed before committing could start.";
  }
  return error instanceof Error ? error.message : String(error);
}

/** The export side: this site's exporter, per-run directory and static-download layout. */
function exportArgs({ input, providerId }: { input: CommitSiteInput; providerId: string }, _optional = {}): sourceControl.CommitExportArgs {
  let pinned!: Parameters<typeof packageStaticSite>[0]; // Set by `files.export`, which the orchestration always runs before `layout.arrangeFiles`.
  return {
    folder: input.folder, workspaceId: input.workspaceId, owner: input.owner, repo: input.repo, commitMessage: input.commitMessage, providerId,
    ids: { next: () => input.idGen.newId() },
    describeError: describeStageError,
    files: { export: async ({ outputDir }) => {
      const context = await input.staticSiteContext();
      pinned = { context, report: await input.exportSiteBound({ outputDir, clean: true, includeThemePreviews: false, themeId: context.themeId }) };
      return pinned.report;
    } },
    layout: {
      outputDirectory: ({ providerId: id, runId }) => commitExportDir({ parent: input.sourceControlExportRootDir, providerId: id, runId }),
      cleanup: async ({ outputDir }) => rmSync(outputDir, { recursive: true, force: true }),
      arrangeFiles: () => packageStaticSite(pinned),
    },
  };
}

/** The credential and provider side: the default credential, else the provider-declared saved API key. */
function commitArgs({ deps, input }: { deps: CommitSiteDeps; input: CommitSiteInput }, _optional = {}): sourceControl.CommitOrchestrationArgs {
  const { providerId, credentialDeps } = deps;
  return {
    ...exportArgs({ input, providerId }),
    supportsFolder: deps.supportsFolder,
    describeMissingCredential: () => `No source control credential is configured for '${providerId}'. Connect one in the admin's Source Control page first.`,
    credentials: { resolve: async () => {
      const credential = await resolveDefaultForSourceControl(credentialDeps, { workspaceId: input.workspaceId, providerId });
      if (credential) return { providerId: credential.connection.providerId, token: credential.connection.token };
      const saved = await credentialDeps.resolveSavedApiKey?.({ workspaceId: input.workspaceId, providerId });
      return saved ? { providerId, token: saved.token } : null;
    } },
    adapter: { commitSite: async (required, optional = {}) => deps.gitAdapter?.commit({ ...required, folder: required.folder ?? "", ...optional })
      ?? { ok: false, code: "provider-error", message: "no source control commit adapter is configured — this is a wiring bug, not a credential or network problem" } }, // Production always supplies the adapter (`tool-registrations.ts`): absent is refused loudly, never a silent no-op commit.
  };
}

/** Previews what {@link commitSiteToSourceControl} would export, for the tool's `dryRun`: the same validation and fresh export, no credential read, no provider call. */
export async function previewCommitExport(input: CommitSiteInput, { providerId = "preview", validateTarget }: { providerId?: string; validateTarget?: RepositoryTargetValidator } = {}): Promise<sourceControl.PreviewCommitExportResult> {
  const configError = validateCommitTarget(input, validateTarget);
  if (configError) return { ok: false, code: "INVALID_CONFIG", message: configError };
  return sourceControl.previewCommitExport(exportArgs({ input, providerId }), { branch: input.branch });
}

/** Commits Tovu's current site export to `input.owner/input.repo` through Jini's orchestration; a success adds the normalized folder and entry file. */
export async function commitSiteToSourceControl(deps: CommitSiteDeps, input: CommitSiteInput): Promise<SourceControlCommitOutcome> {
  const configError = validateCommitTarget(input, deps.validateTarget);
  if (configError) return { ok: false, code: "INVALID_CONFIG", message: configError };
  const outcome = await sourceControl.commitSiteToSourceControl(commitArgs({ deps, input }), { branch: input.branch });
  if (!outcome.ok) return outcome;
  const folder = sourceControl.normalizeRepositoryFolder({ folder: input.folder });
  return { ...outcome, folder, entryPath: sourceControl.prefixRepositoryPath({ folder, path: LANDING_FILE }) };
}
