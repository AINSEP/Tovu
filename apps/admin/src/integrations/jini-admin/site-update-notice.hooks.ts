import { useEffect, useRef, useState } from "react";
import type { SiteUpdateStatusReply } from "@jini-ai/core/contracts/site/devops-deploy";

/** One status read for a workspace; the signal cancels it when the shell identity changes. */
export type ReadSiteUpdateStatus = (required: { workspaceId: string }, optional?: { signal?: AbortSignal | undefined }) => Promise<SiteUpdateStatusReply>;

/**
 * -> the site-update status for the signed-in principal in this workspace, or null until it is known.
 * One check per mounted principal/workspace, no polling. On an identity change the old request is
 * aborted and its status is no longer returned, even when a client ignores the abort and resolves late.
 * @complexity One request per identity.
 */
export function useTovuSiteUpdateStatus(
  required: { workspaceId: string; principalId: string; readStatus: ReadSiteUpdateStatus },
  _optional: Record<string, never> = {},
): SiteUpdateStatusReply | null {
  const { workspaceId, principalId } = required;
  // The latest client, without making a new function identity start another check.
  const readStatus = useRef(required.readStatus);
  readStatus.current = required.readStatus;
  const identity = JSON.stringify([principalId, workspaceId]);
  const [settled, setSettled] = useState<{ identity: string; status: SiteUpdateStatusReply } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    readStatus.current({ workspaceId }, { signal: controller.signal }).then(
      (status) => { if (!controller.signal.aborted) setSettled({ identity, status }); },
      // A failed background check stays quiet: the assistant's check tool is where an owner asks.
      () => undefined,
    );
    return () => controller.abort();
  }, [identity, workspaceId]);
  // A status belongs to the identity it was read for; another principal or workspace never sees it.
  return settled !== null && settled.identity === identity ? settled.status : null;
}
