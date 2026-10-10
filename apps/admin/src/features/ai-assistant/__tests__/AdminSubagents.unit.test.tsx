import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@/__tests__/fetch-query-render";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AdminSubagents } from "../AdminSubagents";
import { SubagentsIndicator } from "@/components/AssistantDock/SubagentsIndicator";
import { useAdminSubagents, useAssistantSubagentsSettings } from "../hooks/use-admin-subagents.hooks";
import { SUBAGENT_DANGERS, SUBAGENTS_NAMESPACE, type AssistantSubagentsPort, type AssistantSubagentsSettings } from "@/lib/assistant-subagents";
import { publishSettingsRefresh } from "@/lib/settings-refresh-bus";
import { t as translate } from "../ai-assistant-i18n";

function fakePort(initial: AssistantSubagentsSettings = { enabled: false, canEdit: true }) {
  let settings = initial;
  let failure: Error | null = null;
  let readFailure: Error | null = null;
  const writes: { enabled: boolean; riskAcknowledged: boolean }[] = [];
  const port: AssistantSubagentsPort = {
    read: async () => { if (readFailure) throw readFailure; return settings; },
    write: async (input) => { writes.push(input); if (failure) throw failure; settings = { ...settings, enabled: input.enabled }; return settings; },
  };
  return { port, writes, failRead: (message: string) => { readFailure = new Error(message); }, fail: (message: string) => { failure = new Error(message); },
    changeElsewhere: (enabled: boolean) => { settings = { ...settings, enabled }; } };
}

function mount(port: AssistantSubagentsPort) {
  return render(<>
    <AdminSubagents useController={(input) => useAdminSubagents({ ...input, port })} />
    <SubagentsIndicator useSettings={() => useAssistantSubagentsSettings({ port })} />
  </>);
}
const toggle = () => screen.getByRole("checkbox", { name: "Allow the admin assistant to spawn subagents" });
const ready = () => waitFor(() => expect(toggle()).toBeEnabled());
const dangerDialog = () => screen.getByRole("dialog", { name: "Allow the assistant to spawn subagents?" });

describe("owner subagent opt-in", () => {
  it("starts off; shows all four dangers; cancel and native Escape cancel do not save", async () => {
    const f = fakePort();
    const user = userEvent.setup();
    mount(f.port);
    await ready();
    expect(toggle()).not.toBeChecked();
    expect(screen.queryByText("Subagents: on")).toBeNull();
    await user.click(toggle());
    for (const danger of SUBAGENT_DANGERS) expect(dangerDialog()).toHaveTextContent(danger);
    expect(within(dangerDialog()).getByRole("button", { name: "Cancel" })).toHaveFocus();
    expect(within(dangerDialog()).getByRole("button", { name: "Allow subagents" })).not.toHaveAttribute("data-agent-handle");
    expect(f.writes).toEqual([]);
    await user.click(within(dangerDialog()).getByRole("button", { name: "Cancel" }));
    await ready();
    expect(toggle()).not.toBeChecked();
    expect(toggle()).toHaveFocus();
    await user.click(toggle());
    // Browsers dispatch cancel when Escape is pressed in a modal native dialog.
    fireEvent(dangerDialog(), new Event("cancel", { bubbles: true, cancelable: true }));
    await ready();
    expect(f.writes).toEqual([]);
    expect(toggle()).not.toBeChecked();
    expect(toggle()).toHaveFocus();
  });

  it("enables only after confirmation; the shared dock indicator updates; disabling needs no dialog", async () => {
    const f = fakePort();
    const user = userEvent.setup();
    mount(f.port);
    await ready();
    await user.click(toggle());
    expect(f.writes).toEqual([]);
    await user.click(within(dangerDialog()).getByRole("button", { name: "Allow subagents" }));
    await waitFor(() => expect(toggle()).toBeChecked());
    expect(f.writes).toEqual([{ enabled: true, riskAcknowledged: true }]);
    expect(screen.getByText("Subagents: on")).toBeVisible();
    expect(screen.getByText("Subagents: on")).toHaveClass("jini-chat-pane__subagents");
    await ready();
    await user.click(toggle());
    await waitFor(() => expect(toggle()).not.toBeChecked());
    expect(f.writes).toEqual([{ enabled: true, riskAcknowledged: true }, { enabled: false, riskAcknowledged: false }]);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("Subagents: on")).toBeNull();
  });

  it("a failed save reports the real error and leaves both checkbox and dock at server truth", async () => {
    const f = fakePort();
    f.fail("The owner grant was revoked.");
    const user = userEvent.setup();
    mount(f.port);
    await ready();
    await user.click(toggle());
    await user.click(within(dangerDialog()).getByRole("button", { name: "Allow subagents" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The owner grant was revoked.");
    expect(toggle()).not.toBeChecked();
    expect(screen.queryByText("Subagents: on")).toBeNull();
  });

  it("renders a disabled owner-only control for non-owners while exposing the active grant in the dock", async () => {
    const f = fakePort({ enabled: true, canEdit: false });
    mount(f.port);
    await screen.findByText("Only the owner can change subagent access.");
    expect(toggle()).toBeDisabled();
    expect(toggle()).toHaveAccessibleDescription("Off by default. Applies to Claude CLI runs only; BYOK and other CLIs are unaffected. Changes apply to new runs; existing subagents may continue. Only the owner can change subagent access.");
    expect(toggle()).toBeChecked();
    expect(screen.getByText("Subagents: on")).toBeVisible();
    expect(f.writes).toEqual([]);
  });

  it("the dock refreshes on namespace notifications from another tab", async () => {
    const f = fakePort();
    mount(f.port);
    await ready();
    f.changeElsewhere(true);
    act(() => publishSettingsRefresh([SUBAGENTS_NAMESPACE]));
    expect(await screen.findByText("Subagents: on")).toBeVisible();
    f.changeElsewhere(false);
    act(() => publishSettingsRefresh([SUBAGENTS_NAMESPACE]));
    await waitFor(() => expect(screen.queryByText("Subagents: on")).toBeNull());
  });

  it("a read failure disables the control and exposes the actual error", async () => {
    const f = fakePort();
    mount({ ...f.port, read: async () => { throw new Error("Settings are unavailable."); } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Settings are unavailable.");
    expect(toggle()).toBeDisabled();
    expect(await screen.findByText("Subagents: unknown")).toHaveClass("jini-chat-pane__subagents");
    expect(screen.queryByText("Subagents: on")).toBeNull();
  });

  it("concurrent toggles share one confirmation/write lock", async () => {
    const f = fakePort();
    let answer!: (accepted: boolean) => void;
    const decision = new Promise<boolean>((resolve) => { answer = resolve; });
    let asks = 0;
    const { result } = renderHook(() => useAdminSubagents({ port: f.port }, { useConfirmation: () => ({
      confirm: () => { asks++; return decision; },
      dialog: { open: false, title: "", body: "", confirmLabel: "", onConfirm: () => {}, onCancel: () => {} },
    }) }));
    await waitFor(() => expect(result.current.settings?.canEdit).toBe(true));
    let first!: Promise<void>;
    act(() => {
      first = result.current.setEnabled({ enabled: true });
      void result.current.setEnabled({ enabled: true });
    });
    expect(asks).toBe(1);
    expect(f.writes).toEqual([]);
    await act(async () => { answer(true); await first; });
    expect(f.writes).toEqual([{ enabled: true, riskAcknowledged: true }]);
  });
});


describe("subagent status recovery and dialog copy", () => {
  it("shows unknown after a failed refresh even if the cached grant was ON", async () => {
    const f = fakePort({ enabled: true, canEdit: true });
    mount(f.port);
    await ready();
    expect(screen.getByText("Subagents: on")).toBeVisible();
    f.failRead("Settings are unavailable.");
    act(() => publishSettingsRefresh([SUBAGENTS_NAMESPACE]));
    expect(await screen.findByText("Subagents: unknown")).toBeVisible();
    expect(screen.queryByText("Subagents: on")).toBeNull();
    expect(toggle()).toBeDisabled();
  });

  it("renders the controller's authoritative dialog body", async () => {
    const f = fakePort();
    render(<AdminSubagents useController={(input) => {
      const controller = useAdminSubagents({ ...input, port: f.port });
      return { ...controller, dialog: { ...controller.dialog, body: "Risk copy from the controller." } };
    }} />);
    await ready();
    await userEvent.setup().click(toggle());
    expect(dangerDialog()).toHaveTextContent("Risk copy from the controller.");
    expect(dangerDialog()).not.toHaveTextContent(SUBAGENT_DANGERS[0]);
  });
});


it("translates the dock's ON and unknown states with the AI assistant dictionary", async () => {
  const f = fakePort({ enabled: true, canEdit: false });
  render(<SubagentsIndicator t={(key) => translate({ locale: "es", key })}
    useSettings={() => useAssistantSubagentsSettings({ port: f.port })} />);
  expect(await screen.findByText("Subagentes: activados")).toHaveAttribute("role", "status");
  f.failRead("Settings are unavailable.");
  act(() => publishSettingsRefresh([SUBAGENTS_NAMESPACE]));
  expect(await screen.findByText("Subagentes: estado desconocido")).toHaveAttribute("role", "status");
  expect(screen.queryByText("Subagentes: activados")).toBeNull();
});


it("uses a translated fallback when a subagent save fails without an error message", async () => {
  const f = fakePort({ enabled: true, canEdit: true });
  const port = { ...f.port, write: async () => { throw null; } };
  const { result } = renderHook(() => useAdminSubagents({ port, t: key => translate({ locale: "es", key }) }));
  await waitFor(() => expect(result.current.settings?.canEdit).toBe(true));
  await act(async () => { await result.current.setEnabled({ enabled: false }); });
  expect(result.current.saveError).toBe("no se pudo guardar el acceso de subagentes");
  expect(result.current.settings?.enabled).toBe(true);
});
