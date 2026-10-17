import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import type { AdminTerm } from "@/lib/api";
import { createFakeMergeTermSectionPort } from "../hooks/merge-term-section-dependencies.hooks";
import { useMergeTermSection } from "../hooks/use-merge-term-section.hooks";

// The main suite is being edited by another coverage worker. Reuse its port/provider owners
// here without modifying that worker's file.
function wrapper({ children }: { children: ReactNode }) {
  return <FetchQueryProvider>{children}</FetchQueryProvider>;
}

const term: AdminTerm = {
  id: "from1", taxonomyId: "tax1", parentId: null, name: "From Term", status: "active",
  updatedAt: "2026-08-01T00:00:00.000Z", version: 1,
};

describe("merge wizard stale failures", () => {
  it.each(["plan", "confirm", "execute"] as const)("keeps the new term's plan when an old %s fails", async stage => {
    const port = createFakeMergeTermSectionPort({ overlappingContentCount: 3 });
    const onMerged = vi.fn();
    let reject!: (error: Error) => void;
    const held = new Promise<never>((_resolve, fail) => { reject = fail; });
    let attempted = false;
    if (stage === "plan") {
      const plan = port.planMergeTerm;
      port.planMergeTerm = input => {
        if (input.fromTermId !== "from1") return plan(input);
        attempted = true;
        return held;
      };
    } else if (stage === "confirm") {
      port.confirmMergeTerm = () => { attempted = true; return held; };
    } else {
      port.executeMergeTerm = () => { attempted = true; return held; };
    }
    const { result, rerender } = renderHook(
      ({ currentTerm }) => useMergeTermSection({ term: currentTerm, onMerged }, port, "en"),
      { initialProps: { currentTerm: term }, wrapper },
    );
    act(() => result.current.setIntoTermId("into1"));
    if (stage !== "plan") await act(async () => { await result.current.startPlan(); });
    if (stage === "execute") await act(async () => { await result.current.doConfirm(); });
    let pending!: Promise<void>;
    act(() => {
      pending = stage === "plan" ? result.current.startPlan()
        : stage === "confirm" ? result.current.doConfirm() : result.current.doExecute();
    });
    await waitFor(() => expect(attempted).toBe(true));
    expect(result.current.busy).toBe(true);
    rerender({ currentTerm: { ...term, id: "from2", name: "Next Term" } });
    act(() => result.current.setIntoTermId("into2"));
    await act(async () => { await result.current.startPlan(); });
    const planNumber = stage === "plan" ? 1 : 2;
    expect(result.current.plan).toEqual({ planId: `fake-plan-${planNumber}`, planHash: `fake-hash-${planNumber}`, overlappingContentCount: 3 });
    await act(async () => { reject(new Error("old term merge failed")); await pending; });
    expect(result.current.intoTermId).toBe("into2");
    expect(result.current.step).toBe("planned");
    expect(result.current.plan).toEqual({ planId: `fake-plan-${planNumber}`, planHash: `fake-hash-${planNumber}`, overlappingContentCount: 3 });
    expect(result.current.confirmationToken).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.busy).toBe(false);
    expect(onMerged).not.toHaveBeenCalled();
  });
});
