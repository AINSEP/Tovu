import { runInNewContext } from "node:vm";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Partial mock (`importOriginal`, same pattern `AssistantDock.hooks.unit.test.tsx` uses for
// `execution-settings`): every existing test in this file needs the REAL bundled projection to
// keep asserting real group ids, so only `createBundledComposerCapabilitySource` is wrapped in a
// `vi.fn` — spyable per-test via `mockReturnValueOnce`, calling through to the real implementation
// everywhere else.
vi.mock("../../../features/plugins/composer-capabilities", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../features/plugins/composer-capabilities")>();
  return {
    ...actual,
    createBundledComposerCapabilitySource: vi.fn(actual.createBundledComposerCapabilitySource),
  };
});

import {
  buildAssistantMcpUiSandboxProxyUrl,
  extractResumeCapableAgentIds,
  getResumeCapableAgentIds,
  openMcpUiLink,
  resetResumeCapableAgentIds,
  useComposerCapabilities,
  useRuntimeAccess,
} from "../hooks/AssistantDock.hooks";
import { FetchQueryProvider } from "@jini-ai/ui/fetch-query";
import {
  createBundledComposerCapabilitySource,
  emptyComposerCapabilityProjection,
} from "../../../features/plugins/composer-capabilities";

/**
 * @file Regression coverage for the 2026-08-21 owner decision to stop projecting the live
 * tool-catalog source into the composer's "/" and "+" menus (see `useComposerCapabilities`'s own
 * doc in `AssistantDock.hooks.tsx` for the full reasoning: the menu is for pointing the assistant
 * at a Skill or Agent Plugin, not for handing it a raw, non-resolving tool id).
 *
 * The former raw tool-catalog source was the dependency that called `fetch` — `fetch` never being
 * called is therefore direct proof the source is not in the projected list, not an inference from
 * the rendered groups. Before the fix (`AssistantDock.hooks.tsx` wiring
 * the raw tool-catalog source into the same `Promise.all` as the bundled source),
 * this test fails: `fetch` is called once for `/api/tools/search` and a `tool-catalog` group is
 * projected alongside the bundled ones.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useComposerCapabilities", () => {
  it("loads installed skills alongside bundled groups without exposing the raw tool catalog", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        skills: [{ toolId: "skill_incident_response", name: "incident-response", description: "Respond to outages.", enabled: true }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useComposerCapabilities());

    await waitFor(() => {
      expect(result.current.composerCapabilities.groups.length).toBeGreaterThan(0);
    });

    const groupIds = result.current.composerCapabilities.groups.map((group) => group.id);
    expect(groupIds).not.toContain("tool-catalog");
    expect(groupIds).toEqual(["regular-plugins", "agent-plugins", "mcp", "tools", "installed-skills"]);
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/v1/workspaces/workspace-local/skills", {
      credentials: "same-origin",
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: expect.any(AbortSignal),
    });
    expect(result.current.composerCapabilities.byItemId.has("installed-skill:skill_incident_response")).toBe(true);
    expect(result.current.composerCapabilities.byItemId.has("skill:ui-ux-design")).toBe(false);
  });

  it("falls back to the empty catalog and logs, rather than throwing, when the projection rejects", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(createBundledComposerCapabilitySource).mockReturnValueOnce({
      id: "bundled",
      list: () => Promise.reject(new Error("bad catalog")),
    });

    const { result } = renderHook(() => useComposerCapabilities());

    await waitFor(() =>
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[AssistantDock] composer capability projection failed",
        expect.any(Error),
      ),
    );
    expect(result.current.composerCapabilities).toEqual(emptyComposerCapabilityProjection());
    consoleErrorSpy.mockRestore();
  });

  it("ignores a nonempty projection from the cleaned-up effect after StrictMode remount", async () => {
    const capabilities = await createBundledComposerCapabilitySource().list();
    let resolveOld!: (value: typeof capabilities) => void;
    vi.mocked(createBundledComposerCapabilitySource)
      .mockReturnValueOnce({ id: "bundled", list: () => new Promise((resolve) => { resolveOld = resolve; }) })
      .mockReturnValueOnce({ id: "bundled", list: async () => [] });
    const { result } = renderHook(() => useComposerCapabilities(), {
      reactStrictMode: true,
    });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { resolveOld(capabilities); });
    expect(capabilities.length).toBeGreaterThan(0);
    expect(result.current.composerCapabilities).toEqual(emptyComposerCapabilityProjection());
  });

  it("does not update composerCapabilities after unmount, once a successful projection settles late", async () => {
    let resolveList!: (capabilities: readonly never[]) => void;
    vi.mocked(createBundledComposerCapabilitySource).mockReturnValueOnce({
      id: "bundled",
      list: () =>
        new Promise((resolve) => {
          resolveList = resolve;
        }),
    });

    const { result, unmount } = renderHook(() => useComposerCapabilities());
    unmount();
    await act(async () => {
      resolveList([]);
      await Promise.resolve();
    });

    expect(result.current.composerCapabilities).toEqual(emptyComposerCapabilityProjection());
  });
});

/**
 * @file Coverage for the transcript-duplication fix's plumbing: `useAssistantTransport`'s
 * `getResumeCapableAgentIds` option (`assistant-transport.ts`) has to be fed from SOMEWHERE, and
 * `GET /api/agents`'s `carriesOwnMemory` field (`apps/website/src/assistant/agents.ts`) is that
 * source. These pin the two halves: the pure projection, and that `useRuntimeAccess`'s
 * `listAgents`/`rescanAgents` actually keep the module-level set current as a side effect of the
 * SAME fetch `ChatPane`'s own agent picker already makes — not a second request.
 */
/**
 * @file Regression coverage for the MCP-UI sandbox-proxy admin-origin-authority fix (Codex
 * gpt-5.6-sol xhigh adversarial review, 2026-09-03). `@mcp-ui/client`'s `AppFrame` hardcodes
 * `sandbox="allow-scripts allow-same-origin allow-forms"` on the iframe it creates — before this fix,
 * `AssistantDock.tsx` pointed that iframe at `/mcp-ui/sandbox-proxy.html`, a route served from this
 * admin app's own origin, so any third-party MCP server's HTML written into it via the proxy's
 * `document.write` got this admin origin's real cookies, storage, and same-origin fetches.
 * `buildAssistantMcpUiSandboxProxyUrl` closes that by handing `AppFrame` a `data:` URL instead — a
 * `data:` URL's origin is opaque under the URL Standard regardless of `allow-same-origin` (verified
 * live against a real Chromium build — see this session's report and `@jini-ai/ui`'s `sandbox-proxy.ts`
 * module doc). This test would fail against the pre-fix `@jini-ai/ui` (no `buildSandboxProxyDataUrl`
 * export) and against the pre-fix `AssistantDock.tsx` (still building an `http(s):` same-origin URL).
 */
describe("buildAssistantMcpUiSandboxProxyUrl", () => {
  const hostOrigin = "https://admin.example.com";

  it("returns a data: URL, not a same-origin http(s) route — a data: URL's origin is always opaque", () => {
    const url = buildAssistantMcpUiSandboxProxyUrl(hostOrigin);
    expect(url.protocol).toBe("data:");
  });

  it("bakes the given host origin into the served script instead of trusting window.location.origin", () => {
    const url = buildAssistantMcpUiSandboxProxyUrl(hostOrigin);
    const encoded = url.href.slice(url.href.indexOf(",") + 1);
    const html = decodeURIComponent(encoded);
    expect(html).toContain(`var hostOrigin = ${JSON.stringify(hostOrigin)};`);
    expect(html).not.toContain("window.location.origin");
  });

  it("executes the proxy handshake with an exact host origin and ignores foreign senders", () => {
    const url = buildAssistantMcpUiSandboxProxyUrl(hostOrigin);
    const html = decodeURIComponent(url.href.slice(url.href.indexOf(",") + 1));
    const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
    const host = { postMessage: vi.fn() };
    const proxyDocument = { open: vi.fn(), write: vi.fn(), close: vi.fn() };
    let onMessage!: (event: { source: unknown; origin: string; data: unknown }) => void;
    runInNewContext(script, {
      window: { parent: host, addEventListener: (_type: string, listener: typeof onMessage) => { onMessage = listener; } },
      document: proxyDocument,
    });
    expect(host.postMessage).toHaveBeenCalledExactlyOnceWith(
      { method: "ui/notifications/sandbox-proxy-ready", params: {} }, hostOrigin,
    );

    const data = { method: "ui/notifications/sandbox-resource-ready", params: { html: "<p>trusted</p>" } };
    onMessage({ source: host, origin: "https://foreign.example", data });
    onMessage({ source: {}, origin: hostOrigin, data });
    expect(proxyDocument.open).not.toHaveBeenCalled();
    expect(proxyDocument.write).not.toHaveBeenCalled();
    expect(proxyDocument.close).not.toHaveBeenCalled();

    onMessage({ source: host, origin: hostOrigin, data });
    expect(proxyDocument.open).toHaveBeenCalledTimes(1);
    expect(proxyDocument.write).toHaveBeenCalledExactlyOnceWith("<p>trusted</p>");
    expect(proxyDocument.close).toHaveBeenCalledTimes(1);
  });
});

/**
 * @file Coverage for `openMcpUiLink` (S-G1b, generic MCP-UI chat card link handling — memory
 * `links_open_new_tab`). `useMcpUiHost`'s `onOpenLink` is omitted by default (`McpUiHostOptions`'s
 * own doc: "Omit and the Host refuses the request"), so before this fix a View's `ui/open-link`
 * request was silently refused — every link inside a rendered MCP-UI card was inert. This is the
 * callback `AssistantDock.tsx` now passes down through `OverflowAwareMcpUiSurfaceCard` ->
 * `McpUiSurfaceCard` -> `McpUiHost` -> `useMcpUiHost`.
 */
describe("openMcpUiLink", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens an https URL in a new, unreferrered tab", () => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);

    openMcpUiLink("https://example.com/docs");

    expect(openSpy).toHaveBeenCalledExactlyOnceWith("https://example.com/docs", "_blank", "noopener,noreferrer");
  });

  it("refuses a javascript: URL — a View cannot run script in this admin origin via a rendered link", () => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);

    openMcpUiLink("javascript:alert(document.cookie)");

    expect(openSpy).not.toHaveBeenCalled();
  });

  it.each([
    "http://example.com/docs",
    "data:text/html,<script>alert(1)</script>",
    "file:///tmp/private.txt",
    "blob:https://admin.example.com/1234",
  ])("refuses a non-https URL: %s", (url) => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    openMcpUiLink(url);
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("refuses an unparseable URL rather than throwing", () => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);

    expect(() => openMcpUiLink("not a url")).not.toThrow();
    expect(openSpy).not.toHaveBeenCalled();
  });

  // Owner 2026-10-08: every chat link opens a new tab, in-app links included. A View's `<a href="/admin/…">`
  // reaches this handler unresolved (the sandbox proxy is an opaque `data:` document with no base to
  // resolve against), so a root-relative path means this admin's own page.
  it("opens a root-relative in-app path from a View against this admin's own origin", () => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);

    openMcpUiLink("/admin/pages/x");

    expect(openSpy).toHaveBeenCalledExactlyOnceWith(`${window.location.origin}/admin/pages/x`, "_blank", "noopener,noreferrer");
  });

  it("refuses a protocol-relative URL — it names another host, not an in-app path", () => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);

    openMcpUiLink("//evil.example.com/x");

    expect(openSpy).not.toHaveBeenCalled();
  });
});

describe("extractResumeCapableAgentIds", () => {
  it("keeps only the agentIds whose carriesOwnMemory is exactly true", () => {
    const ids = extractResumeCapableAgentIds([
      { id: "claude", name: "Claude Code", carriesOwnMemory: true },
      { id: "qwen", name: "Qwen", carriesOwnMemory: false },
      { id: "vibe", name: "Vibe" },
    ]);
    expect(ids).toEqual(new Set(["claude"]));
  });
});

describe("useRuntimeAccess — resume-capable agentId tracking", () => {
  afterEach(() => {
    resetResumeCapableAgentIds();
  });

  it("listAgents() populates the module-level resume-capable set from the /api/agents response", async () => {
    expect(getResumeCapableAgentIds()).toEqual(new Set());
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        agents: [
          { id: "claude", name: "Claude Code", carriesOwnMemory: true },
          { id: "qwen", name: "Qwen", carriesOwnMemory: false },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useRuntimeAccess(), { wrapper: FetchQueryProvider });
    await result.current.listAgents();

    expect(getResumeCapableAgentIds()).toEqual(new Set(["claude"]));
  });

  it("rescanAgents() also refreshes the resume-capable set from its own response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ agents: [{ id: "codex", name: "Codex", carriesOwnMemory: true }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useRuntimeAccess(), { wrapper: FetchQueryProvider });
    await result.current.rescanAgents();

    expect(getResumeCapableAgentIds()).toEqual(new Set(["codex"]));
  });

  it("a failed rescan falls back to listAgents() — the resume-capable set still comes from a real response, not stale", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ agents: [{ id: "amr", name: "AMR", carriesOwnMemory: true }] }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useRuntimeAccess(), { wrapper: FetchQueryProvider });
    await result.current.rescanAgents();

    expect(getResumeCapableAgentIds()).toEqual(new Set(["amr"]));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/agents/rescan", expect.objectContaining({ method: "POST", credentials: "same-origin" }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/agents", expect.objectContaining({ method: "GET", credentials: "same-origin" }));
  });
});
