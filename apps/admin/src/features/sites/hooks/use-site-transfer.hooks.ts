import { useCallback, useEffect, useRef, useState } from "react";
import { useFetchQuery, useInvalidate } from "@jini-ai/ui/fetch-query";
import type { Translate } from "@jini-ai/ui/panel-kit";
import { API_UNREACHABLE_CODE, ApiError, describeApiError } from "@/lib/api";
import { requestAssistantPrompt } from "@/lib/assistant-prompt-bus";
import {
  defaultSiteTransferPort,
  type SiteImport,
  type SiteShare,
  type SiteShareCreateResult,
  type SiteTransferPort,
} from "./site-transfer-dependencies.hooks";

/**
 * @file State for the Sites screen's Export Site and Import Site tabs (owner, 2026-10-18). Every
 * effect goes through {@link SiteTransferPort}; the tabs themselves are markup only.
 */

export const SITE_TRANSFER_KEYS = { shares: ["sites", "shares"], imports: ["sites", "imports"] } as const;

/** Share jobs answer within ~1.5 s per POST (the server waits that long itself), so re-posting at
 *  once is the poll. 600 posts bound a stuck job at ~15 min, past the server's own 10 min limit. */
const MAX_EXPORT_POLLS = 600;

function isFinishedShare(result: SiteShareCreateResult): result is SiteShare & { message?: string } {
  return "shareId" in result;
}

/** Starts an export and re-posts its job id until a finished share returns, the caller stops
 *  wanting it (`alive()` false, the tab unmounted) or the poll cap is spent.
 *  @returns The last answer: a finished share, or a still-running job. */
async function createShareUntilDone({ port, alive }: { port: SiteTransferPort; alive: () => boolean }): Promise<SiteShareCreateResult> {
  let result = await port.createShare({});
  for (let polls = 0; !isFinishedShare(result) && alive() && polls < MAX_EXPORT_POLLS; polls += 1) {
    result = await port.createShare({ jobId: result.jobId });
  }
  return result;
}

export interface SiteExportController {
  shares: SiteShare[] | undefined;
  listError: string | null;
  exporting: boolean;
  exportError: string | null;
  exportSite: () => Promise<void>;
  revokingId: string | null;
  revoke: (share: SiteShare) => Promise<void>;
  copiedId: string | null;
  copyLink: (share: SiteShare) => Promise<void>;
  downloadHref: (share: SiteShare) => string;
  /** True when the newest export has no recipient link: no link host is set up. */
  zipOnly: boolean;
}

/**
 * Export Site: create (no confirmation, owner rule), list, revoke, copy link.
 * @complexity O(polls) network round trips per export; O(shares) per render.
 */
export function useSiteExport(
  { port, t }: { port: SiteTransferPort; t: Translate },
  // Guarded for SSR / non-browser hosts, where `navigator` may be absent entirely; `clipboard` itself
  // may also be absent (insecure context). `copyLink` copies nothing in either case.
  { clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard }: { clipboard?: Pick<Clipboard, "writeText"> } = {},
): SiteExportController {
  const list = useFetchQuery({ key: [...SITE_TRANSFER_KEYS.shares], fetch: () => port.listShares() });
  const invalidate = useInvalidate();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    // StrictMode replays setup after cleanup; each setup must mark this mount alive again.
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  async function exportSite() {
    if (exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      const result = await createShareUntilDone({ port, alive: () => alive.current });
      if (alive.current && !isFinishedShare(result)) setExportError(t("The export is taking too long. Try again later."));
    } catch (failure) {
      if (alive.current) setExportError(describeApiError(failure, t("Export failed.")));
    } finally {
      if (alive.current) setExporting(false);
      invalidate({ key: [...SITE_TRANSFER_KEYS.shares] });
    }
  }

  async function revoke(share: SiteShare) {
    if (revokingId) return;
    setRevokingId(share.shareId);
    setExportError(null);
    try {
      await port.revokeShare({ shareId: share.shareId });
    } catch (failure) {
      setExportError(describeApiError(failure, t("Revoke failed.")));
    } finally {
      setRevokingId(null);
      invalidate({ key: [...SITE_TRANSFER_KEYS.shares] });
    }
  }

  async function copyLink(share: SiteShare) {
    if (!share.url || !clipboard) return;
    await clipboard.writeText(share.url);
    setCopiedId(share.shareId);
  }

  const shares = list.data?.shares;
  return {
    shares,
    listError: list.error ? describeApiError(list.error, t("Couldn't load exports.")) : null,
    exporting,
    exportError,
    exportSite,
    revokingId,
    revoke,
    copiedId,
    copyLink,
    downloadHref: (share) => port.shareDownloadHref(share),
    zipOnly: shares?.[0] !== undefined && shares[0].url === null,
  };
}

/** A share link the import route will take: HTTPS, no credentials or fragment. */
export function validShareLink(link: string): boolean {
  try {
    const url = new URL(link.trim());
    return url.protocol === "https:" && !url.username && !url.password && !url.hash;
  } catch {
    return false;
  }
}

/** A live website address: http(s) only, so the drafted request never carries a script or file URL. */
export function validWebsiteAddress(address: string): boolean {
  try {
    return ["http:", "https:"].includes(new URL(address.trim()).protocol);
  } catch {
    return false;
  }
}

/** The drafted request the "From a live website" option hands to the assistant. */
export function liveImportPrompt(address: string): string {
  return `Import the live website at ${address.trim()} into this site with the site-import agent plugin.`;
}

export interface SiteImportController {
  imports: SiteImport[] | undefined;
  listError: string | null;
  link: string;
  setLink: (link: string) => void;
  file: File | null;
  chooseFiles: (files: File[]) => void;
  clearFile: () => void;
  canImport: boolean;
  importing: boolean;
  importError: string | null;
  startImport: () => Promise<void>;
  /** The import waiting on the new owner's password, or the one just finished. */
  current: SiteImport | null;
  resume: (item: SiteImport) => void;
  password: string;
  setPassword: (password: string) => void;
  confirm: string;
  setConfirm: (confirm: string) => void;
  passwordProblem: string | null;
  settingOwner: boolean;
  ownerError: string | null;
  completeOwner: () => Promise<void>;
  liveAddress: string;
  setLiveAddress: (address: string) => void;
  liveAddressValid: boolean;
  startLiveImport: () => void;
}

function passwordProblemFor({ password, confirm, t }: { password: string; confirm: string; t: Translate }): string | null {
  if (confirm.length > 0 && confirm !== password) return t("The passwords don't match.");
  return null;
}

/** The upload route's v1 cap (`SHARE_LIMITS.maxArchiveBytes`), checked here because the server
 *  refuses an oversized body before reading it and the dropped connection hides its reason. */
const MAX_IMPORT_ZIP_BYTES = 300 * 1024 * 1024;

/** The server's own reason when it answered that import is unavailable here (503), else null. */
function unavailableReason(error: unknown): string | null {
  return error instanceof ApiError && error.status === 503 && error.message ? error.message : null;
}

/**
 * Uploads the zip; when the connection drops, asks the server why. A route that refuses before
 * reading the body (busy, unavailable, signed out) closes the socket mid-upload, so the browser
 * only sees "cannot reach the Tovu API" — a fresh GET returns the real refusal instead.
 * @complexity O(1) round trips beyond the upload.
 */
async function uploadOrExplain({ port, file }: { port: SiteTransferPort; file: File }): Promise<{ uploadId: string }> {
  try {
    return await port.uploadImportZip({ file });
  } catch (failure) {
    if (failure instanceof ApiError && failure.code === API_UNREACHABLE_CODE) await port.listImports();
    throw failure;
  }
}

/**
 * Import Site: a share link or a .zip into a NEW site, then the new owner's password (the
 * backend's needs-owner contract), plus the hand-off to the site-import plugin for live websites.
 * @complexity O(1) round trips per action; O(imports) per render.
 */
export function useSiteImport({ port, t }: { port: SiteTransferPort; t: Translate }): SiteImportController {
  const list = useFetchQuery({ key: [...SITE_TRANSFER_KEYS.imports], fetch: () => port.listImports() });
  const invalidate = useInvalidate();
  const refresh = useCallback(() => invalidate({ key: [...SITE_TRANSFER_KEYS.imports] }), [invalidate]);
  const [link, setLinkState] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [current, setCurrent] = useState<SiteImport | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [settingOwner, setSettingOwner] = useState(false);
  const [ownerError, setOwnerError] = useState<string | null>(null);
  const [liveAddress, setLiveAddress] = useState("");
  // A 503 on the list means import is off on this host: say why once, above the form, not as a list error.
  const unavailable = unavailableReason(list.error);

  // A link and a file are two ways to give ONE source; choosing one clears the other.
  const setLink = (next: string) => {
    setLinkState(next);
    if (next) setFile(null);
    setImportError(null);
  };
  const chooseFiles = (files: File[]) => {
    const picked = files[0];
    if (!picked) return;
    if (!/\.zip$/i.test(picked.name)) {
      setImportError(t("Choose a .tovu.zip file."));
      return;
    }
    setFile(picked);
    setLinkState("");
    setImportError(null);
  };

  async function startImport() {
    if (importing) return;
    if (unavailable) return;
    if (!file && !validShareLink(link)) {
      setImportError(t("Paste an https:// share link."));
      return;
    }
    if (file && file.size > MAX_IMPORT_ZIP_BYTES) {
      setImportError(t("This zip is over the 300 MB limit."));
      return;
    }
    setImporting(true);
    setImportError(null);
    try {
      const source = file ? { uploadId: (await uploadOrExplain({ port, file })).uploadId } : { url: link.trim() };
      setCurrent(await port.startImport(source));
      setLinkState("");
      setFile(null);
    } catch (failure) {
      setImportError(describeApiError(failure, t("Import failed. No site was changed.")));
    } finally {
      setImporting(false);
      refresh();
    }
  }

  const passwordProblem = passwordProblemFor({ password, confirm, t });

  async function completeOwner() {
    const passwordsReady = password.length > 0 && confirm === password;
    if (!current || settingOwner || !passwordsReady) return;
    setSettingOwner(true);
    setOwnerError(null);
    try {
      setCurrent(await port.completeImportOwner({ importId: current.importId, adminPassword: password }));
      setPassword("");
      setConfirm("");
    } catch (failure) {
      setOwnerError(describeApiError(failure, t("Couldn't create the site.")));
    } finally {
      setSettingOwner(false);
      refresh();
    }
  }

  return {
    imports: unavailable ? [] : list.data?.imports,
    listError: list.error && !unavailable ? describeApiError(list.error, t("Couldn't load imports.")) : null,
    link,
    setLink,
    file,
    chooseFiles,
    clearFile: () => setFile(null),
    canImport: !unavailable && (Boolean(file) || link.trim().length > 0),
    importing,
    importError: importError ?? unavailable,
    startImport,
    current,
    resume: (item) => {
      setCurrent(item);
      setOwnerError(null);
    },
    password,
    setPassword,
    confirm,
    setConfirm,
    passwordProblem,
    settingOwner,
    ownerError,
    completeOwner,
    liveAddress,
    setLiveAddress,
    liveAddressValid: validWebsiteAddress(liveAddress),
    startLiveImport: () => {
      if (validWebsiteAddress(liveAddress)) requestAssistantPrompt(liveImportPrompt(liveAddress));
    },
  };
}

export function useWiredSiteExport({ t }: { t: Translate }): SiteExportController {
  return useSiteExport({ port: defaultSiteTransferPort, t });
}

export function useWiredSiteImport({ t }: { t: Translate }): SiteImportController {
  return useSiteImport({ port: defaultSiteTransferPort, t });
}
