import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminRestorePoint } from "../../../lib/api";
import { useRestoreFlow } from "../hooks/use-restore-flow.hooks";

/**
 * @file `useRestoreFlow` — the restore ceremony (`plan`/`confirm`/`execute`, SPEC-019
 * C-301/C-302/C-303) plus the discarded-write-window disclosure fetch (design-spec.md §4.3).
 * Follows the fetch-mocking harness `use-migrate-forward-section.unit.test.ts` established for
 * this package — same ceremony shape, different endpoints.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const POINT: AdminRestorePoint = {
  id: "rp1",
  trigger: "manual",
  costClass: "cheap",
  kind: "full",
  watermarkAtCapture: 42,
  createdAt: "2026-08-01T00:00:00.000Z",
};
const POINT_2: AdminRestorePoint = { ...POINT, id: "rp2" };

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mount / point-change effect", () => {
  it("fetches the disclosure for the given point on mount", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ partial: true, watermarkBaselineAvailable: true, counts: { posts_pages: 3 } }));
    const { result } = renderHook(() => useRestoreFlow({ point: POINT }));
    await waitFor(() => expect(result.current.disclosure).not.toBeNull());
    const call = fetchMock.mock.calls[0];
    expect(String(call[0])).toContain("/recovery/disclosure");
    expect(JSON.parse(String((call[1] as RequestInit).body))).toEqual({ restorePointId: "rp1" });
  });

  it("starts step='idle', busy=false, disclosure=null, ceremonyError=null", () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ partial: true, watermarkBaselineAvailable: true, counts: {} }));
    const { result } = renderHook(() => useRestoreFlow({ point: POINT }));
    expect(result.current.step).toBe("idle");
    expect(result.current.busy).toBe(false);
    expect(result.current.disclosure).toBeNull();
    expect(result.current.ceremonyError).toBeNull();
    expect(result.current.plan).toBeNull();
    expect(result.current.confirmationToken).toBeNull();
    expect(result.current.result).toBeNull();
  });

  it("sets the Recovery-specific fallback error when the disclosure fetch fails with no server message", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "" }, 500));
    const { result } = renderHook(() => useRestoreFlow({ point: POINT }));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toBe("Failed to compute the discarded-write-window disclosure");
    expect(result.current.disclosure).toBeNull();
  });

  it("resets every field (disclosure, acknowledged, step, ceremony state) when the point prop changes", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ partial: true, watermarkBaselineAvailable: true, counts: { posts_pages: 3 } }));
    const view = renderHook(({ point }) => useRestoreFlow({ point }), { initialProps: { point: POINT } });
    await waitFor(() => expect(view.result.current.disclosure).not.toBeNull());
    act(() => view.result.current.setAcknowledged(true));
    expect(view.result.current.acknowledged).toBe(true);

    fetchMock.mockResolvedValueOnce(jsonResponse({ partial: true, watermarkBaselineAvailable: true, counts: {} }));
    view.rerender({ point: POINT_2 });

    expect(view.result.current.disclosure).toBeNull();
    expect(view.result.current.acknowledged).toBe(false);
    expect(view.result.current.step).toBe("idle");
    const secondCall = fetchMock.mock.calls[1];
    expect(JSON.parse(String((secondCall[1] as RequestInit).body))).toEqual({ restorePointId: "rp2" });
  });
});

describe("setAcknowledged", () => {
  it("toggles the acknowledged flag", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ partial: true, watermarkBaselineAvailable: true, counts: {} }));
    const { result } = renderHook(() => useRestoreFlow({ point: POINT }));
    expect(result.current.acknowledged).toBe(false);
    act(() => result.current.setAcknowledged(true));
    expect(result.current.acknowledged).toBe(true);
  });
});

async function mounted() {
  fetchMock.mockResolvedValueOnce(jsonResponse({ partial: true, watermarkBaselineAvailable: true, counts: {} }));
  const view = renderHook(() => useRestoreFlow({ point: POINT }));
  await waitFor(() => expect(view.result.current.disclosure).not.toBeNull());
  return view;
}

describe("startPlan", () => {
  it("sets busy during the request, then plan + step='planned' on success, busy=false after", async () => {
    const view = await mounted();
    let resolvePlan: ((r: Response) => void) | undefined;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => (resolvePlan = resolve)));

    let promise!: Promise<void>;
    act(() => {
      promise = view.result.current.startPlan();
    });
    expect(view.result.current.busy).toBe(true);

    await act(async () => {
      resolvePlan?.(jsonResponse({ planId: "plan1", planHash: "hash1" }));
      await promise;
    });

    expect(view.result.current.busy).toBe(false);
    expect(view.result.current.step).toBe("planned");
    expect(view.result.current.plan).toEqual({ planId: "plan1", planHash: "hash1" });
  });

  it("POSTs restorePointId to the plan endpoint", async () => {
    const view = await mounted();
    fetchMock.mockResolvedValueOnce(jsonResponse({ planId: "plan1", planHash: "hash1" }));
    await act(async () => {
      await view.result.current.startPlan();
    });
    const call = fetchMock.mock.calls.at(-1)!;
    expect(String(call[0])).toContain("/recovery/restore/plan");
    expect(JSON.parse(String((call[1] as RequestInit).body))).toEqual({ restorePointId: "rp1" });
  });

  it("on failure, sets the plan-specific fallback ceremonyError and leaves step at idle", async () => {
    const view = await mounted();
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "" }, 500));
    await act(async () => {
      await view.result.current.startPlan();
    });
    expect(view.result.current.ceremonyError).toBe("Failed to plan the restore");
    expect(view.result.current.step).toBe("idle");
    expect(view.result.current.busy).toBe(false);
  });

  it("uses the server's own error message when present", async () => {
    const view = await mounted();
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "restore point pruned" }, 409));
    await act(async () => {
      await view.result.current.startPlan();
    });
    expect(view.result.current.ceremonyError).toBe("restore point pruned");
  });

  it("clears a prior ceremonyError when re-invoked", async () => {
    const view = await mounted();
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "" }, 500));
    await act(async () => {
      await view.result.current.startPlan();
    });
    expect(view.result.current.ceremonyError).not.toBeNull();

    fetchMock.mockResolvedValueOnce(jsonResponse({ planId: "plan1", planHash: "hash1" }));
    await act(async () => {
      await view.result.current.startPlan();
    });
    expect(view.result.current.ceremonyError).toBeNull();
  });
});

describe("doConfirm", () => {
  it("is a no-op with no plan yet — no fetch call, step unchanged", async () => {
    const view = await mounted();
    const callsBefore = fetchMock.mock.calls.length;
    await act(async () => {
      await view.result.current.doConfirm();
    });
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
    expect(view.result.current.step).toBe("idle");
  });

  async function planned() {
    const view = await mounted();
    fetchMock.mockResolvedValueOnce(jsonResponse({ planId: "plan1", planHash: "hash1" }));
    await act(async () => {
      await view.result.current.startPlan();
    });
    return view;
  }

  it("sends planId, planHash, and disclosureAcknowledged; on success sets confirmationToken + step='confirmed'", async () => {
    const view = await planned();
    act(() => view.result.current.setAcknowledged(true));
    fetchMock.mockResolvedValueOnce(jsonResponse({ confirmationToken: "tok1" }));

    await act(async () => {
      await view.result.current.doConfirm();
    });

    const call = fetchMock.mock.calls.at(-1)!;
    expect(String(call[0])).toContain("/recovery/restore/confirm");
    expect(JSON.parse(String((call[1] as RequestInit).body))).toEqual({
      planId: "plan1",
      planHash: "hash1",
      disclosureAcknowledged: true,
    });
    expect(view.result.current.confirmationToken).toBe("tok1");
    expect(view.result.current.step).toBe("confirmed");
  });

  it("sends disclosureAcknowledged:false when the operator has not checked the box", async () => {
    const view = await planned();
    fetchMock.mockResolvedValueOnce(jsonResponse({ confirmationToken: "tok1" }));
    await act(async () => {
      await view.result.current.doConfirm();
    });
    const call = fetchMock.mock.calls.at(-1)!;
    expect(JSON.parse(String((call[1] as RequestInit).body))).toMatchObject({ disclosureAcknowledged: false });
  });

  it("on failure, sets the confirm-specific fallback error and leaves step at 'planned'", async () => {
    const view = await planned();
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "" }, 409));
    await act(async () => {
      await view.result.current.doConfirm();
    });
    expect(view.result.current.ceremonyError).toBe("Failed to confirm the restore");
    expect(view.result.current.step).toBe("planned");
    expect(view.result.current.confirmationToken).toBeNull();
  });
});

describe("doExecute", () => {
  it("is a no-op with no confirmationToken yet — no fetch call even if a plan exists", async () => {
    const view = await mounted();
    fetchMock.mockResolvedValueOnce(jsonResponse({ planId: "plan1", planHash: "hash1" }));
    await act(async () => {
      await view.result.current.startPlan();
    });
    const callsBefore = fetchMock.mock.calls.length;

    await act(async () => {
      await view.result.current.doExecute();
    });

    expect(fetchMock.mock.calls.length).toBe(callsBefore);
    expect(view.result.current.step).toBe("planned");
  });

  async function confirmed() {
    const view = await mounted();
    fetchMock.mockResolvedValueOnce(jsonResponse({ planId: "plan1", planHash: "hash1" }));
    await act(async () => {
      await view.result.current.startPlan();
    });
    fetchMock.mockResolvedValueOnce(jsonResponse({ confirmationToken: "tok1" }));
    await act(async () => {
      await view.result.current.doConfirm();
    });
    return view;
  }

  it("sends confirmationToken and restorePointId; on success sets result + step='done'", async () => {
    const view = await confirmed();
    fetchMock.mockResolvedValueOnce(jsonResponse({ restoreRunId: "run1", state: "succeeded", restartRequired: true }));

    await act(async () => {
      await view.result.current.doExecute();
    });

    const call = fetchMock.mock.calls.at(-1)!;
    expect(String(call[0])).toContain("/recovery/restore/execute");
    expect(JSON.parse(String((call[1] as RequestInit).body))).toEqual({ confirmationToken: "tok1", restorePointId: "rp1" });
    expect(view.result.current.result).toEqual({ restoreRunId: "run1", state: "succeeded", restartRequired: true });
    expect(view.result.current.step).toBe("done");
  });

  it("preserves restartRequired:undefined when the server omits it", async () => {
    const view = await confirmed();
    fetchMock.mockResolvedValueOnce(jsonResponse({ restoreRunId: "run1", state: "succeeded" }));
    await act(async () => {
      await view.result.current.doExecute();
    });
    expect(view.result.current.result?.restartRequired).toBeUndefined();
  });

  it("on failure, sets the execute-specific fallback error and leaves step at 'confirmed'", async () => {
    const view = await confirmed();
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "" }, 500));
    await act(async () => {
      await view.result.current.doExecute();
    });
    expect(view.result.current.ceremonyError).toBe("Failed to execute the restore");
    expect(view.result.current.step).toBe("confirmed");
    expect(view.result.current.result).toBeNull();
  });
});
