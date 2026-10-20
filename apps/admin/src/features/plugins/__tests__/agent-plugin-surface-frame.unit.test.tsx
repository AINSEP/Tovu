import { act, fireEvent, waitFor } from "@testing-library/react";
import { render, screen } from "@/__tests__/fetch-query-render";
import { describe, expect, it, vi } from "vitest";
import type { AdminSurfaceActionOutcome, AdminSurfaceBootstrap } from "@jini-ai/agent-plugins/admin-surfaces";
import { AgentPluginSurfaceFrame } from "../AgentPluginSurfaceFrame";
import { AgentPluginDetailsModal } from "../AgentPluginDetailsModal";
import type { AgentPluginDetailsModalController } from "../hooks/use-agent-plugin-details-modal.hooks";
import type { AgentPluginSurfacesPort, AgentPluginSurfaceSummary } from "../hooks/agent-plugin-surfaces-port.hooks";
import type { InspectedAgentPlugin } from "../hooks/use-agent-plugins.hooks";

/**
 * @file Security pins for the host page's admin-surface mount (phase A): the frame is sandboxed with
 * scripts only; `init` (carrying the bootstrap) is posted once, only into the frame's first
 * document; the message gate ignores anything not from this mount's frame, origin and nonce;
 * undeclared actions are refused without a server call; answers never go to a navigated frame.
 * Plus the modal tab that mounts a contributed surface. Typed fake port, acme-style ids.
 */

const SURFACE: AgentPluginSurfaceSummary = {
  id: "connection-settings",
  title: "Manage connection",
  src: "/api/agent-plugin-surfaces/v1/acme-office/connection-settings/surface/index.html",
  actions: [{ name: "save-selection", input: { type: "object", properties: { resourceId: { type: "string" } }, required: ["resourceId"] } }],
};
const BOOTSTRAP: AdminSurfaceBootstrap = { surfaceId: SURFACE.id, issuedAt: 1, expiresAt: 2, data: { publicConfig: "x" } };
const identity = (key: string) => key;

function fakePort(overrides: Partial<AgentPluginSurfacesPort> = {}) {
  const port = {
    list: vi.fn<AgentPluginSurfacesPort["list"]>(async () => ({ surfaces: [SURFACE] })),
    bootstrap: vi.fn<AgentPluginSurfacesPort["bootstrap"]>(async () => BOOTSTRAP),
    action: vi.fn<AgentPluginSurfacesPort["action"]>(async (): Promise<AdminSurfaceActionOutcome> => ({ ok: true, result: { saved: true } })),
    ...overrides,
  };
  return port;
}

/** Renders the frame, fires its first load and returns the frame window's postMessage spy and the mount nonce. */
async function mounted(port: AgentPluginSurfacesPort) {
  render(<AgentPluginSurfaceFrame pluginId="acme-office" surface={SURFACE} port={port} t={identity} />);
  const iframe = screen.getByTitle("Manage connection") as HTMLIFrameElement;
  const frameWindow = iframe.contentWindow!;
  const posted = vi.spyOn(frameWindow, "postMessage").mockImplementation(() => {});
  fireEvent.load(iframe);
  await waitFor(() => expect(posted).toHaveBeenCalledTimes(1));
  const init = posted.mock.calls[0]![0] as { kind: string; mountId: string; bootstrap: AdminSurfaceBootstrap };
  return { iframe, frameWindow, posted, init };
}

function request(mountId: string, action = "save-selection", payload: unknown = { resourceId: "r1" }) {
  return { protocol: "jini.admin-surface", version: 1, kind: "action-request", mountId, requestId: "req-1", action, payload };
}

function deliver(data: unknown, origin: string, source: Window | null) {
  act(() => { window.dispatchEvent(new MessageEvent("message", { data, origin, source })); });
}

describe("AgentPluginSurfaceFrame", () => {
  it("renders the frame with sandbox exactly allow-scripts and no referrer", () => {
    render(<AgentPluginSurfaceFrame pluginId="acme-office" surface={SURFACE} port={fakePort()} t={identity} />);
    const iframe = screen.getByTitle("Manage connection");
    expect(iframe.getAttribute("sandbox")).toBe("allow-scripts");
    expect(iframe.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(iframe.getAttribute("src")).toBe(SURFACE.src);
  });

  it("posts init with the bootstrap and a fresh nonce once, after the first load", async () => {
    const port = fakePort();
    const { init } = await mounted(port);
    expect(init.kind).toBe("init");
    expect(init.mountId).toMatch(/^[0-9a-f]{32}$/);
    expect(init.bootstrap).toEqual(BOOTSTRAP);
    expect(port.bootstrap).toHaveBeenCalledWith({ pluginId: "acme-office", surfaceId: SURFACE.id });
  });

  it("unmounts a frame that loads a second time and never re-sends init", async () => {
    const port = fakePort();
    const { iframe, posted } = await mounted(port);
    fireEvent.load(iframe);
    expect(screen.queryByTitle("Manage connection")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("left its page");
    expect(posted).toHaveBeenCalledTimes(1);
    expect(port.bootstrap).toHaveBeenCalledTimes(1);
  });

  it("does not post a bootstrap that arrives after the frame navigated", async () => {
    let resolve: (value: AdminSurfaceBootstrap) => void = () => {};
    const port = fakePort({ bootstrap: vi.fn<AgentPluginSurfacesPort["bootstrap"]>(() => new Promise((done) => { resolve = done; })) });
    render(<AgentPluginSurfaceFrame pluginId="acme-office" surface={SURFACE} port={port} t={identity} />);
    const iframe = screen.getByTitle("Manage connection") as HTMLIFrameElement;
    const posted = vi.spyOn(iframe.contentWindow!, "postMessage").mockImplementation(() => {});
    fireEvent.load(iframe);
    fireEvent.load(iframe);
    await act(async () => { resolve(BOOTSTRAP); });
    expect(posted).not.toHaveBeenCalled();
  });

  it("ignores messages from the wrong origin, the wrong window or with the wrong nonce", async () => {
    const port = fakePort();
    const { frameWindow, posted, init } = await mounted(port);
    deliver(request(init.mountId), "https://evil.example", frameWindow);
    deliver(request(init.mountId), "null", window);
    deliver(request("0".repeat(32)), "null", frameWindow);
    expect(port.action).not.toHaveBeenCalled();
    expect(posted).toHaveBeenCalledTimes(1);
  });

  it("forwards this mount's valid request and posts the answer back with its request id", async () => {
    const port = fakePort();
    const { frameWindow, posted, init } = await mounted(port);
    deliver(request(init.mountId), "null", frameWindow);
    await waitFor(() => expect(posted).toHaveBeenCalledTimes(2));
    expect(port.action).toHaveBeenCalledWith({ pluginId: "acme-office", surfaceId: SURFACE.id, action: "save-selection", payload: { resourceId: "r1" } });
    expect(posted.mock.calls[1]).toEqual([{ protocol: "jini.admin-surface", version: 1, kind: "action-response", mountId: init.mountId, requestId: "req-1", ok: true, result: { saved: true } }, "*"]);
  });

  it("refuses an undeclared action without calling the server", async () => {
    const port = fakePort();
    const { frameWindow, posted, init } = await mounted(port);
    deliver(request(init.mountId, "delete-everything", {}), "null", frameWindow);
    expect(port.action).not.toHaveBeenCalled();
    expect((posted.mock.calls[1]![0] as { ok: boolean; error: { code: string } }).error.code).toBe("action-undeclared");
  });

  it("does not post an answer that arrives after the frame navigated", async () => {
    let resolve: (value: AdminSurfaceActionOutcome) => void = () => {};
    const port = fakePort({ action: vi.fn<AgentPluginSurfacesPort["action"]>(() => new Promise((done) => { resolve = done; })) });
    const { iframe, frameWindow, posted, init } = await mounted(port);
    deliver(request(init.mountId), "null", frameWindow);
    fireEvent.load(iframe);
    await act(async () => { resolve({ ok: true, result: { saved: true } }); });
    expect(posted).toHaveBeenCalledTimes(1);
  });
});

describe("AgentPluginDetailsModal admin surfaces", () => {
  it("adds one view per contributed surface after Memory, titled by the plugin", async () => {
    const plugin: InspectedAgentPlugin = { id: "acme-office", displayName: "Acme Office" };
    const useDetails = (): AgentPluginDetailsModalController => ({ files: [], selectedFile: null, selectFile: vi.fn() });
    render(<AgentPluginDetailsModal plugin={plugin} t={identity} onClose={vi.fn()} useDetails={useDetails} surfacesPort={fakePort()} />);
    await waitFor(() => expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Package files", "Memory", "Manage connection"]));
  });
});
