import { describe, expect, it } from "vitest";
import type { AdminTrashItem } from "@/lib/api";
import { actorLabel, entityTypeLabel } from "../rules";

/**
 * @file `actorLabel`'s three-way fallback — plugin id, then the server-resolved username, then a
 * "no account" label — and specifically the distinction between an EXPLICIT `null` (the server
 * looked `actorPrincipalId` up and found no user record) and the field being absent entirely (an
 * older server that predates username resolution and never sent `actorUsername` at all).
 *
 * Regression for the 2026-09-21 report: the owner's desktop app was running a server started before
 * commit 255bf64d9 added `actorUsername` to the Trash list response, paired with the hot-reloaded
 * admin UI already reading it. Every row — including ones the owner's own `admin` account deleted —
 * rendered "Deleted user", because `item.actorUsername` was `undefined` and `??` cannot tell that
 * apart from the server's own `null`. The UI must never claim an account was deleted unless the
 * server actually said so.
 */
function baseItem(overrides: Partial<AdminTrashItem> = {}): AdminTrashItem {
  return {
    id: "trash-1",
    entityType: "post",
    entityId: "post-1",
    title: "A deleted post",
    subtitle: null,
    trashedAt: "2026-09-01T00:00:00.000Z",
    purgeAfter: "2026-10-31T00:00:00.000Z",
    daysRemaining: 41,
    actorPrincipalId: "principal-1",
    actorPluginId: null,
    actorUsername: "jdoe",
    ...overrides,
  };
}

describe("actorLabel", () => {
  it("prefers the plugin/agent id when an agent did the deleting, even over a resolved username", () => {
    expect(actorLabel("en", baseItem({ actorPluginId: "forms", actorUsername: "jdoe" }))).toBe("forms");
  });

  it("shows the server-resolved username when there is one", () => {
    expect(actorLabel("en", baseItem({ actorUsername: "jdoe" }))).toBe("jdoe");
  });

  it("shows 'Deleted user' only when the server explicitly resolved no account (actorUsername: null)", () => {
    expect(actorLabel("en", baseItem({ actorUsername: null }))).toBe("Deleted user");
  });

  it("does not claim the account was deleted when the server simply omitted actorUsername (older server)", () => {
    const withoutField = baseItem();
    delete (withoutField as { actorUsername?: string | null }).actorUsername;

    const label = actorLabel("en", withoutField);
    expect(label).toBe("Unknown");
    expect(label).not.toBe("Deleted user");
  });

  it("shows 'System' for the boot-time widget adoption's actor, never 'Deleted user' (2026-09-21)", () => {
    // The server resolves no user for the "system" principal (no account can ever hold that id), so
    // actorUsername comes back null exactly as it would for a real removed account — actorIsSystem
    // is what tells the two apart, and it must win before the username branches run at all.
    const label = actorLabel("en", baseItem({ actorUsername: null, actorIsSystem: true }));
    expect(label).toBe("System");
  });

  it("actorIsSystem does not override a real plugin/agent actor", () => {
    const label = actorLabel(
      "en",
      baseItem({ actorPluginId: "forms", actorUsername: "jdoe", actorIsSystem: true })
    );
    expect(label).toBe("forms");
  });
});

describe("entityTypeLabel", () => {
  it("translates every registry kind the Trash's phase-1-and-beyond registry can hold", () => {
    expect(entityTypeLabel("en", "post")).toBe("Post");
    expect(entityTypeLabel("en", "comment")).toBe("Comment");
    expect(entityTypeLabel("en", "media")).toBe("Media");
    expect(entityTypeLabel("en", "redirect")).toBe("Redirect");
    expect(entityTypeLabel("en", "form")).toBe("Form");
    expect(entityTypeLabel("en", "form_submission")).toBe("Form submission");
    expect(entityTypeLabel("en", "widget")).toBe("Widget");
    expect(entityTypeLabel("en", "menu")).toBe("Menu");
    expect(entityTypeLabel("en", "term")).toBe("Term");
    expect(entityTypeLabel("en", "taxonomy")).toBe("Taxonomy");
  });

  it("prints an unrecognized kind as itself rather than hiding the row", () => {
    expect(entityTypeLabel("en", "some_future_kind")).toBe("some_future_kind");
  });
});
