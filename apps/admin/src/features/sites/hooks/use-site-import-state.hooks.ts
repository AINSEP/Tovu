import type { SiteImportPage } from "@jini-ai/core/contracts/site/site-import-history";
import type { Translate } from "@jini-ai/core/text";
import { ApiError, describeApiError } from "@/lib/admin-http/request";
import type { SiteTransferPort } from "./site-transfer-dependencies.hooks";
import { useCallback, useRef, useState } from "react";
import { useFetchQuery as useFetchQueryHook, useInvalidate as useInvalidateHook } from "@jini-ai/ui/fetch-query";
import { useAdminBootScope as useAdminBootScopeHook } from "@jini-ai/admin/shell/lib/admin-boot-scope";
import { SITE_TRANSFER_KEYS, prefilledLiveAddress, unavailableReason } from "./site-transfer-rules";
import type { SiteImport } from "./site-transfer-dependencies.hooks";
import type { useSiteImport } from "./use-site-transfer.hooks";

export function useSiteImportState(
  { port, t }:
    Pick<Parameters<typeof useSiteImport>[0], "port" | "t">,
  { useAdminBootScope = useAdminBootScopeHook, useFetchQuery = useFetchQueryHook, useInvalidate = useInvalidateHook, useImportHistoryPages: usePages = useImportHistoryPages }: { useImportHistoryPages?: typeof useImportHistoryPages; useAdminBootScope?: typeof useAdminBootScopeHook; useFetchQuery?: typeof useFetchQueryHook; useInvalidate?: typeof useInvalidateHook } = {},
) {
  const scope = useAdminBootScope();
  // History is private to the signed-in principal, just like saved-key access.
  const list = useFetchQuery({ key: [...SITE_TRANSFER_KEYS.imports, scope.queryScope], fetch: () => port.listImports({}) }, { enabled: !scope.checking });
  const invalidate = useInvalidate();
  const onReset = useCallback(() => invalidate({ key: [...SITE_TRANSFER_KEYS.imports, scope.queryScope] }), [invalidate, scope.queryScope]);
  const pages = usePages({ scopeKey: scope.queryScope, firstPage: list.data, listImports: port.listImports, onReset, t });
  const refresh = useCallback(() => pages.reset({}), [pages.reset]);
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
    unavailable, setLink, chooseFiles, ...pages,
  };
}


export function useImportHistoryPages({ scopeKey, firstPage, listImports, onReset, t }: {
  scopeKey: string; firstPage: SiteImportPage<SiteImport> | undefined; listImports: SiteTransferPort["listImports"];
  onReset: () => void; t: Translate;
}, _optional: Record<string, never> = {}) {
  const guard = useRef({ scopeKey, firstPage, generation: 0, cursor: undefined as string | undefined });
  const [later, setLater] = useState<{ generation: number; imports: SiteImport[]; nextCursor?: string; loading: boolean; error: string | null; loaded: boolean }>({ generation: 0, imports: [], loading: false, error: null, loaded: false });
  // Scope/generation guards private results against late promises.
  if (guard.current.scopeKey !== scopeKey || guard.current.firstPage !== firstPage) {
    const changedScope = guard.current.scopeKey !== scopeKey;
    guard.current = { scopeKey, firstPage, generation: guard.current.generation + 1, cursor: undefined };
    setLater({ generation: guard.current.generation, imports: [], loading: false, error: changedScope ? null : later.error, loaded: false });
  }
  const reset = useCallback((_required: Record<string, never>, _optional: Record<string, never> = {}) => {
    guard.current.generation++;
    guard.current.cursor = undefined;
    setLater({ generation: guard.current.generation, imports: [], loading: false, error: null, loaded: false });
    onReset();
  }, [onReset]);
  const current = later.generation === guard.current.generation;
  const nextCursor = current && later.loaded ? later.nextCursor : firstPage?.nextCursor;
  const loadMore = async (_required: Record<string, never>, _optional: Record<string, never> = {}) => {
    if (!nextCursor || guard.current.cursor !== undefined) return;
    const generation = guard.current.generation;
    const scope = scopeKey;
    guard.current.cursor = nextCursor;
    setLater(previous => ({ ...previous, generation, loading: true, error: null }));
    try {
      const page = await listImports({ cursor: nextCursor }, {});
      if (guard.current.scopeKey !== scope || guard.current.generation !== generation) return;
      setLater(previous => ({ generation, imports: [...previous.imports, ...page.imports], nextCursor: page.nextCursor, loading: false, error: null, loaded: true }));
    } catch (error) {
      if (guard.current.scopeKey !== scope || guard.current.generation !== generation) return;
      if (error instanceof ApiError && error.code === "INVALID_CURSOR") {
        reset({});
        setLater(previous => ({ ...previous, error: t("This list of imports changed. Reload it to see the newest imports.") }));
      } else setLater(previous => ({ ...previous, loading: false, error: describeApiError({ e: error, fallback: t("Couldn't load imports.") }) }));
    } finally {
      if (guard.current.generation === generation) guard.current.cursor = undefined;
    }
  };
  const seen = new Set<string>();
  const imports = firstPage?.imports.concat(current ? later.imports : []).filter(row => {
    if (seen.has(row.importId)) return false;
    seen.add(row.importId);
    return true;
  });
  // An old response without nextCursor remains a valid first page.
  return { imports, nextCursor, loadingMore: current && later.loading, moreError: current ? later.error : null, loadMore, reset };
}
