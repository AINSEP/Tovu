import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api";
import { createFakeThemesPort, defaultThemesPort } from "../hooks/themes-dependencies.hooks";

/**
 * @file `themes-dependencies.hooks.ts` bundles two things: `defaultThemesPort`, the real wiring
 * to `lib/api`, and `createFakeThemesPort`, the in-memory test double every other suite under
 * `features/themes` uses instead of it. Every existing suite drives `useThemes` through the fake,
 * so `defaultThemesPort` itself (only reachable via `useWiredThemes`, which no test calls either)
 * has never executed. This suite covers both directly: `defaultThemesPort`'s delegation to `api`,
 * and the fake's own branches (`onRescan`/`onDownload` present vs. absent) that no caller happens
 * to take both sides of.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

describe("defaultThemesPort — real api wiring", () => {
  it("getPresentation delegates to api.getPresentation", async () => {
    const spy = vi.spyOn(api, "getPresentation").mockResolvedValue({
      settings: { workspaceId: "ws", activeThemeId: "basic", updatedAt: new Date(0).toISOString() },
      availableThemeIds: ["basic"],
      availableThemes: [{ id: "basic", tier: "declarative" }],
      activeThemeTemplates: [],
      activeThemeStaticPageIds: [],
    });
    await expect(defaultThemesPort.getPresentation()).resolves.toMatchObject({ availableThemeIds: ["basic"] });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("rescanThemes delegates to api.rescanThemes", async () => {
    const spy = vi.spyOn(api, "rescanThemes").mockResolvedValue({
      added: [],
      removed: [],
      total: 1,
      availableThemeIds: ["basic"],
      duplicateIds: [],
    });
    await expect(defaultThemesPort.rescanThemes()).resolves.toMatchObject({ total: 1 });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("setActiveTheme delegates to api.setActiveTheme with the given id", async () => {
    const spy = vi.spyOn(api, "setActiveTheme").mockResolvedValue({
      settings: { workspaceId: "ws", activeThemeId: "quartz", updatedAt: new Date(0).toISOString() },
      availableThemeIds: ["basic", "quartz"],
    });
    await expect(defaultThemesPort.setActiveTheme("quartz")).resolves.toMatchObject({
      settings: { activeThemeId: "quartz" },
    });
    expect(spy).toHaveBeenCalledWith("quartz");
  });

  it("listMarketplaceThemes delegates to api.listMarketplaceThemes", async () => {
    const spy = vi.spyOn(api, "listMarketplaceThemes").mockResolvedValue({
      themes: [{ id: "alpha", name: "Alpha", tier: "declarative", idTaken: false }],
    });
    await expect(defaultThemesPort.listMarketplaceThemes()).resolves.toMatchObject({
      themes: [{ id: "alpha" }],
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("downloadMarketplaceTheme delegates to api.downloadMarketplaceTheme with the given id", async () => {
    const spy = vi.spyOn(api, "downloadMarketplaceTheme").mockResolvedValue({
      id: "alpha",
      suffixed: false,
      tier: "declarative",
      rescan: { added: ["alpha"], removed: [], total: 2 },
    });
    await expect(defaultThemesPort.downloadMarketplaceTheme("alpha")).resolves.toMatchObject({ id: "alpha" });
    expect(spy).toHaveBeenCalledWith("alpha");
  });
});

describe("createFakeThemesPort — rescanThemes", () => {
  it("returns the scripted onRescan result when supplied", async () => {
    const onRescan = vi.fn(() => ({
      added: ["quartz"],
      removed: [],
      total: 2,
      availableThemeIds: ["basic", "quartz"],
      duplicateIds: ["basic"],
    }));
    const port = createFakeThemesPort({ onRescan });
    await expect(port.rescanThemes()).resolves.toEqual({
      added: ["quartz"],
      removed: [],
      total: 2,
      availableThemeIds: ["basic", "quartz"],
      duplicateIds: ["basic"],
    });
    expect(onRescan).toHaveBeenCalledTimes(1);
  });

  it("falls back to a no-op rescan result reflecting current availableThemeIds when onRescan is absent", async () => {
    const port = createFakeThemesPort({ availableThemeIds: ["basic", "quartz"] });
    await expect(port.rescanThemes()).resolves.toEqual({
      added: [],
      removed: [],
      total: 2,
      availableThemeIds: ["basic", "quartz"],
      duplicateIds: [],
    });
  });
});

describe("createFakeThemesPort — listMarketplaceThemes", () => {
  it("defaults to an empty listing when no marketplace option is supplied", async () => {
    const port = createFakeThemesPort();
    await expect(port.listMarketplaceThemes()).resolves.toEqual({ themes: [] });
  });

  it("returns the scripted marketplace listing when supplied", async () => {
    const port = createFakeThemesPort({
      marketplace: [{ id: "alpha", name: "Alpha", tier: "declarative", idTaken: false }],
    });
    await expect(port.listMarketplaceThemes()).resolves.toEqual({
      themes: [{ id: "alpha", name: "Alpha", tier: "declarative", idTaken: false }],
    });
  });
});

describe("createFakeThemesPort — downloadMarketplaceTheme", () => {
  it("returns the scripted onDownload result when supplied", async () => {
    const onDownload = vi.fn((themeId: string) => ({
      id: `${themeId}-1`,
      suffixed: true,
      tier: "declarative",
      rescan: { added: [`${themeId}-1`], removed: [], total: 2 },
    }));
    const port = createFakeThemesPort({ onDownload });
    await expect(port.downloadMarketplaceTheme("alpha")).resolves.toEqual({
      id: "alpha-1",
      suffixed: true,
      tier: "declarative",
      rescan: { added: ["alpha-1"], removed: [], total: 2 },
    });
    expect(onDownload).toHaveBeenCalledWith("alpha");
  });

  it("falls back to a not-suffixed install result reflecting current availableThemeIds when onDownload is absent", async () => {
    const port = createFakeThemesPort({ availableThemeIds: ["basic"] });
    await expect(port.downloadMarketplaceTheme("alpha")).resolves.toEqual({
      id: "alpha",
      suffixed: false,
      tier: "declarative",
      rescan: { added: ["alpha"], removed: [], total: 2 },
    });
  });
});
