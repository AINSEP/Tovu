import { act, cleanup, render, screen } from "@/__tests__/render-with-jini-kits";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SiteUpdateStatusReply } from "@jini-ai/core/contracts/site/devops-deploy";
import { siteUpdateNoticeSlot, TovuSiteUpdateNotice } from "../site-update-notice";
import { useTovuSiteUpdateStatus, type ReadSiteUpdateStatus } from "../site-update-notice.hooks";

/** @file The shell's site-update notice: one check per signed-in identity, never another identity's status. */

afterEach(() => cleanup());

const AVAILABLE: SiteUpdateStatusReply = { availability: { kind: "available", runningVersion: "1.2.0", latest: "1.3.0", notes: "" } };
const CURRENT: SiteUpdateStatusReply = { availability: { kind: "current", runningVersion: "1.3.0" } };
const NOTICE = /Version 1\.3\.0 of the site software is available\. This site runs 1\.2\.0\./;

/** A status client that never honours abort, so only the hook can discard a late answer. */
function abortIgnoringClient() {
  const calls: { workspaceId: string; signal: AbortSignal | undefined; resolve: (status: SiteUpdateStatusReply) => void }[] = [];
  const readStatus = vi.fn<ReadSiteUpdateStatus>(({ workspaceId }, optional = {}) => new Promise((resolve) => {
    calls.push({ workspaceId, signal: optional.signal, resolve });
  }));
  const useSiteUpdateStatusHook: typeof useTovuSiteUpdateStatus = (required) => useTovuSiteUpdateStatus({ ...required, readStatus });
  return { calls, readStatus, useSiteUpdateStatusHook };
}

const settle = async (resolve: () => void) => { await act(async () => { resolve(); await Promise.resolve(); }); };

describe("TovuSiteUpdateNotice", () => {
  it("a status response for the previous principal or workspace cannot show a notice", async () => {
    const client = abortIgnoringClient();
    const view = (principalId: string, workspaceId: string) => (
      <TovuSiteUpdateNotice workspaceId={workspaceId} principalId={principalId} locale="en" useSiteUpdateStatusHook={client.useSiteUpdateStatusHook} />
    );
    const { rerender } = render(view("owner-1", "ws-a"));
    await settle(() => client.calls[0]!.resolve(AVAILABLE));
    expect(screen.getByText(NOTICE)).toBeTruthy();

    // A new principal: the old status is gone at once, before its own check answers.
    rerender(view("owner-2", "ws-a"));
    expect(screen.queryByText(NOTICE)).toBeNull();
    expect(client.calls[0]!.signal?.aborted).toBe(true);

    // A new workspace: the previous identity's answer arriving late still shows nothing.
    rerender(view("owner-2", "ws-b"));
    expect(client.calls[1]!.signal?.aborted).toBe(true);
    await settle(() => client.calls[1]!.resolve(AVAILABLE));
    expect(screen.queryByText(NOTICE)).toBeNull();
    await settle(() => client.calls[2]!.resolve(CURRENT));
    expect(screen.queryByText(NOTICE)).toBeNull();
    expect(client.calls.map((call) => call.workspaceId)).toEqual(["ws-a", "ws-a", "ws-b"]);
  });

  it("no notice is mounted while permissions are still unknown", async () => {
    const client = abortIgnoringClient();
    const slot = (effectivePermissions: readonly string[] | undefined) => siteUpdateNoticeSlot({
      user: { id: "owner-1" }, effectivePermissions, workspaceId: "ws-a", locale: "en", useSiteUpdateStatusHook: client.useSiteUpdateStatusHook,
    });

    const unknown = render(<>{slot(undefined)}</>);
    expect(client.readStatus).not.toHaveBeenCalled();
    expect(screen.queryByText(NOTICE)).toBeNull();
    unknown.unmount();

    render(<>{slot([])}</>);
    expect(client.readStatus).not.toHaveBeenCalled();
    cleanup();

    // Control: a loaded `system.read` grant mounts the notice and makes exactly one check.
    render(<>{slot(["system.read"])}</>);
    expect(client.readStatus).toHaveBeenCalledTimes(1);
    await settle(() => client.calls[0]!.resolve(AVAILABLE));
    expect(screen.getByText(NOTICE)).toBeTruthy();
  });
});
