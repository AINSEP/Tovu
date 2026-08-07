import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, ApiError, type SiteAssistantCredential } from "../../../lib/api";
import { useVisitorCredentialForm } from "../hooks/use-visitor-credential-form.hooks";

/**
 * @file First test file for `useVisitorCredentialForm` (0% before this pass — no test file existed
 * for this screen's highest-complexity hook, cyc 20 / cog 33). Written as a CHARACTERIZATION suite
 * against the CURRENT, pre-refactor behavior — it documents what the code DOES, not a spec of what
 * it should do — so it can prove equivalence across the `runTestConnection` extraction this pass
 * also makes, same discipline `MediaPickerDialog.unit.test.tsx` used.
 *
 * Mocks `api.*` directly (`vi.spyOn`), not `fetch` — `createExecutionPort`'s `testConnection`/
 * `listModels` call `api.testExecutionConnection`/`api.listExecutionModels` directly (see
 * `lib/execution-settings.ts`), so spying there is the real boundary, the same convention
 * `MediaPickerDialog.unit.test.tsx`/`WidgetConfigFields.unit.test.tsx` already use.
 *
 * Scope note: this hook is large enough (five distinct async surfaces: hydration, two discovery
 * paths, key test, connection test, save) that this suite covers each surface's primary contract
 * and its one or two most consequential edge cases (the debounce security gate, the
 * refresh-must-not-clobber-connection-result guard) rather than exhaustively enumerating every
 * branch — reported as a scope note, not silently.
 */

function credential(overrides: Partial<SiteAssistantCredential> = {}): SiteAssistantCredential {
  return {
    isSet: false,
    masked: null,
    provider: "google",
    baseUrl: null,
    model: null,
    updatedAt: null,
    ...overrides,
  };
}

const NOT_STORED = { data: credential() };

beforeEach(() => {
  // Neutral baseline: hydration resolves quickly to "nothing stored" unless a test overrides it,
  // so the stored-key-triggered discovery effect never fires by accident in unrelated tests.
  vi.spyOn(api, "getAssistantSiteCredential").mockResolvedValue(NOT_STORED);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("useVisitorCredentialForm — initial config", () => {
  it("defaults to Google Gemini with an empty key and empty model", async () => {
    const { result } = renderHook(() => useVisitorCredentialForm());
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.config).toMatchObject({
      protocol: "google",
      providerId: "google-gemini",
      apiKey: "",
      baseUrl: "https://generativelanguage.googleapis.com",
      model: "",
    });
    expect(result.current.dirty).toBe(false);
  });
});

describe("useVisitorCredentialForm — hydration", () => {
  it("on success: sets stored and merges baseUrl/model into config, without marking dirty", async () => {
    vi.spyOn(api, "getAssistantSiteCredential").mockResolvedValue({
      data: credential({ isSet: true, masked: "••••abcd", baseUrl: "https://custom.example.com", model: "gpt-4o" }),
    });

    const { result } = renderHook(() => useVisitorCredentialForm());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.stored?.isSet).toBe(true);
    expect(result.current.config.baseUrl).toBe("https://custom.example.com");
    expect(result.current.config.model).toBe("gpt-4o");
    expect(result.current.dirty).toBe(false);
  });

  it("on failure: stays silent — stored is null, no error surfaces anywhere", async () => {
    vi.spyOn(api, "getAssistantSiteCredential").mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() => useVisitorCredentialForm());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.stored).toBeNull();
    expect(result.current.saveState).toEqual({ status: "idle" });
    expect(result.current.discovery).toEqual({ status: "idle" });
  });
});

describe("useVisitorCredentialForm — stored-key discovery (on load, empty field)", () => {
  it("fires one discovery pass when hydration reports a stored key and the field is empty", async () => {
    vi.spyOn(api, "getAssistantSiteCredential").mockResolvedValue({ data: credential({ isSet: true }) });
    const listExecutionModels = vi.spyOn(api, "listExecutionModels").mockResolvedValue({ ok: true, models: ["model-a", "model-b"] });

    const { result } = renderHook(() => useVisitorCredentialForm());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(listExecutionModels).toHaveBeenCalledTimes(1);
    expect(result.current.discovery).toEqual({ status: "ok", models: ["model-a", "model-b"] });
    // Model field was empty, so the empty-model seed rule fills it from discovery.
    expect(result.current.config.model).toBe("model-a");
  });

  it("does not fire when hydration reports no stored key", async () => {
    const listExecutionModels = vi.spyOn(api, "listExecutionModels");
    const { result } = renderHook(() => useVisitorCredentialForm());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(listExecutionModels).not.toHaveBeenCalled();
    expect(result.current.discovery).toEqual({ status: "idle" });
  });
});

describe("useVisitorCredentialForm — debounced typed-key discovery", () => {
  it("does not fire before the debounce window elapses, then fires once after it", async () => {
    vi.useFakeTimers();
    const listExecutionModels = vi.spyOn(api, "listExecutionModels").mockResolvedValue({ ok: true, models: ["m1"] });
    const { result } = renderHook(() => useVisitorCredentialForm());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    act(() => result.current.editConfig({ ...result.current.config, apiKey: "sk-typed" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(699);
    });
    expect(listExecutionModels).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(listExecutionModels).toHaveBeenCalledTimes(1);
    expect(result.current.discovery).toEqual({ status: "ok", models: ["m1"] });
  });

  it("SECURITY GATE: never fires for a key typed against a non-preset (operator-typed) endpoint", async () => {
    vi.useFakeTimers();
    const listExecutionModels = vi.spyOn(api, "listExecutionModels").mockResolvedValue({ ok: true, models: ["m1"] });
    const { result } = renderHook(() => useVisitorCredentialForm());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    act(() =>
      result.current.editConfig({ ...result.current.config, apiKey: "sk-typed", baseUrl: "https://not-a-preset.example.com" }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(listExecutionModels).not.toHaveBeenCalled();
    expect(result.current.discovery).toEqual({ status: "idle" });
  });

  it("clearing the key resets discovery to idle immediately, without waiting for the debounce", async () => {
    vi.useFakeTimers();
    vi.spyOn(api, "listExecutionModels").mockResolvedValue({ ok: true, models: ["m1"] });
    const { result } = renderHook(() => useVisitorCredentialForm());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    act(() => result.current.editConfig({ ...result.current.config, apiKey: "" }));
    // No timer advance at all — the idle reset is synchronous, part of the effect's own guard.
    expect(result.current.discovery).toEqual({ status: "idle" });
  });
});

describe("useVisitorCredentialForm — runKeyTest", () => {
  it("runs immediately (no debounce) and seeds the model field from the result", async () => {
    const listExecutionModels = vi.spyOn(api, "listExecutionModels").mockResolvedValue({ ok: true, models: ["gpt-a"] });
    const { result } = renderHook(() => useVisitorCredentialForm());
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.runKeyTest();
    });

    expect(listExecutionModels).toHaveBeenCalledTimes(1);
    expect(result.current.discovery).toEqual({ status: "ok", models: ["gpt-a"] });
    expect(result.current.config.model).toBe("gpt-a");
  });

  it("on rejection, reports an error discovery state", async () => {
    vi.spyOn(api, "listExecutionModels").mockRejectedValue(new Error("bad key"));
    const { result } = renderHook(() => useVisitorCredentialForm());
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.runKeyTest();
    });

    expect(result.current.discovery).toEqual({ status: "error", message: "bad key" });
  });
});

describe("useVisitorCredentialForm — runTestConnection", () => {
  it("on success, reports ok and quietly refreshes discovery when a key is present", async () => {
    vi.spyOn(api, "testExecutionConnection").mockResolvedValue({ ok: true, message: "Connected" });
    const listExecutionModels = vi.spyOn(api, "listExecutionModels").mockResolvedValue({ ok: true, models: ["refreshed-model"] });
    const { result } = renderHook(() => useVisitorCredentialForm());
    await act(async () => {
      await Promise.resolve();
    });
    act(() => result.current.editConfig({ ...result.current.config, apiKey: "sk-live" }));

    await act(async () => {
      await result.current.runTestConnection();
    });

    expect(result.current.connectionTest).toEqual({ status: "ok", message: "Connected" });
    expect(listExecutionModels).toHaveBeenCalledTimes(1);
    expect(result.current.discovery).toEqual({ status: "ok", models: ["refreshed-model"] });
  });

  it("on success with NO key in the field, does not attempt a discovery refresh at all", async () => {
    vi.spyOn(api, "testExecutionConnection").mockResolvedValue({ ok: true, message: "Connected" });
    const listExecutionModels = vi.spyOn(api, "listExecutionModels");
    const { result } = renderHook(() => useVisitorCredentialForm());
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.runTestConnection();
    });

    expect(result.current.connectionTest).toEqual({ status: "ok", message: "Connected" });
    expect(listExecutionModels).not.toHaveBeenCalled();
  });

  it("a FAILED discovery refresh must not overwrite an existing discovery result or the connection result", async () => {
    // Fake timers so the earlier debounced typed-key discovery (triggered as a side effect of
    // setting `apiKey` below) settles deterministically BEFORE `runTestConnection` runs — otherwise
    // its own leftover 'loading' state, not runTestConnection's refresh, is what the assertions
    // would actually be observing.
    vi.useFakeTimers();
    vi.spyOn(api, "testExecutionConnection").mockResolvedValue({ ok: true, message: "Connected" });
    const listExecutionModels = vi.spyOn(api, "listExecutionModels");
    listExecutionModels.mockResolvedValueOnce({ ok: true, models: ["existing-model"] });
    const { result } = renderHook(() => useVisitorCredentialForm());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    act(() => result.current.editConfig({ ...result.current.config, apiKey: "sk-live" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(result.current.discovery).toEqual({ status: "ok", models: ["existing-model"] });

    listExecutionModels.mockRejectedValueOnce(new Error("discovery flaked"));
    await act(async () => {
      await result.current.runTestConnection();
    });

    // The whole point of the "quiet" refresh: its own failure is swallowed, the operator's actual
    // question ("is the connection good?") keeps its real answer, and the discovery result that was
    // already there is left completely alone rather than clobbered by the failed refresh attempt.
    expect(result.current.connectionTest).toEqual({ status: "ok", message: "Connected" });
    expect(result.current.discovery).toEqual({ status: "ok", models: ["existing-model"] });
  });

  it("on a not-ok result, reports the server's message as a connection error", async () => {
    vi.spyOn(api, "testExecutionConnection").mockResolvedValue({ ok: false, message: "Invalid key" });
    const { result } = renderHook(() => useVisitorCredentialForm());
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.runTestConnection();
    });

    expect(result.current.connectionTest).toEqual({ status: "error", message: "Invalid key" });
  });

  it("on a rejected probe, reports a connection error from the thrown message", async () => {
    vi.spyOn(api, "testExecutionConnection").mockRejectedValue(new Error("timed out"));
    const { result } = renderHook(() => useVisitorCredentialForm());
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.runTestConnection();
    });

    expect(result.current.connectionTest).toEqual({ status: "error", message: "timed out" });
  });
});

describe("useVisitorCredentialForm — saveCredential", () => {
  it("is a no-op with no fetch call when the field is empty and nothing is stored", async () => {
    const setAssistantSiteCredential = vi.spyOn(api, "setAssistantSiteCredential");
    const { result } = renderHook(() => useVisitorCredentialForm());
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.saveCredential();
    });

    expect(setAssistantSiteCredential).not.toHaveBeenCalled();
    expect(result.current.saveState).toEqual({ status: "idle" });
  });

  it("on success: updates stored, clears dirty, and clears the typed key from the field", async () => {
    vi.spyOn(api, "setAssistantSiteCredential").mockResolvedValue({
      data: credential({ isSet: true, masked: "••••wxyz", updatedAt: "2026-08-06T00:00:00.000Z" }),
    });
    const { result } = renderHook(() => useVisitorCredentialForm());
    await act(async () => {
      await Promise.resolve();
    });
    act(() => result.current.editConfig({ ...result.current.config, apiKey: "sk-new-key" }));
    expect(result.current.dirty).toBe(true);

    await act(async () => {
      await result.current.saveCredential();
    });

    expect(result.current.stored?.isSet).toBe(true);
    expect(result.current.saveState).toEqual({ status: "saved", at: "2026-08-06T00:00:00.000Z" });
    expect(result.current.dirty).toBe(false);
    expect(result.current.config.apiKey).toBe("");
  });

  it("on failure: reports a describable save error and leaves the typed key in place", async () => {
    vi.spyOn(api, "setAssistantSiteCredential").mockRejectedValue(new ApiError("boom", 500));
    const { result } = renderHook(() => useVisitorCredentialForm());
    await act(async () => {
      await Promise.resolve();
    });
    act(() => result.current.editConfig({ ...result.current.config, apiKey: "sk-new-key" }));

    await act(async () => {
      await result.current.saveCredential();
    });

    expect(result.current.saveState).toEqual({ status: "error", message: "boom" });
    expect(result.current.config.apiKey).toBe("sk-new-key");
  });

  it("omits apiKey from the write when the field is empty but a credential is already stored — the 'leave the stored key alone' case", async () => {
    vi.spyOn(api, "getAssistantSiteCredential").mockResolvedValue({ data: credential({ isSet: true, model: "m0" }) });
    vi.spyOn(api, "listExecutionModels").mockReturnValue(new Promise(() => {})); // keep discovery quiet
    const setAssistantSiteCredential = vi
      .spyOn(api, "setAssistantSiteCredential")
      .mockResolvedValue({ data: credential({ isSet: true, model: "m1" }) });
    const { result } = renderHook(() => useVisitorCredentialForm());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => result.current.editConfig({ ...result.current.config, model: "m1" }));

    await act(async () => {
      await result.current.saveCredential();
    });

    const [patch] = setAssistantSiteCredential.mock.calls[0];
    expect(patch).not.toHaveProperty("apiKey");
    expect(patch.model).toBe("m1");
  });
});

describe("useVisitorCredentialForm — selectPreset", () => {
  it("resets discovery and connectionTest to idle when switching providers", async () => {
    vi.spyOn(api, "testExecutionConnection").mockResolvedValue({ ok: true, message: "Connected" });
    const { result } = renderHook(() => useVisitorCredentialForm());
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await result.current.runTestConnection();
    });
    expect(result.current.connectionTest.status).toBe("ok");

    act(() => result.current.selectPreset(result.current.preset!));

    expect(result.current.discovery).toEqual({ status: "idle" });
    expect(result.current.connectionTest).toEqual({ status: "idle" });
  });
});

describe("useVisitorCredentialForm — editConfig", () => {
  it("marks the form dirty, unlike hydration or discovery seeding a model", async () => {
    const { result } = renderHook(() => useVisitorCredentialForm());
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.dirty).toBe(false);

    act(() => result.current.editConfig({ ...result.current.config, model: "operator-typed-model" }));

    expect(result.current.dirty).toBe(true);
    expect(result.current.config.model).toBe("operator-typed-model");
  });
});
