import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useMigrateForwardSection } from "../hooks/use-migrate-forward-section.hooks";

/**
 * @file `useMigrateForwardSection` — the Database screen's plan/confirm/execute ceremony
 * (ADR-041 §3, SPEC-017 C-103/C-105). No initial fetch (unlike its two sibling sections): the
 * ceremony only starts on an explicit `startPlan()` call, so there is nothing to await before the
 * first assertion in most of these tests.
 *
 * The ordering guard worth pinning here: `doConfirm`/`doExecute` are no-ops without their
 * predecessor's output (`plan`/`confirmationToken`) — the ceremony cannot be driven out of order
 * even if a caller invoked the later step directly.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  // `useMigrateForwardSection` now also calls `useAdminLocale()` (real `fetch`, not this hook's
  // own concern), which would otherwise consume one of this file's strictly-ordered
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

describe("initial state", () => {
  it("starts idle, with no fetch call on mount", () => {
    const { result } = renderHook(() => useMigrateForwardSection());
    expect(result.current.step).toBe("idle");
    expect(result.current.busy).toBe(false);
    expect(result.current.plan).toBeNull();
    expect(result.current.confirmationToken).toBeNull();
    expect(result.current.done).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("startPlan", () => {
  it("sets busy during the request, then plan + step='planned' on success, and busy=false", async () => {
    const { result } = renderHook(() => useMigrateForwardSection());
    let resolvePlan: ((r: Response) => void) | undefined;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => (resolvePlan = resolve)));

    let promise!: Promise<void>;
    act(() => {
      promise = result.current.startPlan();
    });
    expect(result.current.busy).toBe(true);

    await act(async () => {
      resolvePlan?.(jsonResponse({ planId: "plan1", planHash: "hash1" }));
      await promise;
    });

    expect(result.current.busy).toBe(false);
    expect(result.current.step).toBe("planned");
    expect(result.current.plan).toEqual({ planId: "plan1", planHash: "hash1" });
  });

  it("POSTs to the plan endpoint with no body", async () => {
    const { result } = renderHook(() => useMigrateForwardSection());
    fetchMock.mockResolvedValueOnce(jsonResponse({ planId: "plan1", planHash: "hash1" }));
    await act(async () => {
      await result.current.startPlan();
    });
    const call = fetchMock.mock.calls[0];
    expect(String(call[0])).toContain("/database/migrate-forward/plan");
    expect((call[1] as RequestInit).method).toBe("POST");
    expect((call[1] as RequestInit).body).toBeUndefined();
  });

  it("on failure, sets the migrate-forward-specific fallback error and leaves step at idle", async () => {
    const { result } = renderHook(() => useMigrateForwardSection());
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "" }, 500));

    await act(async () => {
      await result.current.startPlan();
    });

    expect(result.current.error).toBe("Failed to plan the forward migration");
    expect(result.current.step).toBe("idle");
    expect(result.current.busy).toBe(false);
  });
});

describe("doConfirm", () => {
  it("is a no-op with no plan yet — no fetch call, step unchanged", async () => {
    const { result } = renderHook(() => useMigrateForwardSection());
    await act(async () => {
      await result.current.doConfirm();
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.step).toBe("idle");
  });

  async function planned() {
    const view = renderHook(() => useMigrateForwardSection());
    fetchMock.mockResolvedValueOnce(jsonResponse({ planId: "plan1", planHash: "hash1" }));
    await act(async () => {
      await view.result.current.startPlan();
    });
    return view;
  }

  it("sends the plan's own planId/planHash, and on success sets confirmationToken + step='confirmed'", async () => {
    const { result } = await planned();
    fetchMock.mockResolvedValueOnce(jsonResponse({ confirmationToken: "tok1" }));

    await act(async () => {
      await result.current.doConfirm();
    });

    const call = fetchMock.mock.calls.at(-1)!;
    expect(JSON.parse(String((call[1] as RequestInit).body))).toEqual({ planId: "plan1", planHash: "hash1" });
    expect(result.current.confirmationToken).toBe("tok1");
    expect(result.current.step).toBe("confirmed");
  });

  it("on failure, sets the confirm-specific fallback error and leaves step at 'planned' (does not regress or advance)", async () => {
    const { result } = await planned();
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "" }, 409));

    await act(async () => {
      await result.current.doConfirm();
    });

    expect(result.current.error).toBe("Failed to confirm the forward migration");
    expect(result.current.step).toBe("planned");
    expect(result.current.confirmationToken).toBeNull();
  });
});

describe("doExecute", () => {
  it("is a no-op with no confirmationToken yet — no fetch call even if a plan exists", async () => {
    const view = renderHook(() => useMigrateForwardSection());
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
    const view = renderHook(() => useMigrateForwardSection());
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

  it("sends the confirmationToken, and on success sets done=true + step='done'", async () => {
    const { result } = await confirmed();
    fetchMock.mockResolvedValueOnce(jsonResponse({}));

    await act(async () => {
      await result.current.doExecute();
    });

    const call = fetchMock.mock.calls.at(-1)!;
    expect(JSON.parse(String((call[1] as RequestInit).body))).toEqual({ confirmationToken: "tok1" });
    expect(result.current.done).toBe(true);
    expect(result.current.step).toBe("done");
  });

  it("on failure, sets the execute-specific fallback error and leaves done=false, step='confirmed'", async () => {
    const { result } = await confirmed();
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "" }, 500));

    await act(async () => {
      await result.current.doExecute();
    });

    expect(result.current.error).toBe("Failed to execute the forward migration");
    expect(result.current.done).toBe(false);
    expect(result.current.step).toBe("confirmed");
  });
});

describe("reset", () => {
  it("clears step, error, plan, confirmationToken, and done back to their initial values from any point in the ceremony", async () => {
    const view = renderHook(() => useMigrateForwardSection());
    fetchMock.mockResolvedValueOnce(jsonResponse({ planId: "plan1", planHash: "hash1" }));
    await act(async () => {
      await view.result.current.startPlan();
    });
    fetchMock.mockResolvedValueOnce(jsonResponse({ confirmationToken: "tok1" }));
    await act(async () => {
      await view.result.current.doConfirm();
    });

    act(() => view.result.current.reset());

    expect(view.result.current.step).toBe("idle");
    expect(view.result.current.error).toBeNull();
    expect(view.result.current.plan).toBeNull();
    expect(view.result.current.confirmationToken).toBeNull();
    expect(view.result.current.done).toBe(false);
  });
});

describe("t/locale (2026-08-11, standing i18n rule)", () => {
  /** `Database.tsx` no longer imports `useAdminLocale`/`database-i18n` for this section — `t`/
   *  `locale` must reflect this hook's OWN already-resolved locale (the same one it already used
   *  for its own error strings), not a hardcoded English pass-through. */
  it("t/locale reflect the locale settings fetch's resolved value, not the DEFAULT_LOCALE this hook starts with", async () => {
    // Cast rather than calling `fetchMock` directly — this vitest version's `Mock` type is not
    // itself callable without narrowing (a pre-existing tsc gap this whole file's `beforeEach`
    // already carries; scoped locally here rather than touching that shared declaration).
    const network = fetchMock as unknown as (url: string, init?: RequestInit) => Promise<Response>;
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
      if (String(url).includes("/settings/effective") && String(url).includes("namespace=core.language")) {
        return Promise.resolve(jsonResponse({ data: [{ key: "locale", value: "es" }] }));
      }
      return network(url, init);
    });

    const { result } = renderHook(() => useMigrateForwardSection());

    await waitFor(() => expect(result.current.locale).toBe("es"));
    expect(result.current.t("Migrate forward")).toBe("Migrar hacia adelante");
  });
});
