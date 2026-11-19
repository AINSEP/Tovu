import { useStaticExportSelection, type StaticExportSelection } from "./use-static-export-selection.hooks";
import type { UserFacingError } from "@jini-ai/core";
import { siteExportFailure } from "../site-export-error";
import { useShareCredentialGate, type CredentialGate } from "./use-share-credential-gate.hooks";
import { useCallback, useEffect, useRef, useState } from "react";
import { copyToClipboard } from "@jini-ai/ui";
import { useFetchQuery, useInvalidate } from "@jini-ai/ui/fetch-query";

import { API_UNREACHABLE_CODE, ApiError, describeApiError } from "@/lib/admin-http/request";
import { requestAssistantPrompt } from "@/lib/assistant-prompt-bus";
import { SHARE_LIMITS } from "@tovu/contracts/site-share-limits";
import { useAdminBootScope } from "@/lib/admin-boot-scope";
import {
  defaultSiteTransferPort,
  type SiteImport,
  type SiteShare,
  type SiteShareCreateResult,
  type SiteTransferPort,
} from "./site-transfer-dependencies.hooks";

import { type Translate } from '@jini-ai/core/text';
import { createSiteShareActions } from "./site-share-actions";
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
async function createShareUntilDone({ create, alive, initial = {} }: { create: SiteTransferPort["createStaticShare"]; alive: () => boolean; initial?: { themeIds?: readonly string[] } }, _options = {}): Promise<SiteShareCreateResult> {
  let result = await create(initial);
  for (let polls = 0; !isFinishedShare(result) && alive() && polls < MAX_EXPORT_POLLS; polls += 1) {
    result = await create({ jobId: result.jobId });
  }
  return result;
}

export interface SiteExportController extends StaticExportSelection {
  canManageSavedKeys: boolean;
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
  downloadHref: (required: { share: SiteShare }, optional?: Record<string, never>) => string;
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
      if (request === generation.current) setPasswordError(describeApiError({ e: failure, fallback: t("Couldn't reveal the password.") }));
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
 * Static exports retain theme selection; backups always exclude saved keys. O(1).
 */
function selectExportRequest({ port, format, themeIds }: {
  port: SiteTransferPort; format: "backup" | "static"; themeIds: readonly string[];
}, _options = {}) {
  return format === "static"
    ? { create: port.createStaticShare.bind(port), initial: { themeIds } }
    : { create: port.createShare.bind(port), initial: {} };
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
  const {
    scope, canManageSavedKeys, passwordDisplay, list, staticSelection, invalidate, exportKind, setExportKind, exportError, setExportError, exportFailure,
    setExportFailure, revokingId, setRevokingId, copiedId, setCopiedId, credentials, alive,
  } = useSiteExportState({ port, t, clipboard });
  const { exportSite } = createSiteExportActions({
    alive, setExportError, t, credentials, passwordDisplay, exportKind, staticSelection, setExportKind, setExportFailure, port, invalidate, scope,
  });
  const { revoke, copyLink } = createSiteShareActions({
    revokingId, passwordDisplay, setRevokingId, setExportError, setExportFailure, port, t, invalidate, scope, clipboard, credentials, setCopiedId,
  });

  const shares = list.data?.shares;
  // Static downloads stay private even when a link host is configured; only backups diagnose its absence.
  const newestBackup = shares?.find(share => share.file.endsWith(".tovu.zip"));
  return {
    ...passwordDisplay,
    canManageSavedKeys,
    ...staticSelection,
    shares,
    listError: list.error ? describeApiError({ e: list.error, fallback: t("Couldn't load exports.") }) : null,
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
    downloadHref: ({ share }, _optional = {}) => port.shareDownloadHref({ share }),
    credentialGate: credentials.credentialGate,
    acknowledge: credentials.acknowledge,
    download: credentials.download,
    zipOnly: newestBackup !== undefined && newestBackup.url === null,
  };
}

function createSiteExportActions(
  { alive, setExportError, t, credentials, passwordDisplay, exportKind, staticSelection, setExportKind, setExportFailure, port, invalidate, scope }:
    Pick<ReturnType<typeof useSiteExportState>, "alive" | "setExportError" | "credentials" | "passwordDisplay" | "exportKind" | "staticSelection"
    | "setExportKind" | "setExportFailure" | "invalidate" | "scope"> &
    Pick<Parameters<typeof useSiteExport>[0], "t" | "port">
) {
  async function finishExport({ result, format }: { result: SiteShareCreateResult; format: "backup" | "static" }, _options = {}) {
    if (!alive.current) return;
    if (!isFinishedShare(result)) { setExportError(t("The export is taking too long. Try again later.")); return; }
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
    try {
      const { create, initial } = selectExportRequest({ port, format, themeIds: [...staticSelection.selectedThemeIds] });
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
  return { exportSite };
}

export function useSiteExportState(
  { port, t, clipboard }:
    Pick<Parameters<typeof useSiteExport>[0], "port" | "t"> &
    { clipboard: Pick<Clipboard, "writeText"> | undefined }
) {
  const scope = useAdminBootScope();
  const canManageSavedKeys = useSavedKeysAccess({ port, scope });
  const passwordDisplay = useExportPassword({ port, t, canManageSavedKeys, identity: scope.queryScope, clipboard });
  const list = useFetchQuery({ key: [...SITE_TRANSFER_KEYS.shares, scope.queryScope], fetch: () => port.listShares() }, { enabled: !scope.checking });
  const staticSelection = useStaticExportSelection({ port, t });
  const invalidate = useInvalidate();
  const [exportKind, setExportKind] = useState<"backup" | "static" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportFailure, setExportFailure] = useState<UserFacingError | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const refreshShares = () => invalidate({ key: [...SITE_TRANSFER_KEYS.shares, scope.queryScope] });
  const credentials = useShareCredentialGate({ port, t, refresh: refreshShares, onDownloadError: ({ message }, _optional = {}) => { setExportFailure(null); setExportError(message); } });
  const alive = useRef(true);
  useEffect(() => {
    // StrictMode replays setup after cleanup; each setup must mark this mount alive again.
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  return {
    scope, canManageSavedKeys, passwordDisplay, list, staticSelection, invalidate, exportKind, setExportKind, exportError, setExportError, exportFailure,
    setExportFailure, revokingId, setRevokingId, copiedId, setCopiedId, credentials, alive,
  };
}

/** A share link the import route will take: HTTPS, no credentials or fragment. */
export function validShareLink({ link }: { link: string }, _optional = {}): boolean {
  try {
    const url = new URL(link.trim());
    return url.protocol === "https:" && !url.username && !url.password && !url.hash;
  } catch {
    return false;
  }
}

/** A live website address: http(s) only, so the drafted request never carries a script or file URL. */
export function validWebsiteAddress({ address }: { address: string }, _optional = {}): boolean {
  try {
    return ["http:", "https:"].includes(new URL(address.trim()).protocol);
  } catch {
    return false;
  }
}

/** The desktop app's Import page, and the web one's live source (`use-live-import-site.hooks.ts`),
 * open a NEW site's tab with the address already in the URL (`?liveImport=`); the owner then only
 * presses "Import with the assistant". Same-origin page, read once. */
function prefilledLiveAddress(): string {
  if (typeof window === "undefined") return "";
  const address = new URLSearchParams(window.location.search).get("liveImport") ?? "";
  return validWebsiteAddress({ address: address }) ? address : "";
}

/** The drafted request the "From a live website" option hands to the assistant. */
export function liveImportPrompt({ address }: { address: string }, _optional = {}): string {
  return `Import the live website at ${address.trim()} into this site with the site-import agent plugin.`;
}

export interface SiteImportController {
  savedKeysPassword: string;
  setSavedKeysPassword: (password: string) => void;
  imports: SiteImport[] | undefined;
  listError: string | null;
  link: string;
  setLink: (required: { next: string }, optional?: Record<string, never>) => void;
  file: File | null;
  chooseFiles: (required: { files: File[] }, optional?: Record<string, never>) => void;
  clearFile: () => void;
  canImport: boolean;
  importing: boolean;
  importError: string | null;
  startImport: () => Promise<void>;
  /** The import waiting on the new owner's password, or the one just finished. */
  current: SiteImport | null;
  resume: (required: { item: SiteImport }, optional?: Record<string, never>) => void;
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
  /** Drafts the import into THIS site; only offered on a site made for it (see `arrivedForImport`). */
  startLiveImport: () => void;
  /** This page is the new site a live import was made for: its address came in the URL. Elsewhere a
   *  live website makes a new site first and never imports into this one (owner, 2026-11-10). */
  arrivedForImport: boolean;
}

function passwordProblemFor({ password, confirm, t }: { password: string; confirm: string; t: Translate }): string | null {
  if (confirm.length > 0 && confirm !== password) return t("The passwords don't match.");
  return null;
}

/** The upload route's own v1 cap, checked here because the server refuses an oversized body
 *  before reading it and the dropped connection hides its reason. */
const MAX_IMPORT_ZIP_BYTES = SHARE_LIMITS.maxArchiveBytes;

/** The server's own reason when it answered that import is unavailable here (503), else null. */
function unavailableReason({ error }: { error: unknown }, _optional = {}): string | null {
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
  const {
    list, refresh, link, setLinkState, file, setFile, importing, setImporting, importError, setImportError, current, setCurrent, password, setPassword, confirm,
    setConfirm, savedKeysPassword, setSavedKeysPassword, settingOwner, setSettingOwner, ownerError, setOwnerError, liveAddress, setLiveAddress, arrivedForImport,
    unavailable, setLink, chooseFiles,
  } = useSiteImportState({ port, t });
  const { startImport } = createSiteImportAction({
    importing, unavailable, file, link, setImportError, t, setImporting, setSavedKeysPassword, port, setCurrent, setLinkState, setFile, refresh,
  });

  const passwordProblem = passwordProblemFor({ password, confirm, t });
  const { completeOwner } = createSiteOwnerAction({
    password, confirm, current, settingOwner, setSettingOwner, setOwnerError, setCurrent, port, savedKeysPassword, setPassword, setConfirm, t,
    setSavedKeysPassword, refresh,
  });
  return createSiteImportController({
    savedKeysPassword, setSavedKeysPassword, unavailable, list, t, link, setLink, file, chooseFiles, setFile, importing, importError, startImport,
    current, setPassword, setConfirm, setCurrent, setOwnerError, password, confirm, passwordProblem, settingOwner, ownerError, completeOwner, liveAddress,
    setLiveAddress, arrivedForImport,
  });
}

function createSiteImportController(
  {
    savedKeysPassword, setSavedKeysPassword, unavailable, list, t, link, setLink, file, chooseFiles, setFile, importing, importError, startImport, current,
    setPassword, setConfirm, setCurrent, setOwnerError, password, confirm, passwordProblem, settingOwner, ownerError, completeOwner, liveAddress, setLiveAddress,
    arrivedForImport,
  }:
    Pick<ReturnType<typeof useSiteImportState>, "savedKeysPassword" | "setSavedKeysPassword" | "unavailable" | "list" | "link" | "setLink" | "file"
    | "chooseFiles" | "setFile" | "importing" | "importError" | "current" | "setPassword" | "setConfirm" | "setCurrent" | "setOwnerError" | "password" | "confirm"
    | "settingOwner" | "ownerError" | "liveAddress" | "setLiveAddress" | "arrivedForImport"> &
    Pick<Parameters<typeof useSiteImport>[0], "t"> &
    Pick<ReturnType<typeof createSiteImportAction>, "startImport"> &
    Pick<ReturnType<typeof createSiteOwnerAction>, "completeOwner"> &
    { passwordProblem: ReturnType<typeof passwordProblemFor> }
) : SiteImportController {
  return {
    savedKeysPassword,
    setSavedKeysPassword,
    imports: unavailable ? [] : list.data?.imports,
    listError: list.error && !unavailable ? describeApiError({ e: list.error, fallback: t("Couldn't load imports.") }) : null,
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
    ...createSiteImportOwnerController({ setSavedKeysPassword, setPassword, setConfirm, setCurrent, setOwnerError, password, confirm, passwordProblem, settingOwner, ownerError, completeOwner }),
    liveAddress,
    setLiveAddress,
    liveAddressValid: validWebsiteAddress({ address: liveAddress }),
    startLiveImport: () => {
      if (validWebsiteAddress({ address: liveAddress })) requestAssistantPrompt({ text: liveImportPrompt({ address: liveAddress }) });
    },
    arrivedForImport,
  };
}

function createSiteImportOwnerController({ setSavedKeysPassword, setPassword, setConfirm, setCurrent, setOwnerError, password, confirm, passwordProblem, settingOwner, ownerError, completeOwner }: { setSavedKeysPassword: Parameters<typeof createSiteImportController>[0]["setSavedKeysPassword"]; setPassword: Parameters<typeof createSiteImportController>[0]["setPassword"]; setConfirm: Parameters<typeof createSiteImportController>[0]["setConfirm"]; setCurrent: Parameters<typeof createSiteImportController>[0]["setCurrent"]; setOwnerError: Parameters<typeof createSiteImportController>[0]["setOwnerError"]; password: Parameters<typeof createSiteImportController>[0]["password"]; confirm: Parameters<typeof createSiteImportController>[0]["confirm"]; passwordProblem: Parameters<typeof createSiteImportController>[0]["passwordProblem"]; settingOwner: Parameters<typeof createSiteImportController>[0]["settingOwner"]; ownerError: Parameters<typeof createSiteImportController>[0]["ownerError"]; completeOwner: Parameters<typeof createSiteImportController>[0]["completeOwner"] }): Pick<SiteImportController, "resume" | "password" | "setPassword" | "confirm" | "setConfirm" | "passwordProblem" | "settingOwner" | "ownerError" | "completeOwner"> {
  return {
    resume: ({ item }, _optional = {}) => {
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
  };
}

function createSiteOwnerAction(
  {
    password, confirm, current, settingOwner, setSettingOwner, setOwnerError, setCurrent, port, savedKeysPassword, setPassword, setConfirm, t,
    setSavedKeysPassword, refresh,
  }:
    Pick<ReturnType<typeof useSiteImportState>, "password" | "confirm" | "current" | "settingOwner" | "setSettingOwner" | "setOwnerError" | "setCurrent"
    | "savedKeysPassword" | "setPassword" | "setConfirm" | "setSavedKeysPassword" | "refresh"> &
    Pick<Parameters<typeof useSiteImport>[0], "port" | "t">
) {
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
      setOwnerError(describeApiError({ e: failure, fallback: t("Couldn't create the site.") }));
    } finally {
      // The archive password must not linger after an attempted submission, including failures.
      setSavedKeysPassword("");
      setSettingOwner(false);
      refresh();
    }
  }
  return { completeOwner };
}

function createSiteImportAction(
  { importing, unavailable, file, link, setImportError, t, setImporting, setSavedKeysPassword, port, setCurrent, setLinkState, setFile, refresh }:
    Pick<ReturnType<typeof useSiteImportState>, "importing" | "unavailable" | "file" | "link" | "setImportError" | "setImporting" | "setSavedKeysPassword"
    | "setCurrent" | "setLinkState" | "setFile" | "refresh"> &
    Pick<Parameters<typeof useSiteImport>[0], "t" | "port">
) {
  async function startImport() {
    if (importing) return;
    if (unavailable) return;
    if (!file && !validShareLink({ link: link })) {
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
      setImportError(describeApiError({ e: failure, fallback: t("Import failed. No site was changed.") }));
    } finally {
      setImporting(false);
      refresh();
    }
  }
  return { startImport };
}

function useSiteImportState(
  { port, t }:
    Pick<Parameters<typeof useSiteImport>[0], "port" | "t">
) {
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
  const [liveAddress, setLiveAddress] = useState(prefilledLiveAddress);
  const [arrivedForImport] = useState(() => prefilledLiveAddress() !== "");
  // A 503 on the list means import is off on this host: say why once, above the form, not as a list error.
  const unavailable = unavailableReason({ error: list.error });

  // A link and a file are two ways to give ONE source; choosing one clears the other.
  const setLink = ({ next }: { next: string }, _optional = {}) => {
    setLinkState(next);
    if (next) setFile(null);
    setImportError(null);
  };
  const chooseFiles = ({ files }: { files: File[] }, _optional = {}) => {
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
  return {
    list, refresh, link, setLinkState, file, setFile, importing, setImporting, importError, setImportError, current, setCurrent, password, setPassword, confirm,
    setConfirm, savedKeysPassword, setSavedKeysPassword, settingOwner, setSettingOwner, ownerError, setOwnerError, liveAddress, setLiveAddress, arrivedForImport,
    unavailable, setLink, chooseFiles,
  };
}

export function useWiredSiteExport({ t }: { t: Translate }): SiteExportController {
  return useSiteExport({ port: defaultSiteTransferPort, t });
}

export function useWiredSiteImport({ t }: { t: Translate }): SiteImportController {
  return useSiteImport({ port: defaultSiteTransferPort, t });
}
