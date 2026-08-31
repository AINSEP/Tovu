import { describe, expect, it, vi } from "vitest";

import type { AdminPost } from "@/lib/api";
import { pageRowMenuItems, themePageRowMenuItems } from "../rules";
import type { ThemePageRow } from "../hooks/use-theme-pages.hooks";

/**
 * @file Pure logic for `features/pages/rules.ts`.
 *
 * `pageRowMenuItems` mirrors `features/posts/rules.ts`'s `postRowMenuItems` exactly (this feature's
 * own doc comment says so) — the branch worth pinning is the same one: "Disable" is omitted
 * entirely for a draft page rather than rendered disabled.
 */

const PUBLISHED_PAGE: AdminPost = {
  id: "pg1",
  workspaceId: "w1",
  kind: "page",
  title: "About",
  slug: "about",
  bodyJson: {},
  status: "published",
  updatedAt: "2026-08-01T00:00:00.000Z",
  version: 1,
};

const DRAFT_PAGE: AdminPost = { ...PUBLISHED_PAGE, id: "pg2", title: "Draft Page", status: "draft" };

describe("pageRowMenuItems", () => {
  it("returns Edit, Disable, then Delete (in that order) for a published page", () => {
    const items = pageRowMenuItems(PUBLISHED_PAGE, { onEdit: vi.fn(), onDisable: vi.fn(), onDelete: vi.fn() }, "en");
    expect(items.map((i) => i.key)).toEqual(["edit", "disable", "delete"]);
  });

  it("omits Disable entirely (not a disabled entry) for a draft page", () => {
    const items = pageRowMenuItems(DRAFT_PAGE, { onEdit: vi.fn(), onDisable: vi.fn(), onDelete: vi.fn() }, "en");
    expect(items.map((i) => i.key)).toEqual(["edit", "delete"]);
    expect(items.find((i) => i.key === "disable")).toBeUndefined();
  });

  it("marks Delete destructive, and Edit/Disable not", () => {
    const items = pageRowMenuItems(PUBLISHED_PAGE, { onEdit: vi.fn(), onDisable: vi.fn(), onDelete: vi.fn() }, "en");
    expect(items.find((i) => i.key === "delete")).toMatchObject({ label: "Delete", destructive: true });
    expect(items.find((i) => i.key === "edit")).not.toHaveProperty("destructive", true);
    expect(items.find((i) => i.key === "disable")).not.toHaveProperty("destructive", true);
  });

  it("wires Edit's onSelect to onEdit with the page, and only onEdit", () => {
    const onEdit = vi.fn();
    const onDisable = vi.fn();
    const onDelete = vi.fn();
    const items = pageRowMenuItems(PUBLISHED_PAGE, { onEdit, onDisable, onDelete }, "en");
    items.find((i) => i.key === "edit")!.onSelect();
    expect(onEdit).toHaveBeenCalledWith(PUBLISHED_PAGE);
    expect(onDisable).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("wires Disable's onSelect to onDisable with the page, and only onDisable", () => {
    const onEdit = vi.fn();
    const onDisable = vi.fn();
    const onDelete = vi.fn();
    const items = pageRowMenuItems(PUBLISHED_PAGE, { onEdit, onDisable, onDelete }, "en");
    items.find((i) => i.key === "disable")!.onSelect();
    expect(onDisable).toHaveBeenCalledWith(PUBLISHED_PAGE);
    expect(onEdit).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("wires Delete's onSelect to onDelete with the page, and only onDelete", () => {
    const onEdit = vi.fn();
    const onDisable = vi.fn();
    const onDelete = vi.fn();
    const items = pageRowMenuItems(PUBLISHED_PAGE, { onEdit, onDisable, onDelete }, "en");
    items.find((i) => i.key === "delete")!.onSelect();
    expect(onDelete).toHaveBeenCalledWith(PUBLISHED_PAGE);
    expect(onEdit).not.toHaveBeenCalled();
    expect(onDisable).not.toHaveBeenCalled();
  });

  it("translates labels to Spanish when locale is es", () => {
    const items = pageRowMenuItems(PUBLISHED_PAGE, { onEdit: vi.fn(), onDisable: vi.fn(), onDelete: vi.fn() }, "es");
    expect(items.map((i) => i.label)).toEqual(["Editar", "Desactivar", "Eliminar"]);
  });
});

const THEME_ROW: ThemePageRow = {
  pageId: "about",
  filePath: "render/pages/about.html",
  published: false,
  resettable: true,
  collidingContent: null,
};

describe("themePageRowMenuItems", () => {
  it("returns exactly Details then Edit — no Disable/Delete, since a theme page has no PostRecord for either", () => {
    const items = themePageRowMenuItems(THEME_ROW, { onOpenDetails: vi.fn(), onEdit: vi.fn() }, (key) => key);
    expect(items.map((i) => i.key)).toEqual(["details", "edit"]);
    expect(items[0]).toMatchObject({ label: "Details" });
    expect(items[1]).toMatchObject({ label: "Edit" });
  });

  it("wires Details' onSelect to onOpenDetails with the row's own pageId, and only onOpenDetails", () => {
    const onOpenDetails = vi.fn();
    const onEdit = vi.fn();
    const items = themePageRowMenuItems(THEME_ROW, { onOpenDetails, onEdit }, (key) => key);
    items.find((i) => i.key === "details")!.onSelect();
    expect(onOpenDetails).toHaveBeenCalledWith("about");
    expect(onEdit).not.toHaveBeenCalled();
  });

  /**
   * PART 4 (2026-08-31): Edit moved out of `ThemePageDetailsModal.tsx`'s own footer into this menu,
   * directly under Details. Takes the row's bare `pageId` — same shape as `onOpenDetails` — rather
   * than building the Theme Studio href itself, since this module stays free of navigation (this
   * file's own header comment, and `rules.ts`'s `ThemePageRowMenuHandlers` doc); the caller
   * (`ThemePagesTab.tsx`) is the one place that turns it into `navigate(themeStudioHref(...))`.
   */
  it("wires Edit's onSelect to onEdit with the row's own pageId, and only onEdit", () => {
    const onOpenDetails = vi.fn();
    const onEdit = vi.fn();
    const items = themePageRowMenuItems(THEME_ROW, { onOpenDetails, onEdit }, (key) => key);
    items.find((i) => i.key === "edit")!.onSelect();
    expect(onEdit).toHaveBeenCalledWith("about");
    expect(onOpenDetails).not.toHaveBeenCalled();
  });

  it("translates both labels through the given Translate function", () => {
    const items = themePageRowMenuItems(
      THEME_ROW,
      { onOpenDetails: vi.fn(), onEdit: vi.fn() },
      (key) => (key === "Details" ? "Detalles" : key === "Edit" ? "Editar" : key)
    );
    expect(items.map((i) => i.label)).toEqual(["Detalles", "Editar"]);
  });
});
