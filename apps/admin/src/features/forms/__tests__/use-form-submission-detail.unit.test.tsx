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

  it("requestDelete opens the confirm and deletes nothing", async () => {
    const port = createFakeFormSubmissionsPort({ submissions: [submissionFixture()] });
    port.deleteFormSubmission = vi.fn(port.deleteFormSubmission);
    const onDeleted = vi.fn();
    const { result } = renderHook(() => useFormSubmissionDetail({ formId: "f1", submissionId: "s1", onDeleted }, port), {
      wrapper,
    });
    await waitFor(() => expect(result.current.submission).not.toBeNull());

    act(() => {
      result.current.requestDelete();
    });

    expect(result.current.confirmOpen).toBe(true);
    expect(port.deleteFormSubmission).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("confirmDelete deletes, calls onDeleted and closes", async () => {
    const port = createFakeFormSubmissionsPort({ submissions: [submissionFixture()] });
    const onDeleted = vi.fn();
    const { result } = renderHook(() => useFormSubmissionDetail({ formId: "f1", submissionId: "s1", onDeleted }, port), {
      wrapper,
    });
    await waitFor(() => expect(result.current.submission).not.toBeNull());

    act(() => {
      result.current.requestDelete();
    });
    expect(result.current.confirmOpen).toBe(true);

    await act(async () => {
      await result.current.confirmDelete();
    });

    expect(onDeleted).toHaveBeenCalledTimes(1);
    expect(result.current.confirmOpen).toBe(false);
    expect(port.submissions).toEqual([]);
  });

  it("cancelDelete closes with no request", async () => {
    const port = createFakeFormSubmissionsPort({ submissions: [submissionFixture()] });
    port.deleteFormSubmission = vi.fn(port.deleteFormSubmission);
    const onDeleted = vi.fn();
    const { result } = renderHook(() => useFormSubmissionDetail({ formId: "f1", submissionId: "s1", onDeleted }, port), {
      wrapper,
    });
    await waitFor(() => expect(result.current.submission).not.toBeNull());

    act(() => {
      result.current.requestDelete();
    });
    expect(result.current.confirmOpen).toBe(true);

    act(() => {
      result.current.cancelDelete();
    });

    expect(result.current.confirmOpen).toBe(false);
    expect(port.deleteFormSubmission).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
