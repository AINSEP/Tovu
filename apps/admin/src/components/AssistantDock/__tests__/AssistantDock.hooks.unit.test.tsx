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
  resetResumeCapableAgentIds,
  useComposerCapabilities,
  useRuntimeAccess,
} from "../hooks/AssistantDock.hooks";
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
 * `createToolCatalogComposerCapabilitySource().list()` is the ONLY thing in this hook's dependency
 * graph that calls `fetch` (`tool-catalog-composer-source.ts`'s own doc) — `fetch` never being
 * called is therefore direct proof the source is not in the projected list, not an inference from
 * the rendered groups. Before the fix (`AssistantDock.hooks.tsx` wiring
 * `createToolCatalogComposerCapabilitySource()` into the same `Promise.all` as the bundled source),
 * this test fails: `fetch` is called once for `/api/tools/search` and a `tool-catalog` group is
 * projected alongside the bundled ones.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useComposerCapabilities", () => {
  it("never calls fetch, and projects only the bundled groups — the live tool-catalog source is not wired in", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        hits: [{ id: "forms_create_definition", description: "Creates a form definition.", source: "forms", score: 3.1 }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useComposerCapabilities());

    await waitFor(() => {
      expect(result.current.composerCapabilities.groups.length).toBeGreaterThan(0);
    });

    const groupIds = result.current.composerCapabilities.groups.map((group) => group.id);
    expect(groupIds).not.toContain("tool-catalog");
    expect(groupIds).toEqual(["regular-plugins", "agent-plugins", "skills", "mcp", "tools"]);
    expect(fetchMock).not.toHaveBeenCalled();
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

    const { result } = renderHook(() => useRuntimeAccess());
    await result.current.listAgents();

    expect(getResumeCapableAgentIds()).toEqual(new Set(["claude"]));
  });

  it("rescanAgents() also refreshes the resume-capable set from its own response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ agents: [{ id: "codex", name: "Codex", carriesOwnMemory: true }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useRuntimeAccess());
    await result.current.rescanAgents();

    expect(getResumeCapableAgentIds()).toEqual(new Set(["codex"]));
  });

  it("a failed rescan falls back to listAgents() — the resume-capable set still comes from a real response, not stale", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ agents: [{ id: "amr", name: "AMR", carriesOwnMemory: true }] }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useRuntimeAccess());
    await result.current.rescanAgents();

    expect(getResumeCapableAgentIds()).toEqual(new Set(["amr"]));
  });
});
