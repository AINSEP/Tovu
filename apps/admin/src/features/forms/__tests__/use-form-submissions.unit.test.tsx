import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "../../../lib/fetch-query";
import { useFormSubmissions } from "../hooks/use-form-submissions.hooks";
import { createFakeFormSubmissionsPort } from "../hooks/form-submissions-dependencies.hooks";
import type { AdminFormSubmission } from "../../../lib/api";

/**
 * @file `useFormSubmissions` — the submissions list's cursor-append load.
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

describe("useFormSubmissions — injected port", () => {
  it("loads only the given form's submissions from the fake port's seed, with no fetch involved", async () => {
    const networkMock = vi.fn();
    vi.stubGlobal("fetch", networkMock);
    const port = createFakeFormSubmissionsPort({
      submissions: [submissionFixture({ id: "s1", formDefinitionId: "f1" }), submissionFixture({ id: "s2", formDefinitionId: "other" })],
    });

    const { result } = renderHook(() => useFormSubmissions({ formId: "f1" }, port), { wrapper });

    await waitFor(() => expect(result.current.submissions).not.toBeNull());
    expect(result.current.submissions).toEqual([submissionFixture({ id: "s1", formDefinitionId: "f1" })]);
    expect(networkMock).not.toHaveBeenCalled();
  });

  it("selectedId drives the detail view without touching the port", async () => {
    const port = createFakeFormSubmissionsPort();
    const { result } = renderHook(() => useFormSubmissions({ formId: "f1" }, port), { wrapper });
    await waitFor(() => expect(result.current.submissions).toEqual([]));

    act(() => result.current.setSelectedId("s1"));
    expect(result.current.selectedId).toBe("s1");
    act(() => result.current.setSelectedId(null));
    expect(result.current.selectedId).toBeNull();
  });
});
