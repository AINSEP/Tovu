import { Suspense } from "react";
import { cleanup, render, screen } from "@/__tests__/render-with-jini-kits";
import { afterEach, expect, it, vi } from "vitest";
import { ThemeExplore } from "../../panel-pages";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("opens Theme Explore rather than the theme list when no site theme is active", async () => {
  const presentation = "/api/admin/v1/workspaces/workspace-local/presentation";
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    if ((init?.method ?? "GET") !== "GET") return new Response(null, { status: 405 });
    if (input === presentation) return Response.json({ settings: { activeThemeId: null } });
    const url = new URL(String(input), window.location.origin);
    if (url.pathname.endsWith("/settings/effective") && url.searchParams.get("namespace") === "core.language") {
      return Response.json({ data: [{ key: "locale", value: "en" }] });
    }
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal("fetch", fetch);
  render(<Suspense fallback={<p>Opening Theme Explore…</p>}><ThemeExplore themeId="" /></Suspense>);

  expect(await screen.findByText(/^No theme is active\. Your site renders unstyled/, {}, { timeout: 8_000 })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Themes" })).toHaveAttribute("href", "/admin/themes");
  expect(fetch).toHaveBeenCalledWith(presentation, expect.objectContaining({ credentials: "same-origin" }));
}, 10_000);
