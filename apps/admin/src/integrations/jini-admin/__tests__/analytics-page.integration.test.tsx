import { cleanup, render, screen, within } from "@/__tests__/render-with-jini-kits";
import { afterEach, expect, it, vi } from "vitest";
import { Suspense } from "react";
import { Analytics } from "../../../panel-pages";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("shows the authenticated recent hit and the consent link when Analytics is opened", async () => {
  const hitPath = "/api/admin/v1/workspaces/workspace-local/analytics/recent-hits";
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const url = new URL(String(input), window.location.origin);
    if (init?.method !== undefined && init.method !== "GET") return new Response(null, { status: 405 });
    if (url.pathname === hitPath) return Response.json({ hits: [{
      occurredAt: "2026-08-01T00:00:00.000Z", kind: "event", path: "/autumn",
      referrerHost: "example.org", deviceClass: "desktop", browserFamily: "Chrome", eventName: "signup",
    }] });
    if (url.pathname.endsWith("/settings/effective") && url.searchParams.get("namespace") === "core.language") {
      return Response.json({ data: [{ key: "locale", value: "en" }] });
    }
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal("fetch", fetch);

  render(<Suspense fallback={<p>Opening Analytics…</p>}><Analytics /></Suspense>);
  expect(await screen.findByRole("heading", { name: "Analytics" }, { timeout: 8_000 })).toBeInTheDocument();
  const row = screen.getByRole("row", { name: /\/autumn/ });
  expect(within(row).getByRole("cell", { name: "event: signup" })).toBeInTheDocument();
  expect(within(row).getByRole("cell", { name: "example.org" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Cookie Consent" })).toHaveAttribute("href", "/admin/consent");
  expect(fetch).toHaveBeenCalledWith(hitPath, expect.objectContaining({ credentials: "same-origin" }));
}, 10_000);
