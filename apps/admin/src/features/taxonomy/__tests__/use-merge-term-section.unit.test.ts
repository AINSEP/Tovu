import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useMergeTermSection } from "../hooks/use-merge-term-section.hooks";
import type { AdminTerm } from "../../../lib/api";

/**
 * @file `useMergeTermSection` — the plan/confirm/execute merge-term ceremony (ADR-044,
 * SPEC-018 C-207). The state machine is the point of this hook: `step` must only ever advance
 * (idle → planned → confirmed) on a successful call, an error at any step must NOT advance it, and
 * changing `term` mid-wizard must reset everything rather than let a stale plan/confirmation token
 * survive onto a different term.
 */

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

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("startPlan", () => {
  it("is a no-op with no intoTermId chosen — no fetch, step stays idle", async () => {
    const { result } = renderHook(() => useMergeTermSection({ term: termFixture(), onMerged: vi.fn() }));
    await act(async () => {
      await result.current.startPlan();
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.step).toBe("idle");
  });

  it("advances to 'planned' and stores plan details on success", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(PLAN_RESPONSE));
    const { result } = renderHook(() => useMergeTermSection({ term: termFixture(), onMerged: vi.fn() }));
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
    const { result } = renderHook(() => useMergeTermSection({ term: termFixture(), onMerged: vi.fn() }));
    act(() => result.current.setIntoTermId("into1"));

    await act(async () => {
      await result.current.startPlan();
    });

    expect(result.current.step).toBe("idle");
    expect(result.current.error).toBe("cycle detected");
    expect(result.current.plan).toBeNull();
  });
});

describe("doConfirm", () => {
  it("is a no-op with no plan yet — no fetch, step stays idle", async () => {
    const { result } = renderHook(() => useMergeTermSection({ term: termFixture(), onMerged: vi.fn() }));
    await act(async () => {
      await result.current.doConfirm();
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.step).toBe("idle");
  });

  async function planned() {
    fetchMock.mockResolvedValueOnce(jsonResponse(PLAN_RESPONSE));
    const view = renderHook(() => useMergeTermSection({ term: termFixture(), onMerged: vi.fn() }));
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
    expect(result.current.error).toBe("plan expired");
    expect(result.current.confirmationToken).toBeNull();
  });
});

describe("doExecute", () => {
  it("is a no-op with no confirmationToken yet — no fetch, onMerged not called", async () => {
    const { result } = renderHook(() => useMergeTermSection({ term: termFixture(), onMerged: vi.fn() }));
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
    const view = renderHook(() => useMergeTermSection({ term: termFixture(), onMerged }));
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
    expect(result.current.error).toBeNull();
  });

  it("sets an error and does NOT call onMerged when execute fails", async () => {
    const onMerged = vi.fn();
    const { result } = await confirmed(onMerged);
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "already merged" }, 409));

    await act(async () => {
      await result.current.doExecute();
    });

    expect(onMerged).not.toHaveBeenCalled();
    expect(result.current.error).toBe("already merged");
    // Still confirmed — a failed execute must not silently drop the token the operator would need
    // to retry.
    expect(result.current.step).toBe("confirmed");
  });
});

describe("resetting when the term changes mid-wizard", () => {
  it("clears intoTermId/step/plan/confirmationToken/error when a new term id is passed in", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(PLAN_RESPONSE));
    const { result, rerender } = renderHook(({ term }) => useMergeTermSection({ term, onMerged: vi.fn() }), {
      initialProps: { term: termFixture({ id: "from1" }) },
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
