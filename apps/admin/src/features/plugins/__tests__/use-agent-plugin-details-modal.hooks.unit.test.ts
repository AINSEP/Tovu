import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { AdminAgentPluginFiles } from "@/lib/api";
import { createFakeAgentPluginsPort } from "../hooks/agent-plugins-dependencies.hooks";
import { useAgentPluginDetailsModal } from "../hooks/use-agent-plugin-details-modal.hooks";

/**
 * @file `useAgentPluginDetailsModal` — REWRITTEN 2026-09-13 with the hook itself: it reads
 * `AGENT_PLUGIN_FILES` through `AgentPluginsPort` instead of a compile-time catalog. Stale-read and
 * selection edge cases belong to `usePluginPackageFiles` and are covered in
 * `use-plugin-package-files.hooks.unit.test.ts`; this file pins that the Agent Plugins adapter
 * reaches that hook with the right id and surfaces both outcomes.
 */

const identity = (key: string) => key;

const SUPABASE_FILES: AdminAgentPluginFiles = {
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
    const { result } = renderHook(() => useAgentPluginDetailsModal({ pluginId: "supabase", port, t: identity }));

    expect(result.current.status).toEqual({ text: "Loading package files…", role: "status" });
    await waitFor(() => expect(result.current.files.map((file) => file.relativePath)).toEqual(["plugin.json", "skills/supabase/SKILL.md"]));
    expect(result.current.selectedFile?.relativePath).toBe("plugin.json");
    expect(result.current.status).toBeNull();

    act(() => result.current.selectFile("skills/supabase/SKILL.md"));
    expect(result.current.selectedFile?.content).toBe("# Supabase");
  });

  it("a failed read reaches the viewer as an alert, not a silently empty list", async () => {
    const port = createFakeAgentPluginsPort();
    const { result } = renderHook(() => useAgentPluginDetailsModal({ pluginId: "not-installed", port, t: identity }));

    await waitFor(() => expect(result.current.status?.role).toBe("alert"));
    expect(result.current.files).toEqual([]);
    expect(result.current.selectedFile).toBeNull();
  });
});
