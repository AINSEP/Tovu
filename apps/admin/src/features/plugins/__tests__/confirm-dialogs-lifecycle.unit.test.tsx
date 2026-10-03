import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AgentPluginDisableConfirmDialog } from "../AgentPluginDisableConfirmDialog";
import { PluginRemoveConfirmDialog } from "../PluginRemoveConfirmDialog";

// F2.3/F3.3: keep the real document listeners, including every stale registration.
describe.each(["plugin-remove", "agent-disable", "agent-remove"] as const)("%s listener lifecycle", (kind) => {
  function dialog(onCancel: () => void, name = "North Star") {
    const props = { name, onCancel, onConfirm: vi.fn(), agentHandleBase: "north-star", t: (key: string) => key };
    return kind === "plugin-remove"
      ? <PluginRemoveConfirmDialog {...props} />
      : <AgentPluginDisableConfirmDialog {...props} variant={kind === "agent-remove" ? "remove" : "disable"} />;
  }

  it("delivers Escape only to the current callback and removes its listener on unmount", async () => {
    // Regression target: delete the effect cleanup, or remove onCancel from its dependencies.
    const user = userEvent.setup();
    const oldCancel = vi.fn();
    const currentCancel = vi.fn();
    const view = render(dialog(oldCancel));
    await user.keyboard("x");
    expect(oldCancel).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(oldCancel.mock.calls).toEqual([[]]);

    view.rerender(dialog(currentCancel, "South Star"));
    expect(screen.getByRole("dialog")).toHaveAccessibleName(
      kind === "plugin-remove" ? 'Move "South Star" to trash?' : kind === "agent-remove" ? "Turn off South Star?" : "Disable South Star for this site?",
    );
    await user.keyboard("{Escape}");
    expect(oldCancel.mock.calls).toEqual([[]]);
    expect(currentCancel.mock.calls).toEqual([[]]);

    view.unmount();
    await user.keyboard("{Escape}");
    expect(oldCancel.mock.calls).toEqual([[]]);
    expect(currentCancel.mock.calls).toEqual([[]]);
  });
});
