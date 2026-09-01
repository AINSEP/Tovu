import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  extractResumeCapableAgentIds,
  getResumeCapableAgentIds,
  resetResumeCapableAgentIds,
  useComposerCapabilities,
  useRuntimeAccess,
} from "../hooks/AssistantDock.hooks";

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
});

/**
 * @file Coverage for the transcript-duplication fix's plumbing: `useAssistantTransport`'s
 * `getResumeCapableAgentIds` option (`assistant-transport.ts`) has to be fed from SOMEWHERE, and
 * `GET /api/agents`'s `carriesOwnMemory` field (`apps/website/src/assistant/agents.ts`) is that
 * source. These pin the two halves: the pure projection, and that `useRuntimeAccess`'s
 * `listAgents`/`rescanAgents` actually keep the module-level set current as a side effect of the
 * SAME fetch `ChatPane`'s own agent picker already makes — not a second request.
 */
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
