import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "../../lib/api";
import {
  createFakeWidgetConfigFieldsPort,
  defaultWidgetConfigFieldsPort,
} from "../WidgetConfigFields/widget-config-fields-dependencies.hooks";

/**
 * @file `defaultWidgetConfigFieldsPort`/`createFakeWidgetConfigFieldsPort` — the port pulled out
 * from underneath `WidgetConfigFields.tsx`'s existing `useFetchedOptions` seam (this pass).
 * `WidgetConfigFields.unit.test.tsx`'s `MenuConfigFields`/`ContactFormConfigFields` describe blocks
 * already cover the port's real path end-to-end (they spy on `api.listMenus`/`api.listForms`,
 * which the real port still calls through to at call time), so this file's job is narrower: pin
 * the port module's own two exports directly — the real binding delegates to `api`, and the fake
 * is a working `WidgetConfigFieldsPort` on its own.
 */

describe("defaultWidgetConfigFieldsPort", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("listMenus delegates to api.listMenus", async () => {
    const spy = vi.spyOn(api, "listMenus").mockResolvedValue({ menus: [] });
    await defaultWidgetConfigFieldsPort.listMenus();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("listForms delegates to api.listForms", async () => {
    const spy = vi.spyOn(api, "listForms").mockResolvedValue({ data: [] });
    await defaultWidgetConfigFieldsPort.listForms();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("listContentTypes delegates to api.listContentTypes", async () => {
    const spy = vi.spyOn(api, "listContentTypes").mockResolvedValue({ items: [] });
    await defaultWidgetConfigFieldsPort.listContentTypes();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("createFakeWidgetConfigFieldsPort", () => {
  it("defaults to empty menus/forms/content types with no options given", async () => {
    const port = createFakeWidgetConfigFieldsPort();
    await expect(port.listMenus()).resolves.toEqual({ menus: [] });
    await expect(port.listForms()).resolves.toEqual({ data: [] });
    await expect(port.listContentTypes()).resolves.toEqual({ items: [] });
  });

  it("resolves the given seed menus/forms", async () => {
    const menu = { id: "m1", workspaceId: "ws1", slug: "main", title: "Main", status: "published" as const, items: [], locations: [], updatedAt: "2026-01-01", version: 1 };
    const port = createFakeWidgetConfigFieldsPort({ menus: [menu] });
    await expect(port.listMenus()).resolves.toEqual({ menus: [menu] });
  });

  it("resolves the given seed content types", async () => {
    const contentType = { workspaceId: "ws1", key: "docs_page", label: "Docs page", fields: [], status: "active" as const, version: 1 };
    const port = createFakeWidgetConfigFieldsPort({ contentTypes: [contentType] });
    await expect(port.listContentTypes()).resolves.toEqual({ items: [contentType] });
  });

  it("rejects with the given errors when set", async () => {
    const port = createFakeWidgetConfigFieldsPort({
      listMenusError: new Error("menus down"),
      listFormsError: new Error("forms down"),
      listContentTypesError: new Error("content types down"),
    });
    await expect(port.listMenus()).rejects.toThrow("menus down");
    await expect(port.listForms()).rejects.toThrow("forms down");
    await expect(port.listContentTypes()).rejects.toThrow("content types down");
  });
});
