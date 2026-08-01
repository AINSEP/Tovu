import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useSettingsSlice, SAVE_DEBOUNCE_MS } from "../use-settings-slice.hooks";
import { publishSettingsRefresh, resetSettingsRefreshBus } from "../../lib/settings-refresh-bus";

/**
 * @file The external-refresh half of the slice.
 *
 * The happy path (a remote change appears without a reload) is one test. The rest are all the same
 * question from different angles: **can a refresh overwrite something the operator typed?** It must
 * not — that is data loss, and this hook has already had two distinct data-loss bugs found in it by
 * audit. A missed refresh is recoverable in a second; a swallowed keystroke is not.
 */

afterEach(() => {
  resetSettingsRefreshBus();
  vi.useRealTimers();
});

describe("useSettingsSlice external refresh", () => {
  it("picks up a value changed elsewhere, with no reload and no edit in progress", async () => {
    let stored = "en";
    const { result } = renderHook(() =>
      useSettingsSlice<string>({
        load: async () => stored,
        save: async () => [],
        defaultValue: "en",
        namespaces: ["core.language"],
      }),
    );

    await waitFor(() => expect(result.current.value).toBe("en"));

    stored = "es"; // an agent run, another tab, another operator
    await act(async () => {
      publishSettingsRefresh(["core.language"]);
    });

    await waitFor(() => expect(result.current.value).toBe("es"));
  });

  it("IGNORES a refresh while the operator has an uncommitted edit", async () => {
    vi.useFakeTimers();
    let stored = "en";
    const { result } = renderHook(() =>
      useSettingsSlice<string>({
        load: async () => stored,
        save: async () => [],
        defaultValue: "en",
        namespaces: ["core.language"],
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.value).toBe("en");

    // Operator types. The debounce has not fired, so nothing is persisted yet.
    act(() => result.current.onChange("fr"));
    expect(result.current.value).toBe("fr");

    stored = "es";
    await act(async () => {
      publishSettingsRefresh(["core.language"]);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.value).toBe("fr");
  });

  it("still ignores a refresh whose load resolves AFTER an edit begins", async () => {
    // The race the post-await re-check exists for: the reload was legitimately in flight when the
    // operator started typing, and its response predates their keystroke.
    let stored = "en";
    let releaseLoad: (() => void) | null = null;
    let loadCount = 0;

    const { result } = renderHook(() =>
      useSettingsSlice<string>({
        load: async () => {
          loadCount += 1;
          if (loadCount > 1) await new Promise<void>((resolve) => (releaseLoad = resolve));
          return stored;
        },
        save: async () => [],
        defaultValue: "en",
      }),
    );

    await waitFor(() => expect(result.current.value).toBe("en"));

    stored = "es";
    act(() => publishSettingsRefresh());
    await waitFor(() => expect(releaseLoad).not.toBeNull());

    // Operator types while the reload is still awaiting.
    act(() => result.current.onChange("fr"));

    await act(async () => {
      releaseLoad!();
      await Promise.resolve();
    });

    expect(result.current.value).toBe("fr");
  });

  it("ignores a refresh naming only namespaces this slice does not read", async () => {
    const load = vi.fn(async () => "en");
    renderHook(() =>
      useSettingsSlice<string>({ load, save: async () => [], defaultValue: "en", namespaces: ["core.language"] }),
    );

    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));

    await act(async () => {
      publishSettingsRefresh(["core.privacy"]);
    });

    expect(load).toHaveBeenCalledTimes(1);
  });

  it("reloads on an unscoped refresh even when it declares namespaces", async () => {
    // `null` scope means "something changed but we do not know what" — the run-completion publisher
    // always sends this. A slice must not filter it out.
    const load = vi.fn(async () => "en");
    renderHook(() =>
      useSettingsSlice<string>({ load, save: async () => [], defaultValue: "en", namespaces: ["core.language"] }),
    );

    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));

    await act(async () => {
      publishSettingsRefresh();
    });

    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  });

  it("reloads on everything when the slice declares no namespaces", async () => {
    // The safe default: a slice that forgot to declare stays correct, just chattier.
    const load = vi.fn(async () => "en");
    renderHook(() => useSettingsSlice<string>({ load, save: async () => [], defaultValue: "en" }));

    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));

    await act(async () => {
      publishSettingsRefresh(["core.privacy"]);
    });

    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  });

  it("keeps showing the last good value when a background reload fails", async () => {
    let fail = false;
    const { result } = renderHook(() =>
      useSettingsSlice<string>({
        load: async () => {
          if (fail) throw new Error("network blip");
          return "en";
        },
        save: async () => [],
        defaultValue: "en",
      }),
    );

    await waitFor(() => expect(result.current.value).toBe("en"));

    fail = true;
    await act(async () => {
      publishSettingsRefresh();
    });

    // A refresh the operator never asked for must not replace a working panel with an error state.
    expect(result.current.value).toBe("en");
    expect(result.current.loadError).toBeNull();
  });

  it("stops refreshing once unmounted", async () => {
    const load = vi.fn(async () => "en");
    const { unmount } = renderHook(() =>
      useSettingsSlice<string>({ load, save: async () => [], defaultValue: "en" }),
    );

    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    unmount();

    await act(async () => {
      publishSettingsRefresh();
    });

    expect(load).toHaveBeenCalledTimes(1);
  });

  it("resumes accepting refreshes once the operator's edit is saved", async () => {
    vi.useFakeTimers();
    let stored = "en";
    const { result } = renderHook(() =>
      useSettingsSlice<string>({
        load: async () => stored,
        save: async (next) => {
          stored = next;
          return ["locale"];
        },
        defaultValue: "en",
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    act(() => result.current.onChange("fr"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS + 10);
    });
    expect(stored).toBe("fr");

    stored = "es";
    await act(async () => {
      publishSettingsRefresh();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.value).toBe("es");
  });
});
