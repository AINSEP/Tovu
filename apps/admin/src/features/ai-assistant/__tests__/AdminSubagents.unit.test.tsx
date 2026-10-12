import { act, render, renderHook, screen, waitFor } from "@/__tests__/fetch-query-render";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AdminSubagents } from "../AdminSubagents";
import { SubagentsIndicator } from "@/components/AssistantDock/SubagentsIndicator";
import { useAdminSubagents, useAssistantSubagentsSettings } from "../hooks/use-admin-subagents.hooks";
import { SUBAGENTS_NAMESPACE, type AssistantSubagentsPort, type AssistantSubagentsSettings } from "@/lib/assistant-subagents";
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
    <SubagentsIndicator mode="local-cli" agentId="claude" useSettings={(input) => useAssistantSubagentsSettings({ ...input, port })} />
  </>);
}
const toggle = () => screen.getByRole("checkbox", { name: "Allow the admin assistant to spawn subagents" });
const ready = () => waitFor(() => expect(toggle()).toBeEnabled());
// The icon is an InfoTip trigger since 2026-10-10 (white bubble below it), named by its tip text.
const icon = () => screen.queryByRole("button", { name: "This chat can use subagents" });

describe("owner subagent setting", () => {
  it("shows the default-ON grant and copy; disabling and re-enabling save without confirmation", async () => {
    const f = fakePort({ enabled: true, canEdit: true });
    mount(f.port);
    await ready();
    expect(toggle()).toBeChecked();
    expect(toggle()).toHaveAccessibleDescription("On by default. Applies to Claude CLI runs only; BYOK and other CLIs are unaffected. Changes apply to new runs; existing subagents may continue.");
    expect(icon()).toBeVisible();
    expect(icon()).toHaveAccessibleName("This chat can use subagents");
    expect(icon()?.querySelector(".ri-group-line")).not.toBeNull();
    expect(icon()).toHaveTextContent("");
    await userEvent.setup().click(toggle());
    await waitFor(() => expect(toggle()).not.toBeChecked());
    expect(icon()).toBeNull();
    await ready();
    await userEvent.setup().click(toggle());
    await waitFor(() => expect(toggle()).toBeChecked());
    expect(f.writes).toEqual([{ enabled: false, riskAcknowledged: false }, { enabled: true, riskAcknowledged: false }]);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(icon()).toBeVisible();
  });

  it("a failed save reports the real error and leaves both checkbox and dock at server truth", async () => {
    const f = fakePort();
    f.fail("The owner grant was revoked.");
    const user = userEvent.setup();
    mount(f.port);
    await ready();
    await user.click(toggle());
    expect(await screen.findByRole("alert")).toHaveTextContent("The owner grant was revoked.");
    expect(toggle()).not.toBeChecked();
    expect(icon()).toBeNull();
  });

  it("renders a disabled owner-only control for non-owners while exposing the active grant in the dock", async () => {
    const f = fakePort({ enabled: true, canEdit: false });
    mount(f.port);
    await screen.findByText("Only the owner can change subagent access.");
    expect(toggle()).toBeDisabled();
    expect(toggle()).toHaveAccessibleDescription("On by default. Applies to Claude CLI runs only; BYOK and other CLIs are unaffected. Changes apply to new runs; existing subagents may continue. Only the owner can change subagent access.");
    expect(toggle()).toBeChecked();
    expect(icon()).toBeVisible();
    expect(f.writes).toEqual([]);
  });

  it("the dock refreshes on namespace notifications from another tab", async () => {
    const f = fakePort();
    mount(f.port);
    await ready();
    f.changeElsewhere(true);
    act(() => publishSettingsRefresh([SUBAGENTS_NAMESPACE]));
    await waitFor(() => expect(icon()).toBeVisible());
    f.changeElsewhere(false);
    act(() => publishSettingsRefresh([SUBAGENTS_NAMESPACE]));
    await waitFor(() => expect(icon()).toBeNull());
  });

  it("a read failure disables the control and exposes the actual error", async () => {
    const f = fakePort();
    mount({ ...f.port, read: async () => { throw new Error("Settings are unavailable."); } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Settings are unavailable.");
    expect(toggle()).toBeDisabled();
    expect(icon()).toBeNull();
  });

  it("concurrent toggles share one write lock and never request confirmation", async () => {
    const f = fakePort();
    let finish!: () => void;
    const pending = new Promise<void>(resolve => { finish = resolve; });
    const port: AssistantSubagentsPort = { ...f.port, write: async input => { await pending; return f.port.write(input); } };
    let asks = 0;
    const { result } = renderHook(() => useAdminSubagents({ port }, { useConfirmation: () => ({
      confirm: async () => { asks++; return false; },
      dialog: { open: false, title: "", body: "", confirmLabel: "", onConfirm: () => {}, onCancel: () => {} },
    }) }));
    await waitFor(() => expect(result.current.settings?.canEdit).toBe(true));
    let first!: Promise<void>;
    act(() => {
      first = result.current.setEnabled({ enabled: true });
      void result.current.setEnabled({ enabled: true });
    });
    expect(asks).toBe(0);
    await act(async () => { finish(); await first; });
    expect(f.writes).toEqual([{ enabled: true, riskAcknowledged: false }]);
  });
});


it("hides cached ON after a failed refresh", async () => {
  const f = fakePort({ enabled: true, canEdit: true });
  mount(f.port);
  await ready();
  expect(icon()).toBeVisible();
  f.failRead("Settings are unavailable.");
  act(() => publishSettingsRefresh([SUBAGENTS_NAMESPACE]));
  await waitFor(() => expect(toggle()).toBeDisabled());
  expect(icon()).toBeNull();
});

it("the hook hides the icon for OFF, BYOK and other CLIs and reacts to runtime changes", async () => {
  const f = fakePort({ enabled: true, canEdit: false });
  const { rerender } = render(<SubagentsIndicator mode="byok" agentId="claude"
    useSettings={input => useAssistantSubagentsSettings({ ...input, port: f.port })} />);
  await waitFor(() => expect(icon()).toBeNull());
  rerender(<SubagentsIndicator mode="local-cli" agentId="claude"
    useSettings={input => useAssistantSubagentsSettings({ ...input, port: f.port })} />);
  await waitFor(() => expect(icon()).toBeVisible());
  rerender(<SubagentsIndicator mode="byok" agentId="claude"
    useSettings={input => useAssistantSubagentsSettings({ ...input, port: f.port })} />);
  expect(icon()).toBeNull();
  rerender(<SubagentsIndicator mode="local-cli" agentId="codex"
    useSettings={input => useAssistantSubagentsSettings({ ...input, port: f.port })} />);
  expect(icon()).toBeNull();
});

it("translates the icon tooltip through the existing assistant dictionary", async () => {
  const f = fakePort({ enabled: true, canEdit: false });
  render(<SubagentsIndicator mode="local-cli" agentId="claude" t={key => translate({ locale: "es", key })}
    useSettings={input => useAssistantSubagentsSettings({ ...input, port: f.port })} />);
  expect(await screen.findByRole("button", { name: "Este chat puede usar subagentes" })).toBeInTheDocument();
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
