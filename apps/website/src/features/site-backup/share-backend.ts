import type { CredentialWarning } from "./credential-warnings.js";
import { randomUUID } from "node:crypto";
import { redactSecretShapes } from "@tovu/contracts/secret-redaction";
import type { zipFolderFiles } from "@jini-ai/agent-plugins/folder-zip";
import { NO_THEME_ID } from "../theme/index.js";
import type { prepareShareContent } from "./share-preparation.js";
import type { SiteBackupPushProgress } from "./push-engine.js";
import { SiteBackupPushJobs, type PushJobKey, type PushJobWait } from "./push-jobs.js";
import { buildShareZip, buildStaticSiteZip } from "./share-zip.js";
import { captureStaticSite, type StaticSitePorts, type StaticSiteCopy } from "./static-copy.js";
import { createSiteShare, acknowledgeSiteShare, isOwnShareFolder, revokeSiteShare, type ShareDelivery } from "./share-service.js";
import { SiteShareRegistry, type SiteShareRecord, newShareIdentity } from "./share-registry.js";
import { allocateStaticExportThemes, parseStaticExportInput, type StaticExportOptions } from "./static-export-selection.js";
import type { SiteSavedKeysPort } from "./saved-keys-port.js";
import { checkShareLimits, SiteShareRefusal } from "./share-policy.js";

export interface SiteShareBackend {
  readonly registry: SiteShareRegistry;
  /** Current export/upload lifecycle, independent of polling and retained finished job records. */
  hasWork?(required: Record<string, never>, optional?: Record<string, never>): boolean;
  staticOptions(required: Record<string, never>, optional?: Record<string, never>): Promise<StaticExportOptions>;
  create(required: { principalId: string; jobId?: string; signal: AbortSignal; includeSavedKeys?: boolean; format?: "static"; themeIds?: readonly string[]; publicUrl?: string }, optional?: { waitMs?: number }): Promise<unknown>;
  acknowledge(required: { shareId: string }, optional?: Record<string, never>): Promise<SiteShareView>;
  revealPassword(required: { principalId: string; shareId: string }, optional?: Record<string, never>): Promise<{ password: string }>;
  list(required: Record<string, never>, optional?: Record<string, never>): Promise<readonly SiteShareView[]>;
  revoke(required: { shareId: string }, optional?: Record<string, never>): Promise<SiteShareView>;
}
export type SiteShareView = Omit<SiteShareRecord, "token" | "storage" | "sealedPassword"> & { downloadUrl: string; credentialWarnings: readonly CredentialWarning[]; needsAcknowledgement: boolean };
/** A finished export, with what was left out of it (the share's scope notes) for the exporter only. */
type ExportedShare = SiteShareRecord & { readonly notes?: readonly string[] };

const DOMAINLESS_DISCOVERY_NOTICE = "No domain was given, so sitemap.xml and feed.xml were left out.";

/** Locators/tokens stay in the private registry. The authorized caller receives the verified URL. */
function view(row: SiteShareRecord): SiteShareView {
  const { token: _token, storage: _storage, sealedPassword: _sealedPassword, ...publicFields } = row;
  return { ...publicFields, credentialWarnings: row.credentialWarnings ?? [], needsAcknowledgement: row.needsAcknowledgement ?? false, downloadUrl: `/api/admin/v1/workspaces/${encodeURIComponent(row.site)}/site-shares/${row.shareId}/download` };
}

/** What a create caller sees for one wait: the finished share, a cancellation, or in-flight progress. */
function createOutcome(required: { waited: PushJobWait<ExportedShare>; jobId: string; format?: "static" }, _options = {}): unknown {
  const { waited } = required;
  if (waited.state === "done") {
    if (required.format === "static") return { ...view(waited.result), message: (waited.result.notices?.includes(DOMAINLESS_DISCOVERY_NOTICE) ? DOMAINLESS_DISCOVERY_NOTICE + " " : "") + "Extract the ZIP, then double-click “Open website.html” inside the extracted folder. No local server is needed to view the exported pages. README.txt lists features that need a server." };
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
    const theme = installed.get(themeId)!;
    const copy = await captureStaticSite({ ...ports, now: () => instant, context: async () => ({ ...context, themeId, theme: theme.title }) }, { themeId, publicUrl });
    if ("reason" in copy) throw new SiteShareRefusal({ code: "UNAVAILABLE", message: `${themeId}: ${copy.reason}` });
    retainStaticCapture({ copy, media, sizes });
    copies.push(copy);
  }
  signal.throwIfAborted();
  return { copy: copies[0]!, copies, activeThemeId, themes };
}

/** Opt-in capture is owner-only; polls cannot change the captured selection. */
async function requireSavedKeysOwner(required: { input: { principalId: string; includeSavedKeys?: boolean; jobId?: string; format?: "static" }; ownerPrincipalId?: PromiseLike<string> | string }, _options = {}): Promise<void> {
  const { input } = required;
  if (!input.includeSavedKeys) return;
  if (input.principalId !== await required.ownerPrincipalId) throw new SiteShareRefusal({ code: "FORBIDDEN", message: "Only the site owner can export saved keys." });
  if (input.jobId || input.format) throw new SiteShareRefusal({ code: "INVALID_INPUT", message: "Saved keys can only be selected on the initial backup request." });
}

/** A lost sealed password must prevent artifact publication, even if capture returned bytes. */
function requireRetainedPassword(required: { content: Awaited<ReturnType<typeof prepareShareContent>>; includeSavedKeys?: boolean }, _options = {}): void {
  if (!required.includeSavedKeys) return;
  if (!required.content.encryptedKeys || !required.content.sealedPassword) throw new SiteShareRefusal({ code: "UNAVAILABLE", message: "Saved keys export could not retain its password. No archive was published." });
}

/** Reuses backup jobs and the common backup plan content. Only one bounded, buffered preparation runs per site at a time. */
export function createSiteShareBackend(required: {
  registry: SiteShareRegistry;
  site: string;
  prepare: (required: { signal: AbortSignal; includeSavedKeys?: boolean; shareId: string; workspaceId: string }) => ReturnType<typeof prepareShareContent>;
  zip: typeof zipFolderFiles;
  delivery: (required: { provider?: string; binding?: string }) => Promise<ShareDelivery | undefined>;
  ownerPrincipalId?: PromiseLike<string> | string;
  savedKeys?: Pick<SiteSavedKeysPort, "reveal">;
  staticSite?: StaticSitePorts;
}, _optional: Record<string, never> = {}): SiteShareBackend {
  const jobs = new SiteBackupPushJobs<ExportedShare>();
  let active: string | null = null;
  /** Prepares, archives and delivers one share under a ten-minute bound; always frees the site's lane. */
  const exportShare = async ({ signal, progress, format, themeIds, includeSavedKeys, publicUrl }: { signal: AbortSignal; progress: SiteBackupPushProgress; format?: "static"; themeIds?: readonly string[]; publicUrl?: string; includeSavedKeys?: boolean }, _options = {}): Promise<ExportedShare> => {
    try {
      const bounded = AbortSignal.any([signal, AbortSignal.timeout(10 * 60 * 1000)]);
      if (format === "static") {
        if (!required.staticSite) throw new SiteShareRefusal({ code: "UNAVAILABLE", message: "Static exporter is unavailable in this context." });
        const selection = await captureSelection({ ports: required.staticSite, themeIds, publicUrl, signal: bounded });
        const { copy } = selection;
        const notices: string[] = copy.publicOrigin ? [] : [DOMAINLESS_DISCOVERY_NOTICE];
        const credentialWarnings: CredentialWarning[] = [];
        const archive = await buildStaticSiteZip({ ...selection, zip: required.zip }, { signal: bounded, progress, notices, credentialWarnings });
        return await createSiteShare({ registry: required.registry, site: required.site, name: copy.filename, archive }, { signal: bounded, filename: copy.filename, notices, credentialWarnings });
      }
      const identity = newShareIdentity({});
      const content = await required.prepare({ signal: bounded, includeSavedKeys, shareId: identity.shareId, workspaceId: required.site });
      requireRetainedPassword({ content, includeSavedKeys });
      const notices = [...new Set(content.notices ?? [])];
      const credentialWarnings = [...(content.credentialWarnings ?? [])];
      const notes = Object.values(content.scopeNotes).map(note => redactSecretShapes({ text: note }).text);
      // Progress's readonly totals describe the prepared backup; the ZIP collector records its exact files.
      Object.assign(progress, { filesTotal: content.files.length + (content.bufferedFiles?.length ?? 0) + 1, bytesTotal: content.totalBytes });
      const archive = await buildShareZip({ plan: content, zip: required.zip }, { signal: bounded, progress, notices, credentialWarnings });
      const delivery = await required.delivery({});
      bounded.throwIfAborted();
      const record = await createSiteShare({ registry: required.registry, site: required.site, name: content.site.folderName, archive }, { delivery, signal: bounded, identity, sealedPassword: content.sealedPassword, notices, notes, credentialWarnings });
      // Plugins left out of the archive are told to the exporter, never dropped silently.
      return notes.length > 0 ? { ...record, notes } : record;
    } finally { active = null; }
  };
  /** Starts a new export job, refusing a resume of an unknown job and a second export on this site. */
  const startExport = (startRequired: { key: PushJobKey; resumedJobId: string | undefined; format?: "static"; themeIds?: readonly string[]; publicUrl?: string; includeSavedKeys?: boolean }, _options = {}) => {
    const { key } = startRequired;
    if (startRequired.resumedJobId) throw new SiteShareRefusal({ code: "JOB_NOT_FOUND", message: "Share job expired or belongs to another principal. Create a new export." });
    if (active) throw new SiteShareRefusal({ code: "BUSY", message: "Another share export is running for this site. Wait for it to finish." });
    active = key.planId;
    return jobs.start(key, { filesDone: 0, filesTotal: 0, bytesDone: 0, bytesTotal: 0 }, (signal, progress) => exportShare({ signal, progress, format: startRequired.format, themeIds: startRequired.themeIds, publicUrl: startRequired.publicUrl, includeSavedKeys: startRequired.includeSavedKeys }));
  };
  return {
    registry: required.registry,
    hasWork: () => active !== null,
    async staticOptions() {
      if (!required.staticSite) throw new SiteShareRefusal({ code: "UNAVAILABLE", message: "Static exporter is unavailable in this context." });
      const { activeThemeId, themes } = staticRoster({ ports: required.staticSite, context: await required.staticSite.context() });
      return { activeThemeId, themes: activeThemeId === NO_THEME_ID ? [{ themeId: NO_THEME_ID, name: "Current site" }] : themes };
    },
    async create(input, options = {}) {
      input.signal.throwIfAborted();
      await requireSavedKeysOwner({ input, ownerPrincipalId: required.ownerPrincipalId });
      const selection = input.format === "static" ? parseStaticExportInput({ input: { jobId: input.jobId, themeIds: input.themeIds, publicUrl: input.publicUrl } }) : {};
      const jobId = input.jobId ?? randomUUID();
      const key = { planId: jobId, principalId: input.principalId, workspaceId: required.site + (input.format === "static" ? "/static" : "") };
      const job = jobs.find(key) ?? startExport({ key, resumedJobId: input.jobId, format: input.format, themeIds: selection.themeIds, publicUrl: selection.publicUrl, includeSavedKeys: input.includeSavedKeys });
      const waited = await jobs.wait(job, { signal: input.signal, budgetMs: options.waitMs ?? 1500 });
      const outcome = waited.state === "done" ? { ...waited, result: await required.registry.get({ site: required.site, shareId: waited.result.shareId }) ?? waited.result } : waited;
      return createOutcome({ waited: outcome, jobId, format: input.format });
    },
    async acknowledge(input) {
      if (active) throw new SiteShareRefusal({ code: "BUSY", message: "Export acknowledgement is waiting for another export or delivery. Retry when it finishes." });
      active = input.shareId;
      try {
        const row = await required.registry.get({ site: required.site, shareId: input.shareId });
        if (!row || row.status === "revoked") throw new SiteShareRefusal({ code: "NOT_FOUND", message: "This export is missing or was revoked." });
        const delivery = row.needsAcknowledgement && row.storage ? await required.delivery({ provider: row.storage.provider, binding: row.storage.binding }) : undefined;
        return view(await acknowledgeSiteShare({ registry: required.registry, site: required.site, shareId: input.shareId }, { delivery }));
      } finally { active = null; }
    },
    async revealPassword(input) {
      if (input.principalId !== await required.ownerPrincipalId) throw new SiteShareRefusal({ code: "FORBIDDEN", message: "Only the site owner can reveal an export password." });
      const row = await required.registry.get({ site: required.site, shareId: input.shareId });
      if (!row?.hasEncryptedKeys || !row.sealedPassword || row.status === "revoked") throw new SiteShareRefusal({ code: "NOT_FOUND", message: "Export password not found for this site." });
      if (!required.savedKeys) throw new SiteShareRefusal({ code: "UNAVAILABLE", message: "Saved keys are unavailable." });
      return required.savedKeys.reveal({ sealedPassword: row.sealedPassword, shareId: row.shareId, workspaceId: required.site });
    },
    list: async () => (await required.registry.list({ site: required.site })).map(view),
    async revoke(input) {
      const row = await required.registry.get({ site: required.site, shareId: input.shareId });
      if (!row) throw new SiteShareRefusal({ code: "NOT_FOUND", message: "Share not found for this site." });
      let delivery: ShareDelivery | undefined;
      // Resolution failure must not prevent revoke's own disable-first/delete-local sequence.
      if (row.storage && !isOwnShareFolder({ storage: row.storage })) {
        try { delivery = await required.delivery({ provider: row.storage.provider, binding: row.storage.binding }); }
        catch { /* revokeSiteShare disables locally before reporting the missing remote store. */ }
      }
      return view(await revokeSiteShare({ registry: required.registry, site: required.site, shareId: input.shareId }, { delivery }));
    },
  };
}
