import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "@/lib/fetch-query";
import { createFakeCommentsPort } from "../hooks/comments-dependencies.hooks";
import { useComments, useWiredComments } from "../hooks/use-comments.hooks";

/**
 * @file `useComments` — the top-level `Comments()` screen's permissions load. New coverage added
 * alongside the `useWiredX` conversion (`comments-port.hooks.ts` / `comments-dependencies.hooks.ts`)
 * — `Comments.unit.test.tsx` already exercises the wired composition end-to-end through real
 * `fetch`; this file proves the pure hook is independently testable against an injected port, no
 * `fetch` stub required.
 *
 * `fetch-query` migration (2026-08-12): every `renderHook` now needs `wrapper: FetchQueryProvider`
 * — see `redirects/__tests__/use-redirects.hooks.unit.test.tsx`'s identical wrapper for the pilot
 * precedent.
 */

function wrapper({ children }: { children: React.ReactNode }) {
  return <FetchQueryProvider>{children}</FetchQueryProvider>;
}

describe("useComments", () => {
  it("resolves permissions from the injected port, without touching fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      const port = createFakeCommentsPort({ effectivePermissions: ["comments.moderate"] });
      const { result } = renderHook(() => useComments({ port, locale: "en" }), { wrapper });
      await waitFor(() => expect(result.current.permissions).not.toBeNull());
      expect(result.current.permissions).toEqual(["comments.moderate"]);
      expect(result.current.error).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("sets the fallback error when the injected port rejects", async () => {
    const port = createFakeCommentsPort({ meError: new Error("boom") });
    const { result } = renderHook(() => useComments({ port, locale: "en" }), { wrapper });
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toBe("boom");
    expect(result.current.permissions).toBeNull();
  });

  it("useWiredComments composes the real port — same controller shape, no port argument needed", () => {
    // Not exercised end-to-end here (that's `Comments.unit.test.tsx`'s job through the mounted
    // component) — this just proves the zero-arg wrapper type-checks and returns immediately with
    // the loading-state shape before its real fetch settles.
    const { result } = renderHook(() => useWiredComments(), { wrapper });
    expect(result.current.permissions).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
