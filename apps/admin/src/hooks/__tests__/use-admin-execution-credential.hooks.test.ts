import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ByokConfig } from "@jini-ai/ui";
import type { AdminExecutionCredential } from "../../lib/api";
import { resetSettingsRefreshBus } from "../../lib/settings-refresh-bus";

/**
 * @file Covers the four owner-required behaviors for the admin's own BYOK credential UI (Bug 7),
 * plus (2026-08-10) the cross-mount staleness fix documented in the hook's own "Cross-mount
 * staleness" doc comment:
 *
 * 1. The one-time migration prompt: shown when a legacy `localStorage` key is found and nothing is
 *    stored server-side yet; a confirm PUTs it and clears local storage ONLY on success; a decline
 *    leaves local storage untouched.
 * 2. Save success clears the local (in-memory) key and reflects the new masked/isSet state.
 * 3. Save FAILURE leaves the local key intact — never silently lost.
 * 4. Write-only display: the hook never surfaces a real key anywhere in its state, only
 *    `isSet`/`masked`.
 * 5. Cross-mount: a save/migrate in one mounted instance is observed by a SEPARATE, independently
 *    mounted instance of this same hook, without either remounting.
 */

const { getAdminExecutionCredential, setAdminExecutionCredential, FakeApiError } = vi.hoisted(() => {
  class FakeApiError extends Error {
    status: number;
    code?: string;
    constructor(message: string, status: number, code?: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }
  return {
    getAdminExecutionCredential: vi.fn(),
    setAdminExecutionCredential: vi.fn(),
    FakeApiError,
  };
});

vi.mock("../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api")>();
  return {
    ...actual,
    api: { ...actual.api, getAdminExecutionCredential, setAdminExecutionCredential },
    ApiError: FakeApiError,
  };
});

import { useAdminExecutionCredential } from "../use-admin-execution-credential.hooks";

const LEGACY_STORAGE_KEY = "tovu:execution-credentials:v1";

function byok(overrides: Partial<ByokConfig> = {}): ByokConfig {
  return {
    protocol: "anthropic",
    providerId: "anthropic",
    apiKey: "",
    baseUrl: "https://api.anthropic.com",
    model: "claude-sonnet-4-5",
    ...overrides,
  };
}

function unsetView(): AdminExecutionCredential {
  return { isSet: false, masked: null, protocol: "anthropic", providerId: null, baseUrl: null, model: null, maxTokens: null, updatedAt: null };
}

function setView(overrides: Partial<AdminExecutionCredential> = {}): AdminExecutionCredential {
  return { isSet: true, masked: "••••test", protocol: "anthropic", providerId: "anthropic", baseUrl: null, model: "claude-sonnet-4-5", maxTokens: null, updatedAt: "2026-08-05T00:00:00.000Z", ...overrides };
}

beforeEach(() => {
  window.localStorage.clear();
  getAdminExecutionCredential.mockReset().mockResolvedValue({ data: unsetView() });
  setAdminExecutionCredential.mockReset();
});

afterEach(() => {
  window.localStorage.clear();
  // The bus is a module-level singleton — without this, a hook instance from one test that never
  // unmounted (or unmounted after this file's own cleanup ran) could leave a stale listener that
  // fires into a later test's unrelated assertions.
  resetSettingsRefreshBus();
});

describe("useAdminExecutionCredential — write-only display", () => {
  it("never exposes a real key — only isSet/masked, both from the server's own view", async () => {
    getAdminExecutionCredential.mockResolvedValue({ data: setView({ masked: "••••wxyz" }) });
    const { result } = renderHook(() => useAdminExecutionCredential({ byok: byok(), onByokChange: vi.fn() }));

    await waitFor(() => expect(result.current.apiKeyStoredExternally).toBe(true));
    expect(result.current.apiKeyPlaceholder).toBe("••••wxyz");
    // `stored` — the server's own read model — carries no `apiKey` field at all; the intentional
    // write-only signal fields (`apiKeyStoredExternally`/`apiKeyPlaceholder`) are named with the
    // substring but never hold the real key, only a boolean and a masked tail.
    expect(Object.keys(result.current.stored ?? {})).not.toContain("apiKey");
    expect(result.current.apiKeyPlaceholder).not.toMatch(/^sk-/);
  });

  it("apiKeyPlaceholder is undefined and apiKeyStoredExternally is false when nothing is stored", async () => {
    const { result } = renderHook(() => useAdminExecutionCredential({ byok: byok(), onByokChange: vi.fn() }));
    await waitFor(() => expect(result.current.stored).not.toBeNull());
    expect(result.current.apiKeyStoredExternally).toBe(false);
    expect(result.current.apiKeyPlaceholder).toBeUndefined();
  });
});

describe("useAdminExecutionCredential — save success", () => {
  it("clears the local key (via onByokChange) and reflects the new masked/isSet state", async () => {
    setAdminExecutionCredential.mockResolvedValue({ data: setView({ masked: "••••abcd" }) });
    // A save now also publishes a same-tab settings-refresh (Finding 2 fix: closes the cross-mount
    // staleness gap), which re-reads through `getAdminExecutionCredential` a second time. A real
    // server's GET reflects the just-committed PUT, so the mock does too — `mockResolvedValueOnce`
    // covers the initial mount GET, `mockResolvedValue` after it covers every later call.
    getAdminExecutionCredential.mockResolvedValueOnce({ data: unsetView() }).mockResolvedValue({ data: setView({ masked: "••••abcd" }) });
    const onByokChange = vi.fn();
    const { result, rerender } = renderHook(
      ({ b }) => useAdminExecutionCredential({ byok: b, onByokChange }),
      { initialProps: { b: byok({ apiKey: "sk-typed-key" }) } },
    );
    await waitFor(() => expect(result.current.stored).not.toBeNull());

    await act(async () => {
      await result.current.saveKey();
    });

    expect(setAdminExecutionCredential).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "sk-typed-key", protocol: "anthropic", model: "claude-sonnet-4-5" }),
    );
    expect(onByokChange).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "" }));
    expect(result.current.saveState).toEqual({ status: "saved" });
    expect(result.current.apiKeyStoredExternally).toBe(true);
    expect(result.current.apiKeyPlaceholder).toBe("••••abcd");
    rerender({ b: byok({ apiKey: "sk-typed-key" }) }); // no-op, keeps the linter quiet about unused rerender
  });

  it("a protocol/model-only save (no typed key) omits apiKey from the PUT, leaving the stored key untouched", async () => {
    getAdminExecutionCredential.mockResolvedValue({ data: setView() }); // already stored
    setAdminExecutionCredential.mockResolvedValue({ data: setView({ model: "claude-opus-5" }) });
    const onByokChange = vi.fn();
    const { result } = renderHook(() => useAdminExecutionCredential({ byok: byok({ apiKey: "", model: "claude-opus-5" }), onByokChange }));
    await waitFor(() => expect(result.current.stored?.isSet).toBe(true));

    await act(async () => {
      await result.current.saveKey();
    });

    const patch = setAdminExecutionCredential.mock.calls[0]![0] as Record<string, unknown>;
    expect("apiKey" in patch).toBe(false);
    // Nothing was typed, so there is nothing to clear back out of the form.
    expect(onByokChange).not.toHaveBeenCalled();
  });

  it("saveKey is a no-op when nothing is typed and nothing is stored", async () => {
    const onByokChange = vi.fn();
    const { result } = renderHook(() => useAdminExecutionCredential({ byok: byok({ apiKey: "" }), onByokChange }));
    await waitFor(() => expect(result.current.stored).not.toBeNull());

    await act(async () => {
      await result.current.saveKey();
    });

    expect(setAdminExecutionCredential).not.toHaveBeenCalled();
    expect(result.current.saveState).toEqual({ status: "idle" });
  });
});

describe("useAdminExecutionCredential — cross-mount staleness (Finding 2)", () => {
  it("a save in one mounted instance refreshes a SEPARATE, independently mounted instance — neither remounts", async () => {
    // Models `SettingsUi.tsx` and `AiAssistant.tsx` each mounting this hook independently over the
    // same server-side credential row — exactly the scenario the hook's own "Cross-mount staleness"
    // doc comment describes. Both start with nothing stored.
    getAdminExecutionCredential.mockResolvedValue({ data: unsetView() });
    const a = renderHook(() => useAdminExecutionCredential({ byok: byok({ apiKey: "sk-typed-key" }), onByokChange: vi.fn() }));
    const b = renderHook(() => useAdminExecutionCredential({ byok: byok(), onByokChange: vi.fn() }));
    await waitFor(() => expect(a.result.current.stored).not.toBeNull());
    await waitFor(() => expect(b.result.current.stored).not.toBeNull());
    expect(b.result.current.apiKeyStoredExternally).toBe(false);

    // From here, any GET reflects the save `a` is about to make — a real server's GET reflects the
    // just-committed PUT, so the mock does too (same reasoning the "save success" tests above use).
    setAdminExecutionCredential.mockResolvedValue({ data: setView({ masked: "••••live" }) });
    getAdminExecutionCredential.mockResolvedValue({ data: setView({ masked: "••••live" }) });

    await act(async () => {
      await a.result.current.saveKey();
    });

    // `a` — the instance that made the write — is correct immediately; this much already worked
    // before this fix.
    expect(a.result.current.apiKeyStoredExternally).toBe(true);

    // `b` made no write of its own. Before this fix, nothing ever told it the row changed, so it
    // would sit on `apiKeyStoredExternally: false` for the rest of its mounted life (in the real
    // app, that is `AssistantDock`'s copy, which never remounts for the whole session).
    await waitFor(() => expect(b.result.current.apiKeyStoredExternally).toBe(true));
    expect(b.result.current.apiKeyPlaceholder).toBe("••••live");

    a.unmount();
    b.unmount();
  });

  it("an unrelated namespace publish does not trigger a pointless refetch", async () => {
    const { result } = renderHook(() => useAdminExecutionCredential({ byok: byok(), onByokChange: vi.fn() }));
    await waitFor(() => expect(result.current.stored).not.toBeNull());
    getAdminExecutionCredential.mockClear();

    const { publishSettingsRefresh } = await import("../../lib/settings-refresh-bus");
    await act(async () => {
      publishSettingsRefresh(["core.presentation"]);
    });

    expect(getAdminExecutionCredential).not.toHaveBeenCalled();
  });
});

describe("useAdminExecutionCredential — save FAILURE leaves the local key intact", () => {
  it("a rejected save reports an error and does NOT clear the typed key", async () => {
    setAdminExecutionCredential.mockRejectedValue(new FakeApiError("no master key", 503, "SECRET_STORE_UNCONFIGURED"));
    const onByokChange = vi.fn();
    const { result } = renderHook(() => useAdminExecutionCredential({ byok: byok({ apiKey: "sk-typed-key" }), onByokChange }));
    await waitFor(() => expect(result.current.stored).not.toBeNull());

    await act(async () => {
      await result.current.saveKey();
    });

    expect(result.current.saveState.status).toBe("error");
    expect((result.current.saveState as { message: string }).message).toMatch(/no encryption master key/i);
    // The local field was never told to clear — the caller's `byok.apiKey` (and therefore whatever
    // it renders) is untouched by a failed save.
    expect(onByokChange).not.toHaveBeenCalled();
  });
});

describe("useAdminExecutionCredential — one-time migration prompt", () => {
  it("offers migration when a legacy localStorage key exists and nothing is stored yet", async () => {
    window.localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ apiKey: "sk-legacy", savedByProviderId: {} }));
    const { result } = renderHook(() => useAdminExecutionCredential({ byok: byok(), onByokChange: vi.fn() }));

    await waitFor(() => expect(result.current.legacyKey).toBe("sk-legacy"));
  });

  it("does NOT offer migration when a credential is already stored server-side, even with a legacy key present", async () => {
    window.localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ apiKey: "sk-legacy" }));
    getAdminExecutionCredential.mockResolvedValue({ data: setView() });
    const { result } = renderHook(() => useAdminExecutionCredential({ byok: byok(), onByokChange: vi.fn() }));

    await waitFor(() => expect(result.current.stored?.isSet).toBe(true));
    expect(result.current.legacyKey).toBeNull();
  });

  it("does not offer migration when localStorage has nothing", async () => {
    const { result } = renderHook(() => useAdminExecutionCredential({ byok: byok(), onByokChange: vi.fn() }));
    await waitFor(() => expect(result.current.stored).not.toBeNull());
    expect(result.current.legacyKey).toBeNull();
  });

  it("confirming migration PUTs the legacy key and clears localStorage ONLY after the PUT succeeds", async () => {
    window.localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ apiKey: "sk-legacy" }));
    setAdminExecutionCredential.mockResolvedValue({ data: setView({ masked: "••••gacy" }) });
    // Same reasoning as the "save success" test above: a migration also publishes a same-tab
    // settings-refresh now, which re-reads through `getAdminExecutionCredential` a second time.
    getAdminExecutionCredential.mockResolvedValueOnce({ data: unsetView() }).mockResolvedValue({ data: setView({ masked: "••••gacy" }) });
    const { result } = renderHook(() => useAdminExecutionCredential({ byok: byok(), onByokChange: vi.fn() }));
    await waitFor(() => expect(result.current.legacyKey).toBe("sk-legacy"));

    await act(async () => {
      await result.current.migrateLegacyKey();
    });

    expect(setAdminExecutionCredential).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "sk-legacy" }));
    expect(window.localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
    expect(result.current.legacyKey).toBeNull();
    expect(result.current.apiKeyStoredExternally).toBe(true);
  });

  it("a FAILED migration save leaves localStorage untouched and the prompt still showing — no auto-clear", async () => {
    window.localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ apiKey: "sk-legacy" }));
    setAdminExecutionCredential.mockRejectedValue(new FakeApiError("no master key", 503, "SECRET_STORE_UNCONFIGURED"));
    const { result } = renderHook(() => useAdminExecutionCredential({ byok: byok(), onByokChange: vi.fn() }));
    await waitFor(() => expect(result.current.legacyKey).toBe("sk-legacy"));

    await act(async () => {
      await result.current.migrateLegacyKey();
    });

    expect(window.localStorage.getItem(LEGACY_STORAGE_KEY)).not.toBeNull();
    expect(result.current.legacyKey).toBe("sk-legacy");
    expect(result.current.saveState.status).toBe("error");
  });

  it("declining the prompt does not touch localStorage or upload anything", async () => {
    window.localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ apiKey: "sk-legacy" }));
    const { result } = renderHook(() => useAdminExecutionCredential({ byok: byok(), onByokChange: vi.fn() }));
    await waitFor(() => expect(result.current.legacyKey).toBe("sk-legacy"));

    act(() => {
      result.current.dismissLegacyPrompt();
    });

    expect(result.current.legacyKey).toBeNull();
    expect(setAdminExecutionCredential).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(LEGACY_STORAGE_KEY)).not.toBeNull();
  });
});
