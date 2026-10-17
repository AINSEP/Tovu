import { act, fireEvent, render, renderHook, screen, waitFor } from "@/__tests__/fetch-query-render";
import type { ChangeEvent } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopyKeysDialog } from "../CopyKeysDialog";
import { useCopyKeys, useWiredCopyKeys, type CopyKeysPort } from "../hooks/use-copy-keys.hooks";
import { ApiError, type AdminCredentialCopySource } from "@/lib/api";
import { subscribeToContentRefresh } from "@/lib/content-refresh-bus";
import { useOtherCredentials } from "../hooks/use-other-credentials.hooks";
import { createFakeOtherCredentialsPort } from "../hooks/other-credentials-dependencies.hooks";

const t = (key: string) => key;
const sources: AdminCredentialCopySource[] = [
  { siteId: "a", name: "Alpha", keys: [{ kind: "vendor", id: "one", label: "Main", provider: "OpenAI", last4: "1234" }] },
  { siteId: "b", name: "Beta", keys: [{ kind: "custom", id: "two", label: "Work", provider: "Example", last4: "5678" }] },
];
function port(choices = sources): CopyKeysPort {
  return {
    listCredentialCopySources: vi.fn().mockResolvedValue({ sources: choices }),
    copyCredentials: vi.fn().mockResolvedValue({ results: [{ kind: "vendor", id: "one", status: "copied", last4: "1234" }] }),
  };
}
function Harness({ api, startSite }: { api: CopyKeysPort; startSite?: (input: { id: string }) => Promise<unknown> }) {
  const dialog = useCopyKeys({ t }, { port: api, startSite });
  return <><button onClick={dialog.show}>Open</button><CopyKeysDialog dialog={dialog} t={t} /></>;
}
async function open(api: CopyKeysPort, startSite?: (input: { id: string }) => Promise<unknown>) {
  const user = userEvent.setup();
  const view = render(<Harness api={api} startSite={startSite} />);
  expect(api.listCredentialCopySources).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Open" }));
  await screen.findByRole("option", { name: "Alpha" });
  await user.selectOptions(screen.getByLabelText("Source project"), "a");
  return { user, ...view };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("CopyKeysDialog", () => {
  it("stays hidden until opened and closes when cancelled", async () => {
    const api = port();
    const user = userEvent.setup();
    render(<Harness api={api} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open" }));
    await screen.findByRole("option", { name: "Alpha" });
    expect(screen.getByRole("dialog", { name: "Copy keys from another project…" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("clears selected keys and results when the source changes; overwrite starts unchecked", async () => {
    const api = port();
    const { user } = await open(api);
    expect(screen.getByLabelText("Overwrite existing")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Copy" })).toBeDisabled();
    await user.click(screen.getByLabelText("Main · OpenAI · …1234"));
    await user.click(screen.getByRole("button", { name: "Copy" }));
    await screen.findByText("Main · copied ✓ …1234");
    expect(api.copyCredentials).toHaveBeenCalledExactlyOnceWith({ sourceSiteId: "a", ids: ["one"], overwrite: false });
    await user.selectOptions(screen.getByLabelText("Source project"), "b");
    expect(screen.getByLabelText("Work · Example · …5678")).not.toBeChecked();
    expect(screen.queryByText("Main · copied ✓ …1234")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy" })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText("Source project"), "a");
    expect(screen.getByLabelText("Main · OpenAI · …1234")).not.toBeChecked();
  });

  it("refuses form submission when no keys are selected", async () => {
    const api = port();
    await open(api);
    // Submit the form directly so the disabled button cannot mask the controller's refusal.
    const form = screen.getByRole("button", { name: "Copy" }).closest("form")!;
    await act(async () => { fireEvent.submit(form); });
    expect(api.copyCredentials).not.toHaveBeenCalled();
  });

  it("labels keys with their kind when the provider is absent", async () => {
    await open(port([{ ...sources[0]!, keys: [
      { kind: "custom", id: "one", label: "Main", provider: null, last4: "1234" },
    ] }]));
    expect(screen.getByLabelText("Main · custom · …1234")).toBeInTheDocument();
  });

  it("renders only summaries, including skipped and failed reasons, and publishes inventory refresh", async () => {
    const api = port();
    vi.mocked(api.copyCredentials).mockResolvedValue({ results: [
      { kind: "vendor", id: "one", status: "copied", last4: "1234", value: "never-show-this-value" },
      { kind: "custom", id: "two", status: "skipped", reasonCode: "target-exists" },
      { kind: "custom", id: "three", status: "failed", reasonCode: "conflict" },
      { kind: "custom", id: "four", status: "copied" },
    ] } as Awaited<ReturnType<CopyKeysPort["copyCredentials"]>>);
    const refreshed = vi.fn();
    const unsubscribe = subscribeToContentRefresh(refreshed);
    try {
      const { user, container } = await open(api);
      await user.click(screen.getByLabelText("Main · OpenAI · …1234"));
      await user.click(screen.getByLabelText("Overwrite existing"));
      await user.click(screen.getByRole("button", { name: "Copy" }));
      await screen.findByText("Main · copied ✓ …1234");
      expect(screen.getByText("skipped (already there)")).toBeInTheDocument();
      expect(screen.getByText("Changed during copy; try again.")).toBeInTheDocument();
      expect(screen.getByText("copied ✓")).toBeInTheDocument();
      expect(container.innerHTML).not.toContain("never-show-this-value");
      expect(refreshed).toHaveBeenCalledExactlyOnceWith(["access-tokens"]);
      expect(api.copyCredentials).toHaveBeenCalledWith({ sourceSiteId: "a", ids: ["one"], overwrite: true });
    } finally { unsubscribe(); }
  });

  it("shows the exact upgrade instruction and starts only the route-supplied desktop site", async () => {
    const upgrade = { ...sources[0]!, keys: [], reasonCode: "source-needs-upgrade",
      actionHint: { action: "start-site" as const, siteId: "a", desktopSiteId: "/registered/alpha" } };
    const api = port([upgrade]);
    vi.mocked(api.listCredentialCopySources).mockResolvedValueOnce({ sources: [upgrade] }).mockResolvedValue({ sources });
    const startSite = vi.fn().mockResolvedValue({});
    const { user } = await open(api, startSite);
    expect(screen.getByText("Start Alpha once in Tovu to upgrade it, then copy.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Start project" }));
    await screen.findByLabelText("Main · OpenAI · …1234");
    expect(startSite).toHaveBeenCalledExactlyOnceWith({ id: "/registered/alpha" });
  });

  it("offers no start action without a route hint, even when the desktop port exists", async () => {
    await open(port([{ ...sources[0]!, keys: [], reasonCode: "source-needs-upgrade" }]), vi.fn());
    expect(screen.queryByRole("button", { name: "Start project" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
  });

  it("starts a project only once while its desktop start is in flight", async () => {
    const api = port([{ ...sources[0]!, keys: [], reasonCode: "source-needs-upgrade",
      actionHint: { action: "start-site", siteId: "a", desktopSiteId: "/registered/alpha" } }]);
    let finish!: () => void;
    const started = new Promise<void>(resolve => { finish = resolve; });
    const startSite = vi.fn(() => started);
    const { result } = renderHook(() => useCopyKeys({ t }, { port: api, startSite }));
    await act(async () => { result.current.show({ currentTarget: document.createElement("button") }); });
    act(() => result.current.changeSource({ currentTarget: { value: "a" } } as ChangeEvent<HTMLSelectElement>));
    expect(result.current.canStart).toBe(true);
    const start = result.current.start;
    let attempts!: Promise<void>[];
    // Call the controller twice before completion; the dialog disables its button after one click.
    act(() => { attempts = [start(), start()]; });
    await act(async () => { finish(); await Promise.all(attempts); });
    expect(startSite).toHaveBeenCalledExactlyOnceWith({ id: "/registered/alpha" });
  });

  it("locks source, keys, overwrite and cancellation while copying and suppresses repeat submission", async () => {
    const api = port();
    let finish!: (value: Awaited<ReturnType<CopyKeysPort["copyCredentials"]>>) => void;
    vi.mocked(api.copyCredentials).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const { user } = await open(api);
    await user.click(screen.getByLabelText("Main · OpenAI · …1234"));
    await user.dblClick(screen.getByRole("button", { name: "Copy" }));
    expect(screen.getByLabelText("Source project")).toBeDisabled();
    expect(screen.getByLabelText("Main · OpenAI · …1234")).toBeDisabled();
    expect(screen.getByLabelText("Overwrite existing")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(api.copyCredentials).toHaveBeenCalledTimes(1);
    finish({ results: [] });
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled());
  });

  it("shows safe failure copy and resets overwrite and selection after cancel/reopen", async () => {
    const api = port();
    vi.mocked(api.copyCredentials).mockRejectedValue(new Error("secret driver payload"));
    const { user, container } = await open(api);
    await user.click(screen.getByLabelText("Main · OpenAI · …1234"));
    await user.click(screen.getByLabelText("Overwrite existing"));
    await user.click(screen.getByRole("button", { name: "Copy" }));
    await screen.findByRole("alert");
    expect(container.innerHTML).not.toContain("secret driver payload");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Open" }));
    await screen.findByRole("option", { name: "Alpha" });
    await user.selectOptions(screen.getByLabelText("Source project"), "a");
    expect(screen.getByLabelText("Overwrite existing")).not.toBeChecked();
    expect(screen.getByLabelText("Main · OpenAI · …1234")).not.toBeChecked();
  });

  it("refreshes the existing Tier 2 store reader after copy", async () => {
    const stores = createFakeOtherCredentialsPort();
    const read = vi.spyOn(stores, "getMediaProviders");
    function Inventory() {
      const inventory = useOtherCredentials(stores, t, "en", { query: "", category: "all" });
      return <><output>{inventory.groups ? "ready" : "loading"}</output>
        {inventory.groups?.flatMap(group => group.rows.map(row => <span key={row.key}>{row.valueFact}</span>))}</>;
    }
    render(<Inventory />);
    await screen.findByText("ready");
    const before = read.mock.calls.length;
    read.mockResolvedValue({ cloudinary: { apiKeyConfigured: true, apiKeyTail: "5678" } });
    const { user } = await open(port());
    await user.click(screen.getByLabelText("Main · OpenAI · …1234"));
    await user.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(read).toHaveBeenCalledTimes(before + 1));
    await screen.findByText(/5678/);
  });

  it("handles a source that needs upgrading between inventory and submission", async () => {
    const api = port();
    vi.mocked(api.copyCredentials).mockRejectedValue(new ApiError("private payload", 409, undefined, { reasonCode: "source-needs-upgrade" }));
    const { user } = await open(api);
    await user.click(screen.getByLabelText("Main · OpenAI · …1234"));
    await user.click(screen.getByRole("button", { name: "Copy" }));
    await screen.findByText("Start Alpha once in Tovu to upgrade it, then copy.");
    expect(screen.getByRole("button", { name: "Copy" })).toBeDisabled();
    expect(screen.queryByLabelText("Main · OpenAI · …1234")).not.toBeInTheDocument();
    expect(screen.queryByText("private payload")).not.toBeInTheDocument();
  });

  it("shows a safe project-list failure and can load again after reopening", async () => {
    const api = port();
    vi.mocked(api.listCredentialCopySources).mockRejectedValueOnce(new Error("private inventory error"));
    const { result } = renderHook(() => useCopyKeys({ t }, { port: api }));
    await act(async () => { result.current.show({ currentTarget: document.createElement("button") }); });
    expect(result.current.error).toBe("Couldn't load projects. Try again.");
    expect(result.current.loading).toBe(false);
    act(() => result.current.cancel());
    await act(async () => { result.current.show({ currentTarget: document.createElement("button") }); });
    expect(result.current.sources).toEqual(sources);
    expect(result.current.error).toBe("");
  });

  it.each(["resolve", "reject"])("ignores a stale inventory %s after cancellation and reopening", async outcome => {
    let resolve!: (value: { sources: AdminCredentialCopySource[] }) => void;
    let reject!: (error: Error) => void;
    const oldRequest = new Promise<{ sources: AdminCredentialCopySource[] }>((yes, no) => { resolve = yes; reject = no; });
    let finishNew!: (value: { sources: AdminCredentialCopySource[] }) => void;
    const newRequest = new Promise<{ sources: AdminCredentialCopySource[] }>(yes => { finishNew = yes; });
    const api = port();
    vi.mocked(api.listCredentialCopySources).mockReturnValueOnce(oldRequest).mockReturnValueOnce(newRequest);
    const { result } = renderHook(() => useCopyKeys({ t }, { port: api }));
    act(() => result.current.show({ currentTarget: document.createElement("button") }));
    expect(result.current.loading).toBe(true);
    act(() => result.current.cancel());
    await act(async () => { result.current.show({ currentTarget: document.createElement("button") }); });
    expect(result.current.sources).toEqual([]);
    await act(async () => {
      if (outcome === "resolve") resolve({ sources: [{ ...sources[0]!, name: "Stale" }] });
      else reject(new Error("stale failure"));
      await oldRequest.catch(() => undefined);
    });
    expect(result.current.sources).toEqual([]);
    expect(result.current.error).toBe("");
    expect(result.current.loading).toBe(true);
    await act(async () => { finishNew({ sources }); await newRequest; });
    expect(result.current.sources).toEqual(sources);
    expect(result.current.loading).toBe(false);
  });

  it("removes unchecked keys, bounds selection at 100, and refuses concurrent submissions and cancellation", async () => {
    const keys = Array.from({ length: 101 }, (_, index) => ({ kind: "custom" as const, id: `k${index}`, label: `Key ${index}`, provider: null }));
    const api = port([{ ...sources[0]!, keys }]);
    let finish!: (value: { results: [] }) => void;
    vi.mocked(api.copyCredentials).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const { result } = renderHook(() => useCopyKeys({ t }, { port: api }));
    await act(async () => { result.current.show({ currentTarget: document.createElement("button") }); });
    act(() => result.current.changeSource({ currentTarget: { value: "a" } } as ChangeEvent<HTMLSelectElement>));
    act(() => { for (const key of keys) result.current.changeKey({ currentTarget: { value: key.id, checked: true } } as ChangeEvent<HTMLInputElement>); });
    expect(result.current.disabled).toBe(true);
    await act(async () => { await result.current.submit({ preventDefault() {} }); });
    expect(api.copyCredentials).not.toHaveBeenCalled();
    act(() => result.current.changeKey({ currentTarget: { value: "k100", checked: false } } as ChangeEvent<HTMLInputElement>));
    expect(result.current.keys.find(key => key.id === "k100")?.checked).toBe(false);
    expect(result.current.keys.find(key => key.id === "k0")?.text).toBe("Key 0 · custom");
    expect(result.current.disabled).toBe(false);
    const submit = result.current.submit;
    let attempts!: Promise<void>[];
    act(() => { attempts = [submit({ preventDefault() {} }), submit({ preventDefault() {} })]; result.current.cancel(); });
    expect(result.current.open).toBe(true);
    expect(result.current.pending).toBe(true);
    await act(async () => { finish({ results: [] }); await Promise.all(attempts); });
    expect(api.copyCredentials).toHaveBeenCalledExactlyOnceWith({ sourceSiteId: "a", ids: keys.slice(0, 100).map(key => key.id), overwrite: false });
    expect(result.current.results).toEqual([]);
    expect(result.current.pending).toBe(false);
    act(() => result.current.cancel());
    expect(result.current.open).toBe(false);
  });

  it("shows safe copy failure text for an ApiError without a reason body", async () => {
    const api = port();
    vi.mocked(api.copyCredentials).mockRejectedValue(new ApiError("private failure", 500));
    const { user } = await open(api);
    await user.click(screen.getByLabelText("Main · OpenAI · …1234"));
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Copying keys failed. Try again.");
    expect(screen.queryByText("private failure")).not.toBeInTheDocument();
  });

  it("uses the default HTTP port and exposes a selected empty project's message", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url, init) => {
      expect(url).toBe("/api/admin/v1/workspaces/workspace-local/system/credential-copy");
      expect(init.method).toBe("GET");
      return Response.json({ sources: [
        { siteId: "empty", name: "Empty", keys: [], message: "No eligible keys in this project." },
      ] });
    }));
    const { result } = renderHook(() => useCopyKeys({ t }));
    await act(async () => { result.current.show({ currentTarget: document.createElement("button") }); });
    act(() => result.current.changeSource({ currentTarget: { value: "empty" } } as ChangeEvent<HTMLSelectElement>));
    expect(result.current.empty).toBe(true);
    expect(result.current.keys).toEqual([]);
    expect(result.current.sourceMessage).toBe("No eligible keys in this project.");
    expect(result.current.disabled).toBe(true);
  });

  it("does not offer or perform desktop start for a mismatched route hint", async () => {
    const api = port([{ ...sources[0]!, keys: [], reasonCode: "source-needs-upgrade",
      actionHint: { action: "start-site", siteId: "b", desktopSiteId: "/registered/beta" } }]);
    const startSite = vi.fn();
    const { result } = renderHook(() => useCopyKeys({ t }, { port: api, startSite }));
    await act(async () => { result.current.show({ currentTarget: document.createElement("button") }); });
    act(() => result.current.changeSource({ currentTarget: { value: "a" } } as ChangeEvent<HTMLSelectElement>));
    expect(result.current.canStart).toBe(false);
    await act(async () => { await result.current.start(); });
    expect(startSite).not.toHaveBeenCalled();
    expect(result.current.pending).toBe(false);
  });

  it("shows a safe start failure and keeps the upgrade selection available for retry", async () => {
    const api = port([{ ...sources[0]!, keys: [], reasonCode: "source-needs-upgrade",
      actionHint: { action: "start-site", siteId: "a", desktopSiteId: "/registered/alpha" } }]);
    const startSite = vi.fn().mockRejectedValue(new Error("private desktop error"));
    const { user } = await open(api, startSite);
    await user.click(screen.getByRole("button", { name: "Start project" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't start this project. Try again.");
    expect(screen.queryByText("private desktop error")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start project" })).toBeEnabled();
    expect(api.listCredentialCopySources).toHaveBeenCalledTimes(1);
  });

  it("retains the other source when an upgrade refusal changes the selected source", async () => {
    const api = port();
    vi.mocked(api.copyCredentials).mockRejectedValue(new ApiError("private", 409, undefined, { reasonCode: "source-needs-upgrade" }));
    const { result } = renderHook(() => useCopyKeys({ t }, { port: api }));
    await act(async () => { result.current.show({ currentTarget: document.createElement("button") }); });
    act(() => result.current.changeSource({ currentTarget: { value: "a" } } as ChangeEvent<HTMLSelectElement>));
    act(() => result.current.changeKey({ currentTarget: { value: "one", checked: true } } as ChangeEvent<HTMLInputElement>));
    await act(async () => { await result.current.submit({ preventDefault() {} }); });
    expect(result.current.sources).toEqual([{ ...sources[0]!, keys: [], reasonCode: "source-needs-upgrade" }, sources[1]]);
    expect(result.current.keys).toEqual([]);
    expect(result.current.disabled).toBe(true);
  });

  it.each([undefined, {}, { startSite: vi.fn(async () => ({})) }])("wires the HTTP inventory and optional desktop bridge: %s", async bridge => {
    vi.stubGlobal("tovuRunner", bridge);
    const fetch = vi.fn(async (url, init) => {
      expect(url).toBe("/api/admin/v1/workspaces/workspace-local/system/credential-copy");
      expect(init.method).toBe("GET");
      return Response.json({ sources: [{ ...sources[0]!, keys: [], reasonCode: "source-needs-upgrade",
        actionHint: { action: "start-site", siteId: "a", desktopSiteId: "/registered/alpha" } }] });
    });
    vi.stubGlobal("fetch", fetch);
    const { result } = renderHook(() => useWiredCopyKeys({ t }));
    await act(async () => { result.current.show({ currentTarget: document.createElement("button") }); });
    expect(result.current.sources[0]?.name).toBe("Alpha");
    act(() => result.current.changeSource({ currentTarget: { value: "a" } } as ChangeEvent<HTMLSelectElement>));
    expect(result.current.canStart).toBe(!!bridge && "startSite" in bridge);
    await act(async () => { await result.current.start(); });
    if (bridge && "startSite" in bridge) {
      expect(bridge.startSite).toHaveBeenCalledExactlyOnceWith("/registered/alpha");
      expect(fetch).toHaveBeenCalledTimes(2);
    } else expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.current.sourceMessage).toBe("Start Alpha once in Tovu to upgrade it, then copy.");
  });
});
