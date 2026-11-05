import { useStaticExportSelection, type StaticExportSelection } from "./use-static-export-selection.hooks";
import type { UserFacingError } from "@jini-ai/core";
import { siteExportFailure } from "../site-export-error";
import { useShareCredentialGate, type CredentialGate } from "./use-share-credential-gate.hooks";
import { useCallback, useEffect, useRef, useState } from "react";
import { copyToClipboard } from "@jini-ai/ui";
import { useFetchQuery, useInvalidate } from "@jini-ai/ui/fetch-query";
import type { Translate } from "@jini-ai/ui/panel-kit";
import { API_UNREACHABLE_CODE, ApiError, describeApiError } from "@/lib/api";
import { requestAssistantPrompt } from "@/lib/assistant-prompt-bus";
import { SHARE_LIMITS } from "@tovu/contracts/site-share-limits";
import { useAdminBootScope } from "@/lib/admin-boot-scope";
import {
  defaultSiteTransferPort,
  siteShareNotices,
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
async function createShareUntilDone({ create, alive, initial = {} }: { create: SiteTransferPort["createStaticShare"]; alive: () => boolean; initial?: { themeIds?: readonly string[]; includeSavedKeys?: boolean } }, _options = {}): Promise<SiteShareCreateResult> {
  let result = await create(initial);
  for (let polls = 0; !isFinishedShare(result) && alive() && polls < MAX_EXPORT_POLLS; polls += 1) {
    result = await create({ jobId: result.jobId });
  }
  return result;
}

export interface SiteExportController extends StaticExportSelection {
  canManageSavedKeys: boolean;
  includeSavedKeys: boolean;
  setIncludeSavedKeys: (include: boolean) => void;
  exportNotices: readonly string[];
  noticeShareId: string | null;
  revealedPassword: { shareId: string; password: string } | null;
  passwordError: string | null;
  revealingId: string | null;
  passwordCopied: boolean;
  revealPassword: (required: { shareId: string }) => Promise<void>;
  copyPassword: () => Promise<void>;
  hidePassword: () => void;
  shares: SiteShare[] | undefined;
  listError: string | null;
  exporting: boolean;
  exportingStatic: boolean;
  exportError: string | null;
  exportFailure?: UserFacingError | null;
  exportSite: () => Promise<void>;
  exportStaticSite: () => Promise<void>;
  revokingId: string | null;
  revoke: (share: SiteShare) => Promise<void>;
  copiedId: string | null;
  copyLink: (share: SiteShare) => Promise<void>;
  downloadHref: (share: SiteShare) => string;
  /** The credential warning a row shows while Download zip and Copy link wait, else null. */
  credentialGate: (share: SiteShare) => CredentialGate | null;
  /** "I understand this export may contain credentials": records consent, then enables the row. */
  acknowledge: (share: SiteShare) => Promise<void>;
  /** Download zip, checked with the server first so a refusal shows its reason instead of saving it. */
  download: (share: SiteShare) => Promise<void>;
  /** True when the newest backup has no recipient link; static-only exports always stay private. */
  zipOnly: boolean;
}

/** Fetch a password only in response to completion or Reveal. It never enters query caches.
 * Request generations discard late responses after dismissal, a new export, or unmount.
 * @returns Memory-only display state and explicit reveal/copy/dismiss actions.
 * @complexity O(1), one HTTP request per reveal and one clipboard operation per copy.
 */
function useExportPassword({ port, t, canManageSavedKeys, identity, clipboard }: {
  port: SiteTransferPort; t: Translate; canManageSavedKeys: boolean; identity: string; clipboard?: Pick<Clipboard, "writeText">;
}, _options = {}) {
  const [revealedPassword, setRevealedPassword] = useState<{ shareId: string; password: string } | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [revealingId, setRevealingId] = useState<string | null>(null);
  const [passwordCopied, setPasswordCopied] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    generation.current += 1;
    setRevealedPassword(null);
    setRevealingId(null);
    setPasswordCopied(false);
    setPasswordError(null);
    return () => { generation.current += 1; };
  }, [identity, canManageSavedKeys]);

  function hidePassword() {
    generation.current += 1;
    setRevealedPassword(null);
    setRevealingId(null);
    setPasswordCopied(false);
    setPasswordError(null);
  }

  async function revealPassword({ shareId }: { shareId: string }, _optional = {}) {
    if (!canManageSavedKeys) return;
    hidePassword();
    const request = generation.current;
    setRevealingId(shareId);
    try {
      const result = await port.revealSharePassword({ shareId });
      if (request === generation.current) setRevealedPassword({ shareId, password: result.password });
    } catch (failure) {
      if (request === generation.current) setPasswordError(describeApiError(failure, t("Couldn't reveal the password.")));
    } finally {
      if (request === generation.current) setRevealingId(null);
    }
  }

  async function copyPassword() {
    if (!revealedPassword || !canManageSavedKeys) return;
    const request = generation.current;
    const copied = await copyToClipboard({ text: revealedPassword.password }, clipboard ? { clipboard: { writeText: ({ text }) => clipboard.writeText(text) } } : {});
    if (request !== generation.current) return;
    setPasswordCopied(copied);
    if (!copied) setPasswordError(t("Couldn't copy the password. Copy it manually."));
  }

  return { revealedPassword: canManageSavedKeys ? revealedPassword : null, passwordError, revealingId, passwordCopied, revealPassword, copyPassword, hidePassword };
}

/** Resolve the browser owner's saved-key capability within the authenticated query scope.
 * Defers the request during boot and denies access while unresolved or failed. O(1) request.
 */
function useSavedKeysAccess({ port, scope }: { port: SiteTransferPort; scope: ReturnType<typeof useAdminBootScope> }, _options = {}): boolean {
  const access = useFetchQuery({ key: ["sites", "saved-keys-access", scope.queryScope], fetch: () => port.savedKeysAccess({}) }, { enabled: !scope.checking });
  return !scope.checking && !access.error && access.data?.isOwner === true;
}

/** Capture the selected export format and its initial request; polls send only the job id.
 * Static exports retain theme selection; only authorized backups may opt into saved keys. O(1).
 */
function selectExportRequest({ port, format, themeIds, includeSavedKeys }: {
  port: SiteTransferPort; format: "backup" | "static"; themeIds: readonly string[]; includeSavedKeys: boolean;
}, _options = {}) {
  return format === "static"
    ? { create: port.createStaticShare.bind(port), initial: { themeIds } }
    : { create: port.createShare.bind(port), initial: includeSavedKeys ? { includeSavedKeys: true } : {} };
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
  const scope = useAdminBootScope();
  const canManageSavedKeys = useSavedKeysAccess({ port, scope });
  const passwordDisplay = useExportPassword({ port, t, canManageSavedKeys, identity: scope.queryScope, clipboard });
  const [includeSavedKeys, setIncludeSavedKeys] = useState(false);
  const [exportNotices, setExportNotices] = useState<readonly string[]>([]);
  const [noticeShareId, setNoticeShareId] = useState<string | null>(null);
  const list = useFetchQuery({ key: [...SITE_TRANSFER_KEYS.shares, scope.queryScope], fetch: () => port.listShares() }, { enabled: !scope.checking });
  const staticSelection = useStaticExportSelection({ port, t });
  const invalidate = useInvalidate();
  const [exportKind, setExportKind] = useState<"backup" | "static" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportFailure, setExportFailure] = useState<UserFacingError | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const refreshShares = () => invalidate({ key: [...SITE_TRANSFER_KEYS.shares, scope.queryScope] });
  const credentials = useShareCredentialGate({ port, t, refresh: refreshShares, onDownloadError: error => { setExportFailure(null); setExportError(error); } });
  const alive = useRef(true);
  useEffect(() => {
    // StrictMode replays setup after cleanup; each setup must mark this mount alive again.
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  async function finishExport({ result, format }: { result: SiteShareCreateResult; format: "backup" | "static" }, _options = {}) {
    if (!alive.current) return;
    if (!isFinishedShare(result)) { setExportError(t("The export is taking too long. Try again later.")); return; }
    // Completion notices must survive even when the following password request fails.
    setExportNotices(siteShareNotices({ share: result }));
    setNoticeShareId(result.shareId);
    if (format === "static") await credentials.downloadWhenAllowed(result);
    if (format === "backup" && result.hasEncryptedKeys) await passwordDisplay.revealPassword({ shareId: result.shareId });
  }

  async function exportSite({ format }: { format: "backup" | "static" }, _options = {}) {
    if (exportKind) return;
    if (format === "static" && !staticSelection.staticExportReady) return;
    setExportKind(format);
    setExportError(null);
    setExportFailure(null);
    passwordDisplay.hidePassword();
    setExportNotices([]);
    setNoticeShareId(null);
    try {
      const { create, initial } = selectExportRequest({ port, format, themeIds: [...staticSelection.selectedThemeIds], includeSavedKeys: canManageSavedKeys && includeSavedKeys });
      const result = await createShareUntilDone({ create, alive: () => alive.current, initial });
      await finishExport({ result, format });
    } catch (failure) {
      if (alive.current) {
        const formatted = siteExportFailure({ error: failure, t });
        setExportError(formatted.message);
        setExportFailure(formatted);
      }
    } finally {
      if (alive.current) setExportKind(null);
      invalidate({ key: [...SITE_TRANSFER_KEYS.shares, scope.queryScope] });
    }
  }

  async function revoke(share: SiteShare) {
    if (revokingId) return;
    // Invalidate even an in-flight reveal; a revoked archive must not redisplay its password.
    passwordDisplay.hidePassword();
    setRevokingId(share.shareId);
    setExportError(null);
    setExportFailure(null);
    try {
      await port.revokeShare({ shareId: share.shareId });
    } catch (failure) {
      setExportError(describeApiError(failure, t("Revoke failed.")));
    } finally {
      setRevokingId(null);
      invalidate({ key: [...SITE_TRANSFER_KEYS.shares, scope.queryScope] });
    }
  }

  async function copyLink(share: SiteShare) {
    if (!share.url || !clipboard || credentials.credentialGate(share)) return;
    await clipboard.writeText(share.url);
    setCopiedId(share.shareId);
  }

  const shares = list.data?.shares;
  // Static downloads stay private even when a link host is configured; only backups diagnose its absence.
  const newestBackup = shares?.find(share => share.file.endsWith(".tovu.zip"));
  return {
    ...passwordDisplay,
    canManageSavedKeys,
    includeSavedKeys,
    setIncludeSavedKeys,
    exportNotices,
    noticeShareId,
    ...staticSelection,
    shares,
    listError: list.error ? describeApiError(list.error, t("Couldn't load exports.")) : null,
    exporting: exportKind === "backup",
    exportingStatic: exportKind === "static",
    exportError,
    exportFailure,
    exportSite: () => exportSite({ format: "backup" }),
    exportStaticSite: () => exportSite({ format: "static" }),
    revokingId,
    revoke,
    copiedId,
    copyLink,
    downloadHref: (share) => port.shareDownloadHref(share),
    credentialGate: credentials.credentialGate,
    acknowledge: credentials.acknowledge,
    download: credentials.download,
    zipOnly: newestBackup !== undefined && newestBackup.url === null,
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
  savedKeysPassword: string;
  setSavedKeysPassword: (password: string) => void;
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

/** The upload route's own v1 cap, checked here because the server refuses an oversized body
 *  before reading it and the dropped connection hides its reason. */
const MAX_IMPORT_ZIP_BYTES = SHARE_LIMITS.maxArchiveBytes;

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
  const scope = useAdminBootScope();
  // History is private to the signed-in principal, just like saved-key access.
  const list = useFetchQuery({ key: [...SITE_TRANSFER_KEYS.imports, scope.queryScope], fetch: () => port.listImports() }, { enabled: !scope.checking });
  const invalidate = useInvalidate();
  const refresh = useCallback(() => invalidate({ key: [...SITE_TRANSFER_KEYS.imports, scope.queryScope] }), [invalidate, scope.queryScope]);
  const [link, setLinkState] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [current, setCurrent] = useState<SiteImport | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [savedKeysPassword, setSavedKeysPassword] = useState("");
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
    setSavedKeysPassword("");
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
      setCurrent(await port.completeImportOwner({ importId: current.importId, adminPassword: password,
        ...(current.hasEncryptedKeys && savedKeysPassword ? { savedKeysPassword } : {}) }));
      setPassword("");
      setConfirm("");
    } catch (failure) {
      setOwnerError(describeApiError(failure, t("Couldn't create the site.")));
    } finally {
      // The archive password must not linger after an attempted submission, including failures.
      setSavedKeysPassword("");
      setSettingOwner(false);
      refresh();
    }
  }

  return {
    savedKeysPassword,
    setSavedKeysPassword,
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
      setSavedKeysPassword("");
      setPassword("");
      setConfirm("");
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
