import { useCallback, useState } from "react";
import { useFetchQuery as useFetchQueryHook, useInvalidate as useInvalidateHook } from "@jini-ai/ui/fetch-query";
import { useAdminBootScope as useAdminBootScopeHook } from "@jini-ai/admin/shell/lib/admin-boot-scope";
import { SITE_TRANSFER_KEYS, prefilledLiveAddress, unavailableReason } from "./site-transfer-rules";
import type { SiteImport } from "./site-transfer-dependencies.hooks";
import type { useSiteImport } from "./use-site-transfer.hooks";

export function useSiteImportState(
  { port, t }:
    Pick<Parameters<typeof useSiteImport>[0], "port" | "t">,
  { useAdminBootScope = useAdminBootScopeHook, useFetchQuery = useFetchQueryHook, useInvalidate = useInvalidateHook }: { useAdminBootScope?: typeof useAdminBootScopeHook; useFetchQuery?: typeof useFetchQueryHook; useInvalidate?: typeof useInvalidateHook } = {},
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
