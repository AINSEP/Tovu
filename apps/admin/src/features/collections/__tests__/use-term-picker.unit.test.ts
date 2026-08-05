import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useTermPicker } from "../hooks/use-term-picker.hooks";

/**
 * @file `useTermPicker` — `TermPicker`'s own selection state and `assignTerms` action.
 * Follows the fetch-mocking harness `use-migrate-forward-section.unit.test.ts` established for
 * this package.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function mount() {
  return renderHook(() => useTermPicker({ contentType: "recipe", contentId: "e1" }));
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

    await act(async () => {
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
