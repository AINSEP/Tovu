import { WORKSPACE_ID, authenticatedAdminRequest, authenticatedAdminUrl } from "@/lib/api";

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
  createdAt: string;
  adminUrl?: string | null;
  error?: string;
}

export interface SiteTransferPort {
  listShares(): Promise<{ shares: SiteShare[] }>;
  createShare(input: { jobId?: string }): Promise<SiteShareCreateResult>;
  revokeShare(input: { shareId: string }): Promise<SiteShare>;
  /** Absolute admin URL for a share's zip, so a plain link can download it with the session cookie. */
  shareDownloadHref(share: SiteShare): string;
  listImports(): Promise<{ imports: SiteImport[] }>;
  uploadImportZip(input: { file: Blob }): Promise<{ uploadId: string }>;
  startImport(input: { url: string } | { uploadId: string }): Promise<SiteImport>;
  /** The route only takes a form-encoded `adminPassword`, so the password never travels as JSON. */
  completeImportOwner(input: { importId: string; adminPassword: string }): Promise<SiteImport>;
}

const SHARES = `/workspaces/${WORKSPACE_ID}/site-shares`;
const IMPORTS = `/workspaces/${WORKSPACE_ID}/site-imports`;

export const defaultSiteTransferPort: SiteTransferPort = {
  listShares: () => authenticatedAdminRequest({ method: "GET", path: SHARES }),
  createShare: (input) => authenticatedAdminRequest({ method: "POST", path: SHARES, body: input.jobId ? { jobId: input.jobId } : {} }),
  revokeShare: ({ shareId }) => authenticatedAdminRequest({ method: "DELETE", path: `${SHARES}/${encodeURIComponent(shareId)}` }),
  shareDownloadHref: (share) => authenticatedAdminUrl({ path: `${SHARES}/${encodeURIComponent(share.shareId)}/download` }),
  listImports: () => authenticatedAdminRequest({ method: "GET", path: IMPORTS }),
  // The upload route admits only `application/zip`; Windows reports `.zip` files as
  // `application/x-zip-compressed` and some browsers send no type, so the bytes are re-typed here.
  uploadImportZip: ({ file }) =>
    authenticatedAdminRequest({ method: "POST", path: `${IMPORTS}/uploads`, body: new Blob([file], { type: "application/zip" }) }),
  startImport: (source) => authenticatedAdminRequest({ method: "POST", path: IMPORTS, body: source }),
  completeImportOwner: ({ importId, adminPassword }) =>
    authenticatedAdminRequest({
      method: "POST",
      path: `${IMPORTS}/${encodeURIComponent(importId)}/owner`,
      body: new Blob([new URLSearchParams({ adminPassword }).toString()], { type: "application/x-www-form-urlencoded" }),
    }),
};

/** An in-memory {@link SiteTransferPort} for tests. Unlisted operations reject, so a test that
 *  reaches one it did not describe fails loudly. */
export function createFakeSiteTransferPort(overrides: Partial<SiteTransferPort> = {}): SiteTransferPort {
  const unexpected = (name: string) => () => Promise.reject(new Error(`${name} was not expected`));
  return {
    listShares: () => Promise.resolve({ shares: [] }),
    createShare: unexpected("createShare"),
    revokeShare: unexpected("revokeShare"),
    shareDownloadHref: (share) => `/download/${share.shareId}`,
    listImports: () => Promise.resolve({ imports: [] }),
    uploadImportZip: unexpected("uploadImportZip"),
    startImport: unexpected("startImport"),
    completeImportOwner: unexpected("completeImportOwner"),
    ...overrides,
  };
}
