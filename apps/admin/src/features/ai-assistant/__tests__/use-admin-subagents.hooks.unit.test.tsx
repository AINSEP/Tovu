import { act, renderHook, waitFor } from "@/__tests__/fetch-query-render";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ASSISTANT_CLI_CAPABILITIES, assistantCliPermissions } from "@tovu/headless";
import {
  useAdminSubagents, useAssistantSubagentsSettings, useDockAgentPermissions, useWiredAdminSubagents, useWiredAssistantSubagentsSettings,
} from "../hooks/use-admin-subagents.hooks";
import { assistantSubagentsPort, SUBAGENTS_NAMESPACE, type AssistantSubagentsPort, type AssistantSubagentsSettings } from "@/lib/assistant-subagents";
import { publishSettingsRefresh } from "@/lib/settings-refresh-bus";

const ALL_ON = { ...assistantCliPermissions({ enabled: true, capabilities: { userMcp: true } }), canEdit: true };

/** Typed fake port; reads or writes can be failed mid-test to reach stale-cache and error states. */
function fakePort(initial: AssistantSubagentsSettings = ALL_ON) {
  let stored = initial, readFailure: Error | null = null, writeFailure: unknown = undefined;
  const writes: Parameters<AssistantSubagentsPort["write"]>[0][] = [];
  const port: AssistantSubagentsPort = {
    read: async () => { if (readFailure) throw readFailure; return stored; },
    write: async input => {
      writes.push(input);
      if (writeFailure !== undefined) throw writeFailure;
      stored = { ...stored, ...assistantCliPermissions(input) };
      return stored;
    },
  };
  return { port, writes, failRead: (message: string) => { readFailure = new Error(message); }, failWrite: (error: unknown) => { writeFailure = error; } };
}
afterEach(() => { vi.restoreAllMocks(); });

describe("subagents tooltip", () => {
  const settingsHook = (port: AssistantSubagentsPort, agentId: string | null) =>
    renderHook(() => useAssistantSubagentsSettings({ port, mode: "local-cli", agentId }));

  it("hides the tooltip when no agent is selected", async () => {
    const { result } = settingsHook(fakePort().port, null);
    await waitFor(() => expect(result.current.settings).not.toBeNull());
    expect(result.current.tooltipKey).toBeNull();
  });

  it("follows an explicit subagents OFF over the master ON", async () => {
    const f = fakePort({ ...assistantCliPermissions({ enabled: true, capabilities: { subagents: false } }), canEdit: true });
    const { result } = settingsHook(f.port, "claude");
    await waitFor(() => expect(result.current.settings).not.toBeNull());
    expect(result.current.tooltipKey).toBeNull();
  });

  it("follows an explicit subagents ON over the master OFF", async () => {
    const f = fakePort({ ...assistantCliPermissions({ enabled: false, capabilities: { subagents: true } }), canEdit: true });
    const { result } = settingsHook(f.port, "claude");
    await waitFor(() => expect(result.current.tooltipKey).toBe("This chat can use subagents"));
  });

  it("falls back to the master when the server sends no capabilities", async () => {
    const { result } = settingsHook(fakePort({ enabled: true, canEdit: true }).port, "claude");
    await waitFor(() => expect(result.current.tooltipKey).toBe("This chat can use subagents"));
  });
});

describe("admin subagents controller", () => {
  it("a capability change before the grant loads writes nothing", async () => {
    const f = fakePort();
    const port: AssistantSubagentsPort = { ...f.port, read: () => new Promise<AssistantSubagentsSettings>(() => {}) };
    const { result } = renderHook(() => useAdminSubagents({ port }));
    await act(async () => { await result.current.setCapability({ key: "shell", enabled: false }); });
    expect(f.writes).toEqual([]);
  });

  it("a capability change keeps the master and every other capability", async () => {
    const f = fakePort({ ...assistantCliPermissions({ enabled: false, capabilities: { web: true } }), canEdit: true });
    const { result } = renderHook(() => useAdminSubagents({ port: f.port }));
    await waitFor(() => expect(result.current.settings).not.toBeNull());
    await act(async () => { await result.current.setCapability({ key: "shell", enabled: true }); });
    expect(f.writes).toEqual([{ ...assistantCliPermissions({ enabled: false, capabilities: { web: true, shell: true } }), riskAcknowledged: false }]);
  });

  it("an untranslated save failure falls back to the English copy", async () => {
    const f = fakePort();
    f.failWrite(null);
    const { result } = renderHook(() => useAdminSubagents({ port: f.port }));
    await waitFor(() => expect(result.current.settings).not.toBeNull());
    await act(async () => { await result.current.setEnabled({ enabled: false }); });
    expect(result.current.saveError).toBe("failed to save subagent access");
  });
});

describe("dock agent permissions", () => {
  const dock = (port: AssistantSubagentsPort, openSettings?: () => void) =>
    renderHook(() => useDockAgentPermissions({ t: key => `es:${key}`, port, ...(openSettings ? { openSettings } : {}) }));

  it("before the grant loads, everything is off, locked and without an advanced entry", () => {
    const port: AssistantSubagentsPort = { ...fakePort().port, read: () => new Promise<AssistantSubagentsSettings>(() => {}) };
    const { result } = dock(port, () => {});
    expect(result.current).toMatchObject({ enabled: false, canEdit: false, onMoreSettings: undefined, error: null, unavailableReason: undefined, busy: false });
    expect(result.current.capabilities.every(item => !item.enabled)).toBe(true);
  });

  it("offers the advanced entry and edits to a clean local owner", async () => {
    const openSettings = vi.fn();
    const { result } = dock(fakePort().port, openSettings);
    await waitFor(() => expect(result.current.canEdit).toBe(true));
    expect(result.current.onMoreSettings).toBe(openSettings);
    expect(result.current.enabled).toBe(true);
  });

  it("translates every capability label and description", async () => {
    const { result } = dock(fakePort().port);
    await waitFor(() => expect(result.current.canEdit).toBe(true));
    expect(result.current.capabilities).toEqual(ASSISTANT_CLI_CAPABILITIES.map(item =>
      ({ ...item, label: `es:${item.label}`, description: `es:${item.description}`, enabled: true })));
  });

  it("reports the master as off when any one capability is off", async () => {
    const { result } = dock(fakePort({ ...assistantCliPermissions({ enabled: true, capabilities: { web: false } }), canEdit: true }).port);
    await waitFor(() => expect(result.current.canEdit).toBe(true));
    expect(result.current.enabled).toBe(false);
  });

  it("hides the advanced entry and locks a non-owner", async () => {
    const { result } = dock(fakePort({ ...ALL_ON, canEdit: false }).port, () => {});
    await waitFor(() => expect(result.current.enabled).toBe(true));
    expect(result.current.onMoreSettings).toBeUndefined();
    expect(result.current.canEdit).toBe(false);
  });

  it("locks an owner's switches under an env lock but keeps the advanced entry and the reason", async () => {
    const openSettings = vi.fn();
    const f = fakePort({ ...assistantCliPermissions({ enabled: false }), canEdit: true, unavailableReason: "Turned off on this computer by TOVU_AGENT_FORBID_BASH." });
    const { result } = dock(f.port, openSettings);
    await waitFor(() => expect(result.current.unavailableReason).toBe("Turned off on this computer by TOVU_AGENT_FORBID_BASH."));
    expect(result.current.canEdit).toBe(false);
    expect(result.current.onMoreSettings).toBe(openSettings);
  });

  it("a failed refresh locks a cached owner, hides the advanced entry and shows the load error", async () => {
    const f = fakePort();
    const { result } = dock(f.port, () => {});
    await waitFor(() => expect(result.current.canEdit).toBe(true));
    f.failRead("Settings are unavailable.");
    act(() => publishSettingsRefresh([SUBAGENTS_NAMESPACE]));
    await waitFor(() => expect(result.current.error).toBe("Settings are unavailable."));
    expect(result.current.canEdit).toBe(false);
    expect(result.current.onMoreSettings).toBeUndefined();
  });

  it("shows the load error ahead of an earlier save error", async () => {
    const f = fakePort();
    f.failWrite(new Error("Permission save failed"));
    const { result } = dock(f.port);
    await waitFor(() => expect(result.current.canEdit).toBe(true));
    act(() => result.current.onChange({ key: "shell", enabled: false }));
    await waitFor(() => expect(result.current.error).toBe("Permission save failed"));
    f.failRead("Settings are unavailable.");
    act(() => publishSettingsRefresh([SUBAGENTS_NAMESPACE]));
    await waitFor(() => expect(result.current.error).toBe("Settings are unavailable."));
  });

  it("the master change writes every capability through the master", async () => {
    const f = fakePort();
    const { result } = dock(f.port);
    await waitFor(() => expect(result.current.canEdit).toBe(true));
    act(() => result.current.onChange({ enabled: false }));
    await waitFor(() => expect(f.writes).toEqual([{ ...assistantCliPermissions({ enabled: false }), riskAcknowledged: false }]));
  });

  it("ignores a change for a capability key it does not know", async () => {
    const f = fakePort();
    const { result } = dock(f.port);
    await waitFor(() => expect(result.current.canEdit).toBe(true));
    act(() => result.current.onChange({ key: "rootAccess", enabled: true }));
    await act(async () => { await Promise.resolve(); });
    expect(f.writes).toEqual([]);
    expect(result.current.busy).toBe(false);
  });
});

describe("production bindings", () => {
  it("the dock reads the production port when no port is injected", async () => {
    const read = vi.spyOn(assistantSubagentsPort, "read").mockResolvedValue(ALL_ON);
    const { result } = renderHook(() => useDockAgentPermissions({ t: key => key }));
    await waitFor(() => expect(result.current.canEdit).toBe(true));
    expect(read).toHaveBeenCalledWith({});
  });

  it("the wired admin controller reads the production port", async () => {
    const read = vi.spyOn(assistantSubagentsPort, "read").mockResolvedValue(ALL_ON);
    const { result } = renderHook(() => useWiredAdminSubagents({}));
    await waitFor(() => expect(result.current.settings).toEqual(ALL_ON));
    expect(read).toHaveBeenCalledWith({});
  });

  it("the wired tooltip settings read the production port", async () => {
    const read = vi.spyOn(assistantSubagentsPort, "read").mockResolvedValue(ALL_ON);
    const { result } = renderHook(() => useWiredAssistantSubagentsSettings({ mode: "local-cli", agentId: "claude" }));
    await waitFor(() => expect(result.current.tooltipKey).toBe("This chat can use subagents"));
    expect(read).toHaveBeenCalledWith({});
  });
});
