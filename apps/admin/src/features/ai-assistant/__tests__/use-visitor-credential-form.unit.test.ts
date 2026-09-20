import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PROVIDER_PRESETS, type ByokConfig } from "@jini-ai/ui";

import {
  api,
  ApiError,
  type SiteAssistantCredential,
  type SiteAssistantCredentialPatch,
} from "@/lib/api";
import { storedKeyIsForOtherEndpoint } from "@/lib/stored-credential-endpoint";
import {
  saveVisitorKey,
  saveVisitorSettings,
  useWiredVisitorCredentialForm,
  useVisitorCredentialForm,
} from "../hooks/use-visitor-credential-form.hooks";
import type { VisitorCredentialFormPort } from "../hooks/visitor-credential-form-port.hooks";

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
 *
 * Orc-BASH port split (later pass): `useVisitorCredentialForm` now takes a required `{ port }`
 * dependency instead of an optional `{ api }` — every "real path" call below is
 * `useWiredVisitorCredentialForm()` (still spies on the module-level `api` singleton via
 * `vi.spyOn`, since `defaultVisitorCredentialFormPort` is a thin passthrough to it), and the single
 * "fake path" scenario in the `VisitorCredentialFormPort injection` describe block below passes
 * `{ port: fake.port }` to `useVisitorCredentialForm` directly. `VisitorCredentialApi` was renamed
 * `VisitorCredentialFormPort` and moved to `visitor-credential-form-port.hooks.ts` in the same pass;
 * no test assertion changed.
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
    const { result } = renderHook(() => useWiredVisitorCredentialForm());
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

    const { result } = renderHook(() => useWiredVisitorCredentialForm());
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

    const { result } = renderHook(() => useWiredVisitorCredentialForm());
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

    const { result } = renderHook(() => useWiredVisitorCredentialForm());
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
    const { result } = renderHook(() => useWiredVisitorCredentialForm());
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
    const { result } = renderHook(() => useWiredVisitorCredentialForm());
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
    const { result } = renderHook(() => useWiredVisitorCredentialForm());
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
    const { result } = renderHook(() => useWiredVisitorCredentialForm());
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
    const { result } = renderHook(() => useWiredVisitorCredentialForm());
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
    const { result } = renderHook(() => useWiredVisitorCredentialForm());
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
    const { result } = renderHook(() => useWiredVisitorCredentialForm());
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
    const { result } = renderHook(() => useWiredVisitorCredentialForm());
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
    const { result } = renderHook(() => useWiredVisitorCredentialForm());
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
    const { result } = renderHook(() => useWiredVisitorCredentialForm());
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
    const { result } = renderHook(() => useWiredVisitorCredentialForm());
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.runTestConnection();
    });

    expect(result.current.connectionTest).toEqual({ status: "error", message: "timed out" });
  });
});

describe("useVisitorCredentialForm — saveKey", () => {
  it("is a no-op with no fetch call when the field is empty", async () => {
    const setAssistantSiteCredential = vi.spyOn(api, "setAssistantSiteCredential");
    const { result } = renderHook(() => useWiredVisitorCredentialForm());
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.saveKey();
    });

    expect(setAssistantSiteCredential).not.toHaveBeenCalled();
    expect(result.current.saveState).toEqual({ status: "idle" });
  });

  it("on success: updates stored and clears the typed key from the field, leaving dirty alone", async () => {
    vi.spyOn(api, "setAssistantSiteCredential").mockResolvedValue({
      data: credential({ isSet: true, masked: "••••wxyz", updatedAt: "2026-08-06T00:00:00.000Z" }),
    });
    const { result } = renderHook(() => useWiredVisitorCredentialForm());
    await act(async () => {
      await Promise.resolve();
    });
    act(() => result.current.editConfig({ ...result.current.config, apiKey: "sk-new-key" }));
    expect(result.current.dirty).toBe(true);

    await act(async () => {
      await result.current.saveKey();
    });

    expect(result.current.stored?.isSet).toBe(true);
    expect(result.current.saveState).toEqual({ status: "saved", at: "2026-08-06T00:00:00.000Z" });
    // `dirty` means "settings changed since they were last written", and a key write does not write
    // them — clearing it here would have told the operator their unsaved model change was saved.
    // Only `saveSettings` clears it (2026-09-02 two-button split).
    expect(result.current.dirty).toBe(true);
    expect(result.current.config.apiKey).toBe("");
  });

  it("on failure: reports a describable save error and leaves the typed key in place", async () => {
    vi.spyOn(api, "setAssistantSiteCredential").mockRejectedValue(new ApiError("boom", 500));
    const { result } = renderHook(() => useWiredVisitorCredentialForm());
    await act(async () => {
      await Promise.resolve();
    });
    act(() => result.current.editConfig({ ...result.current.config, apiKey: "sk-new-key" }));

    await act(async () => {
      await result.current.saveKey();
    });

    expect(result.current.saveState).toEqual({ status: "error", message: "boom" });
    expect(result.current.config.apiKey).toBe("sk-new-key");
  });

  it("saveSettings omits apiKey when the field is empty but a credential is already stored — the 'leave the stored key alone' case", async () => {
    vi.spyOn(api, "getAssistantSiteCredential").mockResolvedValue({ data: credential({ isSet: true, model: "m0" }) });
    vi.spyOn(api, "listExecutionModels").mockReturnValue(new Promise(() => {})); // keep discovery quiet
    const setAssistantSiteCredential = vi
      .spyOn(api, "setAssistantSiteCredential")
      .mockResolvedValue({ data: credential({ isSet: true, model: "m1" }) });
    const { result } = renderHook(() => useWiredVisitorCredentialForm());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => result.current.editConfig({ ...result.current.config, model: "m1" }));

    await act(async () => {
      await result.current.saveSettings();
    });

    const [patch] = setAssistantSiteCredential.mock.calls[0];
    expect(patch).not.toHaveProperty("apiKey");
    expect(patch.model).toBe("m1");
  });

  it("never sends an empty string for a WHITESPACE-only field — saveKey writes nothing, saveSettings omits apiKey", async () => {
    // The input that looks non-empty to a naive check, run against BOTH buttons. Since the split,
    // two independent things stand between a blank-looking field and the stored key: Save key
    // refuses to call the server at all, and Save settings has no `apiKey` in its patch to begin
    // with. Asserted as an absent PROPERTY, not a falsy value: `apiKey: ""` would satisfy a
    // truthiness check while being exactly the write that must never happen.
    vi.spyOn(api, "getAssistantSiteCredential").mockResolvedValue({ data: credential({ isSet: true, model: "m0" }) });
    vi.spyOn(api, "listExecutionModels").mockReturnValue(new Promise(() => {}));
    const setAssistantSiteCredential = vi
      .spyOn(api, "setAssistantSiteCredential")
      .mockResolvedValue({ data: credential({ isSet: true, model: "m1" }) });
    const { result } = renderHook(() => useWiredVisitorCredentialForm());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => result.current.editConfig({ ...result.current.config, apiKey: "   \t   ", model: "m1" }));

    await act(async () => {
      await result.current.saveKey();
    });

    expect(setAssistantSiteCredential, "a whitespace-only field is not a key").not.toHaveBeenCalled();

    await act(async () => {
      await result.current.saveSettings();
    });

    const [patch] = setAssistantSiteCredential.mock.calls[0];
    expect(patch).not.toHaveProperty("apiKey");
    expect(Object.keys(patch)).not.toContain("apiKey");
  });
});

describe("useVisitorCredentialForm — selectPreset", () => {
  it("resets discovery and connectionTest to idle when switching providers", async () => {
    vi.spyOn(api, "testExecutionConnection").mockResolvedValue({ ok: true, message: "Connected" });
    const { result } = renderHook(() => useWiredVisitorCredentialForm());
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

/**
 * Owner repro 2026-09-12: a Google key is stored, the owner picks Anthropic, and both the live model
 * list and "Test Key" showed the server's raw endpoint-pin text. The server pin is correct — a key it
 * holds may only go to the endpoint it was saved for — so the form must not ask for that, and must
 * say what to do in plain language when it would.
 */
describe("useVisitorCredentialForm — switching provider while a key is stored for another endpoint", () => {
  const GOOGLE = "https://generativelanguage.googleapis.com";
  const ANTHROPIC = "https://api.anthropic.com";
  const OTHER_PROVIDER_COPY = "Your saved key is for a different provider. Paste a key for this one.";
  const NO_ENDPOINT_COPY = "Your saved key has no provider saved with it. Paste the key again to test it.";
  const anthropic = DEFAULT_PROVIDER_PRESETS.find((p) => p.id === "anthropic")!;

  type ProbeInput = { apiKey: string; baseUrl: string };

  /** Answers the two probe routes the way `stored-credential-probe.ts` does: a typed key goes
   *  anywhere, an empty key (stored opt-in) only to the stored endpoint. */
  function emulateServerPin(storedBaseUrl: string | null) {
    const rejectUnpinned = ({ apiKey, baseUrl }: ProbeInput) => {
      if (apiKey.trim()) return;
      if (!storedBaseUrl) {
        throw new ApiError(
          "the stored site assistant credential has no saved endpoint, so this probe has no approved destination — save a base URL for the credential first, or supply an apiKey in this request",
          400,
          "STORED_CREDENTIAL_ENDPOINT_UNSET",
        );
      }
      if (baseUrl !== storedBaseUrl) {
        throw new ApiError(
          `the stored site assistant credential is saved for '${storedBaseUrl}' and cannot be probed against '${baseUrl}' — save the new endpoint first, or supply an apiKey for it in this request`,
          400,
          "STORED_CREDENTIAL_ENDPOINT_MISMATCH",
        );
      }
    };
    const listExecutionModels = vi.spyOn(api, "listExecutionModels").mockImplementation(async (input) => {
      rejectUnpinned(input);
      return { ok: true, models: ["model-a"] };
    });
    const testExecutionConnection = vi.spyOn(api, "testExecutionConnection").mockImplementation(async (input) => {
      rejectUnpinned(input);
      return { ok: true, message: "Connected" };
    });
    return { listExecutionModels, testExecutionConnection };
  }

  async function mountWithStoredKey(clientBaseUrl: string | null, serverBaseUrl: string | null = clientBaseUrl) {
    vi.useFakeTimers();
    vi.spyOn(api, "getAssistantSiteCredential").mockResolvedValue({
      data: credential({ isSet: true, masked: "••••mw4w", provider: "google", baseUrl: clientBaseUrl }),
    });
    const spies = emulateServerPin(serverBaseUrl);
    const hook = renderHook(() => useWiredVisitorCredentialForm());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    return { ...hook, ...spies };
  }

  function storedKeyProbesTo(spy: { mock: { calls: unknown[][] } }, baseUrl: string) {
    return spy.mock.calls.filter(([input]) => {
      const probe = input as ProbeInput;
      return !probe.apiKey.trim() && probe.baseUrl === baseUrl;
    });
  }

  it("picking Anthropic with no key typed sends the stored key nowhere and shows no error", async () => {
    const { result, listExecutionModels, unmount } = await mountWithStoredKey(GOOGLE);

    act(() => result.current.selectPreset(anthropic));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(result.current.config.baseUrl).toBe(ANTHROPIC);
    expect(result.current.discovery).toEqual({ status: "idle" });
    expect(storedKeyProbesTo(listExecutionModels, ANTHROPIC)).toEqual([]);
    expect(result.current.hasUsableKey).toBe(false);
    expect(result.current.storedKeyIsForOtherEndpoint).toBe(true);
    unmount();
  });

  it("Test Key and Test connection with no key typed do not probe Anthropic with the Google key", async () => {
    const { result, listExecutionModels, testExecutionConnection, unmount } = await mountWithStoredKey(GOOGLE);
    act(() => result.current.selectPreset(anthropic));

    await act(async () => {
      await result.current.runKeyTest();
    });
    await act(async () => {
      await result.current.runTestConnection();
    });

    expect(result.current.discovery).toEqual({ status: "idle" });
    expect(result.current.connectionTest).toEqual({ status: "idle" });
    expect(storedKeyProbesTo(listExecutionModels, ANTHROPIC)).toEqual([]);
    expect(storedKeyProbesTo(testExecutionConnection, ANTHROPIC)).toEqual([]);
    unmount();
  });

  it("after picking Anthropic, a typed key is what both probes send, to the Anthropic endpoint", async () => {
    const { result, listExecutionModels, testExecutionConnection, unmount } = await mountWithStoredKey(GOOGLE);
    act(() => result.current.selectPreset(anthropic));
    act(() => result.current.editConfig({ ...result.current.config, apiKey: "sk-ant-typed" }));

    await act(async () => {
      await result.current.runKeyTest();
    });
    await act(async () => {
      await result.current.runTestConnection();
    });

    expect(listExecutionModels).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "sk-ant-typed", baseUrl: ANTHROPIC }));
    expect(testExecutionConnection).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "sk-ant-typed", baseUrl: ANTHROPIC }));
    expect(result.current.discovery).toEqual({ status: "ok", models: ["model-a"] });
    expect(result.current.connectionTest).toEqual({ status: "ok", message: "Connected" });
    expect(result.current.hasUsableKey).toBe(true);
    unmount();
  });

  it("when the server still answers with its endpoint pin, the operator sees plain language, never the pin text", async () => {
    // The screen's copy of the stored row says Google; the server's row was re-pointed since.
    const { result, unmount } = await mountWithStoredKey(GOOGLE, "https://api.openai.com/v1");

    expect(result.current.discovery).toEqual({ status: "error", message: OTHER_PROVIDER_COPY });

    await act(async () => {
      await result.current.runTestConnection();
    });
    expect(result.current.connectionTest).toEqual({ status: "error", message: OTHER_PROVIDER_COPY });
    unmount();
  });

  it("a stored key with no saved endpoint gets plain language too, not the server's text", async () => {
    const { result, unmount } = await mountWithStoredKey(null);

    expect(result.current.discovery).toEqual({ status: "error", message: NO_ENDPOINT_COPY });
    unmount();
  });

  it("storedKeyIsForOtherEndpoint matches the server's endpoint comparison", () => {
    const storedAt = (baseUrl: string | null) => credential({ isSet: true, baseUrl });
    expect(storedKeyIsForOtherEndpoint(storedAt(GOOGLE), ANTHROPIC)).toBe(true);
    expect(storedKeyIsForOtherEndpoint(storedAt(GOOGLE), GOOGLE)).toBe(false);
    // Same normalization as the server: trim, then strip trailing slashes.
    expect(storedKeyIsForOtherEndpoint(storedAt(`${GOOGLE}//`), ` ${GOOGLE} `)).toBe(false);
    // Path case is significant on the server, so it is here.
    expect(storedKeyIsForOtherEndpoint(storedAt("https://x.example.com/V1"), "https://x.example.com/v1")).toBe(true);
    // Unknown stored endpoint: not provably another one, so the server answers.
    expect(storedKeyIsForOtherEndpoint(storedAt(null), ANTHROPIC)).toBe(false);
    expect(storedKeyIsForOtherEndpoint(storedAt("   "), ANTHROPIC)).toBe(false);
    expect(storedKeyIsForOtherEndpoint(credential({ isSet: false, baseUrl: GOOGLE }), ANTHROPIC)).toBe(false);
    expect(storedKeyIsForOtherEndpoint(null, ANTHROPIC)).toBe(false);
  });
});

describe("useVisitorCredentialForm — editConfig", () => {
  it("marks the form dirty, unlike hydration or discovery seeding a model", async () => {
    const { result } = renderHook(() => useWiredVisitorCredentialForm());
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.dirty).toBe(false);

    act(() => result.current.editConfig({ ...result.current.config, model: "operator-typed-model" }));

    expect(result.current.dirty).toBe(true);
    expect(result.current.config.model).toBe("operator-typed-model");
  });
});

/**
 * The injected-port seam from the F05 coupling fix (audit `TM-20260810-01`). The save handler used to
 * import the ambient `api` singleton directly, so the only way to exercise it was to `vi.spyOn` that
 * module — which every test above still does for the hook's other surfaces. These assertions pass a
 * fake in instead: no module mocking at all, which is the property that proves the seam is a real
 * dependency boundary rather than a rename. Retargeted onto `saveVisitorKey`/`saveVisitorSettings`
 * by the 2026-09-02 two-button split; the seam itself is unchanged.
 */
describe("VisitorCredentialFormPort injection", () => {
  function fakeApi(stored: SiteAssistantCredential) {
    const setCalls: SiteAssistantCredentialPatch[] = [];
    let getCalls = 0;
    return {
      setCalls,
      getCallCount: () => getCalls,
      port: {
        getAssistantSiteCredential: async () => {
          getCalls += 1;
          return { data: stored };
        },
        setAssistantSiteCredential: async (patch: SiteAssistantCredentialPatch) => {
          setCalls.push(patch);
          return { data: { ...stored, ...patch, isSet: true, updatedAt: "2026-08-10T00:00:00.000Z" } };
        },
      } satisfies VisitorCredentialFormPort,
    };
  }

  const CONFIG: ByokConfig = {
    protocol: "google",
    providerId: "google-gemini",
    apiKey: "  typed-key  ",
    baseUrl: "https://example.test",
    model: "gemini-flash-latest",
  };

  it("saveVisitorKey writes the trimmed key ALONE through the injected port, never the ambient singleton", async () => {
    // No `vi.spyOn(api, ...)` anywhere in this test: if the handler still reached for the module
    // singleton, this would hit the real client and the fake would record nothing.
    const fake = fakeApi(credential());
    const writes: string[] = [];

    await saveVisitorKey({
      api: fake.port,
      config: CONFIG,
      writers: {
        setSaveState: (state) => writes.push(`saveState:${state.status}`),
        setStored: () => writes.push("stored"),
        setConfig: () => writes.push("config"),
      },
    });

    expect(fake.setCalls).toEqual([{ apiKey: "typed-key" }]);
    expect(writes).toEqual(["saveState:saving", "stored", "saveState:saved", "config"]);
  });

  it("saveVisitorSettings writes the non-secret fields ALONE through the injected port", async () => {
    const fake = fakeApi(credential());
    const writes: string[] = [];

    await saveVisitorSettings({
      api: fake.port,
      config: CONFIG,
      writers: {
        setSettingsSaveState: (state) => writes.push(`settingsSaveState:${state.status}`),
        setStored: () => writes.push("stored"),
        setDirty: (dirty) => writes.push(`dirty:${String(dirty)}`),
      },
    });

    expect(fake.setCalls).toEqual([
      { provider: "google", baseUrl: "https://example.test", model: "gemini-flash-latest" },
    ]);
    expect(Object.keys(fake.setCalls[0] as object)).not.toContain("apiKey");
    expect(writes).toEqual(["settingsSaveState:saving", "stored", "settingsSaveState:saved", "dirty:false"]);
  });

  it("saveVisitorKey reports the injected port's failure without touching storage", async () => {
    const states: string[] = [];
    await saveVisitorKey({
      api: {
        getAssistantSiteCredential: () => Promise.reject(new Error("unused")),
        setAssistantSiteCredential: () => Promise.reject(new ApiError("boom", 500, "SERVER_ERROR")),
      },
      config: { ...CONFIG, apiKey: "typed-key" },
      writers: {
        setSaveState: (state) => states.push(state.status),
        setStored: () => states.push("stored-MUST-NOT-HAPPEN"),
        setConfig: () => states.push("config-MUST-NOT-HAPPEN"),
      },
    });

    expect(states).toEqual(["saving", "error"]);
  });

  it("the hook hydrates from an injected port instead of the singleton", async () => {
    const fake = fakeApi(credential({ isSet: true, masked: "••••1234", baseUrl: "https://injected.test", model: "m-1" }));
    const { result } = renderHook(() => useVisitorCredentialForm({ port: fake.port }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(fake.getCallCount()).toBe(1);
    expect(result.current.stored?.masked).toBe("••••1234");
    expect(result.current.config.baseUrl).toBe("https://injected.test");
  });
});

/**
 * The two-button split (owner ruling, 2026-09-02) — the same change made to the admin's own BYOK
 * panel, applied to this screen. One control used to write the key AND provider/baseUrl/model
 * together, which is why its status line could say "Saved to the server, encrypted." about a press
 * that sent no key. Each button now writes exactly one thing; these two cases pin what each patch
 * must carry and, more importantly, what it must not.
 */
describe("useVisitorCredentialForm — the two buttons write disjoint patches", () => {
  it("saveKey sends apiKey and NOTHING else — no provider, baseUrl or model", async () => {
    const setAssistantSiteCredential = vi
      .spyOn(api, "setAssistantSiteCredential")
      .mockResolvedValue({ data: credential({ isSet: true, masked: "••••wxyz" }) });
    const { result } = renderHook(() => useWiredVisitorCredentialForm());
    await act(async () => {
      await Promise.resolve();
    });
    act(() => result.current.editConfig({ ...result.current.config, apiKey: "sk-new-key", model: "m1" }));

    await act(async () => {
      await result.current.saveKey();
    });

    const [patch] = setAssistantSiteCredential.mock.calls[0];
    expect(patch).toEqual({ apiKey: "sk-new-key" });
    expect(Object.keys(patch)).not.toContain("provider");
    expect(Object.keys(patch)).not.toContain("baseUrl");
    expect(Object.keys(patch)).not.toContain("model");
  });

  it("saveSettings sends provider/baseUrl/model and NEVER an apiKey property, even with a key typed", async () => {
    // Absent PROPERTY, not a falsy value: `apiKey: ""` passes a truthiness check while being exactly
    // the write the server rejects with a 400 and exactly the write this button must never make. A
    // typed key is the adversarial case — the old single control would have shipped it.
    const setAssistantSiteCredential = vi
      .spyOn(api, "setAssistantSiteCredential")
      .mockResolvedValue({ data: credential({ isSet: true, model: "m1" }) });
    const { result } = renderHook(() => useWiredVisitorCredentialForm());
    await act(async () => {
      await Promise.resolve();
    });
    act(() => result.current.editConfig({ ...result.current.config, apiKey: "sk-still-in-the-field", model: "m1" }));

    await act(async () => {
      await result.current.saveSettings();
    });

    const [patch] = setAssistantSiteCredential.mock.calls[0];
    expect(Object.keys(patch)).not.toContain("apiKey");
    expect(patch).toEqual({ provider: "google", baseUrl: "https://generativelanguage.googleapis.com", model: "m1" });
    expect(result.current.settingsSaveState).toMatchObject({ status: "saved" });
    // The key the operator is still holding in the field is the key button's business.
    expect(result.current.config.apiKey).toBe("sk-still-in-the-field");
  });

  it("a settings save clears dirty; a key save leaves the key's own state alone", async () => {
    vi.spyOn(api, "setAssistantSiteCredential").mockResolvedValue({ data: credential({ isSet: true, model: "m1" }) });
    const { result } = renderHook(() => useWiredVisitorCredentialForm());
    await act(async () => {
      await Promise.resolve();
    });
    act(() => result.current.editConfig({ ...result.current.config, model: "m1" }));
    expect(result.current.dirty).toBe(true);

    await act(async () => {
      await result.current.saveSettings();
    });

    expect(result.current.dirty).toBe(false);
    // Untouched: the key button never ran, so its status line must still say nothing happened.
    expect(result.current.saveState).toEqual({ status: "idle" });
  });
});

/**
 * Save key and Save settings are both enabled at once (a key typed AND a settings edit made), and
 * the server builds each write from the row it READ first (`setSiteAssistantCredential`: find →
 * seal → upsert the whole merged record). Two PUTs in flight together each merge over the same old
 * row, so whichever upserts last reverts the other's field — while both answer 200.
 */
describe("useVisitorCredentialForm — Save key and Save settings pressed back to back", () => {
  interface ServerRow {
    provider: string;
    baseUrl: string;
    model: string;
    apiKey: string;
  }

  /** A port with the server's read-then-upsert shape: each PUT snapshots the row when it ARRIVES
   *  and writes `{ ...snapshot, ...patch }` only when the test releases it. */
  function readMergeUpsertServer(initial: ServerRow) {
    let row = { ...initial };
    const pending: Array<() => void> = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const port: VisitorCredentialFormPort = {
      getAssistantSiteCredential: async () => ({ data: credential({ baseUrl: row.baseUrl, model: row.model }) }),
      setAssistantSiteCredential: (patch) => {
        const snapshot = { ...row };
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        return new Promise((resolve) => {
          pending.push(() => {
            row = { ...snapshot, ...(patch as Partial<ServerRow>) };
            inFlight -= 1;
            resolve({ data: credential({ isSet: true, masked: "••••-new", provider: row.provider, baseUrl: row.baseUrl, model: row.model }) });
          });
        });
      },
    };
    return { port, pending, row: () => row, maxInFlight: () => maxInFlight };
  }

  it("the second write starts only after the first settles, so the stored row keeps BOTH the new key and the new model", async () => {
    vi.spyOn(api, "listExecutionModels").mockResolvedValue({ ok: true, models: ["new-model"] });
    const server = readMergeUpsertServer({
      provider: "google",
      baseUrl: "https://generativelanguage.googleapis.com",
      model: "old-model",
      apiKey: "sk-old",
    });
    const { result } = renderHook(() => useVisitorCredentialForm({ port: server.port }));
    await act(async () => {
      await Promise.resolve();
    });
    act(() => result.current.editConfig({ ...result.current.config, apiKey: "sk-new", model: "new-model" }));

    await act(async () => {
      let settled = false;
      const both = Promise.all([result.current.saveKey(), result.current.saveSettings()]).then(() => {
        settled = true;
      });
      // Release the NEWEST pending write each round — the settings PUT finishing before the slower
      // key PUT (which also has to seal) is exactly the order that reverts the model.
      for (let round = 0; round < 20 && !settled; round += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        server.pending.pop()?.();
      }
      await both;
    });

    expect(server.row()).toEqual({
      provider: "google",
      baseUrl: "https://generativelanguage.googleapis.com",
      model: "new-model",
      apiKey: "sk-new",
    });
    expect(server.maxInFlight()).toBe(1);
    expect(result.current.saveState).toMatchObject({ status: "saved" });
    expect(result.current.settingsSaveState).toMatchObject({ status: "saved" });
  });
});
