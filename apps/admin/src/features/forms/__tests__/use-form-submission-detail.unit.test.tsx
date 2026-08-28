import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "@/lib/fetch-query";
import { useFormSubmissionDetail } from "../hooks/use-form-submission-detail.hooks";
import { createFakeFormSubmissionsPort } from "../hooks/form-submissions-dependencies.hooks";
import type { AdminFormSubmission } from "@/lib/api";

/**
 * @file `useFormSubmissionDetail` — the submission detail view's load + two-click delete.
 * `FormEditor.unit.test.tsx` already exercises the full UI flow through a stubbed `fetch`; this
 * file is the hook's own injected-port coverage — see `form-submissions-port.hooks.ts` for why
 * the injection exists.
 *
 * `fetch-query` migration (2026-08-12): every `renderHook` now needs `wrapper: FetchQueryProvider`
 * — see `redirects/__tests__/use-redirects.hooks.unit.test.tsx`'s identical wrapper for the pilot
 * precedent.
 */

function wrapper({ children }: { children: React.ReactNode }) {
  return <FetchQueryProvider>{children}</FetchQueryProvider>;
}

function submissionFixture(overrides: Partial<AdminFormSubmission> = {}): AdminFormSubmission {
  return {
    id: "s1",
    formDefinitionId: "f1",
    workspaceId: "fake-ws",
    data: { email: "a@example.com" },
    sourceIp: "127.0.0.1",
    submittedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useFormSubmissionDetail — injected port", () => {
  it("loads the fake port's seeded submission, with no fetch involved", async () => {
    const networkMock = vi.fn();
    vi.stubGlobal("fetch", networkMock);
    const port = createFakeFormSubmissionsPort({ submissions: [submissionFixture()] });
    const onDeleted = vi.fn();

    const { result } = renderHook(() => useFormSubmissionDetail({ formId: "f1", submissionId: "s1", onDeleted }, port), {
      wrapper,
    });

    await waitFor(() => expect(result.current.submission).not.toBeNull());
    expect(result.current.submission).toEqual(submissionFixture());
    expect(networkMock).not.toHaveBeenCalled();
  });

  it("the two-click delete removes through the port and calls onDeleted only on the second click", async () => {
    const port = createFakeFormSubmissionsPort({ submissions: [submissionFixture()] });
    const onDeleted = vi.fn();
    const { result } = renderHook(() => useFormSubmissionDetail({ formId: "f1", submissionId: "s1", onDeleted }, port), {
      wrapper,
    });
    await waitFor(() => expect(result.current.submission).not.toBeNull());

    act(() => {
      result.current.handleDelete();
    });
    expect(result.current.confirming).toBe(true);
    expect(onDeleted).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.handleDelete();
    });

    expect(onDeleted).toHaveBeenCalledTimes(1);
  });
});
