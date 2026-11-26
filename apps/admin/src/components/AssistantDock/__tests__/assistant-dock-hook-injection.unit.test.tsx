import { render, screen } from "@/__tests__/fetch-query-render";
import { describe, expect, it, vi } from "vitest";

import { AssistantDock, type AssistantDockProps } from "@jini-ai/admin/shell/components/AssistantDock/AssistantDock";
import type { AssistantDockState } from "@jini-ai/admin/shell/components/AssistantDock/AssistantDock.state.hooks";

/**
 * @file `AssistantDock` calls one hook, `useAssistantDockState`, and takes it as a prop defaulted to the real
 * hook (owner rule: custom hooks a component uses are injected). The test hands the component a FAKE hook and
 * asserts that the component forwards its own props to it and renders the view from what the fake returned,
 * so the seam is proven to be the one the component actually reads.
 */

describe("AssistantDock — useAssistantDockStateHook", () => {
  it("passes its props to the injected hook and renders the view from the state that hook returned", () => {
    const fakeDock = { marker: "fake-dock-state" };
    const useAssistantDockStateHook = vi.fn(() => fakeDock) as unknown as AssistantDockProps["useAssistantDockStateHook"];
    const props = { query: null, principalId: "owner-1", useConversationDeepLink: vi.fn() };

    render(<AssistantDock {...props} useAssistantDockStateHook={useAssistantDockStateHook}
      kit={{ DockChatPane: ({ dock }: { dock: AssistantDockState }) => <p data-testid="dock-view">{(dock as unknown as { marker: string }).marker}</p> }} />);

    expect(screen.getByTestId("dock-view")).toHaveTextContent("fake-dock-state");
    expect(useAssistantDockStateHook).toHaveBeenCalledTimes(1);
    expect(useAssistantDockStateHook).toHaveBeenCalledWith(expect.objectContaining({ principalId: "owner-1" }));
  });
});
