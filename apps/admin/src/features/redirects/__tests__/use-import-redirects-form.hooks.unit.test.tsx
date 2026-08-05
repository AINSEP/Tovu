import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "../../../lib/fetch-query";
import { useImportRedirectsForm } from "../hooks/use-import-redirects-form.hooks";

/**
 * @file `useImportRedirectsForm` (SPEC-037 REQ-04) — the bulk-import textarea's lifecycle.
 *
 * The adversarial case worth pinning here is precedence: a client-side PARSE failure
 * (`parseImportPayload`) must never reach the network, and once a request-level failure is on
 * screen, a later parse failure must replace it rather than stack with it — see the hook's own
 * `error = parseError ?? (importRules.error ? ... : null)` line.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function fakeSubmitEvent(): React.FormEvent {
  return { preventDefault: vi.fn() } as unknown as React.FormEvent;
}

function wrapper({ children }: { children: React.ReactNode }) {
  return <FetchQueryProvider>{children}</FetchQueryProvider>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useImportRedirectsForm — client-side parse gate", () => {
  it("rejects invalid JSON without ever calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useImportRedirectsForm(), { wrapper });
    act(() => result.current.setRaw("not json"));
    await act(async () => result.current.submit(fakeSubmitEvent()));

    expect(result.current.error).toBe("Not valid JSON.");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.result).toBeNull();
  });

  it("rejects a non-array JSON payload without calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useImportRedirectsForm(), { wrapper });
    act(() => result.current.setRaw('{"not":"an array"}'));
    await act(async () => result.current.submit(fakeSubmitEvent()));

    expect(result.current.error).toBe("Must be a JSON array of rule objects.");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("useImportRedirectsForm — submit", () => {
  const VALID_RAW = JSON.stringify([{ matchType: "exact", fromPattern: "/a", toTarget: "/b", statusCode: 301 }]);

  it("submits parsed rules and surfaces the 207 created/failed breakdown as a result, not an error", async () => {
    const response = {
      created: [{ id: "r1", fromPattern: "/a", toTarget: "/b" }],
      failed: [{ index: 0, code: "DUPLICATE", message: "already exists" }],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(response)));

    const { result } = renderHook(() => useImportRedirectsForm(), { wrapper });
    act(() => result.current.setRaw(VALID_RAW));
    await act(async () => result.current.submit(fakeSubmitEvent()));

    expect(result.current.result).toEqual(response);
    expect(result.current.error).toBeNull();
  });

  it("is importing for the duration of an in-flight submit", async () => {
    let resolveFetch!: (value: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((resolve) => (resolveFetch = resolve))),
    );

    const { result } = renderHook(() => useImportRedirectsForm(), { wrapper });
    act(() => result.current.setRaw(VALID_RAW));

    let submitPromise!: Promise<void>;
    act(() => {
      submitPromise = result.current.submit(fakeSubmitEvent()) as unknown as Promise<void>;
    });
    await waitFor(() => expect(result.current.importing).toBe(true));

    await act(async () => {
      resolveFetch(jsonResponse({ created: [], failed: [] }));
      await submitPromise;
    });
    expect(result.current.importing).toBe(false);
  });

  it("surfaces a transport/route failure through describeApiError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "import route down" }, 500)));

    const { result } = renderHook(() => useImportRedirectsForm(), { wrapper });
    act(() => result.current.setRaw(VALID_RAW));
    await act(async () => result.current.submit(fakeSubmitEvent()));

    expect(result.current.error).toBe("import route down");
    expect(result.current.result).toBeNull();
  });

  it("a later parse failure replaces an earlier request failure rather than stacking with it", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "import route down" }, 500));

    const { result } = renderHook(() => useImportRedirectsForm(), { wrapper });
    act(() => result.current.setRaw(VALID_RAW));
    await act(async () => result.current.submit(fakeSubmitEvent()));
    expect(result.current.error).toBe("import route down");

    act(() => result.current.setRaw("not json"));
    await act(async () => result.current.submit(fakeSubmitEvent()));

    expect(result.current.error).toBe("Not valid JSON.");
  });

  it("clears the previous result at the start of a new submit", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValueOnce(jsonResponse({ created: [{ id: "r1" }], failed: [] }));

    const { result } = renderHook(() => useImportRedirectsForm(), { wrapper });
    act(() => result.current.setRaw(VALID_RAW));
    await act(async () => result.current.submit(fakeSubmitEvent()));
    expect(result.current.result).not.toBeNull();

    // Second submit is an invalid-JSON attempt — the STALE result from the first submit must not
    // linger on screen next to the new parse error.
    act(() => result.current.setRaw("not json"));
    await act(async () => result.current.submit(fakeSubmitEvent()));
    expect(result.current.result).toBeNull();
  });
});
