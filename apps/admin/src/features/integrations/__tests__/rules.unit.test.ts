import { describe, expect, it, vi } from "vitest";

import type { AdminWebhookDelivery, AdminWebhookSubscription } from "../../../lib/api";
import { displayTimestamp, integrationRowMenuItems, parseTopics } from "../rules";

/**
 * @file Pure-logic coverage for `features/integrations/rules.ts` — the row-menu builder whose
 * `status === "paused"` label branch used to be reachable only by rendering the table and opening
 * the popover (per the file's own header), the topics parser, and the delivery-log timestamp
 * fallback.
 */

const SUBSCRIPTION: AdminWebhookSubscription = {
  id: "sub1",
  label: "My webhook",
  targetUrl: "https://example.com/hooks",
  topics: ["post.published"],
  status: "active",
  secretVersion: 1,
  previousSecretVersion: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  disabledAt: null,
  lastDelivery: null,
};

describe("parseTopics", () => {
  it("splits, trims, and drops blanks", () => {
    expect(parseTopics("post.published, post.deleted ,  , comment.created")).toEqual([
      "post.published",
      "post.deleted",
      "comment.created",
    ]);
  });

  it("returns an empty list for an empty or whitespace-only string", () => {
    expect(parseTopics("")).toEqual([]);
    expect(parseTopics("   ")).toEqual([]);
  });

  it("returns a single-element list for one topic with no commas", () => {
    expect(parseTopics("post.published")).toEqual(["post.published"]);
  });
});

describe("integrationRowMenuItems", () => {
  const handlers = { onTogglePause: vi.fn(), onDelete: vi.fn() };

  it("an active subscription's pause item reads Pause", () => {
    const items = integrationRowMenuItems(SUBSCRIPTION, handlers);
    expect(items.find((i) => i.key === "pause")?.label).toBe("Pause");
  });

  it("a paused subscription's pause item reads Resume", () => {
    const items = integrationRowMenuItems({ ...SUBSCRIPTION, status: "paused" }, handlers);
    expect(items.find((i) => i.key === "pause")?.label).toBe("Resume");
  });

  it("delete is marked destructive; both items wire through to their handlers", () => {
    handlers.onTogglePause.mockClear();
    handlers.onDelete.mockClear();
    const items = integrationRowMenuItems(SUBSCRIPTION, handlers);
    const del = items.find((i) => i.key === "delete")!;
    expect(del.destructive).toBe(true);
    items.find((i) => i.key === "pause")!.onSelect();
    del.onSelect();
    expect(handlers.onTogglePause).toHaveBeenCalledWith(SUBSCRIPTION);
    expect(handlers.onDelete).toHaveBeenCalledWith(SUBSCRIPTION);
  });
});

describe("displayTimestamp", () => {
  const BASE: AdminWebhookDelivery = {
    id: "d1",
    subscriptionId: "sub1",
    eventId: "evt1",
    topic: "post.published",
    status: "delivered",
    attempts: 1,
    nextAttemptAt: "2026-08-01T00:00:00.000Z",
    lastResponseStatus: 200,
    lastError: null,
    signedWithVersion: 1,
    createdAt: "2026-08-01T00:00:00.000Z",
    deliveredAt: null,
    deadAt: null,
  };

  it("prefers deliveredAt when present", () => {
    const delivered = { ...BASE, deliveredAt: "2026-08-02T00:00:00.000Z" };
    expect(displayTimestamp(delivered)).not.toBe(displayTimestamp(BASE));
  });

  it("falls back to createdAt when deliveredAt is null (never delivered)", () => {
    expect(displayTimestamp(BASE)).toBeTruthy();
  });
});
