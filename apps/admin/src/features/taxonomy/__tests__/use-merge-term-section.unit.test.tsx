import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "@/lib/fetch-query";
import { useMergeTermSection, useWiredMergeTermSection } from "../hooks/use-merge-term-section.hooks";
import { createFakeMergeTermSectionPort } from "../hooks/merge-term-section-dependencies.hooks";
import type { AdminTerm } from "@/lib/api";

/**
 * @file `useMergeTermSection` — the plan/confirm/execute merge-term ceremony (ADR-044,
 * SPEC-018 C-207). The state machine is the point of this hook: `step` must only ever advance
 * (idle → planned → confirmed) on a successful call, an error at any step must NOT advance it, and
 * changing `term` mid-wizard must reset everything rather than let a stale plan/confirmation token
 * survive onto a different term.
 *
 * `wrapper` (2026-08-12, `lib/fetch-query` migration): plan/confirm/execute now go through
 * `useFetchMutation`, which throws without a `QueryClientProvider` ancestor.
 *
 * `error` assertions below are wrapped in `waitFor` (same migration): `error` is now DERIVED from
 * three independent `useMutation`s' own `.error`, which — unlike `step`/`plan`/`confirmationToken`
 * (plain `useState`, already settled synchronously inside the same handler) — updates on a render
 * TanStack schedules after `mutateAsync` settles. Reading it as a bare synchronous `expect` right
 * after `act()` raced that render under this file's own three-mutation-per-hook load (flaky, not
 * deterministically failing) — the other four migrated taxonomy hook test files, each with only one
 * mutation in flight at a time, did not need this.
 */

function wrapper({ children }: { children: React.ReactNode }) {
  return <FetchQueryProvider>{children}</FetchQueryProvider>;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function termFixture(overrides: Partial<AdminTerm> = {}): AdminTerm {
  return {
    id: "from1",
    taxonomyId: "tax1",
    parentId: null,
    name: "From Term",
    status: "active",
    updatedAt: "2026-08-01T00:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

const PLAN_RESPONSE = {
  planId: "plan1",
  planHash: "hash1",
  details: { fromTermId: "from1", intoTermId: "into1", overlapLossDisclosed: true, overlappingContentCount: 3 },
};
const CONFIRM_RESPONSE = { confirmationToken: "token1" };

let fetchMock: ReturnType<typeof vi.fn<(...args: any[]) => any>>;

beforeEach(() => {
  fetchMock = vi.fn();
  // `useMergeTermSection` now also calls `useAdminLocale()` (real `fetch`, not this hook's own
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

describe("startPlan", () => {
  it("is a no-op with no intoTermId chosen — no fetch, step stays idle", async () => {
    const { result } = renderHook(() => useWiredMergeTermSection({ term: termFixture(), onMerged: vi.fn() }), { wrapper });
    await act(async () => {
      await result.current.startPlan();
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.step).toBe("idle");
  });

  it("advances to 'planned' and stores plan details on success", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(PLAN_RESPONSE));
    const { result } = renderHook(() => useWiredMergeTermSection({ term: termFixture(), onMerged: vi.fn() }), { wrapper });
    act(() => result.current.setIntoTermId("into1"));

    await act(async () => {
      await result.current.startPlan();
    });

    expect(result.current.step).toBe("planned");
    expect(result.current.plan).toEqual({ planId: "plan1", planHash: "hash1", overlappingContentCount: 3 });
    expect(result.current.busy).toBe(false);
  });

  it("stays on 'idle' and sets an error when planning fails", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "cycle detected" }, 409));
    const { result } = renderHook(() => useWiredMergeTermSection({ term: termFixture(), onMerged: vi.fn() }), { wrapper });
    act(() => result.current.setIntoTermId("into1"));

    await act(async () => {
      await result.current.startPlan();
    });

    expect(result.current.step).toBe("idle");
    await waitFor(() => expect(result.current.error).toBe("cycle detected"));
    expect(result.current.plan).toBeNull();
  });
});

describe("doConfirm", () => {
  it("is a no-op with no plan yet — no fetch, step stays idle", async () => {
    const { result } = renderHook(() => useWiredMergeTermSection({ term: termFixture(), onMerged: vi.fn() }), { wrapper });
    await act(async () => {
      await result.current.doConfirm();
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.step).toBe("idle");
  });

  async function planned() {
    fetchMock.mockResolvedValueOnce(jsonResponse(PLAN_RESPONSE));
    const view = renderHook(() => useWiredMergeTermSection({ term: termFixture(), onMerged: vi.fn() }), { wrapper });
    act(() => view.result.current.setIntoTermId("into1"));
    await act(async () => {
      await view.result.current.startPlan();
    });
    return view;
  }

  it("advances to 'confirmed' and stores the confirmation token on success", async () => {
    const { result } = await planned();
    fetchMock.mockResolvedValueOnce(jsonResponse(CONFIRM_RESPONSE));

    await act(async () => {
      await result.current.doConfirm();
    });

    expect(result.current.step).toBe("confirmed");
    expect(result.current.confirmationToken).toBe("token1");
  });

  it("stays on 'planned' (does not advance) and sets an error when confirming fails", async () => {
    const { result } = await planned();
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "plan expired" }, 409));

    await act(async () => {
      await result.current.doConfirm();
    });

    expect(result.current.step).toBe("planned");
    await waitFor(() => expect(result.current.error).toBe("plan expired"));
    expect(result.current.confirmationToken).toBeNull();
  });
});

describe("doExecute", () => {
  it("is a no-op with no confirmationToken yet — no fetch, onMerged not called", async () => {
    const { result } = renderHook(() => useWiredMergeTermSection({ term: termFixture(), onMerged: vi.fn() }), { wrapper });
    const onMerged = vi.fn();
    await act(async () => {
      await result.current.doExecute();
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onMerged).not.toHaveBeenCalled();
  });

  async function confirmed(onMerged: () => void) {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(PLAN_RESPONSE))
      .mockResolvedValueOnce(jsonResponse(CONFIRM_RESPONSE));
    const view = renderHook(() => useWiredMergeTermSection({ term: termFixture(), onMerged }), { wrapper });
    act(() => view.result.current.setIntoTermId("into1"));
    await act(async () => {
      await view.result.current.startPlan();
    });
    await act(async () => {
      await view.result.current.doConfirm();
    });
    return view;
  }

  it("calls onMerged on a successful execute", async () => {
    const onMerged = vi.fn();
    const { result } = await confirmed(onMerged);
    fetchMock.mockResolvedValueOnce(jsonResponse({ mergedCount: 3 }));

    await act(async () => {
      await result.current.doExecute();
    });

    expect(onMerged).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.error).toBeNull());
  });

  it("sets an error and does NOT call onMerged when execute fails", async () => {
    const onMerged = vi.fn();
    const { result } = await confirmed(onMerged);
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "already merged" }, 409));

    await act(async () => {
      await result.current.doExecute();
    });

    expect(onMerged).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.error).toBe("already merged"));
    // Still confirmed — a failed execute must not silently drop the token the operator would need
    // to retry.
    expect(result.current.step).toBe("confirmed");
  });
});

describe("resetting when the term changes mid-wizard", () => {
  it("clears intoTermId/step/plan/confirmationToken/error when a new term id is passed in", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(PLAN_RESPONSE));
    const { result, rerender } = renderHook(({ term }) => useWiredMergeTermSection({ term, onMerged: vi.fn() }), {
      initialProps: { term: termFixture({ id: "from1" }) },
      wrapper,
    });
    act(() => result.current.setIntoTermId("into1"));
    await act(async () => {
      await result.current.startPlan();
    });
    expect(result.current.step).toBe("planned");

    rerender({ term: termFixture({ id: "from2", name: "Different Term" }) });

    await waitFor(() => expect(result.current.step).toBe("idle"));
    expect(result.current.intoTermId).toBe("");
    expect(result.current.plan).toBeNull();
    expect(result.current.confirmationToken).toBeNull();
    expect(result.current.error).toBeNull();
  });
});

describe("stale settlement across a term switch mid-wizard (no key={term.id} remount)", () => {
  /**
   * `Taxonomy.tsx` mounts `MergeTermSection` (inside `TermDetailPanel`) with no `key={term.id}` —
   * switching the selected term re-renders the SAME hook instance with a new `term` prop rather than
   * remounting a fresh one. The term-change effect resets `step`/`plan`/`error` the moment `term`
   * changes, but a `startPlan()` call already in flight for the PREVIOUS term has no way to know
   * that happened: its `then` still unconditionally advances `step`/`plan`, landing them onto the
   * NEW term's wizard. Same class of bug `use-widget-instance-editor.hooks.ts`'s `activeEntityRef`
   * guard fixes for its own save()-after-navigate case, and `use-term-detail-panel.hooks.ts`'s
   * `activeTermIdRef` now fixes for its sibling `rename()` case.
   */
  it("a plan started for term A that settles AFTER switching to term B must not advance B's wizard", async () => {
    const port = createFakeMergeTermSectionPort({ overlappingContentCount: 3 });
    let resolvePlan!: (v: { planId: string; planHash: string; details: { fromTermId: string; intoTermId: string; overlapLossDisclosed: boolean; overlappingContentCount: number } }) => void;
    port.planMergeTerm = vi.fn(() => new Promise((resolve) => (resolvePlan = resolve)));

    const { result, rerender } = renderHook(
      ({ term }) => useMergeTermSection({ term, onMerged: vi.fn() }, port, "en"),
      { initialProps: { term: termFixture({ id: "from1" }) }, wrapper }
    );
    act(() => result.current.setIntoTermId("into1"));
    act(() => {
      void result.current.startPlan();
    });
    await waitFor(() => expect(port.planMergeTerm).toHaveBeenCalledTimes(1));

    // Operator switches the selected term to a DIFFERENT one while A's plan is still in flight.
    rerender({ term: termFixture({ id: "from2", name: "Different Term" }) });
    await waitFor(() => expect(result.current.intoTermId).toBe(""));
    expect(result.current.step).toBe("idle");

    // A's stale plan now settles.
    await act(async () => {
      resolvePlan({
        planId: "plan1",
        planHash: "hash1",
        details: { fromTermId: "from1", intoTermId: "into1", overlapLossDisclosed: true, overlappingContentCount: 3 },
      });
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Must still read as term B's untouched wizard — A's late plan must not advance `step` or
    // populate `plan` on a wizard that is now showing a different term.
    expect(result.current.step).toBe("idle");
    expect(result.current.plan).toBeNull();
  });
});

describe("useMergeTermSection — injected port", () => {
  it("plans through the fake port and stores plan details, with no fetch involved", async () => {
    const networkMock = vi.fn();
    vi.stubGlobal("fetch", networkMock);
    const port = createFakeMergeTermSectionPort({ overlappingContentCount: 5 });

    const { result } = renderHook(() => useMergeTermSection({ term: termFixture(), onMerged: vi.fn() }, port, "en"), { wrapper });
    act(() => result.current.setIntoTermId("into1"));
    await act(async () => {
      await result.current.startPlan();
    });

    expect(result.current.step).toBe("planned");
    expect(result.current.plan?.overlappingContentCount).toBe(5);
    expect(networkMock).not.toHaveBeenCalled();
  });

  it("runs the full plan/confirm/execute ceremony through the port and calls onMerged", async () => {
    const port = createFakeMergeTermSectionPort();
    const onMerged = vi.fn();
    const { result } = renderHook(() => useMergeTermSection({ term: termFixture(), onMerged }, port, "en"), { wrapper });

    act(() => result.current.setIntoTermId("into1"));
    await act(async () => {
      await result.current.startPlan();
    });
    await act(async () => {
      await result.current.doConfirm();
    });
    await act(async () => {
      await result.current.doExecute();
    });

    expect(onMerged).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.error).toBeNull());
  });

  it("surfaces a rejected planMergeTerm call's message on the error channel", async () => {
    const port = createFakeMergeTermSectionPort({ planError: "cycle detected" });
    const { result } = renderHook(() => useMergeTermSection({ term: termFixture(), onMerged: vi.fn() }, port, "en"), { wrapper });
    act(() => result.current.setIntoTermId("into1"));

    await act(async () => {
      await result.current.startPlan();
    });

    expect(result.current.step).toBe("idle");
    await waitFor(() => expect(result.current.error).toBe("cycle detected"));
  });
});
