import { api, WORKSPACE_ID, authenticatedAdminRequest, authenticatedAdminUrl } from "@/lib/api";

/**
 * @file The Export Site / Import Site tabs' port onto the committed share and import routes
 * (`admin-http/routes/system/site-shares.ts`, `site-imports.ts`). Same `useX(dependencies)` split as
 * `sites-port.hooks.ts`; one port for both tabs because they move the same thing, a site archive.
 */

/** One export of this site (`SiteShareView`). `url` is the recipient link, `null` when no link host
 *  is set up; `downloadUrl` is the signed-in admin's own zip download. */
export interface SiteShare {
  shareId: string;
  file: string;
  bytes: number;
  url: string | null;
  status: "active" | "revoked" | "failed";
  createdAt: string;
  downloadUrl: string;
  hasEncryptedKeys?: boolean;
  notices?: readonly string[];
  /** Scope notes from older export responses. */
  notes?: readonly string[];
  /** Where credential-looking content was kept (owner, 2026-11-03: warn, never leave it out). */
  credentialWarnings?: readonly CredentialWarning[];
  /** True until the owner checks "I understand"; the download route answers 409 until then. */
  needsAcknowledgement?: boolean;
}

/** One place an archive may hold a credential: a ZIP path or `content.db:<table>.<column>`, and a
 *  human kind label. Never the matched value. */
export interface CredentialWarning { path: string; kind: string }

/** Why the download route refused a zip, read before the browser saves anything. */
export interface ShareDownloadRefusal { status: number; code?: string; message?: string; credentialWarnings: readonly CredentialWarning[] }

/** Merge legacy scope notes with omission notices for completion and history alike.
 * @returns Distinct safe server notices, in presentation order. O(n) for n notices.
 */
export function siteShareNotices({ share }: { share: Pick<SiteShare, "notices" | "notes"> }, _options = {}): readonly string[] {
  return [...new Set([...(share.notes ?? []), ...(share.notices ?? [])])];
}

/** POST site-shares answers a finished export, or a running job to poll with its `jobId`. */
export type SiteShareCreateResult = (SiteShare & { message?: string }) | { jobId: string; phase: string };

export type SiteImportState = "verifying" | "needs-owner" | "creating" | "ready" | "failed";

/** One import (`SiteImportView`). `source` is a share link or an upload id, never a server path. */
export interface SiteImport {
  importId: string;
  source: { url: string } | { uploadId: string };
  newSiteName: string | null;
  state: SiteImportState;
  warnings?: readonly string[];
  /** Credential-looking content the archive carried; a notice only, imports need no acknowledgement. */
  credentialWarnings?: readonly CredentialWarning[];
  hasEncryptedKeys?: boolean;
  createdAt: string;
  adminUrl?: string | null;
  error?: string;
}

export interface StaticExportOptions { activeThemeId: string; themes: readonly { themeId: string; name: string }[] }

export interface SiteTransferPort {
  savedKeysAccess(required: Record<string, never>, optional?: Record<string, never>): Promise<{ isOwner: boolean }>;
  revealSharePassword(required: { shareId: string }, optional?: Record<string, never>): Promise<{ password: string }>;
  staticExportOptions(required: Record<string, never>, optional?: Record<string, never>): Promise<StaticExportOptions>;
  listShares(): Promise<{ shares: SiteShare[] }>;
  createShare(input: { jobId?: string }): Promise<SiteShareCreateResult>;
  createStaticShare(input: { jobId?: string; themeIds?: readonly string[] }, optional?: Record<string, never>): Promise<SiteShareCreateResult>;
  downloadShare(required: { share: SiteShare }, optional?: Record<string, never>): void;
  revokeShare(input: { shareId: string }): Promise<SiteShare>;
  /** Records "I understand this export may contain credentials"; answers the updated row. */
  acknowledgeShare(required: { shareId: string }, optional?: Record<string, never>): Promise<SiteShare>;
  /** `null` when the zip may be downloaded, else the server's refusal (409 = acknowledge first). */
  shareDownloadRefusal(required: { share: SiteShare }, optional?: Record<string, never>): Promise<ShareDownloadRefusal | null>;
  /** Absolute admin URL for a share's zip, so a plain link can download it with the session cookie. */
  shareDownloadHref(share: SiteShare): string;
  listImports(): Promise<{ imports: SiteImport[] }>;
  uploadImportZip(input: { file: Blob }): Promise<{ uploadId: string }>;
  startImport(input: { url: string } | { uploadId: string }): Promise<SiteImport>;
  /** Both passwords use the session-only form endpoint, never URLs or tool inputs. */
  completeImportOwner(input: { importId: string; adminPassword: string; savedKeysPassword?: string }): Promise<SiteImport>;
}

const SHARES = `/workspaces/${WORKSPACE_ID}/site-shares`;
const IMPORTS = `/workspaces/${WORKSPACE_ID}/site-imports`;

/** HEAD carries no zip bytes, so only a refusal pays for a GET to read its reason. A check that
 *  cannot run (offline, an old server) answers `null`: the download proceeds as it always did.
 * @complexity O(1) requests; two only when refused. */
async function readDownloadRefusal({ href }: { href: string }, _options = {}): Promise<ShareDownloadRefusal | null> {
  const head = await fetch(href, { method: "HEAD", credentials: "same-origin" }).catch(() => null);
  if (!head || head.ok) return null;
  const response = await fetch(href, { method: "GET", credentials: "same-origin" }).catch(() => null);
  // Acknowledged in between: the GET is the zip itself; let the browser's own download fetch it.
  if (response?.ok) return null;
  const body = (await response?.json().catch(() => null) ?? {}) as { code?: unknown; message?: unknown; credentialWarnings?: unknown };
  return {
    status: response?.status ?? head.status,
    ...(typeof body.code === "string" ? { code: body.code } : {}),
    ...(typeof body.message === "string" && body.message ? { message: body.message } : {}),
    credentialWarnings: Array.isArray(body.credentialWarnings) ? body.credentialWarnings as CredentialWarning[] : [],
  };
}

/** Selection belongs only to the initial POST; subsequent calls resume the captured job. */
function staticShareInput(input: { jobId?: string; themeIds?: readonly string[] }, _options = {}) {
  if (input.jobId) return { jobId: input.jobId };
  return input.themeIds ? { themeIds: input.themeIds } : {};
}

export const defaultSiteTransferPort: SiteTransferPort = {
  savedKeysAccess: async (_required, _optional = {}) => {
    // The roster's isOwner includes wildcard policy owners. Only the bootstrap owner has
    // canRename=false (users/list.ts); match that identity, never its display name or grants.
    const [session, users] = await Promise.all([api.me(), api.listUsers()]);
    const current = users.users.find(user => user.principalId === session.user.id);
    return { isOwner: current?.isOwner === true && current.canRename === false };
  },
  revealSharePassword: ({ shareId }, _optional = {}) => authenticatedAdminRequest({ method: "POST", path: `${SHARES}/${encodeURIComponent(shareId)}/password`, body: {} }),
  listShares: () => authenticatedAdminRequest({ method: "GET", path: SHARES }),
  createShare: (input) => authenticatedAdminRequest({ method: "POST", path: SHARES, body: input.jobId ? { jobId: input.jobId } : {} }),
  staticExportOptions: (_input, _options = {}) => authenticatedAdminRequest({ method: "GET", path: `${SHARES}/static/options` }),
  createStaticShare: (input, _options = {}) => authenticatedAdminRequest({ method: "POST", path: `${SHARES}/static`, body: staticShareInput(input) }),
  downloadShare: ({ share }, _options = {}) => {
    // The same authenticated attachment route the export list's Download zip link uses.
    const anchor = document.createElement("a");
    anchor.href = defaultSiteTransferPort.shareDownloadHref(share);
    anchor.download = share.file;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  },
  revokeShare: ({ shareId }) => authenticatedAdminRequest({ method: "DELETE", path: `${SHARES}/${encodeURIComponent(shareId)}` }),
  acknowledgeShare: ({ shareId }, _optional = {}) => authenticatedAdminRequest({ method: "POST", path: `${SHARES}/${encodeURIComponent(shareId)}/acknowledge`, body: {} }),
  shareDownloadRefusal: ({ share }, _optional = {}) => readDownloadRefusal({ href: defaultSiteTransferPort.shareDownloadHref(share) }),
  shareDownloadHref: (share) => authenticatedAdminUrl({ path: `${SHARES}/${encodeURIComponent(share.shareId)}/download` }),
  listImports: () => authenticatedAdminRequest({ method: "GET", path: IMPORTS }),
  // The upload route admits only `application/zip`; Windows reports `.zip` files as
  // `application/x-zip-compressed` and some browsers send no type, so the bytes are re-typed here.
  uploadImportZip: ({ file }) =>
    authenticatedAdminRequest({ method: "POST", path: `${IMPORTS}/uploads`, body: new Blob([file], { type: "application/zip" }) }),
  startImport: (source) => authenticatedAdminRequest({ method: "POST", path: IMPORTS, body: source }),
  completeImportOwner: ({ importId, adminPassword, savedKeysPassword }) =>
    authenticatedAdminRequest({
      method: "POST",
      path: `${IMPORTS}/${encodeURIComponent(importId)}/owner`,
      body: new Blob([new URLSearchParams({ adminPassword, ...(savedKeysPassword ? { savedKeysPassword } : {}) }).toString()], { type: "application/x-www-form-urlencoded" }),
    }),
};

/** An in-memory {@link SiteTransferPort} for tests. Unlisted operations reject, so a test that
 *  reaches one it did not describe fails loudly. */
export function createFakeSiteTransferPort(overrides: Partial<SiteTransferPort> = {}): SiteTransferPort {
  const unexpected = (name: string) => () => Promise.reject(new Error(`${name} was not expected`));
  return {
    savedKeysAccess: async () => ({ isOwner: false }),
    revealSharePassword: unexpected("revealSharePassword"),
    listShares: () => Promise.resolve({ shares: [] }),
    createShare: unexpected("createShare"),
    staticExportOptions: async () => ({ activeThemeId: "", themes: [] }),
    createStaticShare: unexpected("createStaticShare"),
    downloadShare: () => { throw new Error("downloadShare was not expected"); },
    revokeShare: unexpected("revokeShare"),
    acknowledgeShare: unexpected("acknowledgeShare"),
    shareDownloadRefusal: async () => null,
    shareDownloadHref: (share) => `/download/${share.shareId}`,
    listImports: () => Promise.resolve({ imports: [] }),
    uploadImportZip: unexpected("uploadImportZip"),
    startImport: unexpected("startImport"),
    completeImportOwner: unexpected("completeImportOwner"),
    ...overrides,
  };
}
