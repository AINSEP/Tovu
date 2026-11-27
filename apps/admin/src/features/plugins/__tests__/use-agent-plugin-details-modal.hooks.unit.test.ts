import { useWiredAgentPluginDetailsModal } from "../hooks/use-agent-plugin-details-modal.hooks";
import { pluginRules } from "../rules";
import { act, renderHook, waitFor } from "@/__tests__/fetch-query-render";
import { describe, expect, it, vi } from "vitest";

import type { AgentPluginFiles } from "@jini-ai/admin/agent-plugins/models";
import { createFakeAgentPluginsPort } from "../hooks/agent-plugins-dependencies.hooks";
import { useAgentPluginDetailsModal } from "@jini-ai/admin/screens/plugins/hooks/use-agent-plugin-details-modal.hooks";

/**
 * @file `useAgentPluginDetailsModal` — REWRITTEN 2026-09-13 with the hook itself: it reads
 * `AGENT_PLUGIN_FILES` through `AgentPluginsPort` instead of a compile-time catalog. Stale-read and
 * selection edge cases belong to `usePluginPackageFiles` and are covered in
 * `use-plugin-package-files.hooks.unit.test.ts`; this file pins that the Agent Plugins adapter
 * reaches that hook with the right id and surfaces both outcomes.
 */

const identity = (key: string) => key;

const SUPABASE_FILES: AgentPluginFiles = {
  pluginId: "supabase",
  files: [
    { relativePath: "plugin.json", sizeBytes: 19, content: '{"name":"supabase"}', omitted: null },
    { relativePath: "skills/supabase/SKILL.md", sizeBytes: 10, content: "# Supabase", omitted: null },
  ],
  truncated: false,
  limits: { maxFiles: 200, maxEntries: 2000, maxFileBytes: 524288, maxTotalBytes: 4194304 },
};

describe("useAgentPluginDetailsModal", () => {
  it("lists a switched-off plugin's installed files from the port, defaulting to the first file", async () => {
    const port = createFakeAgentPluginsPort({ files: { supabase: SUPABASE_FILES } });
    const { result } = renderHook(() => useAgentPluginDetailsModal({ rules: pluginRules, pluginId: "supabase", port, t: identity }));

    expect(result.current.status).toEqual({ text: "Loading package files…", role: "status" });
    await waitFor(() => expect(result.current.files.map((file) => file.relativePath)).toEqual(["plugin.json", "skills/supabase/SKILL.md"]));
    expect(result.current.selectedFile?.relativePath).toBe("plugin.json");
    expect(result.current.status).toBeNull();

    act(() => result.current.selectFile("skills/supabase/SKILL.md"));
    expect(result.current.selectedFile?.content).toBe("# Supabase");
  });

  it("a failed read reaches the viewer as an alert, not a silently empty list", async () => {
    const port = createFakeAgentPluginsPort();
    const { result } = renderHook(() => useAgentPluginDetailsModal({ rules: pluginRules, pluginId: "not-installed", port, t: identity }));

    await waitFor(() => expect(result.current.status?.role).toBe("alert"));
    expect(result.current.files).toEqual([]);
    expect(result.current.selectedFile).toBeNull();
  });
});

it("loads an installed agent package through the wired file viewer", async () => {
  const requests: string[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/settings/effective?namespace=core.language")) return Response.json({ data: [] });
    requests.push(url);
    if (url === "/api/admin/v1/workspaces/workspace-local/agent-plugins/supabase/files" && (init?.method ?? "GET") === "GET") {
      return Response.json(SUPABASE_FILES);
    }
    return Response.json({ error: "Unexpected package" }, { status: 404 });
  });
  try {
    const { result } = renderHook(() => useWiredAgentPluginDetailsModal({ pluginId: "supabase" }));
    expect(result.current.status).toEqual({ text: "Loading package files…", role: "status" });
    await waitFor(() => expect(result.current.selectedFile?.content).toBe('{"name":"supabase"}'));
    act(() => result.current.selectFile("skills/supabase/SKILL.md"));
    expect(result.current.selectedFile?.content).toBe("# Supabase");
    expect(requests).toEqual(["/api/admin/v1/workspaces/workspace-local/agent-plugins/supabase/files"]);
  } finally {
    vi.unstubAllGlobals();
  }
});
