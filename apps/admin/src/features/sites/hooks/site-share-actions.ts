import { describeApiError } from "@/lib/admin-http/request";
import type { SiteShare } from "./site-transfer-dependencies.hooks";
import { SITE_TRANSFER_KEYS, type useSiteExport, type useSiteExportState } from "./use-site-transfer.hooks";

/**
 * @file Share-row actions (revoke, copy link) that `useSiteExport` composes. Split from
 * `use-site-transfer.hooks.ts` to keep that file under the max-lines budget; behaviour is unchanged.
 */

export function createSiteShareActions(
  { revokingId, passwordDisplay, setRevokingId, setExportError, setExportFailure, port, t, invalidate, scope, clipboard, credentials, setCopiedId }:
    Pick<ReturnType<typeof useSiteExportState>, "revokingId" | "passwordDisplay" | "setRevokingId" | "setExportError" | "setExportFailure" | "invalidate"
    | "scope" | "credentials" | "setCopiedId"> &
    Pick<Parameters<typeof useSiteExport>[0], "port" | "t"> &
    { clipboard: Pick<Clipboard, "writeText"> | undefined }
) {
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
      setExportError(describeApiError({ e: failure, fallback: t("Revoke failed.") }));
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
  return { revoke, copyLink };
}
