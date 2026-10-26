import { runInNewContext } from "node:vm";
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useChatPaneRuntimeInventory, type ChatPaneAgent } from "@jini-ai/chat/react";

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
import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import { SKILLS_CHANGED_EVENT } from "@/features/skills/api";
import { publishAssistantDockState, resetAssistantDockBus } from "@/lib/assistant-dock-bus";
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
  resetAssistantDockBus();
});

describe("useComposerCapabilities", () => {
  it("refreshes on open/focus/visible/explicit changes, has no idle poll and cleans up listeners", async () => {
    vi.useFakeTimers();
    const focus = vi.spyOn(document, "hasFocus").mockReturnValue(true);
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ skills: [] }) });
    vi.stubGlobal("fetch", fetchMock);
    const { unmount } = renderHook(() => useComposerCapabilities());
    const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });
    try {
      await flush();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await act(async () => { await vi.advanceTimersByTimeAsync(600_000); });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      act(() => window.dispatchEvent(new Event("focus")));
      await flush();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      focus.mockReturnValue(false);
      act(() => document.dispatchEvent(new Event("visibilitychange")));
      await flush();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      focus.mockReturnValue(true);
      visibility.mockReturnValue("hidden");
      act(() => document.dispatchEvent(new Event("visibilitychange")));
      await flush();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      visibility.mockReturnValue("visible");
      act(() => document.dispatchEvent(new Event("visibilitychange")));
      await flush();
      expect(fetchMock).toHaveBeenCalledTimes(3);
      act(() => window.dispatchEvent(new Event(SKILLS_CHANGED_EVENT)));
      await flush();
      expect(fetchMock).toHaveBeenCalledTimes(4);
      act(() => publishAssistantDockState(true));
      await flush();
      expect(fetchMock).toHaveBeenCalledTimes(5);
      act(() => publishAssistantDockState(false));
      await flush();
      expect(fetchMock).toHaveBeenCalledTimes(5);
      unmount();
      publishAssistantDockState(true);
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new Event(SKILLS_CHANGED_EVENT));
      document.dispatchEvent(new Event("visibilitychange"));
      await flush();
      expect(fetchMock).toHaveBeenCalledTimes(5);
    } finally {
      unmount();
      focus.mockRestore();
      visibility.mockRestore();
      vi.useRealTimers();
    }
  });

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

describe("runtime inventory — shared loader and pending retry integration", () => {
  const base = Date.parse("2026-10-18T12:00:00Z");
  const pending: ChatPaneAgent = {
    id: "antigravity", name: "Antigravity", discoveryPending: true,
    models: [{ id: "previous-model", label: "Previous model" }],
  };
  const completed: ChatPaneAgent = {
    ...pending, discoveryPending: false,
    models: [{ id: "gemini-4-argon-high", label: "Gemini 4 Argon High" }],
    modelCatalog: { source: "cli", freshness: "fresh", coverage: "account", fetchedAt: new Date(base).toISOString(),
      expiresAt: new Date(base + 60 * 60_000).toISOString(), launchFingerprint: "agy-test" },
  };

  /** Keeps both production owners real: the pane retry hook and Tovu's boot-scoped loader. */
  function InventoryPane({ name }: { name: string }) {
    const access = useRuntimeAccess();
    const { agents } = useChatPaneRuntimeInventory({ access, pollIntervalMs: 60_000 });
    return <output data-testid={name}>{agents[0]?.models?.[0]?.id}</output>;
  }

  /** Only the HTTP boundary is faked; completion depends on elapsed server discovery time. */
  function installDiscoveryResponse({ completesAt }: { completesAt: number }) {
    vi.useFakeTimers();
    vi.setSystemTime(base);
    const inventoryGet = vi.fn(async () => new Response(JSON.stringify({
      agents: [Date.now() >= base + completesAt ? completed : pending],
    })));
    vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
      if (url === "/api/agents" && init?.method === "GET") return inventoryGet();
      if (url === "/api/agents" && init?.method === undefined) return Promise.resolve(new Response("{}"));
      throw new Error(`Unexpected request: ${init?.method} ${url}`);
    }));
    return inventoryGet;
  }

  afterEach(() => {
    vi.useRealTimers();
    resetResumeCapableAgentIds();
  });

  it.each([
    { completesAt: 9_000, displayedAt: 37_000 },
    { completesAt: 75_000, displayedAt: 97_000 },
    { completesAt: 14 * 60_000, displayedAt: 15 * 60_000 },
  ])("automatically displays a catalog completed at $completesAt ms in both readers", async ({ completesAt, displayedAt }) => {
    const inventoryGet = installDiscoveryResponse({ completesAt });
    const view = render(<FetchQueryProvider><InventoryPane name="first" /><InventoryPane name="second" /></FetchQueryProvider>);
    await act(async () => {});
    expect(screen.getByTestId("first")).toHaveTextContent("previous-model");
    expect(inventoryGet).toHaveBeenCalledTimes(1);

    // These are eligible GET times, including the loader's 30s cooldown after its short backoff.
    let elapsed = 0;
    for (const due of [1_000, 3_000, 7_000, 37_000, 67_000, 97_000, 157_000, 277_000, 517_000, 900_000]) {
      if (due > displayedAt) break;
      const requests = inventoryGet.mock.calls.length;
      await act(async () => vi.advanceTimersByTime(due - elapsed - 1));
      expect(inventoryGet).toHaveBeenCalledTimes(requests);
      await act(async () => vi.advanceTimersByTime(1));
      expect(inventoryGet).toHaveBeenCalledTimes(requests + 1);
      elapsed = due;
    }

    expect(screen.getByTestId("first")).toHaveTextContent("gemini-4-argon-high");
    expect(screen.getByTestId("second")).toHaveTextContent("gemini-4-argon-high");
    const requests = inventoryGet.mock.calls.length;
    await act(async () => vi.advanceTimersByTime(60_000));
    expect(inventoryGet).toHaveBeenCalledTimes(requests);
    view.unmount();
  });

  it("remounts during a pending cooldown and displays completion with one GET when eligible", async () => {
    const inventoryGet = installDiscoveryResponse({ completesAt: 9_000 });
    const view = render(<FetchQueryProvider><InventoryPane name="first" /></FetchQueryProvider>);
    await act(async () => {});
    for (const delay of [1_000, 2_000, 4_000]) {
      await act(async () => vi.advanceTimersByTime(delay));
    }
    expect(inventoryGet).toHaveBeenCalledTimes(4);
    view.rerender(<FetchQueryProvider>{null}</FetchQueryProvider>);
    await act(async () => vi.advanceTimersByTime(1_000));
    view.rerender(<FetchQueryProvider><InventoryPane name="remounted" /><InventoryPane name="second" /></FetchQueryProvider>);
    await act(async () => {});
    expect(screen.getByTestId("remounted")).toHaveTextContent("previous-model");
    expect(inventoryGet).toHaveBeenCalledTimes(4);
    await act(async () => vi.advanceTimersByTime(28_999));
    expect(inventoryGet).toHaveBeenCalledTimes(4);
    await act(async () => vi.advanceTimersByTime(1));
    expect(inventoryGet).toHaveBeenCalledTimes(5);
    expect(screen.getByTestId("remounted")).toHaveTextContent("gemini-4-argon-high");
    expect(screen.getByTestId("second")).toHaveTextContent("gemini-4-argon-high");
    view.unmount();
  });

  it("stops permanently pending discovery after the finite window despite focus and health events", async () => {
    const inventoryGet = installDiscoveryResponse({ completesAt: Infinity });
    const view = render(<FetchQueryProvider><InventoryPane name="first" /></FetchQueryProvider>);
    await act(async () => {});
    let elapsed = 0;
    for (const due of [1_000, 3_000, 7_000, 37_000, 67_000, 97_000, 157_000, 277_000, 517_000, 900_000]) {
      await act(async () => vi.advanceTimersByTime(due - elapsed));
      elapsed = due;
    }
    expect(inventoryGet).toHaveBeenCalledTimes(11);
    await act(async () => vi.advanceTimersByTime(30 * 60_000));
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await act(async () => vi.advanceTimersByTime(60_000));
    expect(inventoryGet).toHaveBeenCalledTimes(11);
    expect(screen.getByTestId("first")).toHaveTextContent("previous-model");
    view.unmount();
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

  it("listAgents() refreshes pending discovery to the live catalog and caches the completed inventory", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-18T12:00:00Z"));
    try {
      const fallback: ChatPaneAgent = {
        id: "codex", name: "Codex", discoveryPending: true,
        models: [{ id: "gpt-5", label: "GPT-5" }],
      };
      const discovered: ChatPaneAgent = {
        id: "codex", name: "Codex", discoveryPending: false,
        models: [{ id: "gpt-6.1-sol", label: "GPT-6.1 Sol" }],
        modelCatalog: {
          source: "cli", freshness: "fresh", coverage: "account",
          fetchedAt: "2026-10-18T12:00:00Z", expiresAt: "2026-10-18T13:00:00Z",
          launchFingerprint: "codex-test",
        },
      };
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ agents: [fallback] }) })
        .mockResolvedValue({ ok: true, json: async () => ({ agents: [discovered] }) });
      vi.stubGlobal("fetch", fetchMock);
      const { result, rerender } = renderHook(() => useRuntimeAccess(), { wrapper: FetchQueryProvider });

      const initial = await result.current.listAgents();
      expect(initial.find(agent => agent.id === "codex")?.discoveryPending).toBe(true);
      expect(initial.find(agent => agent.id === "codex")?.modelCatalog).toBeUndefined();

      vi.setSystemTime(new Date("2026-10-18T12:00:00.999Z"));
      expect(await result.current.listAgents()).toEqual([fallback]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      vi.setSystemTime(new Date("2026-10-18T12:00:01Z"));
      const refreshed = await result.current.listAgents();
      expect(refreshed.find(agent => agent.id === "codex")?.modelCatalog).toEqual(discovered.modelCatalog);
      expect(refreshed.find(agent => agent.id === "codex")?.models).toContainEqual({ id: "gpt-6.1-sol", label: "GPT-6.1 Sol" });
      expect(refreshed.find(agent => agent.id === "codex")?.discoveryPending).toBe(false);

      rerender();
      for (let read = 0; read < 3; read += 1) {
        expect(await result.current.listAgents()).toEqual([discovered]);
      }
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/agents", expect.objectContaining({ method: "GET" }));
    } finally {
      vi.useRealTimers();
    }
  });

  it("a failed refresh of a cached inventory keeps the cached list and retries no sooner than 30 seconds later", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const base = Date.parse("2026-10-18T12:00:00Z");
    vi.setSystemTime(base);
    const known = { id: "claude", name: "Claude Code", discoveryPending: false };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ agents: [known] }), { headers: { "Content-Type": "application/json" } }))
      .mockResolvedValue(new Response(JSON.stringify({ error: "daemon down" }), { status: 503, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const { result } = renderHook(() => useRuntimeAccess(), { wrapper: FetchQueryProvider });
      expect(await result.current.listAgents()).toEqual([known]);
      const staleAt = base + 15 * 60_000;
      expect(result.current.getAgentsRefreshAt?.()).toBe(staleAt);

      vi.setSystemTime(staleAt);
      await expect(result.current.listAgents()).rejects.toThrow(/503/);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      // The failure moved the cached list's deadline to the retry window instead of leaving it due.
      expect(result.current.getAgentsRefreshAt?.()).toBe(staleAt + 30_000);

      vi.setSystemTime(staleAt + 29_999);
      expect(await result.current.listAgents()).toEqual([known]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("an unparsable model-catalog expiry falls back to the inventory's own deadline instead of poisoning it", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const base = Date.parse("2026-10-18T12:00:00Z");
    vi.setSystemTime(base);
    const agent: ChatPaneAgent = {
      id: "codex", name: "Codex", discoveryPending: false,
      modelCatalog: { source: "cli", freshness: "fresh", coverage: "account", fetchedAt: new Date(base).toISOString(),
        expiresAt: "not-a-timestamp", launchFingerprint: "test" },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ agents: [agent] }), { headers: { "Content-Type": "application/json" } })));
    try {
      const { result } = renderHook(() => useRuntimeAccess(), { wrapper: FetchQueryProvider });
      expect(await result.current.listAgents()).toEqual([agent]);
      expect(result.current.getAgentsRefreshAt?.()).toBe(base + 15 * 60_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it("identical pending responses retain their backoff across immediate TanStack reads", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const base = Date.parse("2026-10-18T12:00:00Z");
    vi.setSystemTime(base);
    const pending = { id: "codex", name: "Codex", discoveryPending: true };
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ agents: [pending] }))));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const { result } = renderHook(() => useRuntimeAccess(), { wrapper: FetchQueryProvider });
      expect(await result.current.listAgents()).toEqual([pending]);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      for (const [due, nextDue, requests] of [[1_000, 3_000, 2], [3_000, 7_000, 3], [7_000, 37_000, 4]] as const) {
        vi.setSystemTime(base + due);
        expect(await result.current.listAgents()).toEqual([pending]);
        expect(await result.current.listAgents()).toEqual([pending]);
        expect(fetchMock).toHaveBeenCalledTimes(requests);

        vi.setSystemTime(base + nextDue - 1);
        expect(await result.current.listAgents()).toEqual([pending]);
        expect(fetchMock).toHaveBeenCalledTimes(requests);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("a completed response retaining an expired catalog after host failure waits 30 seconds before one shared refresh", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const base = Date.parse("2026-10-18T12:00:00Z");
    vi.setSystemTime(base);
    const retained: ChatPaneAgent = {
      id: "codex", name: "Codex", discoveryPending: false,
      modelCatalog: { source: "cli", freshness: "fresh", coverage: "account", fetchedAt: new Date(base).toISOString(),
        expiresAt: new Date(base + 1_000).toISOString(), launchFingerprint: "test" },
    };
    const recovered = { ...retained, name: "Recovered Codex", modelCatalog: {
      ...retained.modelCatalog!, expiresAt: new Date(base + 60 * 60_000).toISOString(),
    } };
    let finish!: (response: Response) => void;
    let started!: () => void;
    const didStart = new Promise<void>(resolve => { started = resolve; });
    const response = new Promise<Response>(resolve => { finish = resolve; });
    const fetchMock = vi.fn().mockImplementation(() => {
      if (Date.now() < base + 1_000 + 30_000) return Promise.resolve(new Response(JSON.stringify({ agents: [retained] })));
      started();
      return response;
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const { result } = renderHook(() => [useRuntimeAccess(), useRuntimeAccess()], { wrapper: FetchQueryProvider });
      expect(await result.current[0]!.listAgents()).toEqual([retained]);
      vi.setSystemTime(base + 1_000);
      expect(await result.current[0]!.listAgents()).toEqual([retained]);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      expect(await result.current[1]!.listAgents()).toEqual([retained]);
      vi.setSystemTime(base + 1_000 + 29_999);
      expect(await result.current[0]!.listAgents()).toEqual([retained]);
      expect(await result.current[1]!.listAgents()).toEqual([retained]);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      vi.setSystemTime(base + 1_000 + 30_000);
      const first = result.current[0]!.listAgents();
      await didStart;
      const second = result.current[1]!.listAgents();
      await act(async () => {});
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/agents", expect.objectContaining({ method: "GET" }));
      finish(new Response(JSON.stringify({ agents: [recovered] })));
      expect(await first).toEqual([recovered]);
      expect(await second).toEqual([recovered]);
      expect(await result.current[0]!.listAgents()).toEqual([recovered]);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("overlapping readers join one pending refresh and leave newer Rescan data in place", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-18T12:00:00Z"));
    const pending = { id: "codex", name: "Codex", discoveryPending: true };
    const old = { id: "codex", name: "Codex", discoveryPending: false };
    const newer = { id: "codex", name: "Rescanned Codex", discoveryPending: false };
    let finish!: (response: Response) => void;
    let started!: () => void;
    const didStart = new Promise<void>(resolve => { started = resolve; });
    const response = new Promise<Response>(resolve => { finish = resolve; });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ agents: [pending] })))
      .mockImplementation((_url, init) => {
        if (init.method === "POST") return Promise.resolve(new Response(JSON.stringify({ agents: [newer] })));
        started();
        return response;
      });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const { result } = renderHook(() => [useRuntimeAccess(), useRuntimeAccess()], { wrapper: FetchQueryProvider });
      await result.current[0]!.listAgents();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      vi.setSystemTime(new Date("2026-10-18T12:00:01Z"));
      const first = result.current[0]!.listAgents();
      await didStart;
      const second = result.current[1]!.listAgents();
      await act(async () => {});
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(await result.current[1]!.rescanAgents()).toEqual([newer]);
      finish(new Response(JSON.stringify({ agents: [old] })));
      expect(await first).toEqual([newer]);
      expect(await second).toEqual([newer]);
      expect(await result.current[0]!.listAgents()).toEqual([newer]);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(["offline-fallback", "stale"] as const)("completed %s catalogs retry at 30 seconds", async (freshness) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const base = Date.parse("2026-10-18T12:00:00Z");
    vi.setSystemTime(base);
    const fallback: ChatPaneAgent = {
      id: "codex", name: "Codex", discoveryPending: false,
      modelCatalog: { source: "cli", freshness, coverage: "account", fetchedAt: new Date(base).toISOString(),
        expiresAt: new Date(base + 30_000).toISOString(), launchFingerprint: "test" },
    };
    const fresh = { id: "codex", name: "Recovered Codex", discoveryPending: false };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ agents: [fallback] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ agents: [fresh] })));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const { result } = renderHook(() => useRuntimeAccess(), { wrapper: FetchQueryProvider });
      expect(await result.current.listAgents()).toEqual([fallback]);
      vi.setSystemTime(base + 29_999);
      expect(await result.current.listAgents()).toEqual([fallback]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      vi.setSystemTime(base + 30_000);
      expect(await result.current.listAgents()).toEqual([fresh]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("listAgents() reuses completed inventory within 15 minutes and refetches after expiry", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const fetchedAt = new Date("2026-10-18T12:00:00Z");
    vi.setSystemTime(fetchedAt);
    const previous = { id: "codex", name: "Codex", discoveryPending: false, models: [{ id: "gpt-5", label: "GPT-5" }] };
    const fresh = { id: "codex", name: "Codex", discoveryPending: false, models: [{ id: "gpt-6.1-sol", label: "GPT-6.1 Sol" }] };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ agents: [previous] }) })
      .mockResolvedValue({ ok: true, json: async () => ({ agents: [fresh] }) });
    vi.stubGlobal("fetch", fetchMock);

    try {
      const { result } = renderHook(() => useRuntimeAccess(), { wrapper: FetchQueryProvider });
      expect(await result.current.listAgents()).toEqual([previous]);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      vi.setSystemTime(fetchedAt.getTime() + 15 * 60_000 - 1);
      expect(await result.current.listAgents()).toEqual([previous]);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      vi.setSystemTime(fetchedAt.getTime() + 15 * 60_000 + 1);
      const refreshed = await result.current.listAgents();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(refreshed).toEqual([fresh]);
      expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/agents", expect.objectContaining({ method: "GET" }));
      for (let read = 0; read < 3; read += 1) {
        expect(await result.current.listAgents()).toEqual([fresh]);
      }
      vi.setSystemTime(fetchedAt.getTime() + 30 * 60_000);
      expect(await result.current.listAgents()).toEqual([fresh]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rescanAgents() returns its fresh response and replaces the previous cached inventory", async () => {
    const previous = { id: "codex", name: "Codex", models: [{ id: "gpt-5", label: "GPT-5" }] };
    const fresh = { id: "codex", name: "Codex", models: [{ id: "gpt-6.1-sol", label: "GPT-6.1 Sol" }] };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ agents: [previous] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ agents: [fresh] }) });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useRuntimeAccess(), { wrapper: FetchQueryProvider });

    expect(await result.current.listAgents()).toEqual([previous]);
    expect(await result.current.rescanAgents()).toEqual([fresh]);
    expect(await result.current.listAgents()).toEqual([fresh]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/agents/rescan", expect.objectContaining({ method: "POST" }));
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
