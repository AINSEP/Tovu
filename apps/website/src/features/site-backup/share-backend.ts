import type { CredentialWarning } from "./credential-warnings.js";
import { shareExpiresAt } from "./share-expiry.js";
import { randomUUID } from "node:crypto";
import { DatabaseDiskSpaceError } from "@jini-ai/db/sqlite";
import { SiteShareExportFailure, type SiteShareExportStep } from "@jini-ai/devops/backup/site/share-export-failure";
import { redactSecretShapes } from "@tovu/contracts/secret-redaction";
import type { zipFolderFiles } from "@jini-ai/agent-plugins/folder-zip";
import { NO_THEME_ID } from "#src/contracts/core/theme-ids";
import type { prepareShareContent } from "./share-preparation.js";
import { SiteBackupPushJobs, type PushJobKey, type PushJobWait, type SiteBackupPushProgress } from "@jini-ai/devops/backup/push-jobs";
import { buildShareZip, buildStaticSiteZip } from "./share-zip.js";
import { captureStaticSite, type StaticSitePorts, type StaticSiteCopy } from "./static-copy.js";
import { createSiteShare, acknowledgeSiteShare, isOwnShareFolder, revokeSiteShare, type ShareDelivery } from "./share-service.js";
import { SiteShareRegistry, type SiteShareRecord, newShareIdentity } from "./share-registry.js";
import { allocateStaticExportThemes, parseStaticExportInput, type StaticExportOptions } from "./static-export-selection.js";
import { SAVED_KEYS_PATH, type SiteSavedKeysPort } from "./saved-keys-port.js";
import { checkShareLimits, SiteShareRefusal } from "./share-policy.js";

export interface SiteShareBackend {
  readonly registry: SiteShareRegistry;
  /** Current export/upload lifecycle, independent of polling and retained finished job records. */
  hasWork?(required: Record<string, never>, optional?: Record<string, never>): boolean;
  staticOptions(required: Record<string, never>, optional?: Record<string, never>): Promise<StaticExportOptions>;
  create(required: { principalId: string; jobId?: string; signal: AbortSignal; includeSavedKeys?: boolean; expiresInDays?: number | null; format?: "static"; themeIds?: readonly string[]; publicUrl?: string }, optional?: { waitMs?: number }): Promise<unknown>;
  acknowledge(required: { shareId: string }, optional?: Record<string, never>): Promise<SiteShareView>;
  revealPassword(required: { principalId: string; shareId: string }, optional?: Record<string, never>): Promise<{ password: string }>;
  list(required: Record<string, never>, optional?: Record<string, never>): Promise<readonly SiteShareView[]>;
  revoke(required: { shareId: string }, optional?: Record<string, never>): Promise<SiteShareView>;
}
export type SiteShareView = Omit<SiteShareRecord, "token" | "storage" | "sealedPassword"> & { downloadUrl: string; credentialWarnings: readonly CredentialWarning[]; needsAcknowledgement: boolean };
/** A finished export, with what was left out of it (the share's scope notes) for the exporter only. */
type ExportedShare = SiteShareRecord & { readonly notes?: readonly string[] };

const DOMAINLESS_DISCOVERY_NOTICE = "No domain was given, so sitemap.xml and feed.xml were left out.";

/** Keep closed refusals' class/status contracts; wrap only unexpected export exceptions. */
function exportFailure({ cause, step, appVersion, jiniVersion, time }: { cause: unknown; step: SiteShareExportStep; appVersion: string | undefined; jiniVersion: string | undefined; time: string }, _options = {}): unknown {
  if (cause instanceof SiteShareRefusal || cause instanceof DatabaseDiskSpaceError) return cause;
  return new SiteShareExportFailure({ step, cause, time, ...(appVersion ? { appVersion } : {}), ...(jiniVersion ? { jiniVersion } : {}) });
}

/** Run one export lifecycle, preserving stage evidence and releasing the site lane on every exit.
 * Metadata is read at the failure boundary so it includes the stage and prepared app version.
 * @throws Closed share refusals unchanged, otherwise SiteShareExportFailure with the original cause.
 * @complexity The supplied bounded export plus O(1) stage metadata; no additional I/O.
 */
async function runExportStage({ execute, diagnostic, release }: {
  execute: () => Promise<ExportedShare>;
  diagnostic: () => Omit<Parameters<typeof exportFailure>[0], "cause">;
  release: () => void;
}, _options = {}): Promise<ExportedShare> {
  try { return await execute(); }
  catch (cause) {
    // Preserve closed refusals and their status/recovery contracts for both HTTP and tools.
    throw exportFailure({ cause, ...diagnostic() });
  } finally { release(); }
}

/** Locators/tokens stay in the private registry. The authorized caller receives the verified URL. */
function view(row: SiteShareRecord): SiteShareView {
  const { token: _token, storage: _storage, sealedPassword: _sealedPassword, ...publicFields } = row;
  return { ...publicFields, credentialWarnings: row.credentialWarnings ?? [], needsAcknowledgement: row.needsAcknowledgement ?? false, downloadUrl: `/api/admin/v1/workspaces/${encodeURIComponent(row.site)}/site-shares/${row.shareId}/download` };
}

/** What a create caller sees for one wait: the finished share, a cancellation, or in-flight progress. */
function createOutcome(required: { waited: PushJobWait<ExportedShare>; jobId: string; format?: "static" }, _options = {}): unknown {
  const { waited } = required;
  if (waited.state === "done") {
    if (required.format === "static") return { ...view(waited.result), message: (waited.result.notices?.includes(DOMAINLESS_DISCOVERY_NOTICE) ? DOMAINLESS_DISCOVERY_NOTICE + " " : "") + "Extract the ZIP, then open index.html inside the extracted folder in your browser; it lists every exported theme and page. No local server is needed to view the exported pages. README.txt lists features that need a server." };
    return { ...view(waited.result), ...(waited.result.url ? {} : { message: "ZIP ready. Download zip only. Connect a deployed Tovu site or S3-compatible storage to get a link." }) };
  }
  if (waited.state === "abandoned") throw new SiteShareRefusal({ code: "CANCELLED", message: "Share export was cancelled." });
  return { jobId: required.jobId, phase: waited.progress.filesTotal ? "archive-or-upload" : "preparing", progress: waited.progress };
}

/** Use the same full-roster allocation for options and the archive, including deselected aliases.
 * With the theme off, offer only the current unstyled site.
 */
function staticRoster({ ports, context }: { ports: StaticSitePorts; context: Awaited<ReturnType<StaticSitePorts["context"]>> }, _options = {}) {
  const activeThemeId = context.themeId ?? context.theme;
  const roster = activeThemeId === NO_THEME_ID ? [{ themeId: NO_THEME_ID, title: context.theme }]
    : ports.themes?.().map(theme => ({ ...theme })) ?? [{ themeId: activeThemeId, title: context.theme }];
  return { activeThemeId, roster, themes: allocateStaticExportThemes({ themeIds: roster.map(theme => theme.themeId), siteSlug: context.slug }) };
}

/** Release repeated public-media buffers before the next render, using the layout's URL identity.
 * Mutates job-owned file entries so each capture retains the first media bytes, just as packaging does.
 * @throws SiteShareRefusal as soon as retained unique files/bytes exceed the existing share caps.
 * @complexity O(files × retained files) for the existing limit policy, bounded to 2,000 unique files.
 */
function retainStaticCapture({ copy, media, sizes }: { copy: Exclude<StaticSiteCopy, { reason: string }>; media: Map<string, Buffer>; sizes: { path: string; bytes: number }[] }, _options = {}): void {
  for (const file of copy.files) {
    const shared = file.path.startsWith("m/");
    const existing = shared ? media.get(file.path) : undefined;
    if (existing) { file.content = existing; continue; }
    sizes.push({ path: file.path, bytes: file.content.length });
    checkShareLimits({ files: sizes });
    if (shared) media.set(file.path, file.content);
  }
}

/** Snapshot selection/active identity/time once; isolate and clean each sequential capture.
 * @throws SiteShareRefusal for unknown selections or any unusable selected capture.
 * @complexity O(selected export bytes + retained files² + roster sorting); sequential under the job deadline.
 */
async function captureSelection({ ports, themeIds, signal, publicUrl }: { ports: StaticSitePorts; themeIds?: readonly string[]; publicUrl?: string; signal: AbortSignal }, _options = {}) {
  const context = await ports.context(), instant = ports.now();
  const { roster, themes, activeThemeId } = staticRoster({ ports, context });
  const selected = themeIds ?? [activeThemeId];
  const installed = new Map(roster.map(theme => [theme.themeId, theme]));
  if (selected.some(id => !installed.has(id))) throw new SiteShareRefusal({ code: "INVALID_INPUT", message: "Every selected theme must be installed and valid." });
  const copies: Exclude<StaticSiteCopy, { reason: string }>[] = [];
  const media = new Map<string, Buffer>(), sizes: { path: string; bytes: number }[] = [];
  for (const themeId of selected) {
    signal.throwIfAborted();
    const theme = installed.get(themeId);
    if (theme === undefined) throw new SiteShareRefusal({ code: "INVALID_INPUT", message: `Selected theme '${themeId}' is not installed.` });
    const copy = await captureStaticSite({ ...ports, now: () => instant, context: async () => ({ ...context, themeId, theme: theme.title }) }, { themeId, publicUrl });
    if ("reason" in copy) throw new SiteShareRefusal({ code: "UNAVAILABLE", message: `${themeId}: ${copy.reason}` });
    retainStaticCapture({ copy, media, sizes });
    copies.push(copy);
  }
  signal.throwIfAborted();
  const copy = copies[0];
  if (copy === undefined) throw new SiteShareRefusal({ code: "INVALID_INPUT", message: "Select at least one theme to share." });
  return { copy, copies, activeThemeId, themes };
}

/** Retired option fails closed for internal callers as well as HTTP. */
/** Retired payloads cannot be published even if a stale preparation adapter returns one. */
function requireCredentialFreeExport({ content }: { content: Awaited<ReturnType<typeof prepareShareContent>> }): void {
  const hasKeyFile = content.bufferedFiles?.some(file => file.path === SAVED_KEYS_PATH);
  if (content.encryptedKeys || content.sealedPassword || hasKeyFile) throw new SiteShareRefusal({ code: "INVALID_INPUT", message: "Exports no longer include saved keys. Update the export adapter and create this export again." });
}

function requireNoShareCredentialWarnings({ credentialWarnings }: { credentialWarnings: readonly CredentialWarning[] }): void {
  if (credentialWarnings.length > 0) throw new SiteShareRefusal({ code: "UNSAFE_FILE", message: "The export contains files with possible credentials. Remove the credentials and export again." });
}

type ShareBackendRequired = {
  registry: SiteShareRegistry;
  site: string;
  prepare: (required: { signal: AbortSignal; includeSavedKeys?: boolean; shareId: string; workspaceId: string }) => ReturnType<typeof prepareShareContent>;
  zip: typeof zipFolderFiles;
  delivery: (required: { provider?: string; binding?: string }) => Promise<ShareDelivery | undefined>;
  ownerPrincipalId?: PromiseLike<string> | string;
  savedKeys?: Pick<SiteSavedKeysPort, "reveal">;
  staticSite?: StaticSitePorts;
};
type ShareBackendOptional = { now?: () => number; appVersion?: string; jiniVersion?: string };
/** What every share operation reads: the ports, the job table, and the one-at-a-time lane (`lane.active`). */
type ShareBackendContext = { required: ShareBackendRequired; jobs: SiteBackupPushJobs<ExportedShare>; lane: { active: string | null }; now: () => number; boundaryVersion: string | undefined; jiniVersion: string | undefined };
type ShareExportInput = { signal: AbortSignal; progress: SiteBackupPushProgress; expiresAt: string | null; format?: "static"; themeIds?: readonly string[]; publicUrl?: string; includeSavedKeys?: boolean };
type ShareExportStage = { step: SiteShareExportStep; appVersion: string | undefined };

/** The static-site flavour of an export: capture the selected themes, archive and deliver them. */
async function exportStaticShare({ ctx, input, bounded, stage }: { ctx: ShareBackendContext; input: ShareExportInput; bounded: AbortSignal; stage: ShareExportStage }): Promise<ExportedShare> {
  const { required } = ctx;
  if (!required.staticSite) throw new SiteShareRefusal({ code: "UNAVAILABLE", message: "Static exporter is unavailable in this context." });
  const selection = await captureSelection({ ports: required.staticSite, themeIds: input.themeIds, publicUrl: input.publicUrl, signal: bounded });
  const { copy } = selection;
  const notices: string[] = copy.publicOrigin ? [] : [DOMAINLESS_DISCOVERY_NOTICE];
  const credentialWarnings: CredentialWarning[] = [];
  stage.step = "archive";
  const archive = await buildStaticSiteZip({ ...selection, zip: required.zip }, { signal: bounded, progress: input.progress, notices, credentialWarnings });
  stage.step = "delivery";
  return await createSiteShare({ registry: required.registry, site: required.site, name: copy.filename, archive }, { signal: bounded, filename: copy.filename, expiresAt: input.expiresAt, notices, credentialWarnings });
}

/** The full-backup flavour of an export: prepare the content, archive and deliver it. */
async function exportBackupShare({ ctx, input, bounded, stage }: { ctx: ShareBackendContext; input: ShareExportInput; bounded: AbortSignal; stage: ShareExportStage }): Promise<ExportedShare> {
  const { required } = ctx;
  const { progress } = input;
  const identity = newShareIdentity({});
  const content = await required.prepare({ signal: bounded, shareId: identity.shareId, workspaceId: required.site });
  stage.appVersion = content.tovuVersion;
  requireCredentialFreeExport({ content });
  const notices = [...new Set(content.notices ?? [])];
  const credentialWarnings = [...(content.credentialWarnings ?? [])];
  const notes = Object.values(content.scopeNotes).map(note => redactSecretShapes({ text: note }).text);
  // Progress's readonly totals describe the prepared backup; the ZIP collector records its exact files.
  Object.assign(progress, { filesTotal: content.files.length + (content.bufferedFiles?.length ?? 0) + 1, bytesTotal: content.totalBytes });
  stage.step = "archive";
  const archive = await buildShareZip({ plan: content, zip: required.zip }, { signal: bounded, progress, notices, credentialWarnings });
  stage.step = "delivery";
  const delivery = await required.delivery({});
  bounded.throwIfAborted();
  if (delivery) requireNoShareCredentialWarnings({ credentialWarnings });
  const record = await createSiteShare({ registry: required.registry, site: required.site, name: content.site.folderName, archive }, { delivery, expiresAt: input.expiresAt, signal: bounded, identity, sealedPassword: content.sealedPassword, notices, notes, credentialWarnings });
  // Plugins left out of the archive are told to the exporter, never dropped silently.
  return notes.length > 0 ? { ...record, notes } : record;
}

/** Prepares, archives and delivers one share under a ten-minute bound; always frees the site's lane. */
async function exportShare({ ctx, input }: { ctx: ShareBackendContext; input: ShareExportInput }, _options = {}): Promise<ExportedShare> {
  const stage: ShareExportStage = { step: "prepare", appVersion: ctx.boundaryVersion };
  return runExportStage({ execute: async () => {
    const bounded = AbortSignal.any([input.signal, AbortSignal.timeout(10 * 60 * 1000)]);
    return input.format === "static" ? exportStaticShare({ ctx, input, bounded, stage }) : exportBackupShare({ ctx, input, bounded, stage });
  }, diagnostic: () => ({ ...stage, jiniVersion: ctx.jiniVersion, time: new Date(ctx.now()).toISOString() }), release: () => { ctx.lane.active = null; } });
}

/** Starts a new export job, refusing a resume of an unknown job and a second export on this site. */
function startExport({ ctx, startRequired }: { ctx: ShareBackendContext; startRequired: { key: PushJobKey; resumedJobId: string | undefined; expiresAt: string | null; format?: "static"; themeIds?: readonly string[]; publicUrl?: string; includeSavedKeys?: boolean } }, _options = {}) {
  const { key } = startRequired;
  if (startRequired.resumedJobId) throw new SiteShareRefusal({ code: "JOB_NOT_FOUND", message: "Share job expired or belongs to another principal. Create a new export." });
  if (ctx.lane.active) throw new SiteShareRefusal({ code: "BUSY", message: "Another share export is running for this site. Wait for it to finish." });
  ctx.lane.active = key.planId;
  return ctx.jobs.start({ key, progress: { filesDone: 0, filesTotal: 0, bytesDone: 0, bytesTotal: 0 }, run: ({ signal, progress }) => exportShare({ ctx, input: { signal, progress, expiresAt: startRequired.expiresAt, format: startRequired.format, themeIds: startRequired.themeIds, publicUrl: startRequired.publicUrl, includeSavedKeys: startRequired.includeSavedKeys } }) });
}

async function staticShareOptions({ ctx }: { ctx: ShareBackendContext }, _options = {}): Promise<StaticExportOptions> {
  const { required } = ctx;
  if (!required.staticSite) throw new SiteShareRefusal({ code: "UNAVAILABLE", message: "Static exporter is unavailable in this context." });
  const { activeThemeId, roster } = staticRoster({ ports: required.staticSite, context: await required.staticSite.context() });
  return { activeThemeId, themes: activeThemeId === NO_THEME_ID ? [{ themeId: NO_THEME_ID, name: "Current site" }]
    : roster.map(theme => ({ themeId: theme.themeId, name: theme.title })) };
}

type ShareCreateInput = Parameters<SiteShareBackend["create"]>[0];

async function createShare({ ctx, input, options }: { ctx: ShareBackendContext; input: ShareCreateInput; options: { waitMs?: number } }, _optional = {}): Promise<unknown> {
  const { required, jobs } = ctx;
  input.signal.throwIfAborted();
  const selection = input.format === "static" ? parseStaticExportInput({ input: { jobId: input.jobId, themeIds: input.themeIds, publicUrl: input.publicUrl } }) : {};
  // Validated before any job starts: an unsupported choice is refused, never silently made Never.
  const expiresAt = shareExpiresAt({ days: input.expiresInDays ?? null, now: ctx.now() });
  const jobId = input.jobId ?? randomUUID();
  const key = { planId: jobId, principalId: input.principalId, workspaceId: required.site + (input.format === "static" ? "/static" : "") };
  const job = jobs.find(key) ?? startExport({ ctx, startRequired: { key, resumedJobId: input.jobId, expiresAt, format: input.format, themeIds: selection.themeIds, publicUrl: selection.publicUrl, includeSavedKeys: input.includeSavedKeys } });
  const waited = await jobs.wait({ job, signal: input.signal, budgetMs: options.waitMs ?? 1500 });
  const outcome = waited.state === "done" ? { ...waited, result: await required.registry.get({ site: required.site, shareId: waited.result.shareId }) ?? waited.result } : waited;
  return createOutcome({ waited: outcome, jobId, format: input.format });
}

async function acknowledgeShare({ ctx, shareId }: { ctx: ShareBackendContext; shareId: string }, _optional = {}): Promise<SiteShareView> {
  const { required, lane } = ctx;
  if (lane.active) throw new SiteShareRefusal({ code: "BUSY", message: "Export acknowledgement is waiting for another export or delivery. Retry when it finishes." });
  lane.active = shareId;
  try {
    const row = await required.registry.get({ site: required.site, shareId });
    if (!row || row.status === "revoked") throw new SiteShareRefusal({ code: "NOT_FOUND", message: "This export is missing or was revoked." });
    const delivery = row.needsAcknowledgement && row.storage && !row.credentialWarnings?.length ? await required.delivery({ provider: row.storage.provider, binding: row.storage.binding }) : undefined;
    return view(await acknowledgeSiteShare({ registry: required.registry, site: required.site, shareId }, { delivery }));
  } finally { lane.active = null; }
}

async function revealSharePassword({ ctx, input }: { ctx: ShareBackendContext; input: { principalId: string; shareId: string } }, _optional = {}): Promise<{ password: string }> {
  const { required } = ctx;
  if (input.principalId !== await required.ownerPrincipalId) throw new SiteShareRefusal({ code: "FORBIDDEN", message: "Only the site owner can reveal an export password." });
  const row = await required.registry.get({ site: required.site, shareId: input.shareId });
  if (!row?.hasEncryptedKeys || !row.sealedPassword || row.status === "revoked") throw new SiteShareRefusal({ code: "NOT_FOUND", message: "Export password not found for this site." });
  if (!required.savedKeys) throw new SiteShareRefusal({ code: "UNAVAILABLE", message: "Saved keys are unavailable." });
  return required.savedKeys.reveal({ sealedPassword: row.sealedPassword, shareId: row.shareId, workspaceId: required.site });
}

async function revokeShare({ ctx, shareId }: { ctx: ShareBackendContext; shareId: string }, _optional = {}): Promise<SiteShareView> {
  const { required } = ctx;
  const row = await required.registry.get({ site: required.site, shareId });
  if (!row) throw new SiteShareRefusal({ code: "NOT_FOUND", message: "Share not found for this site." });
  let delivery: ShareDelivery | undefined;
  // Resolution failure must not prevent revoke's own disable-first/delete-local sequence.
  if (row.storage && !isOwnShareFolder({ storage: row.storage })) {
    try { delivery = await required.delivery({ provider: row.storage.provider, binding: row.storage.binding }); }
    catch { /* revokeSiteShare disables locally before reporting the missing remote store. */ }
  }
  return view(await revokeSiteShare({ registry: required.registry, site: required.site, shareId }, { delivery }));
}

/** Reuses backup jobs and the common backup plan content. Only one bounded, buffered preparation runs per site at a time.
 * Optional host clock/build versions stamp failures when they occur, before a later poll collects them.
 * @complexity The existing bounded export work; diagnostics add only job-local metadata, with no I/O.
 */
export function createSiteShareBackend(required: ShareBackendRequired, { now = Date.now, appVersion: boundaryVersion, jiniVersion }: ShareBackendOptional = {}): SiteShareBackend {
  const ctx: ShareBackendContext = { required, jobs: new SiteBackupPushJobs<ExportedShare>({}, { now }), lane: { active: null }, now, boundaryVersion, jiniVersion };
  return {
    registry: required.registry,
    hasWork: () => ctx.lane.active !== null,
    staticOptions: () => staticShareOptions({ ctx }),
    create: (input, options = {}) => createShare({ ctx, input, options }),
    acknowledge: (input) => acknowledgeShare({ ctx, shareId: input.shareId }),
    revealPassword: (input) => revealSharePassword({ ctx, input }),
    list: async () => (await required.registry.list({ site: required.site })).map(view),
    revoke: (input) => revokeShare({ ctx, shareId: input.shareId }),
  };
}
