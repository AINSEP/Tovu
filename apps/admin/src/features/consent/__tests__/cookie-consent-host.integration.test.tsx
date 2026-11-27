import { cleanup, render, screen } from "@/__tests__/render-with-jini-kits";
import { afterEach, expect, it, vi } from "vitest";
import { Suspense } from "react";
import { CookieConsent } from "../../../panel-pages";
import { consentSnapshot } from "./consent-fixtures";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("loads this workspace's saved config into the Rules tab from a deep link", async () => {
  const settingsPath = "/api/admin/v1/workspaces/workspace-local/consent/settings";
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const url = new URL(String(input), window.location.origin);
    if (init?.method !== undefined && init.method !== "GET") return new Response(null, { status: 405 });
    if (url.pathname === settingsPath) return Response.json(consentSnapshot());
    if (url.pathname.endsWith("/settings/effective") && url.searchParams.get("namespace") === "core.language") {
      return Response.json({ data: [{ key: "locale", value: "en" }] });
    }
    if (url.pathname === "/api/admin/v1/workspaces/workspace-local/consent/readiness") {
      return Response.json({ ready: true, enabled: false, blockingProblems: [], declarations: [], warnings: [], truncated: false, limitations: [] });
    }
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal("fetch", fetch);

  render(<Suspense fallback={<p>Opening Cookie Consent…</p>}><CookieConsent tabId="rules" /></Suspense>);
  expect(await screen.findByRole("region", { name: "Fixed rules" }, { timeout: 8_000 })).toHaveTextContent("Global Privacy Control always turns off analytics and marketing.");
  expect(screen.getByRole("tab", { name: "Rules", selected: true })).toBeInTheDocument();
  expect(screen.getByRole("group", { name: "Rules" })).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Banner preview" })).toBeNull();
  expect(fetch).toHaveBeenCalledWith(settingsPath, expect.objectContaining({ credentials: "same-origin" }));
}, 10_000);
