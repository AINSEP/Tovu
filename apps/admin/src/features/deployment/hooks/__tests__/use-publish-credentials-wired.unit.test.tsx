import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "@/lib/fetch-query";

/**
 * @file Coverage for `useWiredPublishCredentials` — the zero-arg entry point that binds the real
 * port and the real resolved locale. Kept separate from `use-publish-credentials.unit.test.ts`
 * (which drives `usePublishCredentials` entirely through an injected fake port) because this one
 * test needs a module-level `vi.mock` of `@/lib/api` and `@/hooks/use-admin-locale.hooks`, which
 * would otherwise apply (harmlessly, but needlessly) to every test in that much larger file.
 */

const { listPublishCredentials } = vi.hoisted(() => ({ listPublishCredentials: vi.fn() }));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { ...actual.api, listPublishCredentials } };
});

vi.mock("@/hooks/use-admin-locale.hooks", () => ({ useAdminLocale: () => "en" }));

const { useWiredPublishCredentials } = await import("../use-publish-credentials.hooks");

function wrapper({ children }: { children: React.ReactNode }) {
  return <FetchQueryProvider>{children}</FetchQueryProvider>;
}

describe("useWiredPublishCredentials", () => {
  it("binds the real port and locale, loading rows through it", async () => {
    listPublishCredentials.mockResolvedValue({ credentials: [], executionMode: "self-hosted-cli" });
    const { result } = renderHook(() => useWiredPublishCredentials(), { wrapper });

    await waitFor(() => expect(result.current.rows).not.toBeUndefined());
    expect(listPublishCredentials).toHaveBeenCalledWith();
    expect(result.current.rows).toHaveLength(4);
    expect(result.current.t("Copy")).toBe("Copy"); // fakeT-equivalent identity for an untranslated key in "en"
  });
});
