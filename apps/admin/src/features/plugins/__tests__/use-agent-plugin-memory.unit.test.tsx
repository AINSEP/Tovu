import { afterEach, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@/__tests__/fetch-query-render";
import { useAgentPluginMemory, useWiredAgentPluginMemory } from "../hooks/use-agent-plugin-memory.hooks";
import type { AgentPluginMemoryPort, PluginMemoryListing } from "../hooks/agent-plugin-memory-port.hooks";

afterEach(() => vi.restoreAllMocks());

const listing = (overrides: Partial<PluginMemoryListing> = {}): PluginMemoryListing => ({
  pluginId: "p1", learned: [], notes: [{ relativePath: "project.md", text: "hello" }], limits: { learned: 1, notes: 1, files: 1 }, ...overrides,
});
const t = (key: string) => `T:${key}`;

it("hydrates the editor from the first note once the read lands", async () => {
  const port: AgentPluginMemoryPort = { read: vi.fn(async () => listing()), saveNote: vi.fn() };
  const { result } = renderHook(() => useAgentPluginMemory({ pluginId: "p1", port, t }));
  await waitFor(() => expect(result.current.text).toBe("hello"));
  expect(result.current.entryPath).toBe("project.md");
  expect(result.current.editorDisabled).toBe(false);
  expect(result.current.status).toBeNull();
});

it("says so, logs the cause and keeps the editor locked when the loaded notes cannot be applied", async () => {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const notes = Object.assign([], { find: () => { throw new Error("notes could not be searched"); } });
  const port: AgentPluginMemoryPort = { read: vi.fn(async () => listing({ notes })), saveNote: vi.fn() };
  const { result } = renderHook(() => useAgentPluginMemory({ pluginId: "p1", port, t }));
  await waitFor(() => expect(result.current.status).toBe("T:Could not load memory."));
  expect(consoleError).toHaveBeenCalledWith("[agent-plugin-memory] Could not apply the loaded notes", expect.anything());
  expect(result.current.editorDisabled).toBe(true);
});

it("shows a load error in plain words when the read fails", async () => {
  const port: AgentPluginMemoryPort = { read: vi.fn(async () => { throw new Error("offline"); }), saveNote: vi.fn() };
  const { result } = renderHook(() => useAgentPluginMemory({ pluginId: "p1", port, t }));
  await waitFor(() => expect(result.current.status).toBe("T:Could not load memory."));
  expect(result.current.listing).toBeNull();
});

it("the wired hook reads through the real port and translates with the admin locale", async () => {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
    new Response(JSON.stringify(listing({ notes: [{ relativePath: "project.md", text: "from server" }] })), { status: 200, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
  const { result } = renderHook(() => useWiredAgentPluginMemory({ pluginId: "p/1" }));
  await waitFor(() => expect(result.current.text).toBe("from server"));
  expect(fetchMock.mock.calls.map(call => call[0])).toContain("/api/admin/v1/workspaces/workspace-local/agent-plugins/p%2F1/memory");
  vi.unstubAllGlobals();
});

it("saves the edited note, reports it, and picks up the returned listing", async () => {
  const saved = listing({ notes: [{ relativePath: "project.md", text: "edited" }, { relativePath: "b.md", text: "other" }] });
  const port: AgentPluginMemoryPort = { read: vi.fn(async () => listing({ notes: [{ relativePath: "project.md", text: "hello" }, { relativePath: "b.md", text: "other" }] })), saveNote: vi.fn(async () => saved) };
  const { result } = renderHook(() => useAgentPluginMemory({ pluginId: "p1", port, t }));
  await waitFor(() => expect(result.current.editorDisabled).toBe(false));
  act(() => result.current.setText({ text: "edited" }));
  expect(result.current.text).toBe("edited");
  await act(async () => { await result.current.save(); });
  expect(port.saveNote).toHaveBeenCalledExactlyOnceWith({ pluginId: "p1", entryPath: "project.md", text: "edited" });
  await waitFor(() => expect(result.current.status).toBe("T:Note saved."));
  expect(result.current.saving).toBe(false);
  act(() => result.current.setPath({ entryPath: "b.md" }));
  expect(result.current.entryPath).toBe("b.md");
  expect(result.current.text).toBe("other");
  act(() => result.current.setPath({ entryPath: "new.md" }));
  expect(result.current.text).toBe("");
});

it("explains a failed save in plain words and allows trying again", async () => {
  const saveNote = vi.fn().mockRejectedValueOnce(new Error("disk full")).mockResolvedValueOnce(listing());
  const port: AgentPluginMemoryPort = { read: vi.fn(async () => listing()), saveNote };
  const { result } = renderHook(() => useAgentPluginMemory({ pluginId: "p1", port, t }));
  await waitFor(() => expect(result.current.editorDisabled).toBe(false));
  await act(async () => { await result.current.save(); });
  await waitFor(() => expect(result.current.status).toBe("disk full"));
  await act(async () => { await result.current.save(); });
  await waitFor(() => expect(result.current.status).toBe("T:Note saved."));
  expect(saveNote).toHaveBeenCalledTimes(2);
});

it("ignores a second save while one is in flight and a save before the notes have loaded", async () => {
  let finish!: (value: PluginMemoryListing) => void;
  const saveNote = vi.fn(() => new Promise<PluginMemoryListing>(resolve => { finish = resolve; }));
  const port: AgentPluginMemoryPort = { read: vi.fn(async () => listing()), saveNote };
  const { result } = renderHook(() => useAgentPluginMemory({ pluginId: "p1", port, t }));
  await act(async () => { await result.current.save(); });
  expect(saveNote).not.toHaveBeenCalled();
  await waitFor(() => expect(result.current.editorDisabled).toBe(false));
  let first!: Promise<void>;
  act(() => { first = result.current.save(); });
  await act(async () => { await result.current.save(); });
  expect(saveNote).toHaveBeenCalledTimes(1);
  expect(result.current.saving).toBe(true);
  await act(async () => { finish(listing()); await first; });
  expect(result.current.saving).toBe(false);
});

it("explains empty note and learned lists only after a successful read", async () => {
  const port: AgentPluginMemoryPort = { read: vi.fn(async () => listing({ notes: [], learned: [] })), saveNote: vi.fn() };
  const { result } = renderHook(() => useAgentPluginMemory({ pluginId: "p1", port, t }));
  expect(result.current.notesEmptyMessage).toBeNull();
  await waitFor(() => expect(result.current.notesEmptyMessage).toBe("T:No note files yet. Save a project note to get started."));
  expect(result.current.learnedEmptyMessage).toBe("T:Nothing learned yet. The assistant saves what it verifies here.");
});

it("drops a save result that arrives after switching to another plugin, success or failure", async () => {
  for (const outcome of ["resolve", "reject"] as const) {
    let settle!: (value: PluginMemoryListing | Error) => void;
    const port: AgentPluginMemoryPort = {
      read: vi.fn(async ({ pluginId }) => listing({ pluginId, notes: [{ relativePath: "project.md", text: `note of ${pluginId}` }] })),
      saveNote: vi.fn(() => new Promise<PluginMemoryListing>((resolve, reject) => { settle = value => value instanceof Error ? reject(value) : resolve(value); })),
    };
    const { result, rerender } = renderHook(({ pluginId }) => useAgentPluginMemory({ pluginId, port, t }), { initialProps: { pluginId: "p1" } });
    await waitFor(() => expect(result.current.text).toBe("note of p1"));
    let pending!: Promise<void>;
    act(() => { pending = result.current.save(); });
    rerender({ pluginId: "p2" });
    expect(result.current.text).toBe("");
    await waitFor(() => expect(result.current.text).toBe("note of p2"));
    await act(async () => { settle(outcome === "resolve" ? listing({ pluginId: "p1" }) : new Error("late failure")); await pending; });
    expect(result.current.status).toBeNull();
    expect(result.current.text).toBe("note of p2");
  }
});

it("logs but does not set a status when the editor is left while the loaded notes are being applied", async () => {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  let leave = () => {};
  const notes = Object.assign([], { find: () => { leave(); throw new Error("left mid-apply"); } });
  const port: AgentPluginMemoryPort = { read: vi.fn(async () => listing({ notes })), saveNote: vi.fn() };
  const { result, unmount } = renderHook(() => useAgentPluginMemory({ pluginId: "p1", port, t }));
  leave = unmount;
  expect(result.current.status).toBe("T:Loading memory…");
  await waitFor(() => expect(consoleError).toHaveBeenCalledWith("[agent-plugin-memory] Could not apply the loaded notes", expect.anything()));
});

it("hydrates once: a later re-read never replaces what the person has typed", async () => {
  const port: AgentPluginMemoryPort = { read: vi.fn(async () => listing()), saveNote: vi.fn() };
  const { result, rerender } = renderHook(({ translate }) => useAgentPluginMemory({ pluginId: "p1", port, t: translate }), { initialProps: { translate: t } });
  await waitFor(() => expect(result.current.text).toBe("hello"));
  act(() => result.current.setText({ text: "typed" }));
  rerender({ translate: (key: string) => `U:${key}` }); // a new loadErrorMessage re-runs the load effect
  await waitFor(() => expect(port.read).toHaveBeenCalledTimes(2));
  await act(async () => { await Promise.resolve(); });
  expect(result.current.text).toBe("typed");
});
