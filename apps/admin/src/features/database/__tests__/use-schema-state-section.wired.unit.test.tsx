import { renderHook, waitFor } from "@/__tests__/fetch-query-render";
import { afterEach, expect, it, vi } from "vitest";

import { useWiredSchemaStateSection } from "../hooks/use-schema-state-section.hooks";

// Exercises the wired entry point through the real HTTP adapter and locale query.
afterEach(() => vi.unstubAllGlobals());

it("the wired schema check surfaces endpoint drift with the resolved admin translator", async () => {
  vi.stubGlobal("fetch", async (url: string) => {
    let body: unknown;
    if (String(url) === "/api/admin/v1/database/schema-state") {
      body = { status: "diverged", siteMeta: { version: 7, tag: "site" }, runtime: { version: 7, tag: "runtime" } };
    } else if (String(url).includes("/settings/effective") && String(url).includes("namespace=core.language")) {
      body = { data: [{ key: "locale", value: "es" }] };
    } else {
      throw new Error(`Unexpected test request: ${url}`);
    }
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  });
  const { result } = renderHook(() => useWiredSchemaStateSection());
  expect(result.current.settled).toBe(false);

  await waitFor(() => expect(result.current.warning?.title).toBe("Your database does not match the software running this site"));
  expect(result.current.warning?.tone).toBe("error");
  expect(result.current.settled).toBe(true);
  await waitFor(() => expect(result.current.t("Your database is out of date")).toBe("Tu base de datos está desactualizada"));
});
