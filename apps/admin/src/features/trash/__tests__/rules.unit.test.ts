import { describe, expect, it } from "vitest";
import type { AdminTrashItem } from "@/lib/api";
import { actorLabel, entityTypeLabel, itemSubtitle } from "../rules";

/**
 * @file `actorLabel`'s fallback chain — server username, then client-resolved username, then
 * "System", then a "no account" label, with an AI-actor suffix layered on top of whichever of those
 * won — and specifically the distinction between an EXPLICIT `null` (the server looked
 * `actorPrincipalId` up and found no user record) and the field being absent entirely (an older
 * server that predates username resolution and never sent `actorUsername` at all).
 *
 * Regression for the 2026-09-21 report: the owner's desktop app was running a server started before
 * commit 255bf64d9 added `actorUsername` to the Trash list response, paired with the hot-reloaded
 * admin UI already reading it. Every row — including ones the owner's own `admin` account deleted —
 * rendered "Deleted user"/"Unknown", because `item.actorUsername` was `undefined`. The UI must never
 * claim an account was deleted unless the server actually said so — and now, against exactly that
 * older server, must resolve the owner's own principal id client-side instead of giving up
 * (2026-09-21 follow-up: `knownUsernames`).
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
  it("shows the server-resolved username when there is one", () => {
    expect(actorLabel("en", baseItem({ actorUsername: "jdoe" }))).toEqual({ label: "jdoe" });
  });

  it("shows 'Deleted user' only when the server explicitly resolved no account (actorUsername: null)", () => {
    expect(actorLabel("en", baseItem({ actorUsername: null }))).toEqual({ label: "Deleted user" });
  });

  it("does not claim the account was deleted when the server simply omitted actorUsername (older server)", () => {
    const withoutField = baseItem();
    delete (withoutField as { actorUsername?: string | null }).actorUsername;

    const label = actorLabel("en", withoutField);
    expect(label).toEqual({ label: "Unknown" });
    expect(label.label).not.toBe("Deleted user");
  });

  it("shows 'System' for the boot-time widget adoption's actor, never 'Deleted user' (2026-09-21)", () => {
    // The server resolves no user for the "system" principal (no account can ever hold that id), so
    // actorUsername comes back null exactly as it would for a real removed account — actorIsSystem
    // is what tells the two apart, and it must win before the "Deleted user" fallback runs.
    const label = actorLabel("en", baseItem({ actorUsername: null, actorIsSystem: true }));
    expect(label).toEqual({ label: "System" });
  });

  it("resolves actorPrincipalId against the client-side users map when the server omitted actorUsername (2026-09-21 — the owner's own deletions against an old server)", () => {
    const withoutField = baseItem({ actorPrincipalId: "principal-owner" });
    delete (withoutField as { actorUsername?: string | null }).actorUsername;

    const label = actorLabel("en", withoutField, new Map([["principal-owner", "admin"]]));
    expect(label).toEqual({ label: "admin" });
  });

  it("does not let client-side resolution override an explicit server null — the server already gave a real answer", () => {
    const label = actorLabel(
      "en",
      baseItem({ actorPrincipalId: "principal-owner", actorUsername: null }),
      new Map([["principal-owner", "admin"]])
    );
    expect(label).toEqual({ label: "Deleted user" });
  });

  it("falls back to 'System' for actorPrincipalId === 'system' against an old server with no actorIsSystem field either", () => {
    const withoutField = baseItem({ actorPrincipalId: "system" });
    delete (withoutField as { actorUsername?: string | null }).actorUsername;
    delete (withoutField as { actorIsSystem?: boolean }).actorIsSystem;

    const label = actorLabel("en", withoutField, new Map());
    expect(label).toEqual({ label: "System" });
  });

  it("still reads 'Unknown' when neither the server nor the client-side map can explain the id", () => {
    const withoutField = baseItem({ actorPrincipalId: "principal-nobody-knows" });
    delete (withoutField as { actorUsername?: string | null }).actorUsername;

    const label = actorLabel("en", withoutField, new Map([["some-other-principal", "someone-else"]]));
    expect(label).toEqual({ label: "Unknown" });
  });

  it("shows '<user label> + AI' with the plugin id as a tooltip, instead of the plugin id alone", () => {
    expect(actorLabel("en", baseItem({ actorPluginId: "forms", actorUsername: "jdoe" }))).toEqual({
      label: "jdoe + AI",
      title: "forms",
    });
  });

  it("composes the AI suffix over a client-resolved username too", () => {
    const withoutField = baseItem({ actorPluginId: "forms", actorPrincipalId: "principal-owner" });
    delete (withoutField as { actorUsername?: string | null }).actorUsername;

    const label = actorLabel("en", withoutField, new Map([["principal-owner", "admin"]]));
    expect(label).toEqual({ label: "admin + AI", title: "forms" });
  });

  it("actorIsSystem does not override a real, already-resolved username actor", () => {
    const label = actorLabel(
      "en",
      baseItem({ actorPluginId: "forms", actorUsername: "jdoe", actorIsSystem: true })
    );
    expect(label).toEqual({ label: "jdoe + AI", title: "forms" });
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
    expect(entityTypeLabel("en", "plugin")).toBe("Plugin");
  });

  it("prints an unrecognized kind as itself rather than hiding the row", () => {
    expect(entityTypeLabel("en", "some_future_kind")).toBe("some_future_kind");
  });
});

describe("itemSubtitle", () => {
  it("marks plugin packages as shared across workspaces", () => {
    expect(itemSubtitle("en", { entityType: "plugin", subtitle: "my-plugin 1.0.0" })).toBe(
      "my-plugin 1.0.0 · Shared across all workspaces on this site.",
    );
  });
});
