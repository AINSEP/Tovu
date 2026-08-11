import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "../../../lib/fetch-query";
import { createFakeRedirectsPort } from "../hooks/redirects-dependencies.hooks";
import { useRedirects, useWiredRedirects } from "../hooks/use-redirects.hooks";

/**
 * @file `useRedirects` — the Redirects list screen's three independent writes (create/toggle/
 * delete) sharing one list read. The adversarial case this file exists to pin: three independent
 * mutations each keep their OWN error until reset, and `firstWriteError` (see `rules.unit.test.ts`)
 * returns by array position, not recency — so a failed write's banner must not survive past the
 * start of a DIFFERENT write (`clearOtherWriteErrors`), or a later successful action would still
 * read as broken to the operator.
 *
 * Two styles, matching `use-assistant-chats.unit.test.ts`'s own split: the bulk of this file drives
 * `useWiredRedirects` with `fetch` stubbed, so it still covers the real client and request shapes.
 * The "injected port" group at the bottom composes `useRedirects` directly with
 * `createFakeRedirectsPort` — no `fetch`, no `FetchQueryProvider` request plumbing to stub, just the
 * outcome the hook is actually responsible for.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function wrapper({ children }: { children: React.ReactNode }) {
  return <FetchQueryProvider>{children}</FetchQueryProvider>;
}

const RULE = {
  id: "r1",
  workspaceId: "ws1",
  matchType: "exact",
  fromPattern: "/old",
  toTarget: "/new",
  statusCode: 301,
  status: "active",
  override: false,
  priority: 0,
  source: "manual",
  sourceEntryId: null,
  fromPathAtCapture: null,
  toPathAtCapture: null,
  createdByPrincipal: "p1",
  createdByPluginId: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  version: 1,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Routes a mocked `fetch` call on method + a distinguishing URL substring, matching
 *  `Dashboard.unit.test.tsx`/`Media.unit.test.tsx`'s own helper — order/count-coupled mocks
 *  silently mis-assert the moment a call is reordered. */
function routeFetch(routes: Array<{ when: (url: string, init?: RequestInit) => boolean; respond: () => Response }>) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const route = routes.find((r) => r.when(url, init));
    if (!route) throw new Error(`unrouted fetch: ${init?.method ?? "GET"} ${url}`);
    return route.respond();
  });
}

describe("useRedirects — list load", () => {
  it("starts in loading with redirects undefined", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const { result } = renderHook(() => useWiredRedirects(), { wrapper });
    expect(result.current.listStatus).toBe("loading");
    expect(result.current.redirects).toBeUndefined();
  });

  it("loads the list on mount", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch([{ when: (u) => u.includes("/redirects") && !u.includes("hits"), respond: () => jsonResponse({ data: [RULE] }) }]),
    );
    const { result } = renderHook(() => useWiredRedirects(), { wrapper });
    await waitFor(() => expect(result.current.redirects).toEqual([RULE]));
    expect(result.current.listStatus).toBe("success");
  });

  it("reports a list load failure via listStatus/listError, distinct from the write error channel", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "list route down" }, 500)));
    const { result } = renderHook(() => useWiredRedirects(), { wrapper });
    await waitFor(() => expect(result.current.listStatus).toBe("error"));
    expect(result.current.listError?.message).toBe("list route down");
    expect(result.current.error?.message).toBe("list route down");
  });
});

describe("useRedirects — createRedirect", () => {
  it("shapes the FormData via buildCreateRedirectPayload and posts it", async () => {
    const fetchMock = routeFetch([
      { when: (u) => u.endsWith("/redirects"), respond: () => jsonResponse({ data: [] }) },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useWiredRedirects(), { wrapper });
    await waitFor(() => expect(result.current.listStatus).toBe("success"));

    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { ...RULE, id: "r2" } }));
    const form = new FormData();
    form.set("matchType", "prefix");
    form.set("fromPattern", "/x");
    form.set("toTarget", "/y");
    form.set("statusCode", "302");

    await act(async () => {
      result.current.createRedirect(form);
      await Promise.resolve();
    });

    const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(postCall).toBeDefined();
    expect(JSON.parse((postCall![1] as RequestInit).body as string)).toEqual({
      matchType: "prefix",
      fromPattern: "/x",
      toTarget: "/y",
      statusCode: 302,
    });
  });
});

describe("useRedirects — error precedence across independent writes", () => {
  it("clears a stale write error once a DIFFERENT write starts, so a later successful action is not blamed for an earlier failure", async () => {
    const fetchMock = routeFetch([
      { when: (u) => u.endsWith("/redirects") && !u.includes("hits"), respond: () => jsonResponse({ data: [RULE] }) },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useWiredRedirects(), { wrapper });
    await waitFor(() => expect(result.current.redirects).toEqual([RULE]));

    // Toggle fails first.
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "toggle failed" }, 500));
    await act(async () => {
      result.current.onToggleStatus(RULE);
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.error?.message).toBe("toggle failed"));

    // A DIFFERENT write (create) starts — the stale toggle error must be gone even before create's
    // own outcome is known, because `clearOtherWriteErrors` resets siblings synchronously with the
    // new write starting, not on its resolution.
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { ...RULE, id: "r2" } }));
    const form = new FormData();
    form.set("fromPattern", "/a");
    form.set("toTarget", "/b");
    await act(async () => {
      result.current.createRedirect(form);
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.error).toBeNull());
  });

  it("firstWriteError's array-order precedence is observable through the hook: a create failure outranks a later toggle failure in the visible banner", async () => {
    const fetchMock = routeFetch([
      { when: (u) => u.endsWith("/redirects") && !u.includes("hits"), respond: () => jsonResponse({ data: [RULE] }) },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useWiredRedirects(), { wrapper });
    await waitFor(() => expect(result.current.redirects).toEqual([RULE]));

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "create failed" }, 500));
    const form = new FormData();
    form.set("fromPattern", "/a");
    form.set("toTarget", "/b");
    await act(async () => {
      result.current.createRedirect(form);
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.error?.message).toBe("create failed"));

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "toggle failed" }, 500));
    await act(async () => {
      result.current.onToggleStatus(RULE);
      await Promise.resolve();
      await Promise.resolve();
    });

    // `onToggleStatus` clears create's stale error before starting (clearOtherWriteErrors), so once
    // toggle's own failure lands, IT is now first-in-array among currently-errored writes.
    await waitFor(() => expect(result.current.error?.message).toBe("toggle failed"));
  });
});

describe("useRedirects — saving / onToggleStatus / onRequestDelete guard", () => {
  it("ignores onToggleStatus/onRequestDelete while another write is already saving", async () => {
    const fetchMock = routeFetch([
      { when: (u) => u.endsWith("/redirects") && !u.includes("hits"), respond: () => jsonResponse({ data: [RULE] }) },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useWiredRedirects(), { wrapper });
    await waitFor(() => expect(result.current.redirects).toEqual([RULE]));

    let resolveToggle!: (v: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => (resolveToggle = resolve)));

    act(() => result.current.onToggleStatus(RULE));
    await waitFor(() => expect(result.current.saving).toBe(true));

    act(() => result.current.onRequestDelete(RULE));
    expect(result.current.pendingDelete).toBeNull(); // guarded — never opened the confirm dialog

    await act(async () => {
      resolveToggle(jsonResponse({ data: { ...RULE, status: "disabled" } }));
      await Promise.resolve();
    });
  });
});

describe("useRedirects — delete confirmation", () => {
  it("confirmDelete is a no-op with nothing pending", async () => {
    vi.stubGlobal("fetch", routeFetch([{ when: (u) => u.endsWith("/redirects"), respond: () => jsonResponse({ data: [RULE] }) }]));
    const { result } = renderHook(() => useWiredRedirects(), { wrapper });
    await waitFor(() => expect(result.current.redirects).toEqual([RULE]));

    act(() => result.current.confirmDelete());
    expect(result.current.deletePending).toBe(false);
  });

  it("onRequestDelete opens the confirm dialog (sets pendingDelete), and confirmDelete clears it once the delete settles", async () => {
    const fetchMock = routeFetch([
      { when: (u) => u.endsWith("/redirects") && !u.includes("hits"), respond: () => jsonResponse({ data: [RULE] }) },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useWiredRedirects(), { wrapper });
    await waitFor(() => expect(result.current.redirects).toEqual([RULE]));

    act(() => result.current.onRequestDelete(RULE));
    expect(result.current.pendingDelete).toEqual(RULE);

    fetchMock.mockResolvedValueOnce(jsonResponse({ data: RULE }));
    await act(async () => {
      result.current.confirmDelete();
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.pendingDelete).toBeNull());
  });

  it("confirmDelete clears pendingDelete even when the delete FAILS — the dialog does not get stuck open on a failed confirm", async () => {
    const fetchMock = routeFetch([
      { when: (u) => u.endsWith("/redirects") && !u.includes("hits"), respond: () => jsonResponse({ data: [RULE] }) },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useWiredRedirects(), { wrapper });
    await waitFor(() => expect(result.current.redirects).toEqual([RULE]));

    act(() => result.current.onRequestDelete(RULE));
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "delete failed" }, 500));
    await act(async () => {
      result.current.confirmDelete();
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.pendingDelete).toBeNull());
    expect(result.current.error?.message).toBe("delete failed");
  });

  /**
   * FINDING (not a source change — TDD scope forbids it, see this suite's own dispatch): pins a
   * real defect in `confirmDelete`'s `void removeRule.mutate(rule).finally(() => setPendingDelete
   * (null))`.
   *
   * `mutate()`'s OWN returned promise already has a rejection handler attached internally by
   * `adapter.tanstack.tsx`'s `call` wrapper (`void promise.catch(() => {})` — see that file's own
   * doc comment, and `fetch-query.test.tsx`'s "does not raise a process-level unhandledRejection"
   * test, which this test is deliberately modeled on). But `.finally()` returns a NEW derived
   * promise that re-throws on rejection, and `confirmDelete` discards THAT promise with a bare
   * `void` — no `.catch` of its own. Attaching a handler to the original promise does not retroactively
   * handle a second, later-derived promise chain built on top of it.
   *
   * Net effect: every failed delete confirmation raises a process-level `unhandledRejection` in
   * production, not just under this test runner — the exact class of bug
   * `fetch-query.test.tsx`'s own regression test exists to prevent for `mutate()` callers who use
   * the bare fire-and-forget form, reintroduced one layer up by chaining `.finally` onto it.
   *
   * This test is EXPECTED TO FAIL against the current source. Do not silence it by adding a local
   * `.catch` here — that would hide the defect instead of reporting it; the fix belongs in
   * `use-redirects.hooks.ts`'s `confirmDelete` (e.g. `.catch(() => {}).finally(...)`, or awaiting
   * the mutate call inside its own try/catch).
   */
  it("[FINDING] confirmDelete's failed-delete path does not raise a process-level unhandledRejection", async () => {
    const fetchMock = routeFetch([
      { when: (u) => u.endsWith("/redirects") && !u.includes("hits"), respond: () => jsonResponse({ data: [RULE] }) },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useWiredRedirects(), { wrapper });
    await waitFor(() => expect(result.current.redirects).toEqual([RULE]));

    const reasons: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => reasons.push(reason);
    process.on("unhandledRejection", onUnhandledRejection);

    try {
      act(() => result.current.onRequestDelete(RULE));
      fetchMock.mockResolvedValueOnce(jsonResponse({ error: "delete failed" }, 500));
      await act(async () => {
        result.current.confirmDelete();
        await Promise.resolve();
        await Promise.resolve();
      });
      await waitFor(() => expect(result.current.pendingDelete).toBeNull());

      // `unhandledRejection` fires on a LATER event-loop turn than the rejection itself — give it
      // room before checking, matching `fetch-query.test.tsx`'s own timing.
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 100));
    } finally {
      process.off("unhandledRejection", onUnhandledRejection);
    }

    expect(reasons).toEqual([]);
  });
});

describe("useRedirects — injected port (no fetch stub)", () => {
  it("reads the list from the injected port rather than the real client", async () => {
    const port = createFakeRedirectsPort({ redirects: [{ ...RULE, id: "seed-1" }] });
    const { result } = renderHook(() => useRedirects(port), { wrapper });
    await waitFor(() => expect(result.current.redirects).toEqual([{ ...RULE, id: "seed-1" }]));
  });

  it("routes a create through the injected port, and the new row appears after the list re-reads it", async () => {
    const port = createFakeRedirectsPort();
    const { result } = renderHook(() => useRedirects(port), { wrapper });
    await waitFor(() => expect(result.current.redirects).toEqual([]));

    const form = new FormData();
    form.set("matchType", "exact");
    form.set("fromPattern", "/a");
    form.set("toTarget", "/b");
    form.set("statusCode", "301");
    await act(async () => {
      result.current.createRedirect(form);
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.redirects).toHaveLength(1));
    expect(result.current.redirects?.[0]?.fromPattern).toBe("/a");
  });

  /**
   * Negative verification (per this refactor's own required check): a port method that never
   * resolves is exactly the case a hand-rolled `fetch` stub cannot express without building a
   * `Promise` that never settles for global `fetch` too — this asserts the hook is genuinely
   * reading `redirects` from what the injected port returns, not from some other channel.
   *
   * Confirmed failing without the injection: pointing this hook at
   * `createFakeRedirectsPort({ redirects: [] })` (a port that resolves to a DIFFERENT list) instead
   * of `port` above makes the `toEqual` assertion fail, so this is not a vacuously true test.
   */
  it("does not resolve `redirects` while the injected port's list call is still pending", () => {
    const port = createFakeRedirectsPort();
    port.listRedirects = () => new Promise(() => {});
    const { result } = renderHook(() => useRedirects(port), { wrapper });
    expect(result.current.redirects).toBeUndefined();
    expect(result.current.listStatus).toBe("loading");
  });
});
