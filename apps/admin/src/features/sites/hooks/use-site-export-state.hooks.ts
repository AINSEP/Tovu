import { useEffect, useRef, useState } from "react";
import type { UserFacingError } from "@jini-ai/core";
import { useFetchQuery as useFetchQueryHook, useInvalidate as useInvalidateHook } from "@jini-ai/ui/fetch-query";
import { useAdminBootScope as useAdminBootScopeHook } from "@jini-ai/admin/shell/lib/admin-boot-scope";
import { useExportPassword as useExportPasswordHook } from "./use-export-password.hooks";
import { useStaticExportSelection as useStaticExportSelectionHook } from "./use-static-export-selection.hooks";
import { useShareCredentialGate as useShareCredentialGateHook } from "./use-share-credential-gate.hooks";
import { SITE_TRANSFER_KEYS } from "./site-transfer-rules";
import type { SiteTransferPort } from "./site-transfer-dependencies.hooks";
import type { useSiteExport } from "./use-site-transfer.hooks";

/** Resolve the browser owner's saved-key capability within the authenticated query scope.
 * Defers the request during boot and denies access while unresolved or failed. O(1) request.
 */
function useSavedKeysAccess({ port, scope }: { port: SiteTransferPort; scope: ReturnType<typeof useAdminBootScopeHook> }, { useFetchQuery = useFetchQueryHook }: { useFetchQuery?: typeof useFetchQueryHook } = {}): boolean {
  const access = useFetchQuery({ key: ["sites", "saved-keys-access", scope.queryScope], fetch: () => port.savedKeysAccess({}) }, { enabled: !scope.checking });
  return !scope.checking && !access.error && access.data?.isOwner === true;
}

export function useSiteExportState(
  { port, t, clipboard }:
    Pick<Parameters<typeof useSiteExport>[0], "port" | "t"> &
    { clipboard: Pick<Clipboard, "writeText"> | undefined },
  { useAdminBootScope = useAdminBootScopeHook, useSavedKeysAccess: useSavedKeysAccessHook = useSavedKeysAccess, useExportPassword = useExportPasswordHook, useFetchQuery = useFetchQueryHook, useStaticExportSelection = useStaticExportSelectionHook, useInvalidate = useInvalidateHook, useShareCredentialGate = useShareCredentialGateHook }: { useAdminBootScope?: typeof useAdminBootScopeHook; useSavedKeysAccess?: typeof useSavedKeysAccess; useExportPassword?: typeof useExportPasswordHook; useFetchQuery?: typeof useFetchQueryHook; useStaticExportSelection?: typeof useStaticExportSelectionHook; useInvalidate?: typeof useInvalidateHook; useShareCredentialGate?: typeof useShareCredentialGateHook } = {},
) {
  const scope = useAdminBootScope();
  const canManageSavedKeys = useSavedKeysAccessHook({ port, scope });
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
