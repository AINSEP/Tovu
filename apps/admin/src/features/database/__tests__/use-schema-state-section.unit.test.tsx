import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FetchQueryProvider } from "../../../lib/fetch-query";
import { useSchemaStateSection } from "../hooks/use-schema-state-section.hooks";
import { createFakeSchemaStateSectionPort } from "../hooks/schema-state-section-dependencies.hooks";

/**
 * @file `useSchemaStateSection` — the Database screen's drift check.
 *
 * Driven entirely through the injected `SchemaStateSectionPort` (no `fetch` stub for the data
 * itself), the seam `restore-points-section-dependencies.hooks.ts` established for this feature.
 *
 * The case this file exists for is the LAST one: a port that rejects must still surface a warning.
 * A screen that silently renders nothing when its health check fails is indistinguishable, to the
 * person reading it, from a screen reporting good health — which is the exact failure the drift
 * warning was built to prevent.
 */

function wrapper({ children }: { children: React.ReactNode }) {
  return <FetchQueryProvider>{children}</FetchQueryProvider>;
}

describe("useSchemaStateSection", () => {
  it("stays silent once a clean in-sync read lands", async () => {
    const port = createFakeSchemaStateSectionPort({ state: { status: "in-sync", siteMeta: null, runtime: null } });
    const { result } = renderHook(() => useSchemaStateSection({ port }), { wrapper });

    await waitFor(() => expect(result.current.settled).toBe(true));
    expect(result.current.warning).toBeNull();
  });

  it("surfaces the diverged warning once the read lands", async () => {
    const port = createFakeSchemaStateSectionPort({
      state: { status: "diverged", siteMeta: { version: 7, tag: "site" }, runtime: { version: 7, tag: "runtime" } },
    });
    const { result } = renderHook(() => useSchemaStateSection({ port }), { wrapper });

    await waitFor(() => expect(result.current.warning).not.toBeNull());
    expect(result.current.warning?.tone).toBe("error");
    expect(result.current.warning?.title).toBe("Your database does not match the software running this site");
  });

  it("claims nothing while the first read is still in flight", () => {
    const port = createFakeSchemaStateSectionPort({ state: { status: "diverged", siteMeta: null, runtime: null } });
    const { result } = renderHook(() => useSchemaStateSection({ port }), { wrapper });

    expect(result.current.warning).toBeNull();
    expect(result.current.settled).toBe(false);
  });

  it("warns that the check could not be completed when the port rejects, rather than rendering nothing", async () => {
    const port = createFakeSchemaStateSectionPort({ error: new Error("connection refused") });
    const { result } = renderHook(() => useSchemaStateSection({ port }), { wrapper });

    await waitFor(() => expect(result.current.warning).not.toBeNull());
    expect(result.current.warning?.title).toBe("We could not check your database");
    expect(result.current.warning?.body).toBe(
      "This check did not finish, so we cannot tell whether your database is up to date. Try reloading the page.",
    );
  });

  it("exposes a bound translator so the component never resolves a locale itself", async () => {
    const port = createFakeSchemaStateSectionPort({ state: { status: "in-sync", siteMeta: null, runtime: null } });
    const { result } = renderHook(() => useSchemaStateSection({ port }), { wrapper });

    await waitFor(() => expect(result.current.settled).toBe(true));
    expect(result.current.t("Database")).toBe("Database");
  });
});
