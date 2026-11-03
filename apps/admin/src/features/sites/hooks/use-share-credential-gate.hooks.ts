import { useEffect, useRef, useState } from "react";
import type { Translate } from "@jini-ai/ui/panel-kit";
import { describeApiError } from "@/lib/api";
import type { CredentialWarning, ShareDownloadRefusal, SiteShare, SiteTransferPort } from "./site-transfer-dependencies.hooks";

/**
 * @file Export credential warnings (owner, 2026-11-03: "just a warning for the user, and then
 * click that I understand there may be some content that has credentials. It shouldn't be left
 * out."). A row awaiting acknowledgement shows its warning; Download zip and Copy link wait for the
 * "I understand" checkbox, which records consent on the server before enabling them.
 */

/** What an export row shows in place of its download; `message` is a 409's own reason. */
export interface CredentialGate {
  warnings: readonly CredentialWarning[];
  message: string | null;
  acknowledging: boolean;
  error: string | null;
}

function withoutKey<T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

/**
 * Local consent and refusal state per share id. A local "acknowledged" mark enables the row at once
 * instead of waiting for the list refresh; a 409 overrides any row state, since the server decides.
 * @complexity O(1) per action; two requests per download check at most, one per acknowledgement.
 */
export function useShareCredentialGate({ port, t, refresh, onDownloadError }: {
  port: SiteTransferPort; t: Translate; refresh: () => void; onDownloadError: (message: string) => void;
}, _options = {}) {
  const [acknowledged, setAcknowledged] = useState<ReadonlySet<string>>(() => new Set());
  const [refusals, setRefusals] = useState<Readonly<Record<string, ShareDownloadRefusal>>>({});
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ shareId: string; message: string } | null>(null);
  // The download the user already asked for (a static export's, or a refused click) runs once consent is saved.
  const pendingDownload = useRef<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  function credentialGate(share: SiteShare): CredentialGate | null {
    if (share.status !== "active") return null;
    const refusal = refusals[share.shareId];
    if (!refusal && (!share.needsAcknowledgement || acknowledged.has(share.shareId))) return null;
    return {
      warnings: refusal?.credentialWarnings.length ? refusal.credentialWarnings : share.credentialWarnings ?? [],
      message: refusal?.message ?? null,
      acknowledging: acknowledgingId === share.shareId,
      error: failure?.shareId === share.shareId ? failure.message : null,
    };
  }

  async function download(share: SiteShare) {
    const refusal = await port.shareDownloadRefusal({ share });
    if (!alive.current) return;
    if (!refusal) { port.downloadShare({ share }); return; }
    if (refusal.status !== 409) { onDownloadError(refusal.message ?? t("Download failed.")); return; }
    pendingDownload.current = share.shareId;
    setAcknowledged(previous => { const next = new Set(previous); next.delete(share.shareId); return next; });
    setRefusals(previous => ({ ...previous, [share.shareId]: refusal }));
  }

  /** A finished static export downloads itself; one still awaiting "I understand" waits for it. */
  async function downloadWhenAllowed(share: SiteShare) {
    if (share.needsAcknowledgement) { pendingDownload.current = share.shareId; return; }
    await download(share);
  }

  async function acknowledge(share: SiteShare) {
    if (acknowledgingId) return;
    setAcknowledgingId(share.shareId);
    setFailure(null);
    try {
      await port.acknowledgeShare({ shareId: share.shareId });
      if (!alive.current) return;
      setAcknowledged(previous => new Set(previous).add(share.shareId));
      setRefusals(previous => withoutKey(previous, share.shareId));
      if (pendingDownload.current === share.shareId) {
        pendingDownload.current = null;
        await download(share);
      }
    } catch (error) {
      if (alive.current) setFailure({ shareId: share.shareId, message: describeApiError(error, t("Couldn't save your answer. Try again.")) });
    } finally {
      if (alive.current) setAcknowledgingId(null);
      refresh();
    }
  }

  return { credentialGate, acknowledge, download, downloadWhenAllowed };
}

/** Distinct files (or database columns): one file may carry several kinds. O(n). */
export function credentialFileCount(warnings: readonly CredentialWarning[]): number {
  return new Set(warnings.map(warning => warning.path)).size;
}
