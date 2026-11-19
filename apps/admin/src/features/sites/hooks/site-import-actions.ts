import { describeApiError } from "@/lib/admin-http/request";
import { MAX_IMPORT_ZIP_BYTES, uploadOrExplain, validShareLink } from "./site-transfer-rules";
import type { useSiteImportState } from "./use-site-import-state.hooks";
import type { useSiteImport } from "./use-site-transfer.hooks";

export function createSiteOwnerAction(
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

export function createSiteImportAction(
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
