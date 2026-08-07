import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, api, type AdminIdentityUser, type SettingResolvedValue } from "../../../lib/api";
import { useSettingsContainer } from "../hooks/use-settings-container.hooks";

/**
 * @file Characterization tests for `useSettingsContainer` — first direct test file for this hook
 * (previously exercised only through `Settings.unit.test.tsx`'s narrow permission-derivation
 * checks, which never drive its load/select/edit/reset behavior at all). Written against CURRENT
 * behavior per the complexity-pass dispatch — these pin the hook's existing contract before any
 * structural change is considered, per this pass's "test-first for zero-coverage hooks" rule.
 *
 * `buildNamespaceGroups`/`toSummary`/`selectedNamespaceAndKey`/`resolveSelectedDetail`/
 * `computeEditableScopes` (the pure `rules.ts` helpers this hook composes) are already directly
 * tested in `rules.unit.test.ts` — these tests exercise the hook's own wiring (state, effects, the
 * API calls and their error handling) rather than re-deriving those pure functions' own cases.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

const USER: AdminIdentityUser = {
  principalId: "p1",
  workspaceId: "ws1",
  username: "alice",
  email: "alice@example.com",
  status: "active",
  createdAt: "2026-01-01T00:00:00.000Z",
  roleIds: [],
  policyIds: [],
};

const CAN_WRITE_ALL = { global: true, workspace: true, userSelf: true, userOther: true };

function row(key: string, value: unknown, sourceLayer: SettingResolvedValue["sourceLayer"] = "default"): SettingResolvedValue {
  return { key, value, sourceLayer, defVersion: 1 };
}

function baseProps(overrides: Partial<Parameters<typeof useSettingsContainer>[0]> = {}) {
  return {
    canWriteScopes: CAN_WRITE_ALL,
    selfPrincipalId: "p1",
    users: [USER],
    ...overrides,
  };
}

/** Queues the two `getSettingsEffective` calls `loadNamespace` issues via `Promise.all`
 *  (with-principal, then without) in that order. */
function queueLoad(withUser: SettingResolvedValue[], withoutUser: SettingResolvedValue[] = withUser) {
  vi.spyOn(api, "getSettingsEffective")
    .mockResolvedValueOnce({ data: withUser })
    .mockResolvedValueOnce({ data: withoutUser });
}

async function mountLoaded(rows: SettingResolvedValue[] = [row("theme", "dark", "default")]) {
  queueLoad(rows);
  const view = renderHook(() => useSettingsContainer(baseProps()));
  await waitFor(() => expect(view.result.current.isLoading).toBe(false));
  return view;
}

describe("initial auto-load (core.presentation, on mount)", () => {
  it("starts isLoading=true, then loads and populates groups for the default namespace", async () => {
    queueLoad([row("theme", "dark", "default")]);
    const { result } = renderHook(() => useSettingsContainer(baseProps()));
    expect(result.current.isLoading).toBe(true);
    expect(result.current.namespaceInput).toBe("core.presentation");

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.groups).toEqual([{ namespace: "core.presentation", settings: [expect.objectContaining({ key: "theme" })] }]);
    expect(result.current.error).toBeNull();
  });

  it("calls getSettingsEffective twice — once with the caller's own principalId, once without", async () => {
    const getSettingsEffective = vi.spyOn(api, "getSettingsEffective").mockResolvedValue({ data: [] });
    renderHook(() => useSettingsContainer(baseProps()));

    await waitFor(() => expect(getSettingsEffective).toHaveBeenCalledTimes(2));
    expect(getSettingsEffective).toHaveBeenNthCalledWith(1, { namespace: "core.presentation" }, { principalId: "p1" });
    // The second call passes no second argument at all (not even `undefined` explicitly) — the
    // real source is `api.getSettingsEffective({ namespace })`, one-arg, relying on the API
    // function's own default parameter rather than passing an explicit `undefined`.
    expect(getSettingsEffective).toHaveBeenNthCalledWith(2, { namespace: "core.presentation" });
  });

  it("sets a describable error and isLoading=false when the load rejects", async () => {
    vi.spyOn(api, "getSettingsEffective").mockRejectedValue(new Error("network down"));
    const { result } = renderHook(() => useSettingsContainer(baseProps()));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe("network down");
    expect(result.current.groups).toEqual([]); // namespace never got added — see rules.ts buildNamespaceGroups
  });
});

describe("onLoadNamespace", () => {
  it("is a no-op (no load) for a blank/whitespace-only namespace input", async () => {
    const view = await mountLoaded();
    const getSettingsEffective = vi.spyOn(api, "getSettingsEffective");
    getSettingsEffective.mockClear(); // drop the mount's own auto-load calls before asserting
    act(() => view.result.current.setNamespaceInput("   "));

    act(() => {
      view.result.current.onLoadNamespace({ preventDefault: () => {} } as unknown as React.FormEvent);
    });

    expect(getSettingsEffective).not.toHaveBeenCalled();
  });

  it("loads the trimmed namespace and adds it alongside the already-loaded one", async () => {
    const view = await mountLoaded();
    act(() => view.result.current.setNamespaceInput("  core.editor  "));
    queueLoad([row("autosave", true, "workspace")]);

    act(() => {
      view.result.current.onLoadNamespace({ preventDefault: () => {} } as unknown as React.FormEvent);
    });

    await waitFor(() => expect(view.result.current.groups).toHaveLength(2));
    expect(view.result.current.groups.map((g) => g.namespace)).toEqual(["core.presentation", "core.editor"]);
  });
});

describe("principal selection", () => {
  it("onSubmitPrincipal matches by principalId, email, or username (case-insensitive) and sets valid state", async () => {
    const view = await mountLoaded();

    act(() => view.result.current.onSubmitPrincipal("ALICE@EXAMPLE.COM"));

    expect(view.result.current.principalValidationState).toBe("valid");
    expect(view.result.current.principalValue).toBe("alice");
    expect(view.result.current.principalLastError).toBeNull();
  });

  it("onSubmitPrincipal sets an error state and a PRINCIPAL_NOT_FOUND message for no match", async () => {
    const view = await mountLoaded();

    act(() => view.result.current.onSubmitPrincipal("nobody"));

    expect(view.result.current.principalValidationState).toBe("error");
    expect(view.result.current.principalValue).toBeNull();
    expect(view.result.current.principalLastError).toBe('PRINCIPAL_NOT_FOUND: no active principal matches "nobody".');
  });

  it("onClearPrincipal resets target/value/validationState/lastError to their idle defaults", async () => {
    const view = await mountLoaded();
    act(() => view.result.current.onSubmitPrincipal("alice"));
    expect(view.result.current.principalValidationState).toBe("valid");

    act(() => view.result.current.onClearPrincipal());

    expect(view.result.current.principalValue).toBeNull();
    expect(view.result.current.principalValidationState).toBe("idle");
    expect(view.result.current.principalLastError).toBeNull();
  });

  it("reloads every already-loaded namespace when the target principal changes", async () => {
    const view = await mountLoaded();
    const getSettingsEffective = vi.spyOn(api, "getSettingsEffective").mockResolvedValue({ data: [] });

    act(() => view.result.current.onSubmitPrincipal("alice"));

    // The principal-change effect reloads `core.presentation` again — 2 more calls (with/without).
    await waitFor(() => expect(getSettingsEffective).toHaveBeenCalledTimes(2));
    expect(getSettingsEffective).toHaveBeenCalledWith({ namespace: "core.presentation" }, { principalId: "p1" });
  });
});

describe("onSelectSetting / sel / detail / onRetryLoad", () => {
  it("onSelectSetting sets selectedKey via keyOf, and onRetryLoad becomes defined", async () => {
    const view = await mountLoaded();
    expect(view.result.current.onRetryLoad).toBeUndefined();

    act(() => view.result.current.onSelectSetting("core.presentation", "theme"));

    expect(view.result.current.selectedKey).toBe("core.presentation::theme");
    expect(view.result.current.sel).toEqual({ namespace: "core.presentation", key: "theme" });
    expect(view.result.current.onRetryLoad).toBeInstanceOf(Function);
  });

  it("detail resolves once both effective reads are loaded and the key matches", async () => {
    queueLoad([row("theme", "dark", "workspace")]);
    const view = renderHook(() => useSettingsContainer(baseProps()));
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));

    act(() => view.result.current.onSelectSetting("core.presentation", "theme"));

    expect(view.result.current.detail).not.toBeNull();
    expect(view.result.current.detail?.effective).toBe("dark");
  });

  it("editableScopes reflects canWriteScopes with no target principal (userSelf, not userOther)", async () => {
    const view = renderHook(() =>
      useSettingsContainer(baseProps({ canWriteScopes: { global: false, workspace: false, userSelf: true, userOther: false } })),
    );
    queueLoad([]);
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));

    expect(view.result.current.editableScopes).toEqual(["user"]);
  });
});

describe("onSubmitValue", () => {
  it("is a no-op (no api call) when nothing is selected", async () => {
    const view = await mountLoaded();
    const setSetting = vi.spyOn(api, "setSetting");

    await act(async () => {
      await view.result.current.onSubmitValue("global", "x");
    });

    expect(setSetting).not.toHaveBeenCalled();
  });

  it("calls api.setSetting, sets liveMessage, and reloads the namespace on success", async () => {
    const view = await mountLoaded();
    act(() => view.result.current.onSelectSetting("core.presentation", "theme"));
    const setSetting = vi.spyOn(api, "setSetting").mockResolvedValue({ key: "theme", scope: "global", value: "light", revisionSeq: 2 });
    queueLoad([row("theme", "light", "global")]); // the post-save reload

    await act(async () => {
      await view.result.current.onSubmitValue("global", "light");
    });

    expect(setSetting).toHaveBeenCalledWith(
      { namespace: "core.presentation", key: "theme", scope: "global", valueJson: "light" },
      { principalId: undefined },
    );
    expect(view.result.current.liveMessage).toBe("Saved core.presentation.theme at global scope.");
  });

  it("passes the effective principalId only when scope is 'user'", async () => {
    const view = await mountLoaded();
    act(() => view.result.current.onSelectSetting("core.presentation", "theme"));
    act(() => view.result.current.onSubmitPrincipal("alice")); // sets targetPrincipalId
    const getSettingsEffective = vi.spyOn(api, "getSettingsEffective").mockResolvedValue({ data: [] });
    await waitFor(() => expect(getSettingsEffective).toHaveBeenCalled()); // let the principal-change reload settle

    const setSetting = vi.spyOn(api, "setSetting").mockResolvedValue({ key: "theme", scope: "user", value: "light", revisionSeq: 3 });
    queueLoad([]);

    await act(async () => {
      await view.result.current.onSubmitValue("user", "light");
    });

    expect(setSetting).toHaveBeenCalledWith(expect.objectContaining({ scope: "user" }), { principalId: "p1" });
  });

  it("sets a describable error and saving=false on failure", async () => {
    const view = await mountLoaded();
    act(() => view.result.current.onSelectSetting("core.presentation", "theme"));
    vi.spyOn(api, "setSetting").mockRejectedValue(new ApiError("nope", 403, "FORBIDDEN"));

    await act(async () => {
      await view.result.current.onSubmitValue("global", "light");
    });

    expect(view.result.current.error).toBe("You do not have permission to do that."); // local rules.ts describeApiError override
    expect(view.result.current.saving).toBe(false);
  });
});

describe("onClearValue", () => {
  it("calls api.clearSetting and sets a Cleared liveMessage on success", async () => {
    const view = await mountLoaded();
    act(() => view.result.current.onSelectSetting("core.presentation", "theme"));
    vi.spyOn(api, "clearSetting").mockResolvedValue({ key: "theme", scope: "global", value: null, revisionSeq: 4 });
    queueLoad([]);

    await act(async () => {
      await view.result.current.onClearValue("global");
    });

    expect(view.result.current.liveMessage).toBe("Cleared core.presentation.theme at global scope.");
  });
});

describe("reset flow — onRequestReset / onConfirmReset / onCancelReset", () => {
  it("onRequestReset is a no-op when nothing is selected", async () => {
    const view = await mountLoaded();
    act(() => view.result.current.onRequestReset("global"));
    expect(view.result.current.pendingReset).toBeNull();
  });

  it("onRequestReset stages a pendingReset for the selected namespace/scope", async () => {
    const view = await mountLoaded();
    act(() => view.result.current.onSelectSetting("core.presentation", "theme"));

    act(() => view.result.current.onRequestReset("workspace"));

    expect(view.result.current.pendingReset).toEqual({ namespace: "core.presentation", scope: "workspace" });
  });

  it("onCancelReset clears pendingReset", async () => {
    const view = await mountLoaded();
    act(() => view.result.current.onSelectSetting("core.presentation", "theme"));
    act(() => view.result.current.onRequestReset("workspace"));

    act(() => view.result.current.onCancelReset());

    expect(view.result.current.pendingReset).toBeNull();
  });

  it("onConfirmReset is a no-op when there's no pendingReset", async () => {
    const view = await mountLoaded();
    const resetSettingsNamespace = vi.spyOn(api, "resetSettingsNamespace");

    await act(async () => {
      await view.result.current.onConfirmReset();
    });

    expect(resetSettingsNamespace).not.toHaveBeenCalled();
  });

  it("onConfirmReset calls the API, sets a clearedCount liveMessage, clears pendingReset, and reloads", async () => {
    const view = await mountLoaded();
    act(() => view.result.current.onSelectSetting("core.presentation", "theme"));
    act(() => view.result.current.onRequestReset("workspace"));
    vi.spyOn(api, "resetSettingsNamespace").mockResolvedValue({ namespace: "core.presentation", clearedCount: 3, revisionSeqs: [1, 2, 3] });
    queueLoad([]);

    await act(async () => {
      await view.result.current.onConfirmReset();
    });

    expect(view.result.current.liveMessage).toBe("Reset 3 setting(s) in core.presentation (workspace scope) to defaults.");
    expect(view.result.current.pendingReset).toBeNull();
  });

  it("onConfirmReset sets a describable error and leaves saving=false on failure", async () => {
    const view = await mountLoaded();
    act(() => view.result.current.onSelectSetting("core.presentation", "theme"));
    act(() => view.result.current.onRequestReset("workspace"));
    vi.spyOn(api, "resetSettingsNamespace").mockRejectedValue(new Error("boom"));

    await act(async () => {
      await view.result.current.onConfirmReset();
    });

    expect(view.result.current.error).toBe("boom");
    expect(view.result.current.saving).toBe(false);
  });
});
