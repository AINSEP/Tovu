import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@/__tests__/fetch-query-render";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AdminPermanentDeletes } from "../AdminPermanentDeletes";
import { useAdminPermanentDeletes } from "../hooks/use-admin-permanent-deletes.hooks";
import { PERMANENT_DELETE_TOOLS, PERMANENT_DELETE_DANGERS, ASSISTANT_PERMANENT_DELETES_NAMESPACE, type AssistantPermanentDeletesPort, type AssistantPermanentDeletesSettings } from "@/lib/assistant-permanent-deletes";
import { publishSettingsRefresh } from "@/lib/settings-refresh-bus";
function fakePort(initial: AssistantPermanentDeletesSettings = { enabled: false, allowedToolIds: [], canEdit: true }) {
  let settings = structuredClone(initial), failure: Error | null = null;
  const writes: Parameters<AssistantPermanentDeletesPort["write"]>[0][] = [];
  const port: AssistantPermanentDeletesPort = {
    read: async () => structuredClone(settings),
    write: async input => { writes.push(structuredClone(input)); if (failure) throw failure; settings = { ...settings, enabled: input.enabled, allowedToolIds: [...input.allowedToolIds] }; return structuredClone(settings); },
  };
  return { port, writes, fail: (message: string) => { failure = new Error(message); }, changeElsewhere: () => { settings.enabled = false; } };
}
const toggle = () => screen.getByRole("checkbox", { name: "Allow permanent deletes from chat" });
const ready = () => waitFor(() => expect(toggle()).toBeEnabled());
function mount(port: AssistantPermanentDeletesPort) { return render(<AdminPermanentDeletes useController={input => useAdminPermanentDeletes({ ...input, port })} />); }
describe("owner permanent deletes opt-in", () => {
  it("defaults OFF; names every danger; Escape cancels and returns focus without saving", async () => {
    const f = fakePort(), user = userEvent.setup(); mount(f.port); await ready();
    expect(toggle()).not.toBeChecked(); expect(screen.queryByRole("button", { name: "Select all" })).toBeNull();
    await user.click(toggle());
    const dialog = screen.getByRole("dialog", { name: "Allow permanent deletes from chat?" });
    for (const danger of PERMANENT_DELETE_DANGERS) expect(within(dialog).getByText(danger)).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();
    expect(within(dialog).getByRole("button", { name: "Allow permanent deletes" })).not.toHaveAttribute("data-agent-handle");
    fireEvent(dialog, new Event("cancel", { bubbles: true, cancelable: true }));
    await ready(); expect(toggle()).not.toBeChecked(); expect(toggle()).toHaveFocus(); expect(f.writes).toEqual([]);
  });
  it("confirmed enable shows the 13-tool groups; checkboxes/select all/select none autosave; OFF keeps the list", async () => {
    const f = fakePort(), user = userEvent.setup(); mount(f.port); await ready(); await user.click(toggle());
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Allow permanent deletes" }));
    await waitFor(() => expect(toggle()).toBeChecked());
    expect(f.writes[0]).toEqual({ enabled: true, allowedToolIds: [], riskAcknowledged: true });
    expect(screen.getAllByRole("checkbox")).toHaveLength(14);
    expect(screen.getByRole("group", { name: "Content purges" })).toBeVisible(); expect(screen.getByRole("group", { name: "Settings deletes" })).toBeVisible();
    await user.click(screen.getByRole("checkbox", { name: PERMANENT_DELETE_TOOLS[0].label }));
    await waitFor(() => expect(f.writes.at(-1)).toEqual({ enabled: true, allowedToolIds: ["trash_empty"], riskAcknowledged: false }));
    await ready(); await user.click(screen.getByRole("button", { name: "Select all" }));
    await waitFor(() => expect(f.writes.at(-1)?.allowedToolIds).toEqual(PERMANENT_DELETE_TOOLS.map(tool => tool.id)));
    await ready(); await user.click(screen.getByRole("button", { name: "Select none" }));
    await waitFor(() => expect(f.writes.at(-1)?.allowedToolIds).toEqual([]));
    await ready(); await user.click(screen.getByRole("checkbox", { name: PERMANENT_DELETE_TOOLS[0].label }));
    await waitFor(() => expect(f.writes.at(-1)?.allowedToolIds).toEqual(["trash_empty"]));
    await ready(); await user.click(toggle());
    await waitFor(() => expect(toggle()).not.toBeChecked());
    expect(f.writes.at(-1)).toEqual({ enabled: false, allowedToolIds: ["trash_empty"], riskAcknowledged: false });
    expect(screen.queryByRole("dialog")).toBeNull(); expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });
  it("non-owner sees the disabled grant and checklist with a reason, and cannot write", async () => {
    const f = fakePort({ enabled: true, allowedToolIds: ["trash_empty"], canEdit: false }); mount(f.port);
    await waitFor(() => expect(screen.getByText("Only the owner can change permanent delete access.")).toBeVisible());
    expect(toggle()).toBeDisabled();
    for (const checkbox of screen.getAllByRole("checkbox")) expect(checkbox).toBeDisabled();
    expect(screen.getByRole("button", { name: "Select all" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Select none" })).toBeDisabled(); expect(f.writes).toEqual([]);
  });
  it("failed autosave keeps server truth and displays the real error; external revoke refreshes the master", async () => {
    const f = fakePort({ enabled: true, allowedToolIds: [], canEdit: true }), user = userEvent.setup(); mount(f.port); await ready();
    f.fail("principal is not authorized for permanent delete access");
    await user.click(screen.getByRole("checkbox", { name: PERMANENT_DELETE_TOOLS[0].label }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("principal is not authorized for permanent delete access"));
    expect(screen.getByRole("checkbox", { name: PERMANENT_DELETE_TOOLS[0].label })).not.toBeChecked();
    f.changeElsewhere(); act(() => publishSettingsRefresh([ASSISTANT_PERMANENT_DELETES_NAMESPACE]));
    await waitFor(() => expect(toggle()).not.toBeChecked());
  });
  it("uses the canonical admin destinations and does not invent a secret-removal screen", async () => {
    const f = fakePort({ enabled: true, allowedToolIds: [], canEdit: true }); mount(f.port); await ready();
    const links = screen.getAllByRole("link", { name: "Open admin screen" });
    expect(links.map(link => link.getAttribute("href"))).toEqual(PERMANENT_DELETE_TOOLS.flatMap(tool => tool.adminPath ? [tool.adminPath] : []));
    expect(screen.getByText("No Tovu admin screen for this operation.")).toBeVisible();
  });
  it("supports keyboard activation through native checkbox and dialog controls", async () => {
    const f = fakePort(), user = userEvent.setup(); mount(f.port); await ready();
    toggle().focus(); await user.keyboard(" "); expect(screen.getByRole("dialog")).toBeVisible();
    await user.keyboard("{Enter}"); await ready(); expect(toggle()).not.toBeChecked(); expect(f.writes).toEqual([]);
  });
});

it("translates the save fallback while preserving real API errors", async () => {
  const f = fakePort({ enabled: true, allowedToolIds: [], canEdit: true });
  const port: AssistantPermanentDeletesPort = { ...f.port, write: async () => { throw null; } };
  render(<AdminPermanentDeletes t={key => key === "failed to save permanent delete access" ? "no se pudo guardar el acceso a eliminaciones permanentes" : key}
    useController={input => useAdminPermanentDeletes({ ...input, port })} />);
  await ready();
  await userEvent.click(screen.getByRole("checkbox", { name: PERMANENT_DELETE_TOOLS[0].label }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("no se pudo guardar el acceso a eliminaciones permanentes"));
  expect(screen.getByRole("checkbox", { name: PERMANENT_DELETE_TOOLS[0].label })).not.toBeChecked();
});

it("unchanged enable requests do not write or ask for confirmation", async () => {
  const f = fakePort();
  const { result } = renderHook(() => useAdminPermanentDeletes({ port: f.port }));
  await waitFor(() => expect(result.current.settings?.enabled).toBe(false));
  await act(async () => { await result.current.setEnabled({ enabled: false }, {}); });
  expect(f.writes).toEqual([]);
  expect(result.current.dialog.open).toBe(false);
  expect(result.current.settings).toEqual({ enabled: false, allowedToolIds: [], canEdit: true });
});

it("checklist commands preserve the stored selection while the master is off", async () => {
  const f = fakePort({ enabled: false, allowedToolIds: ["trash_empty"], canEdit: true });
  const { result } = renderHook(() => useAdminPermanentDeletes({ port: f.port }));
  await waitFor(() => expect(result.current.settings?.enabled).toBe(false));
  await act(async () => {
    await result.current.setTool({ toolId: "trash_empty", checked: false }, {});
    await result.current.selectAll({}, {});
    await result.current.selectNone({}, {});
  });
  expect(f.writes).toEqual([]);
  expect(result.current.settings?.allowedToolIds).toEqual(["trash_empty"]);
});

it("unchecking one tool preserves the other tools and checking an existing tool does not duplicate it", async () => {
  const secondId = PERMANENT_DELETE_TOOLS[1].id;
  const f = fakePort({ enabled: true, allowedToolIds: ["trash_empty", secondId], canEdit: true });
  const { result } = renderHook(() => useAdminPermanentDeletes({ port: f.port }, {}));
  await waitFor(() => expect(result.current.settings?.enabled).toBe(true));
  await act(async () => { await result.current.setTool({ toolId: "trash_empty", checked: true }); });
  expect(f.writes).toEqual([{ enabled: true, allowedToolIds: ["trash_empty", secondId], riskAcknowledged: false }]);
  await act(async () => { await result.current.setTool({ toolId: "trash_empty", checked: false }); });
  expect(f.writes.at(-1)).toEqual({ enabled: true, allowedToolIds: [secondId], riskAcknowledged: false });
  expect(result.current.settings?.allowedToolIds).toEqual([secondId]);
});

it("checklist commands are inert before settings load", async () => {
  let resolveRead!: (settings: AssistantPermanentDeletesSettings) => void;
  const pending = new Promise<AssistantPermanentDeletesSettings>(resolve => { resolveRead = resolve; });
  const f = fakePort();
  const port: AssistantPermanentDeletesPort = { ...f.port, read: () => pending };
  const { result } = renderHook(() => useAdminPermanentDeletes({ port }));
  expect(result.current.settings).toBeNull();
  await act(async () => {
    await result.current.setTool({ toolId: "trash_empty", checked: true });
    await result.current.selectAll({});
    await result.current.selectNone({});
    await result.current.setEnabled({ enabled: false });
  });
  expect(f.writes).toEqual([]);
  await act(async () => { resolveRead({ enabled: false, allowedToolIds: [], canEdit: true }); });
  await waitFor(() => expect(result.current.settings?.enabled).toBe(false));
});
