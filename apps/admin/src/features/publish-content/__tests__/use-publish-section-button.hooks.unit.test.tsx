import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PublishSectionButton } from "../PublishSectionButton";
import { setPublishToLiveAvailable } from "../hooks/publish-availability.store";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); setPublishToLiveAvailable(true); });

it("uses the loaded locale for its section label and reacts to live-site availability changes", async () => {
  // Author Checklist F2.4/F3.6/F4.3/F6.2/F7.5: real consumer and locale port,
  // exact localized text and transport; reject hardcoding English or caching availability.
  const fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
    expect(url).toBe("/api/admin/v1/workspaces/workspace-local/settings/effective?namespace=core.language");
    expect(init?.method ?? "GET").toBe("GET");
    return Response.json({ data: [{ key: "locale", value: "es" }] });
  });
  vi.stubGlobal("fetch", fetch);
  setPublishToLiveAvailable(true);
  render(<PublishSectionButton section="collections" />);
  await screen.findByRole("button", { name: "Publicar colecciones" });
  expect(fetch).toHaveBeenCalledTimes(1);
  act(() => setPublishToLiveAvailable(false));
  expect(screen.queryByRole("button", { name: "Publicar colecciones" })).not.toBeInTheDocument();
  act(() => setPublishToLiveAvailable(true));
  expect(screen.getByRole("button", { name: "Publicar colecciones" })).toBeInTheDocument();
});
