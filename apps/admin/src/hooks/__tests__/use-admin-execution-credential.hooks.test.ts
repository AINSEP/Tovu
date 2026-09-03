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
 *
 * All five drive `useWiredAdminExecutionCredential` against a mocked `lib/api` (below) — kept as-is
 * by the `useWiredX` dependency-injection conversion, a call-site swap with no assertion changed. The
 * `describe("injected port …")` block at the end of this file is new: it drives the bare
 * `useAdminExecutionCredential` against `createFakeAdminExecutionCredentialPort` directly, with NO
 * `vi.mock("../../lib/api", ...)` — see `admin-execution-credential-port.hooks.ts`'s file header for
 * what is and is not injected and why.
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

import {
  resolveByokFooterStatusLine,
  useAdminExecutionCredential,
  useWiredAdminExecutionCredential,
} from "../use-admin-execution-credential.hooks";
import { createFakeAdminExecutionCredentialPort } from "../admin-execution-credential-dependencies.hooks";

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
    const { result } = renderHook(() => useWiredAdminExecutionCredential({ byok: byok(), onByokChange: vi.fn() }));

    await waitFor(() => expect(result.current.apiKeyStoredExternally).toBe(true));
    expect(result.current.apiKeyPlaceholder).toBe("••••wxyz");
    // `stored` — the server's own read model — carries no `apiKey` field at all; the intentional
    // write-only signal fields (`apiKeyStoredExternally`/`apiKeyPlaceholder`) are named with the
    // substring but never hold the real key, only a boolean and a masked tail.
    expect(Object.keys(result.current.stored ?? {})).not.toContain("apiKey");
    expect(result.current.apiKeyPlaceholder).not.toMatch(/^sk-/);
  });

  it("apiKeyPlaceholder is undefined and apiKeyStoredExternally is false when nothing is stored", async () => {
    const { result } = renderHook(() => useWiredAdminExecutionCredential({ byok: byok(), onByokChange: vi.fn() }));
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
      ({ b }) => useWiredAdminExecutionCredential({ byok: b, onByokChange }),
      { initialProps: { b: byok({ apiKey: "sk-typed-key" }) } },
    );
    await waitFor(() => expect(result.current.stored).not.toBeNull());

    await act(async () => {
      await result.current.saveKey();
    });

    // The key and NOTHING else, since the two-button split (2026-09-02). protocol/model moved to
    // `saveSettings` — see the "two buttons write disjoint patches" block at the end of this file.
    expect(setAdminExecutionCredential).toHaveBeenCalledWith({ apiKey: "sk-typed-key" });
    expect(onByokChange).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "" }));
    expect(result.current.saveState).toEqual({ status: "saved" });
    expect(result.current.apiKeyStoredExternally).toBe(true);
    expect(result.current.apiKeyPlaceholder).toBe("••••abcd");
    rerender({ b: byok({ apiKey: "sk-typed-key" }) }); // no-op, keeps the linter quiet about unused rerender
  });

  it("no longer performs a protocol/model-only save — a blank field writes nothing at all", async () => {
    // REVERSAL, recorded deliberately (owner ruling, 2026-09-02). This case used to assert that a
    // blank field with a key stored still PUT the protocol/model fields, with `apiKey` omitted. The
    // owner's rule is now narrower: Save key's only job is to write the key, so a blank field is a
    // no-op, not a partial save.
    //
    // No capability is lost. The admin's protocol/model/baseUrl live in the `core.execution` LEDGER
    // and are persisted by `use-admin-execution-mode.hooks.ts`'s `useSettingsSlice` on their own
    // save path — changing a model without retyping a key still works, it just never depended on
    // this button. The credential ROW's companion columns (the server-side fallback for an
    // empty-field browser) are written by `saveSettings`, the second button of the 2026-09-02 split;
    // they no longer ride along on a key save at all.
    getAdminExecutionCredential.mockResolvedValue({ data: setView() }); // already stored
    const onByokChange = vi.fn();
    const { result } = renderHook(() => useWiredAdminExecutionCredential({ byok: byok({ apiKey: "", model: "claude-opus-5" }), onByokChange }));
    await waitFor(() => expect(result.current.stored?.isSet).toBe(true));

    await act(async () => {
      await result.current.saveKey();
    });

    expect(setAdminExecutionCredential).not.toHaveBeenCalled();
    expect(onByokChange).not.toHaveBeenCalled();
  });

  it("canSaveKey goes false the moment a typed key is cleared, even with a key already stored", async () => {
    // The owner's exact reported sequence (2026-09-02): start typing a key, change your mind, clear
    // the field. `dirty` is true and a key IS stored, and the old rule (`hasUsableAdminKey`, whose
    // stored arm answers a DIFFERENT question) left Save key enabled over an empty field — offering
    // to write nothing. Driven through a rerender rather than two separate mounts, because the bug
    // is about the transition: a never-touched blank field was already handled, a cleared one was not.
    getAdminExecutionCredential.mockResolvedValue({ data: setView({ masked: "••••mw4w" }) });
    const { result, rerender } = renderHook(
      ({ b }) => useWiredAdminExecutionCredential({ byok: b, onByokChange: vi.fn() }),
      { initialProps: { b: byok({ apiKey: "AIza-typed-then-regretted" }) } },
    );
    await waitFor(() => expect(result.current.stored?.isSet).toBe(true));
    expect(result.current.canSaveKey, "a typed key is of course saveable").toBe(true);

    rerender({ b: byok({ apiKey: "" }) });

    expect(result.current.canSaveKey, "the field was cleared — there is nothing left to write").toBe(false);
    // The stored key is untouched by any of this; clearing the FIELD is not clearing the CREDENTIAL.
    expect(result.current.apiKeyStoredExternally).toBe(true);
    expect(result.current.apiKeyPlaceholder).toBe("••••mw4w");
  });

  it("treats a whitespace-only field as blank for canSaveKey, with a key stored", async () => {
    getAdminExecutionCredential.mockResolvedValue({ data: setView() });
    const { result } = renderHook(() =>
      useWiredAdminExecutionCredential({ byok: byok({ apiKey: "   \t   " }), onByokChange: vi.fn() }),
    );
    await waitFor(() => expect(result.current.stored?.isSet).toBe(true));

    expect(result.current.canSaveKey).toBe(false);
  });

  it("saveKey sends nothing when the field is blank but a key is stored", async () => {
    // The guard and the button read the same rule, so a blank field cannot reach the server even if
    // something called saveKey directly. Without this, tightening only the button would leave the
    // keyless write path alive one layer down.
    getAdminExecutionCredential.mockResolvedValue({ data: setView({ masked: "••••mw4w" }) });
    const { result } = renderHook(() =>
      useWiredAdminExecutionCredential({ byok: byok({ apiKey: "" }), onByokChange: vi.fn() }),
    );
    await waitFor(() => expect(result.current.stored?.isSet).toBe(true));

    await act(async () => {
      await result.current.saveKey();
    });

    expect(setAdminExecutionCredential).not.toHaveBeenCalled();
    expect(result.current.apiKeyPlaceholder, "the stored key is left exactly as it was").toBe("••••mw4w");
  });

  it("saveKey is a no-op when nothing is typed and nothing is stored", async () => {
    const onByokChange = vi.fn();
    const { result } = renderHook(() => useWiredAdminExecutionCredential({ byok: byok({ apiKey: "" }), onByokChange }));
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
    const a = renderHook(() => useWiredAdminExecutionCredential({ byok: byok({ apiKey: "sk-typed-key" }), onByokChange: vi.fn() }));
    const b = renderHook(() => useWiredAdminExecutionCredential({ byok: byok(), onByokChange: vi.fn() }));
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
    const { result } = renderHook(() => useWiredAdminExecutionCredential({ byok: byok(), onByokChange: vi.fn() }));
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
    const { result } = renderHook(() => useWiredAdminExecutionCredential({ byok: byok({ apiKey: "sk-typed-key" }), onByokChange }));
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
    const { result } = renderHook(() => useWiredAdminExecutionCredential({ byok: byok(), onByokChange: vi.fn() }));

    await waitFor(() => expect(result.current.legacyKey).toBe("sk-legacy"));
  });

  it("does NOT offer migration when a credential is already stored server-side, even with a legacy key present", async () => {
    window.localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ apiKey: "sk-legacy" }));
    getAdminExecutionCredential.mockResolvedValue({ data: setView() });
    const { result } = renderHook(() => useWiredAdminExecutionCredential({ byok: byok(), onByokChange: vi.fn() }));

    await waitFor(() => expect(result.current.stored?.isSet).toBe(true));
    expect(result.current.legacyKey).toBeNull();
  });

  it("does not offer migration when localStorage has nothing", async () => {
    const { result } = renderHook(() => useWiredAdminExecutionCredential({ byok: byok(), onByokChange: vi.fn() }));
    await waitFor(() => expect(result.current.stored).not.toBeNull());
    expect(result.current.legacyKey).toBeNull();
  });

  it("confirming migration PUTs the legacy key and clears localStorage ONLY after the PUT succeeds", async () => {
    window.localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ apiKey: "sk-legacy" }));
    setAdminExecutionCredential.mockResolvedValue({ data: setView({ masked: "••••gacy" }) });
    // Same reasoning as the "save success" test above: a migration also publishes a same-tab
    // settings-refresh now, which re-reads through `getAdminExecutionCredential` a second time.
    getAdminExecutionCredential.mockResolvedValueOnce({ data: unsetView() }).mockResolvedValue({ data: setView({ masked: "••••gacy" }) });
    const { result } = renderHook(() => useWiredAdminExecutionCredential({ byok: byok(), onByokChange: vi.fn() }));
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
    const { result } = renderHook(() => useWiredAdminExecutionCredential({ byok: byok(), onByokChange: vi.fn() }));
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
    const { result } = renderHook(() => useWiredAdminExecutionCredential({ byok: byok(), onByokChange: vi.fn() }));
    await waitFor(() => expect(result.current.legacyKey).toBe("sk-legacy"));

    act(() => {
      result.current.dismissLegacyPrompt();
    });

    expect(result.current.legacyKey).toBeNull();
    expect(setAdminExecutionCredential).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(LEGACY_STORAGE_KEY)).not.toBeNull();
  });
});

/**
 * `useWiredX` dependency-injection conversion — `useAdminExecutionCredential` driven directly
 * against `createFakeAdminExecutionCredentialPort`, with NO `vi.mock("../../lib/api", ...)`
 * exercised (it stays hoisted at the top of this file for the suite above, but every assertion here
 * also checks it was never called — the actual proof the injection replaces it rather than just
 * sitting unused alongside it). `localStorage` and `settings-refresh-bus` are used directly, real
 * jsdom / real bus — see `admin-execution-credential-port.hooks.ts`'s file header for why those two
 * are deliberately NOT part of the injected port.
 */
describe("injected port — useAdminExecutionCredential with no lib/api mock", () => {
  it("loads via the injected port, never touching the mocked lib/api", async () => {
    const port = createFakeAdminExecutionCredentialPort({
      stored: setView({ masked: "••••live" }),
    });
    const { result } = renderHook(() =>
      useAdminExecutionCredential({ byok: byok(), onByokChange: vi.fn() }, port),
    );

    await waitFor(() => expect(result.current.stored).not.toBeNull());
    expect(result.current.apiKeyStoredExternally).toBe(true);
    expect(result.current.apiKeyPlaceholder).toBe("••••live");
    expect(getAdminExecutionCredential).not.toHaveBeenCalled();
  });

  it("saveKey writes through the injected port and clears the typed field", async () => {
    const port = createFakeAdminExecutionCredentialPort();
    const onByokChange = vi.fn();
    const { result } = renderHook(() =>
      useAdminExecutionCredential({ byok: byok({ apiKey: "sk-typed" }), onByokChange }, port),
    );
    await waitFor(() => expect(result.current.stored).not.toBeNull());

    await act(async () => {
      await result.current.saveKey();
    });

    expect(port.saveCalls).toEqual([{ apiKey: "sk-typed" }]);
    expect(onByokChange).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "" }));
    expect(result.current.apiKeyStoredExternally).toBe(true);
    expect(setAdminExecutionCredential).not.toHaveBeenCalled();
  });

  it("a save the port rejects surfaces an error and never clears the typed field", async () => {
    const port = createFakeAdminExecutionCredentialPort({
      onSave: () => {
        throw new FakeApiError("no master key", 503, "SECRET_STORE_UNCONFIGURED");
      },
    });
    const onByokChange = vi.fn();
    const { result } = renderHook(() =>
      useAdminExecutionCredential({ byok: byok({ apiKey: "sk-typed" }), onByokChange }, port),
    );
    await waitFor(() => expect(result.current.stored).not.toBeNull());

    await act(async () => {
      await result.current.saveKey();
    });

    expect(result.current.saveState.status).toBe("error");
    expect((result.current.saveState as { message: string }).message).toMatch(/no encryption master key/i);
    expect(onByokChange).not.toHaveBeenCalled();
    expect(setAdminExecutionCredential).not.toHaveBeenCalled();
  });

  it("migrateLegacyKey writes the legacy key through the injected port and clears localStorage only after it resolves", async () => {
    window.localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ apiKey: "sk-legacy" }));
    const port = createFakeAdminExecutionCredentialPort();
    const { result } = renderHook(() =>
      useAdminExecutionCredential({ byok: byok(), onByokChange: vi.fn() }, port),
    );
    await waitFor(() => expect(result.current.legacyKey).toBe("sk-legacy"));

    await act(async () => {
      await result.current.migrateLegacyKey();
    });

    expect(port.saveCalls).toEqual([expect.objectContaining({ apiKey: "sk-legacy" })]);
    expect(window.localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
    expect(result.current.legacyKey).toBeNull();
    expect(setAdminExecutionCredential).not.toHaveBeenCalled();
  });
});

/**
 * The two-button split (owner ruling, 2026-09-02). One overloaded control used to write the key AND
 * the row's non-secret companion fields, which is why pressing it over a blank field could report
 * "Saved to the server, encrypted." about a key that was never sent. Each button now writes exactly
 * one thing, and these two cases are the contract for that: what each patch MUST carry, and — more
 * importantly — what it must NOT.
 */
describe("useAdminExecutionCredential — the two buttons write disjoint patches", () => {
  it("saveKey sends apiKey and NOTHING else — no protocol, providerId, baseUrl, model or maxTokens", async () => {
    setAdminExecutionCredential.mockResolvedValue({ data: setView({ masked: "••••abcd" }) });
    const { result } = renderHook(() =>
      useWiredAdminExecutionCredential({
        byok: byok({ apiKey: "sk-typed-key", model: "claude-opus-5", baseUrl: "https://example.invalid", maxTokens: 4096 }),
        onByokChange: vi.fn(),
      }),
    );
    await waitFor(() => expect(result.current.stored).not.toBeNull());

    await act(async () => {
      await result.current.saveKey();
    });

    const [patch] = setAdminExecutionCredential.mock.calls[0] as [Record<string, unknown>];
    expect(patch).toEqual({ apiKey: "sk-typed-key" });
    expect(Object.keys(patch)).not.toContain("protocol");
    expect(Object.keys(patch)).not.toContain("baseUrl");
    expect(Object.keys(patch)).not.toContain("model");
  });

  it("saveSettings sends the non-secret fields and NEVER an apiKey property, even with a key sitting in the field", async () => {
    // Asserted as an ABSENT property, not a falsy one: `apiKey: ""` satisfies a truthiness check
    // while being exactly the write the server rejects (400) and exactly the write this button must
    // never make. A typed key in the field is the adversarial case — the old overloaded control
    // would have shipped it.
    setAdminExecutionCredential.mockResolvedValue({ data: setView({ model: "claude-opus-5" }) });
    const onByokChange = vi.fn();
    const { result } = renderHook(() =>
      useWiredAdminExecutionCredential({
        byok: byok({ apiKey: "sk-typed-key", model: "claude-opus-5", baseUrl: "https://example.invalid", maxTokens: 4096 }),
        onByokChange,
      }),
    );
    await waitFor(() => expect(result.current.stored).not.toBeNull());

    await act(async () => {
      await result.current.saveSettings();
    });

    const [patch] = setAdminExecutionCredential.mock.calls[0] as [Record<string, unknown>];
    expect(Object.keys(patch)).not.toContain("apiKey");
    expect(patch).toEqual({
      protocol: "anthropic",
      providerId: "anthropic",
      baseUrl: "https://example.invalid",
      model: "claude-opus-5",
      maxTokens: 4096,
    });
    expect(result.current.settingsSaveState).toEqual({ status: "saved" });
    // The key field is the KEY button's business — a settings save must not clear what the operator
    // is still holding there.
    expect(onByokChange).not.toHaveBeenCalled();
  });

  it("saveSettings reports its own error without touching the key button's save state", async () => {
    setAdminExecutionCredential.mockRejectedValue(new FakeApiError("boom", 500));
    const { result } = renderHook(() =>
      useWiredAdminExecutionCredential({ byok: byok({ apiKey: "sk-typed-key" }), onByokChange: vi.fn() }),
    );
    await waitFor(() => expect(result.current.stored).not.toBeNull());

    await act(async () => {
      await result.current.saveSettings();
    });

    expect(result.current.settingsSaveState).toEqual({ status: "error", message: "boom" });
    expect(result.current.saveState).toEqual({ status: "idle" });
  });
});

// Moved from `components/__tests__/AdminByokKeyPanel.unit.test.tsx` alongside
// `resolveByokFooterStatusLine` itself (2026-09-03 relocation pass, moving derived-logic
// computations out of `.tsx` files and into their hooks) — `AdminByokKeyFooter`'s own render tests
// in that file already pin the same four cases end-to-end; this exercises the status/isStored
// combinations without a render at all.
describe("resolveByokFooterStatusLine", () => {
  it("reports 'Saving…' while saving, regardless of isStored", () => {
    expect(resolveByokFooterStatusLine("saving", false)).toBe("Saving…");
    expect(resolveByokFooterStatusLine("saving", true)).toBe("Saving…");
  });

  it("reports the saved confirmation once saved", () => {
    expect(resolveByokFooterStatusLine("saved", false)).toBe("Saved to the server, encrypted.");
  });

  it("distinguishes 'stored' from 'never stored' while idle", () => {
    expect(resolveByokFooterStatusLine("idle", true)).toBe("Stored on the server, encrypted. Paste a new key to replace it.");
    expect(resolveByokFooterStatusLine("idle", false)).toBe("Paste your key, then press Save key.");
  });

  it("returns null on error — the footer renders the error via a separate element", () => {
    expect(resolveByokFooterStatusLine("error", false)).toBeNull();
  });
});
