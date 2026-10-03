// PARITY: the host default remains opt-out; only stale, explicitly enabled queries refresh.
import { act, render, waitFor, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FetchQueryProvider, useFetchQuery } from "..";

/**
 * @file The `refetchOnWindowFocus` per-query passthrough (2026-09-21, forms plan §C) — additive, and
 * the shared cache default (`false`) must stay unchanged for every
 * query that does not explicitly opt in. Both cases pass `staleTime: 0` so the query is always
 * eligible to refetch on focus in the first place; the focus-refetch gate additionally
 * requires the query be stale, which the contract suite (see `fetch-query.test.tsx`) says is
 * deliberately out of scope to otherwise re-derive here.
 *
 * The former TanStack fixture flipped unfocused -> focused because its FocusManager notified only
 * on change, then reset that singleton after each case to avoid state leaking into later tests.
 * Jini owns subscriptions per provider and listens to native browser focus; dispatch that event
 * here so this remains a host-facing contract rather than driving a retired library singleton.

 */

function Reader({ fetch, refetchOnWindowFocus, id = "data" }: { fetch: () => Promise<string>; refetchOnWindowFocus?: boolean; id?: string }) {
  const q = useFetchQuery({ key: ["focus-thing", id], fetch, staleTime: 0, ...(refetchOnWindowFocus === undefined ? {} : { refetchOnWindowFocus }) });
  return <span data-testid={id}>{q.data ?? "-"}</span>;
}

describe("useFetchQuery refetchOnWindowFocus", () => {
  it("refetches when the window regains focus, when explicitly opted in", async () => {
    let call = 0;
    const fetch = vi.fn(async () => `v${++call}`);
    render(
      <FetchQueryProvider>
        <Reader fetch={fetch} refetchOnWindowFocus />
      </FetchQueryProvider>
    );
    await waitFor(() => expect(screen.getByTestId("data")).toHaveTextContent("v1"));

    act(() => window.dispatchEvent(new Event("focus")));

    await waitFor(() => expect(screen.getByTestId("data")).toHaveTextContent("v2"));
  });

  it("does NOT refetch on window focus when the option is omitted — the default stays unchanged", async () => {
    let call = 0;
    const fetch = vi.fn(async () => `v${++call}`);
    let sentinelCalls = 0;
    const sentinelFetch = vi.fn(async () => `sentinel${++sentinelCalls}`);
    render(
      <FetchQueryProvider>
        <Reader fetch={fetch} />
        <Reader fetch={sentinelFetch} refetchOnWindowFocus id="sentinel" />
      </FetchQueryProvider>
    );
    await waitFor(() => expect(screen.getByTestId("data")).toHaveTextContent("v1"));

    act(() => window.dispatchEvent(new Event("focus")));

    await waitFor(() => expect(screen.getByTestId("sentinel")).toHaveTextContent("sentinel2"));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("data")).toHaveTextContent("v1");
  });
});
