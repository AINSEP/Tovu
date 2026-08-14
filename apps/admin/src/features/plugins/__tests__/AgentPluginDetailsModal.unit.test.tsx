import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AgentPluginDetailsModal } from "../AgentPluginDetailsModal";
import type { AgentPluginDetailsModalController } from "../hooks/use-agent-plugin-details-modal.hooks";
import { TOVU_BUNDLED_AGENT_PLUGINS } from "../agent-plugin-catalog";

/**
 * @file `AgentPluginDetailsModal`'s own rendering behavior is already covered end-to-end through
 * `AgentPlugins.unit.test.tsx` ("opens an accessible read-only package inspector..."). This file's
 * job is narrower: prove the `useDetails` seam this pass added actually reaches the render, per
 * the `ConfirmDialog dialog-hook injection` precedent every other seamed component carries.
 */

const PLUGIN = TOVU_BUNDLED_AGENT_PLUGINS[0]!;

describe("AgentPluginDetailsModal details-hook injection", () => {
  it("renders purely off an injected fake, proving useAgentPluginDetailsModal is not hardcoded", () => {
    // A fake with a file the real catalog lookup could never produce (an id outside the compile-time
    // allowlist) is proof this render used the fake, not the real hook.
    function useFakeDetails(): AgentPluginDetailsModalController {
      return {
        files: [{ relativePath: "fake/only.md", content: "fake content body" }],
        selectedFile: { relativePath: "fake/only.md", content: "fake content body" },
        selectFile: vi.fn(),
      };
    }

    render(<AgentPluginDetailsModal plugin={PLUGIN} onClose={vi.fn()} useDetails={useFakeDetails} />);

    expect(screen.getByRole("button", { name: "fake/only.md" })).toBeInTheDocument();
    expect(screen.getByText("fake content body")).toBeInTheDocument();
  });

  it("shows the empty-catalog message when the fake resolves no files", () => {
    function useFakeDetails(): AgentPluginDetailsModalController {
      return { files: [], selectedFile: null, selectFile: vi.fn() };
    }

    render(<AgentPluginDetailsModal plugin={PLUGIN} onClose={vi.fn()} useDetails={useFakeDetails} />);

    expect(screen.getByRole("status")).toHaveTextContent("No source files are catalogued for this package.");
  });
});
