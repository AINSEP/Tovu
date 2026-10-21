import { act, fireEvent, waitFor } from "@testing-library/react";
import { render, screen } from "@/__tests__/fetch-query-render";
import { afterEach, describe, expect, it, vi } from "vitest";
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
 * undeclared actions are refused without a server call; answers never go to a navigated frame;
 * only server-issued https sign-in links are offered (new tab, no opener) and never reach the frame;
 * a surface's open-link opens only its declared https link origins (new tab, no opener), from this mount only.
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
async function mounted(port: AgentPluginSurfacesPort, surface: AgentPluginSurfaceSummary = SURFACE) {
  render(<AgentPluginSurfaceFrame pluginId="acme-office" surface={surface} port={port} t={identity} />);
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

function openLink(mountId: string, url: string) {
  return { protocol: "jini.admin-surface", version: 1, kind: "open-link", mountId, requestId: "link-1", url };
}

const LINKING: AgentPluginSurfaceSummary = { ...SURFACE, linkOrigins: ["https://accounts.acme.test"] };

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

  it("offers only the server's https sign-in links, as a new tab without opener, and keeps them out of the frame", async () => {
    const hostLink = { authorizationUrl: "https://auth.acme.test/authorize?state=s1", expiresAt: new Date(Date.now() + 60_000).toISOString() };
    const port = fakePort({ action: vi.fn<AgentPluginSurfacesPort["action"]>(async () => ({
      ok: true, result: { authorizationUrl: "https://evil.example/phish" },
      hostSignIns: [hostLink, { authorizationUrl: "javascript:alert(1)", expiresAt: hostLink.expiresAt }],
    })) });
    const { frameWindow, posted, init } = await mounted(port);
    deliver(request(init.mountId), "null", frameWindow);
    await waitFor(() => expect(posted).toHaveBeenCalledTimes(2));
    const links = screen.getAllByRole("link", { name: "Continue to sign-in" });
    expect(links.map((link) => [link.getAttribute("href"), link.getAttribute("target"), link.getAttribute("rel")])).toEqual([[hostLink.authorizationUrl, "_blank", "noopener noreferrer"]]);
    expect(posted.mock.calls[1]![0]).not.toHaveProperty("hostSignIns");
    fireEvent.click(links[0]!);
    expect(screen.queryByRole("link", { name: "Continue to sign-in" })).toBeNull();
  });

  it("never offers an expired sign-in link", async () => {
    const port = fakePort({ action: vi.fn<AgentPluginSurfacesPort["action"]>(async () => ({
      ok: true, result: { saved: true }, hostSignIns: [{ authorizationUrl: "https://auth.acme.test/authorize?state=old", expiresAt: new Date(Date.now() - 1).toISOString() }],
    })) });
    const { frameWindow, posted, init } = await mounted(port);
    deliver(request(init.mountId), "null", frameWindow);
    await waitFor(() => expect(posted).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("link", { name: "Continue to sign-in" })).toBeNull();
  });
});

describe("AgentPluginSurfaceFrame external links", () => {
  // A failed assertion must not leave window.open spied for the next test.
  afterEach(() => { vi.restoreAllMocks(); });

  it("opens a declared https link once, as a new tab without opener or referrer, and answers the frame", async () => {
    const opened = vi.spyOn(window, "open").mockImplementation(() => null);
    const port = fakePort();
    const { frameWindow, posted, init } = await mounted(port, LINKING);
    deliver(openLink(init.mountId, "https://accounts.acme.test/connections"), "null", frameWindow);
    await waitFor(() => expect(posted).toHaveBeenCalledTimes(2));
    expect(opened.mock.calls).toEqual([["https://accounts.acme.test/connections", "_blank", "noopener,noreferrer"]]);
    expect(posted.mock.calls[1]).toEqual([{ protocol: "jini.admin-surface", version: 1, kind: "action-response", mountId: init.mountId, requestId: "link-1", ok: true, result: null }, "*"]);
    expect(port.action).not.toHaveBeenCalled();
  });

  it("refuses an undeclared origin and a non-https link without opening anything", async () => {
    const opened = vi.spyOn(window, "open").mockImplementation(() => null);
    const { frameWindow, posted, init } = await mounted(fakePort(), LINKING);
    deliver(openLink(init.mountId, "https://evil.example/phish"), "null", frameWindow);
    await waitFor(() => expect(posted).toHaveBeenCalledTimes(2));
    deliver(openLink(init.mountId, "http://accounts.acme.test/connections"), "null", frameWindow);
    await waitFor(() => expect(posted).toHaveBeenCalledTimes(3));
    expect(posted.mock.calls.slice(1).map(([message]) => (message as { error: { code: string } }).error.code)).toEqual(["link-undeclared", "link-not-https"]);
    expect(opened).not.toHaveBeenCalled();
  });

  it("opens nothing for a surface that declares no link origins", async () => {
    const opened = vi.spyOn(window, "open").mockImplementation(() => null);
    const { frameWindow, posted, init } = await mounted(fakePort());
    deliver(openLink(init.mountId, "https://accounts.acme.test/connections"), "null", frameWindow);
    await waitFor(() => expect(posted).toHaveBeenCalledTimes(2));
    expect((posted.mock.calls[1]![0] as { error: { code: string } }).error.code).toBe("link-undeclared");
    expect(opened).not.toHaveBeenCalled();
  });

  it("ignores an open-link from the wrong window, origin or nonce", async () => {
    const opened = vi.spyOn(window, "open").mockImplementation(() => null);
    const { frameWindow, posted, init } = await mounted(fakePort(), LINKING);
    const url = "https://accounts.acme.test/connections";
    deliver(openLink(init.mountId, url), "null", window);
    deliver(openLink(init.mountId, url), "https://evil.example", frameWindow);
    deliver(openLink("0".repeat(32), url), "null", frameWindow);
    await act(async () => { await Promise.resolve(); });
    expect(opened).not.toHaveBeenCalled();
    expect(posted).toHaveBeenCalledTimes(1);
  });
});

describe("AgentPluginSurfaceFrame lifecycle and outcomes", () => {
  // The nonce test spies on crypto; a failed assertion must not leak that spy.
  afterEach(() => { vi.restoreAllMocks(); });

  it("shows the could-not-open notice instead of the frame when the bootstrap fails", async () => {
    const port = fakePort({ bootstrap: vi.fn<AgentPluginSurfacesPort["bootstrap"]>(async () => { throw new Error("401"); }) });
    render(<AgentPluginSurfaceFrame pluginId="acme-office" surface={SURFACE} port={port} t={identity} />);
    fireEvent.load(screen.getByTitle("Manage connection"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Could not open this view. Close and reopen the plugin to try again."));
    expect(screen.queryByTitle("Manage connection")).toBeNull();
  });

  it("ignores a message that arrives before the frame's first load, even a null-source one carrying this mount's nonce", async () => {
    // Zero random bytes make this mount's nonce predictable, so the message below would pass the
    // nonce check: only "no live frame yet" stops a null `source` from matching the missing frame.
    vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation((array) => array);
    const port = fakePort();
    render(<AgentPluginSurfaceFrame pluginId="acme-office" surface={SURFACE} port={port} t={identity} />);
    const iframe = screen.getByTitle("Manage connection") as HTMLIFrameElement;
    const posted = vi.spyOn(iframe.contentWindow!, "postMessage").mockImplementation(() => {});
    deliver(request("0".repeat(32)), "null", null);
    deliver(request("0".repeat(32)), "null", iframe.contentWindow);
    await act(async () => { await Promise.resolve(); });
    expect(port.action).not.toHaveBeenCalled();
    expect(posted).not.toHaveBeenCalled();
  });

  it("posts nothing when the view is closed before its bootstrap arrives", async () => {
    let resolve: (value: AdminSurfaceBootstrap) => void = () => {};
    const port = fakePort({ bootstrap: vi.fn<AgentPluginSurfacesPort["bootstrap"]>(() => new Promise((done) => { resolve = done; })) });
    const view = render(<AgentPluginSurfaceFrame pluginId="acme-office" surface={SURFACE} port={port} t={identity} />);
    const iframe = screen.getByTitle("Manage connection") as HTMLIFrameElement;
    const posted = vi.spyOn(iframe.contentWindow!, "postMessage").mockImplementation(() => {});
    fireEvent.load(iframe);
    view.unmount();
    await act(async () => { resolve(BOOTSTRAP); });
    expect(posted).not.toHaveBeenCalled();
  });

  it("hands the plugin's refusal to the frame as that request's error", async () => {
    const error = { code: "resource-missing", message: "Pick the file again.", retryable: false };
    const port = fakePort({ action: vi.fn<AgentPluginSurfacesPort["action"]>(async () => ({ ok: false, error })) });
    const { frameWindow, posted, init } = await mounted(port);
    deliver(request(init.mountId), "null", frameWindow);
    await waitFor(() => expect(posted).toHaveBeenCalledTimes(2));
    expect(posted.mock.calls[1]).toEqual([{ protocol: "jini.admin-surface", version: 1, kind: "action-response", mountId: init.mountId, requestId: "req-1", ok: false, error }, "*"]);
  });

  it("answers an unreachable server with the host's own retryable error, never the failure's text", async () => {
    const port = fakePort({ action: vi.fn<AgentPluginSurfacesPort["action"]>(async () => { throw new Error("ECONNRESET db=prod secret-path"); }) });
    const { frameWindow, posted, init } = await mounted(port);
    deliver(request(init.mountId), "null", frameWindow);
    await waitFor(() => expect(posted).toHaveBeenCalledTimes(2));
    expect((posted.mock.calls[1]![0] as { error: unknown }).error).toEqual({ code: "host-unavailable", message: "The admin page could not reach the server. Try again.", retryable: true });
  });

  it("never offers a sign-in link that is not a parseable URL", async () => {
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    const port = fakePort({ action: vi.fn<AgentPluginSurfacesPort["action"]>(async () => ({ ok: true, result: null, hostSignIns: [{ authorizationUrl: "not a url", expiresAt }] })) });
    const { frameWindow, posted, init } = await mounted(port);
    deliver(request(init.mountId), "null", frameWindow);
    await waitFor(() => expect(posted).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("link", { name: "Continue to sign-in" })).toBeNull();
  });
});

describe("AgentPluginDetailsModal admin surfaces", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("adds one view per contributed surface after Memory, titled by the plugin", async () => {
    const plugin: InspectedAgentPlugin = { id: "acme-office", displayName: "Acme Office" };
    const useDetails = (): AgentPluginDetailsModalController => ({ files: [], selectedFile: null, selectFile: vi.fn() });
    render(<AgentPluginDetailsModal plugin={plugin} t={identity} onClose={vi.fn()} useDetails={useDetails} surfacesPort={fakePort()} />);
    await waitFor(() => expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Package files", "Memory", "Manage connection"]));
  });

  it("lists surfaces through the admin API when no port is injected", async () => {
    // Recording fetch stub: the surfaces route answers one surface, the Memory tab its empty listing.
    vi.stubGlobal("fetch", async (url: string) => {
      const body = String(url).endsWith("/agent-plugins/acme-office/surfaces")
        ? { surfaces: [SURFACE] }
        : { pluginId: "acme-office", learned: [], notes: [], limits: { learned: 1048576, notes: 16384, files: 128 } };
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    });
    const plugin: InspectedAgentPlugin = { id: "acme-office", displayName: "Acme Office" };
    const useDetails = (): AgentPluginDetailsModalController => ({ files: [], selectedFile: null, selectFile: vi.fn() });
    render(<AgentPluginDetailsModal plugin={plugin} t={identity} onClose={vi.fn()} useDetails={useDetails} />);
    await waitFor(() => expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Package files", "Memory", "Manage connection"]));
  });
});

describe("AgentPluginSurfaceFrame sizing", () => {
  it("starts at 28rem and then follows the surface's reported content height", async () => {
    const { iframe, frameWindow, init } = await mounted(fakePort());
    expect(iframe.style.height).toBe("28rem");
    act(() => {
      window.dispatchEvent(new MessageEvent("message", {
        data: { protocol: "jini.admin-surface", version: 1, kind: "resize", mountId: init.mountId, height: 512 },
        origin: "null",
        source: frameWindow,
      }));
    });
    await waitFor(() => expect(iframe.style.height).toBe("512px"));
  });
});
