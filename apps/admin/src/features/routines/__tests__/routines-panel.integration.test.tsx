import { cleanup, render, screen } from "@/__tests__/render-with-jini-kits";
import { afterEach, expect, it, vi } from "vitest";
import { Suspense } from "react";
import { routinesPanelsFor } from "../../../panels";
import { Placeholder } from "../../../components/Placeholder";
import { useHostAdminLocale } from "@/hooks/admin-locale-dependencies.hooks";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("renders the enabled Routines panel and offers to create a routine", async () => {
  const endpoint = "/api/admin/assistant/routines";
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const url = new URL(String(input), window.location.origin);
    if (url.pathname === endpoint && init?.method === "GET") return Response.json({ routines: [] });
    if (url.pathname.endsWith("/settings/effective") && url.searchParams.get("namespace") === "core.language") {
      return Response.json({ data: [{ key: "locale", value: "en" }] });
    }
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal("fetch", fetch);
  const panel = routinesPanelsFor({ enabled: true }).find(({ id }) => id === "routines");
  if (!panel) throw new Error("Routines was not registered with its flag on");
  render(<Suspense fallback={<p>Opening Routines…</p>}>{panel.render({
    query: new URLSearchParams(), view: null, params: {}, Placeholder, useAdminLocaleHook: useHostAdminLocale,
  })}</Suspense>);

  expect(await screen.findByRole("heading", { name: "Routines" }, { timeout: 8_000 })).toBeInTheDocument();
  expect(await screen.findByText("No routines yet")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "New routine" })).toBeEnabled();
  expect(fetch).toHaveBeenCalledWith(endpoint, expect.objectContaining({ method: "GET", credentials: "same-origin" }));
}, 10_000);
