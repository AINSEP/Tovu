import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

import { FetchQueryProvider, useFetchMutation, useFetchQuery, useInvalidate } from "..";

/**
 * @file Behavioural contract for `lib/fetch-query`.
 *
 * These assert the PROMISES THE INTERFACE MAKES, never TanStack's own
 * behaviour, and they import only from `..` — the public surface. That is
 * deliberate and load-bearing: this file is the acceptance suite a replacement
 * adapter has to pass, so if it referenced `@tanstack/*` types or internals it
 * would silently become untransferable and the rip-out claim in `index.ts`
 * would lose its evidence.
 *
 * Each `render` gets its own `FetchQueryProvider`, so each test starts from a
 * cold cache (the provider builds its client in a `useMemo` for exactly this
 * reason).
 */

function wrap(ui: ReactNode) {
  return render(<FetchQueryProvider>{ui}</FetchQueryProvider>);
}

/** Deferred promise, so a test can assert on the in-flight state before
 *  letting a request finish. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function Reader({ fetch, enabled }: { fetch: () => Promise<string>; enabled?: boolean }) {
  const q = useFetchQuery({ key: ["thing"], fetch, ...(enabled === undefined ? {} : { enabled }) });
  return (
    <div>
      <span data-testid="status">{q.status}</span>
      <span data-testid="fetching">{String(q.isFetching)}</span>
      <span data-testid="data">{q.data ?? "-"}</span>
      <span data-testid="error">{q.error?.message ?? "-"}</span>
      <button type="button" onClick={q.refetch}>
        refetch
      </button>
    </div>
  );
}

/** One enabled reader and one disabled reader on the SAME key, so a failure
 *  cached by the first is observable through the second — the real shape of
 *  the lazy-cell bug, where a row's cell remounts disabled next to a key that
 *  has already failed. */
function Cached({ fetch }: { fetch: () => Promise<string> }) {
  const live = useFetchQuery({ key: ["thing"], fetch });
  const lazy = useFetchQuery({ key: ["thing"], fetch, enabled: false });
  return (
    <div>
      <span data-testid="live-status">{live.status}</span>
      <span data-testid="lazy-status">{lazy.status}</span>
      <span data-testid="lazy-error">{lazy.error?.message ?? "-"}</span>
    </div>
  );
}

describe("useFetchQuery", () => {
  it("reports loading, then success with the resolved data", async () => {
    wrap(<Reader fetch={async () => "hello"} />);
    expect(screen.getByTestId("status")).toHaveTextContent("loading");
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("success"));
    expect(screen.getByTestId("data")).toHaveTextContent("hello");
  });

  it("surfaces a rejection as an Error on the error channel, never as empty data", async () => {
    wrap(<Reader fetch={async () => Promise.reject(new Error("route exploded"))} />);
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("error"));
    expect(screen.getByTestId("error")).toHaveTextContent("route exploded");
    expect(screen.getByTestId("data")).toHaveTextContent("-");
  });

  it("normalises a non-Error rejection into an Error, so callers can rely on .message", async () => {
    wrap(<Reader fetch={async () => Promise.reject("just a string")} />);
    await waitFor(() => expect(screen.getByTestId("error")).toHaveTextContent("just a string"));
  });

  it("does not run while disabled, and runs once enabled — the lazy-cell contract", async () => {
    const fetch = vi.fn(async () => "hits");
    const { rerender } = wrap(<Reader fetch={fetch} enabled={false} />);

    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByTestId("status")).toHaveTextContent("loading");
    expect(screen.getByTestId("fetching")).toHaveTextContent("false");

    rerender(
      <FetchQueryProvider>
        <Reader fetch={fetch} enabled />
      </FetchQueryProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("data")).toHaveTextContent("hits"));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  /**
   * Regression — external review, 2026-08-01. Disabling a query does NOT make
   * the cache forget an earlier failure, and passing that through meant a
   * remounted gesture-gated cell rendered a stale error before the operator had
   * gestured: a failure they never asked for and cannot dismiss.
   */
  it("a disabled query reports no error even when the same key already failed", async () => {
    const fetch = vi.fn(async () => Promise.reject(new Error("hits route down")));

    // First mount: enabled, fails, and the failure is now cached under the key.
    const first = wrap(<Reader fetch={fetch} enabled />);
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("error"));
    first.unmount();

    // Second mount: same provider is gone, so re-create the scenario within one
    // cache by mounting both readers under a single provider instead.
    render(
      <FetchQueryProvider>
        <Cached fetch={fetch} />
      </FetchQueryProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("live-status")).toHaveTextContent("error"));

    // The disabled sibling shares the failed key but must stay quiet.
    expect(screen.getByTestId("lazy-status")).toHaveTextContent("loading");
    expect(screen.getByTestId("lazy-error")).toHaveTextContent("-");
  });

  it("shares one request between two components mounted on the same key", async () => {
    const fetch = vi.fn(async () => "shared");
    wrap(
      <>
        <Reader fetch={fetch} />
        <Reader fetch={fetch} />
      </>,
    );
    await waitFor(() => expect(screen.getAllByTestId("data")[0]).toHaveTextContent("shared"));
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

/**
 * The distinction the old `useState` triple could not express, and the reason
 * the pilot screen stopped blanking after every edit: a refresh of data we
 * already hold is `success` + `isFetching`, NOT `loading`.
 */
describe("background refresh", () => {
  it("keeps status 'success' while re-fetching, so a screen never flashes its skeleton back", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    let call = 0;
    const fetch = () => (call++ === 0 ? first.promise : second.promise);

    wrap(<Reader fetch={fetch} />);
    first.resolve("v1");
    await waitFor(() => expect(screen.getByTestId("data")).toHaveTextContent("v1"));

    await userEvent.click(screen.getByRole("button", { name: "refetch" }));
    await waitFor(() => expect(screen.getByTestId("fetching")).toHaveTextContent("true"));

    expect(screen.getByTestId("status")).toHaveTextContent("success");
    expect(screen.getByTestId("data")).toHaveTextContent("v1");

    second.resolve("v2");
    await waitFor(() => expect(screen.getByTestId("data")).toHaveTextContent("v2"));
  });
});

function Writer({
  run,
  invalidates,
  fetch,
}: {
  run: () => Promise<string>;
  invalidates?: readonly (readonly string[])[];
  fetch: () => Promise<string>;
}) {
  const q = useFetchQuery({ key: ["thing"], fetch });
  const m = useFetchMutation({ run, ...(invalidates ? { invalidates } : {}) });
  return (
    <div>
      <span data-testid="data">{q.data ?? "-"}</span>
      <span data-testid="mstatus">{m.status}</span>
      <span data-testid="merror">{m.error?.message ?? "-"}</span>
      {/* Deliberately NO `.catch()` — this is the documented fire-and-forget
          form, and a local catch here would make the unhandledrejection test
          below pass no matter what the adapter does. */}
      <button type="button" onClick={() => void m.mutate(undefined as never)}>
        write
      </button>
      <button type="button" onClick={m.reset}>
        reset
      </button>
    </div>
  );
}

describe("useFetchMutation", () => {
  it("invalidates the named key on success, refetching a list nobody told to reload", async () => {
    let version = 0;
    const fetch = vi.fn(async () => `v${++version}`);
    wrap(<Writer run={async () => "ok"} invalidates={[["thing"]]} fetch={fetch} />);

    await waitFor(() => expect(screen.getByTestId("data")).toHaveTextContent("v1"));
    await userEvent.click(screen.getByRole("button", { name: "write" }));

    await waitFor(() => expect(screen.getByTestId("data")).toHaveTextContent("v2"));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does NOT invalidate when the write fails — a rejected write changed nothing", async () => {
    const fetch = vi.fn(async () => "v1");
    wrap(<Writer run={async () => Promise.reject(new Error("nope"))} invalidates={[["thing"]]} fetch={fetch} />);

    await waitFor(() => expect(screen.getByTestId("data")).toHaveTextContent("v1"));
    await userEvent.click(screen.getByRole("button", { name: "write" }));

    await waitFor(() => expect(screen.getByTestId("mstatus")).toHaveTextContent("error"));
    expect(screen.getByTestId("merror")).toHaveTextContent("nope");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("reset() clears a failure back to idle without remounting the form", async () => {
    wrap(<Writer run={async () => Promise.reject(new Error("nope"))} fetch={async () => "v1"} />);
    await userEvent.click(screen.getByRole("button", { name: "write" }));
    await waitFor(() => expect(screen.getByTestId("mstatus")).toHaveTextContent("error"));

    await userEvent.click(screen.getByRole("button", { name: "reset" }));
    await waitFor(() => expect(screen.getByTestId("mstatus")).toHaveTextContent("idle"));
    expect(screen.getByTestId("merror")).toHaveTextContent("-");
  });

  /**
   * The fire-and-forget form (`void m.mutate(...)`, which `Writer` above uses
   * deliberately without a local `.catch`) must still land the failure in
   * `status`/`error` as documented.
   *
   * NOT a test that the discarded promise avoids `unhandledrejection`. One was
   * written and deleted: it passed identically with and against the adapter fix
   * it claimed to pin, because neither jsdom's `window` event nor Node's
   * process-level hook fires for it under this runner. A test that cannot
   * distinguish the bug from the fix is worse than no test — it reports
   * confidence it does not have. That property is held by construction instead
   * (see `adapter.tanstack.tsx`'s `call`), and is verifiable only in a real
   * browser console.
   */
  it("the fire-and-forget form still reports the failure through status and error", async () => {
    wrap(<Writer run={async () => Promise.reject(new Error("boom"))} fetch={async () => "v1"} />);
    await userEvent.click(screen.getByRole("button", { name: "write" }));
    await waitFor(() => expect(screen.getByTestId("mstatus")).toHaveTextContent("error"));
    expect(screen.getByTestId("merror")).toHaveTextContent("boom");
  });

  it("mutate() rejects, so a caller that needs the outcome can await it inline", async () => {
    const seen: string[] = [];
    function Inline() {
      const m = useFetchMutation({ run: async () => Promise.reject(new Error("boom")) });
      return (
        <button
          type="button"
          onClick={async () => {
            try {
              await m.mutate(undefined as never);
              seen.push("resolved");
            } catch (e) {
              seen.push(`caught:${(e as Error).message}`);
            }
          }}
        >
          go
        </button>
      );
    }
    wrap(<Inline />);
    await userEvent.click(screen.getByRole("button", { name: "go" }));
    await waitFor(() => expect(seen).toEqual(["caught:boom"]));
  });
});

/**
 * Prefix matching is a contract term, not an implementation detail — see
 * `QueryKey`'s doc. Found by tracing a real delete on the pilot screen, where
 * invalidating `['redirects']` also refetched `['redirects', id, 'hits']`. A
 * replacement adapter doing exact-key equality would compile and quietly stop
 * refreshing derived data, so it is pinned here rather than left to be
 * rediscovered.
 */
describe("invalidation matching", () => {
  it("invalidating a parent key also refreshes keys nested under it", async () => {
    let listV = 0;
    let childV = 0;
    const listFetch = vi.fn(async () => `list${++listV}`);
    const childFetch = vi.fn(async () => `child${++childV}`);

    function Both() {
      const list = useFetchQuery({ key: ["redirects"], fetch: listFetch });
      const child = useFetchQuery({ key: ["redirects", "abc", "hits"], fetch: childFetch });
      const invalidate = useInvalidate();
      return (
        <div>
          <span data-testid="list">{list.data ?? "-"}</span>
          <span data-testid="child">{child.data ?? "-"}</span>
          <button type="button" onClick={() => invalidate(["redirects"])}>
            push
          </button>
        </div>
      );
    }
    wrap(<Both />);
    await waitFor(() => expect(screen.getByTestId("child")).toHaveTextContent("child1"));

    await userEvent.click(screen.getByRole("button", { name: "push" }));
    await waitFor(() => expect(screen.getByTestId("list")).toHaveTextContent("list2"));
    await waitFor(() => expect(screen.getByTestId("child")).toHaveTextContent("child2"));
  });

  it("does NOT invalidate a sibling key that merely shares no prefix", async () => {
    let otherV = 0;
    const otherFetch = vi.fn(async () => `other${++otherV}`);

    function Siblings() {
      const other = useFetchQuery({ key: ["forms"], fetch: otherFetch });
      const invalidate = useInvalidate();
      return (
        <div>
          <span data-testid="other">{other.data ?? "-"}</span>
          <button type="button" onClick={() => invalidate(["redirects"])}>
            push
          </button>
        </div>
      );
    }
    wrap(<Siblings />);
    await waitFor(() => expect(screen.getByTestId("other")).toHaveTextContent("other1"));

    await userEvent.click(screen.getByRole("button", { name: "push" }));
    await new Promise((r) => setTimeout(r, 50));
    expect(otherFetch).toHaveBeenCalledTimes(1);
  });
});

describe("useInvalidate", () => {
  it("refetches a key on demand — the seam the SSE change feed pushes into", async () => {
    let version = 0;
    const fetch = vi.fn(async () => `v${++version}`);
    function External() {
      const q = useFetchQuery({ key: ["thing"], fetch });
      const invalidate = useInvalidate();
      return (
        <div>
          <span data-testid="data">{q.data ?? "-"}</span>
          <button type="button" onClick={() => invalidate(["thing"])}>
            push
          </button>
        </div>
      );
    }
    wrap(<External />);
    await waitFor(() => expect(screen.getByTestId("data")).toHaveTextContent("v1"));

    await userEvent.click(screen.getByRole("button", { name: "push" }));
    await waitFor(() => expect(screen.getByTestId("data")).toHaveTextContent("v2"));
  });
});
