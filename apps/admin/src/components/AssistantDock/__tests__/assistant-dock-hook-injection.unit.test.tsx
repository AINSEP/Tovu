import { render, screen } from "@/__tests__/fetch-query-render";
import { describe, expect, it, vi } from "vitest";

import { AssistantDock, type AssistantDockProps } from "../AssistantDock";
import type { useAssistantDockState } from "../AssistantDock.state.hooks";

/**
 * @file `AssistantDock` calls one hook, `useAssistantDockState`, and takes it as a prop defaulted to the real
 * hook (owner rule: custom hooks a component uses are injected). The test hands the component a FAKE hook and
 * asserts that the component forwards its own props to it and renders the view from what the fake returned,
 * so the seam is proven to be the one the component actually reads.
 */

vi.mock("../DockChatPane", () => ({
  DockChatPane: ({ dock }: { dock: { marker: string } }) => <p data-testid="dock-view">{dock.marker}</p>,
}));

describe("AssistantDock — useAssistantDockStateHook", () => {
  it("passes its props to the injected hook and renders the view from the state that hook returned", () => {
    const fakeDock = { marker: "fake-dock-state" };
    const useAssistantDockStateHook = vi.fn(() => fakeDock) as unknown as typeof useAssistantDockState;
    const props = { principalId: "owner-1" } as unknown as AssistantDockProps;

    render(<AssistantDock {...props} useAssistantDockStateHook={useAssistantDockStateHook} />);

    expect(screen.getByTestId("dock-view")).toHaveTextContent("fake-dock-state");
    expect(useAssistantDockStateHook).toHaveBeenCalledTimes(1);
    expect(useAssistantDockStateHook).toHaveBeenCalledWith(expect.objectContaining({ principalId: "owner-1" }));
  });
});
