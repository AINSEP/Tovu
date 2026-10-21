import { render, screen } from "@/__tests__/fetch-query-render";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AgentPluginDetailsModal } from "../AgentPluginDetailsModal";
import { AgentPluginManageButton } from "../AgentPluginManageButton";
import type { AgentPluginSurfacesPort, AgentPluginSurfaceSummary } from "../hooks/agent-plugin-surfaces-port.hooks";
import type { AgentPluginDetailsModalController } from "../hooks/use-agent-plugin-details-modal.hooks";

/**
 * @file A plugin's own admin screens ("surfaces"): the row's Manage button appears only once the
 * plugin lists at least one and hands that list to the details modal, which then opens on the first
 * screen instead of Package files.
 */

const SURFACE: AgentPluginSurfaceSummary = { id: "settings", title: "Writer settings", src: "/plugin/settings.html", actions: [] };
const identity = (key: string) => key;

function surfacesPort(surfaces: readonly AgentPluginSurfaceSummary[]): AgentPluginSurfacesPort {
  return {
    list: async () => ({ surfaces: [...surfaces] }),
    bootstrap: () => new Promise(() => {}),
    action: () => new Promise(() => {}),
  };
}

function useNoFiles(): AgentPluginDetailsModalController {
  return { files: [], selectedFile: null, selectFile: vi.fn() };
}

describe("AgentPluginManageButton", () => {
  it("renders nothing while the plugin lists no screens", async () => {
    const list = vi.fn(async () => ({ surfaces: [] }));
    const { container } = render(<AgentPluginManageButton pluginId="writer" displayName="Writer" t={identity} agentHandleBase="row-writer" onManage={vi.fn()}
      port={{ ...surfacesPort([]), list }} />);
    await vi.waitFor(() => expect(list).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("offers Manage once a screen is listed and passes the listed screens on click", async () => {
    const onManage = vi.fn();
    render(<AgentPluginManageButton pluginId="writer" displayName="Writer" t={identity} agentHandleBase="row-writer" onManage={onManage} port={surfacesPort([SURFACE])} />);
    await userEvent.click(await screen.findByRole("button", { name: "Manage Writer" }));
    expect(onManage).toHaveBeenCalledWith([SURFACE]);
  });
});

describe("AgentPluginDetailsModal opened from Manage", () => {
  it("starts on the plugin's first screen", async () => {
    render(<AgentPluginDetailsModal plugin={{ id: "writer", displayName: "Writer", surfaces: [SURFACE] }} onClose={vi.fn()} t={identity}
      useDetails={useNoFiles} surfacesPort={surfacesPort([SURFACE])} />);
    expect(await screen.findByRole("tab", { name: "Writer settings" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTitle("Writer settings").tagName).toBe("IFRAME");
  });
});
