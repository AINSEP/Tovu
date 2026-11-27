import userEvent from "@testing-library/user-event";
import { act, cleanup, render, screen } from "@/__tests__/render-with-jini-kits";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SiteUpdateStatusReply } from "@jini-ai/core/contracts/site/devops-deploy";
import { readTovuSiteUpdateStatus, siteUpdateNoticeSlot, TovuSiteUpdateNotice } from "../site-update-notice";
import { useTovuSiteUpdateStatus, type ReadSiteUpdateStatus } from "../site-update-notice.hooks";

/** @file The shell's site-update notice: one check per signed-in identity, never another identity's status. */

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

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

it("leaves a failed background check quiet and checks again for a new workspace", async () => {
  const readStatus = vi.fn<ReadSiteUpdateStatus>()
    .mockRejectedValueOnce(new Error("Release feed temporarily unavailable"))
    .mockResolvedValueOnce(AVAILABLE);
  const useSiteUpdateStatusHook: typeof useTovuSiteUpdateStatus = (required) => useTovuSiteUpdateStatus({ ...required, readStatus });
  const view = (workspaceId: string) =>
    <TovuSiteUpdateNotice workspaceId={workspaceId} principalId="operator" locale="en" useSiteUpdateStatusHook={useSiteUpdateStatusHook} />;
  const { rerender } = render(view("offline"));
  await act(async () => {});
  expect(readStatus).toHaveBeenCalledExactlyOnceWith({ workspaceId: "offline" }, { signal: expect.any(AbortSignal) });
  expect(screen.queryByText(/is available\. This site runs/)).toBeNull();

  rerender(view("online"));
  expect(await screen.findByText(NOTICE)).toBeInTheDocument();
  expect(readStatus).toHaveBeenLastCalledWith({ workspaceId: "online" }, { signal: expect.any(AbortSignal) });
});

it("does not check status before sign-in, even when stale permissions include system.read", () => {
  const client = abortIgnoringClient();
  const { container } = render(<>{siteUpdateNoticeSlot({
    user: null, effectivePermissions: ["system.read"], workspaceId: "ws-a", locale: "en",
    useSiteUpdateStatusHook: client.useSiteUpdateStatusHook,
  })}</>);
  expect(container).toBeEmptyDOMElement();
  expect(client.readStatus).not.toHaveBeenCalled();
});

it.each([true, false])("reads the encoded workspace as JSON with caller signal supplied: %s", async (withSignal) => {
  const path = "/api/admin/v1/workspaces/work%2Fspace/system/site-update/status";
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    if (input === path && init?.method === "GET") return Response.json(AVAILABLE);
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal("fetch", fetch);
  const controller = new AbortController();
  const reply = withSignal
    ? await readTovuSiteUpdateStatus({ workspaceId: "work/space" }, { signal: controller.signal })
    : await readTovuSiteUpdateStatus({ workspaceId: "work/space" });
  expect(reply).toEqual(AVAILABLE);
  expect(fetch).toHaveBeenCalledExactlyOnceWith(path, expect.objectContaining({
    method: "GET", credentials: "same-origin",
    signal: withSignal ? controller.signal : expect.any(AbortSignal),
  }));
  if (withSignal) expect(fetch.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
});

it("rejects a non-JSON success page rather than showing its contents as update status", async () => {
  vi.stubGlobal("fetch", vi.fn<typeof globalThis.fetch>(async () =>
    new Response("<html>Proxy sign-in</html>", { headers: { "content-type": "text/html" } }),
  ));
  await expect(readTovuSiteUpdateStatus({ workspaceId: "ws-a" })).rejects.toMatchObject({ name: "SyntaxError" });
});

it("shows translated versions and release notes in the requested locale", async () => {
  const user = userEvent.setup();
  const status: SiteUpdateStatusReply = {
    availability: { kind: "available", runningVersion: "4.2.1", latest: "4.3.0", notes: "Versión con correcciones." },
  };
  const useStatus = vi.fn<typeof useTovuSiteUpdateStatus>().mockReturnValue(status);
  render(<TovuSiteUpdateNotice workspaceId="docs-workspace" principalId="owner-5" locale="es" useSiteUpdateStatusHook={useStatus} />);

  expect(useStatus).toHaveBeenCalledExactlyOnceWith({
    workspaceId: "docs-workspace", principalId: "owner-5", readStatus: readTovuSiteUpdateStatus,
  });
  expect(screen.getByText("La versión 4.3.0 del software del sitio está disponible. Este sitio usa 4.2.1.")).toBeInTheDocument();
  const summary = screen.getByText("Qué ha cambiado", { selector: "summary" });
  const details = summary.closest("details");
  expect(details).not.toHaveAttribute("open");
  await user.click(summary);
  expect(details).toHaveAttribute("open");
  expect(screen.getByText("Versión con correcciones.")).toBeInTheDocument();
});
