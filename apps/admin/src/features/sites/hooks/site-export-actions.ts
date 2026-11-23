import { formatUserFacingError, type UserFacingError } from "@jini-ai/core";
import type { Translate } from "@jini-ai/core/text";
import { TOVU_ERROR_REDACTION_OPTIONS } from "@tovu/contracts/secret-redaction";
import { describeApiError } from "@/lib/admin-http/request";
import { siteExportFailure } from "../site-export-error";
import { SITE_TRANSFER_KEYS } from "./site-transfer-rules";
import type { SiteShare, SiteShareCreateResult, SiteTransferPort } from "./site-transfer-dependencies.hooks";
import type { useSiteExport } from "./use-site-transfer.hooks";
import type { useSiteExportState } from "./use-site-export-state.hooks";

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

/** A refused clipboard write, in plain words with copyable details. Pure: no clipboard or clock access.
 *  The share's own URL is deliberately not in the details (it may carry a private link token). */
function copyLinkFailure({ error, t }: { error: unknown; t: Translate }, _options = {}): UserFacingError {
  return formatUserFacingError({
    message: t("Couldn't copy the link to your clipboard."),
    action: t("Allow clipboard access for this page in your browser, then press Copy link again."),
    step: "copy link",
    cause: error,
  }, TOVU_ERROR_REDACTION_OPTIONS);
}

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
    try {
      await clipboard.writeText(share.url);
    } catch (failure) {
      // Browsers refuse the write when the page is unfocused, the permission is denied or the
      // context is insecure. Say so: a swallowed refusal looks like a button that does nothing.
      setExportError(null);
      setExportFailure(copyLinkFailure({ error: failure, t }));
      return;
    }
    setCopiedId(share.shareId);
  }
  return { revoke, copyLink };
}

export function createSiteExportActions(
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
