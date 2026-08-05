import { describe, expect, it, vi } from "vitest";

import type { AdminPost } from "../../../lib/api";
import { pageRowMenuItems } from "../rules";

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
    const items = pageRowMenuItems(PUBLISHED_PAGE, { onEdit: vi.fn(), onDisable: vi.fn(), onDelete: vi.fn() });
    expect(items.map((i) => i.key)).toEqual(["edit", "disable", "delete"]);
  });

  it("omits Disable entirely (not a disabled entry) for a draft page", () => {
    const items = pageRowMenuItems(DRAFT_PAGE, { onEdit: vi.fn(), onDisable: vi.fn(), onDelete: vi.fn() });
    expect(items.map((i) => i.key)).toEqual(["edit", "delete"]);
    expect(items.find((i) => i.key === "disable")).toBeUndefined();
  });

  it("marks Delete destructive, and Edit/Disable not", () => {
    const items = pageRowMenuItems(PUBLISHED_PAGE, { onEdit: vi.fn(), onDisable: vi.fn(), onDelete: vi.fn() });
    expect(items.find((i) => i.key === "delete")).toMatchObject({ label: "Delete", destructive: true });
    expect(items.find((i) => i.key === "edit")).not.toHaveProperty("destructive", true);
    expect(items.find((i) => i.key === "disable")).not.toHaveProperty("destructive", true);
  });

  it("wires Edit's onSelect to onEdit with the page, and only onEdit", () => {
    const onEdit = vi.fn();
    const onDisable = vi.fn();
    const onDelete = vi.fn();
    const items = pageRowMenuItems(PUBLISHED_PAGE, { onEdit, onDisable, onDelete });
    items.find((i) => i.key === "edit")!.onSelect();
    expect(onEdit).toHaveBeenCalledWith(PUBLISHED_PAGE);
    expect(onDisable).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("wires Disable's onSelect to onDisable with the page, and only onDisable", () => {
    const onEdit = vi.fn();
    const onDisable = vi.fn();
    const onDelete = vi.fn();
    const items = pageRowMenuItems(PUBLISHED_PAGE, { onEdit, onDisable, onDelete });
    items.find((i) => i.key === "disable")!.onSelect();
    expect(onDisable).toHaveBeenCalledWith(PUBLISHED_PAGE);
    expect(onEdit).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("wires Delete's onSelect to onDelete with the page, and only onDelete", () => {
    const onEdit = vi.fn();
    const onDisable = vi.fn();
    const onDelete = vi.fn();
    const items = pageRowMenuItems(PUBLISHED_PAGE, { onEdit, onDisable, onDelete });
    items.find((i) => i.key === "delete")!.onSelect();
    expect(onDelete).toHaveBeenCalledWith(PUBLISHED_PAGE);
    expect(onEdit).not.toHaveBeenCalled();
    expect(onDisable).not.toHaveBeenCalled();
  });
});
