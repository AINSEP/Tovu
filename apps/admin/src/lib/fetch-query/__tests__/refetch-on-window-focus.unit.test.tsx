import { focusManager } from "@tanstack/react-query";
import { render, waitFor, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FetchQueryProvider, useFetchQuery } from "..";

/**
 * @file The `refetchOnWindowFocus` per-query passthrough (2026-09-21, forms plan §C) — additive, and
 * the client default (`false`, `adapter.tanstack.tsx`'s `createClient`) must stay unchanged for every
 * query that does not explicitly opt in. Both cases pass `staleTime: 0` so the query is always
 * eligible to refetch on focus in the first place; TanStack's own focus-refetch gate additionally
 * requires the query be stale, which this file's header (see `fetch-query.test.tsx`) says is
 * deliberately out of scope to otherwise re-derive here.
 *
 * `focusManager.setFocused` only notifies subscribers on an actual CHANGE (see
 * `@tanstack/query-core`'s `FocusManager`), so each test flips unfocused -> focused to trigger it,
 * and `afterEach` resets it back to the library's own default focus check so no state leaks into a
 * later test in this file.
 */

afterEach(() => {
  focusManager.setFocused(undefined);
});

function Reader({ fetch, refetchOnWindowFocus }: { fetch: () => Promise<string>; refetchOnWindowFocus?: boolean }) {
  const q = useFetchQuery({ key: ["focus-thing"], fetch, staleTime: 0, ...(refetchOnWindowFocus === undefined ? {} : { refetchOnWindowFocus }) });
  return <span data-testid="data">{q.data ?? "-"}</span>;
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

    focusManager.setFocused(false);
    focusManager.setFocused(true);

    await waitFor(() => expect(screen.getByTestId("data")).toHaveTextContent("v2"));
  });

  it("does NOT refetch on window focus when the option is omitted — the default stays unchanged", async () => {
    let call = 0;
    const fetch = vi.fn(async () => `v${++call}`);
    render(
      <FetchQueryProvider>
        <Reader fetch={fetch} />
      </FetchQueryProvider>
    );
    await waitFor(() => expect(screen.getByTestId("data")).toHaveTextContent("v1"));

    focusManager.setFocused(false);
    focusManager.setFocused(true);

    // Give any (wrongly) scheduled refetch a turn to land, then confirm it didn't.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("data")).toHaveTextContent("v1");
  });
});
