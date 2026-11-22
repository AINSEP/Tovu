import type { StaticExportSelection } from "./use-static-export-selection.hooks";
import type { UserFacingError } from "@jini-ai/core";
import type { CredentialGate } from "./use-share-credential-gate.hooks";
import { describeApiError } from "@/lib/admin-http/request";
import { defaultSiteTransferPort, type SiteImport, type SiteShare, type SiteTransferPort } from "./site-transfer-dependencies.hooks";
import { type Translate } from '@jini-ai/core/text';
import { createSiteShareActions, createSiteExportActions } from "./site-export-actions";
import { useSiteExportState as useSiteExportStateHook } from "./use-site-export-state.hooks";
import { useSiteImportState as useSiteImportStateHook } from "./use-site-import-state.hooks";
import { createSiteOwnerAction, createSiteImportAction } from "./site-import-actions";
import { createSiteImportController } from "./site-import-controller";
import { passwordProblemFor } from "./site-transfer-rules";

/**
 * @file State for the Sites screen's Export Site and Import Site tabs (owner, 2026-10-18). Every
 * effect goes through {@link SiteTransferPort}; the tabs themselves are markup only.
 */

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

/**
 * Export Site: create (no confirmation, owner rule), list, revoke, copy link.
 * @complexity O(polls) network round trips per export; O(shares) per render.
 */
export function useSiteExport(
  { port, t }: { port: SiteTransferPort; t: Translate },
  // Guarded for SSR / non-browser hosts, where `navigator` may be absent entirely; `clipboard` itself
  // may also be absent (insecure context). `copyLink` copies nothing in either case.
  { clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard, useSiteExportState = useSiteExportStateHook }: { clipboard?: Pick<Clipboard, "writeText">; useSiteExportState?: typeof useSiteExportStateHook } = {},
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

/**
 * Import Site: a share link or a .zip into a NEW site, then the new owner's password (the
 * backend's needs-owner contract), plus the hand-off to the site-import plugin for live websites.
 * @complexity O(1) round trips per action; O(imports) per render.
 */
export function useSiteImport({ port, t }: { port: SiteTransferPort; t: Translate }, { useSiteImportState = useSiteImportStateHook }: { useSiteImportState?: typeof useSiteImportStateHook } = {}): SiteImportController {
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

export function useWiredSiteExport({ t }: { t: Translate }): SiteExportController {
  return useSiteExport({ port: defaultSiteTransferPort, t });
}

export function useWiredSiteImport({ t }: { t: Translate }): SiteImportController {
  return useSiteImport({ port: defaultSiteTransferPort, t });
}
