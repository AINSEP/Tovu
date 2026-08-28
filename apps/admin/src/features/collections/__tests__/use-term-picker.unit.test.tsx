import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "@/lib/fetch-query";
import { createFakeTermPickerPort } from "../hooks/term-picker-dependencies.hooks";
import { useTermPicker, useWiredTermPicker } from "../hooks/use-term-picker.hooks";

/**
 * @file `useTermPicker` — `TermPicker`'s own selection state and `assignTerms` action.
 * Follows the fetch-mocking harness `use-migrate-forward-section.unit.test.ts` established for
 * this package.
 *
 * `mount()` below drives the wired hook (real `fetch`) — unchanged from before the `useWiredX`
 * conversion, just a call-site swap. The "injected port" describe block at the bottom is new
 * coverage added alongside that conversion, proving the pure hook is independently testable
 * against `createFakeTermPickerPort` with no `fetch` stub at all.
 *
 * `wrapper` (2026-08-12, `lib/fetch-query` migration): `assignTerms` now goes through
 * `useFetchMutation`, which throws without a `QueryClientProvider` ancestor.
 */

function wrapper({ children }: { children: React.ReactNode }) {
  return <FetchQueryProvider>{children}</FetchQueryProvider>;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

let fetchMock: ReturnType<typeof vi.fn<(...args: any[]) => any>>;

beforeEach(() => {
  fetchMock = vi.fn();
  // `useTermPicker` now also calls `useAdminLocale()` (real `fetch`, not this hook's own
  // concern), which would otherwise consume one of this file's strictly-ordered
  // `mockResolvedValueOnce` slots and shift every later assertion by one call. Routed to a fixed
  // default-locale response outside `fetchMock`'s own call queue — same interceptor pattern
  // `Members.unit.test.tsx` uses.
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    if (String(url).includes("/settings/effective") && String(url).includes("namespace=core.language")) {
      return Promise.resolve(
        new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } }),
      );
    }
    return fetchMock(url, init);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function mount() {
  return renderHook(() => useWiredTermPicker({ contentType: "recipe", contentId: "e1" }), { wrapper });
}

describe("initial state", () => {
  it("starts with an empty selection, not saving, no message/error", () => {
    const { result } = mount();
    expect(result.current.selected.size).toBe(0);
    expect(result.current.saving).toBe(false);
    expect(result.current.message).toBeNull();
    expect(result.current.error).toBeNull();
  });
});

describe("toggle", () => {
  it("adds a term id not yet selected", () => {
    const { result } = mount();
    act(() => result.current.toggle("t1"));
    expect(result.current.selected.has("t1")).toBe(true);
  });

  it("removes a term id already selected", () => {
    const { result } = mount();
    act(() => result.current.toggle("t1"));
    act(() => result.current.toggle("t1"));
    expect(result.current.selected.has("t1")).toBe(false);
  });

  it("tracks multiple independent selections", () => {
    const { result } = mount();
    act(() => result.current.toggle("t1"));
    act(() => result.current.toggle("t2"));
    expect(result.current.selected).toEqual(new Set(["t1", "t2"]));
  });
});

describe("assign", () => {
  it("is a no-op with no fetch call when nothing is selected", async () => {
    const { result } = mount();
    await act(async () => {
      await result.current.assign();
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POSTs { contentType, contentId, termIds } for the selected terms", async () => {
    const { result } = mount();
    act(() => result.current.toggle("t1"));
    act(() => result.current.toggle("t2"));
    fetchMock.mockResolvedValueOnce(jsonResponse({}));

    await act(async () => {
      await result.current.assign();
    });

    const call = fetchMock.mock.calls.at(-1)!;
    expect(String(call[0])).toContain("/taxonomy/assign-terms");
    expect(JSON.parse(String((call[1] as RequestInit).body))).toEqual({
      contentType: "recipe",
      contentId: "e1",
      termIds: ["t1", "t2"],
    });
  });

  it("on success, sets a count-specific message and CLEARS the selection", async () => {
    const { result } = mount();
    act(() => result.current.toggle("t1"));
    fetchMock.mockResolvedValueOnce(jsonResponse({}));

    await act(async () => {
      await result.current.assign();
    });

    expect(result.current.message).toBe("Assigned 1 term(s).");
    expect(result.current.selected.size).toBe(0);
  });

  it("sets busy (saving=true) during the request, then false after", async () => {
    const { result } = mount();
    act(() => result.current.toggle("t1"));
    let resolveAssign: ((r: Response) => void) | undefined;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => (resolveAssign = resolve)));

    let promise!: Promise<void>;
    act(() => {
      promise = result.current.assign();
    });
    expect(result.current.saving).toBe(true);

    // `useFetchMutation` flips `saving` to `true` synchronously on `mutate()`, same as the
    // pre-migration `setSaving(true)` did — but defers actually INVOKING `mutationFn` (and
    // therefore this `fetch`) by one microtask, so `resolveAssign` is not assigned yet at this
    // exact point. `await Promise.resolve()` lets that deferred call land before reaching for it.
    await act(async () => {
      await Promise.resolve();
      resolveAssign?.(jsonResponse({}));
      await promise;
    });
    expect(result.current.saving).toBe(false);
  });

  it("on failure, sets the fallback error and does NOT clear the selection", async () => {
    const { result } = mount();
    act(() => result.current.toggle("t1"));
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "" }, 500));

    await act(async () => {
      await result.current.assign();
    });

    expect(result.current.error).toBe("Failed to assign terms");
    expect(result.current.selected.has("t1")).toBe(true);
    expect(result.current.message).toBeNull();
  });

  it("uses the server's own error message when present", async () => {
    const { result } = mount();
    act(() => result.current.toggle("t1"));
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "term not found" }, 404));

    await act(async () => {
      await result.current.assign();
    });

    expect(result.current.error).toBe("term not found");
  });

  it("clears a prior error/message when re-invoked", async () => {
    const { result } = mount();
    act(() => result.current.toggle("t1"));
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "" }, 500));
    await act(async () => {
      await result.current.assign();
    });
    expect(result.current.error).not.toBeNull();

    act(() => result.current.toggle("t2"));
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    await act(async () => {
      await result.current.assign();
    });
    expect(result.current.error).toBeNull();
  });
});

describe("injected port (useWiredX conversion coverage)", () => {
  it("assigns the selected terms through the injected port, without touching fetch", async () => {
    const port = createFakeTermPickerPort();
    const { result } = renderHook(() => useTermPicker({ contentType: "recipe", contentId: "e1" }, { port, locale: "en" }), { wrapper });

    act(() => result.current.toggle("t1"));
    act(() => result.current.toggle("t2"));
    await act(async () => {
      await result.current.assign();
    });

    expect(port.calls).toEqual([{ contentType: "recipe", contentId: "e1", termIds: ["t1", "t2"] }]);
    expect(result.current.message).toBe("Assigned 2 term(s).");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces the injected port's rejection message, and does NOT clear the selection", async () => {
    const port = createFakeTermPickerPort({ assignError: new Error("server exploded") });
    const { result } = renderHook(() => useTermPicker({ contentType: "recipe", contentId: "e1" }, { port, locale: "en" }), { wrapper });

    act(() => result.current.toggle("t1"));
    await act(async () => {
      await result.current.assign();
    });

    // `describeApiError` returns a plain `Error`'s own `.message` verbatim (only `ApiError` gets
    // the locale-aware fallback substituted, and only when its message is empty) — matching
    // `use-term-picker.unit.test.ts`'s existing "uses the server's own error message when present"
    // case above.
    expect(result.current.error).toBe("server exploded");
    expect(result.current.selected.has("t1")).toBe(true);
  });
});
