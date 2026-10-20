import { describe, expect, it } from "vitest";
import type { PublishContentReport } from "@tovu/publish-content-ui";
import { createFakePublishContentPort } from "../publish-content-dependencies.hooks";

const report: PublishContentReport = {
  refused: false,
  refusalReason: null,
  applyOrder: ["page", "post"],
  rows: [
    { entityType: "page", entityId: "a", outcome: "created", writes: true, reason: null },
    { entityType: "page", entityId: "b", outcome: "conflict", writes: false, reason: "Edited live" },
    { entityType: "post", entityId: "a", outcome: "unchanged", writes: false, reason: null },
  ],
};

describe("L057 fake plan characterization", () => {
  it("retains report identity without filters and omits absent optional echoes", async () => {
    const port = createFakePublishContentPort({ report });
    const plan = await port.planPublish({ peerId: "live" });
    expect(plan.details).toBe(report);
    expect(plan).not.toHaveProperty("overwriteEntityKeys");
    expect(plan).not.toHaveProperty("notSupportedByLive");
  });

  it("intersects scope, selection and overwrite in order without mutating the source", async () => {
    const port = createFakePublishContentPort({
      report,
      liveCanOverwrite: false,
      notSupportedByLive: [{ entityType: "form", count: 2 }],
    });
    const plan = await port.planPublish({
      peerId: "live",
      scope: { entityTypes: ["page"], entityKeys: ["page:b", "post:a"] },
      selectedEntityKeys: ["page:b", "post:a"],
      overwriteEntityKeys: ["page:b", "post:a"],
    });
    expect(plan.planId).toBe("fake-plan-scoped-narrowed-overwrite");
    expect(plan.planHash).toBe("fake-plan-hash-scoped-narrowed-overwrite");
    expect(plan.bundleId).toBe("fake-bundle-scoped-narrowed-overwrite");
    expect(plan.details.rows).toEqual([{ ...report.rows[1], outcome: "forced", writes: true }]);
    expect(plan.liveCanOverwrite).toBe(false);
    expect(plan.notSupportedByLive).toEqual([{ entityType: "form", count: 2 }]);
    expect(plan.overwriteEntityKeys).toEqual(["page:b", "post:a"]);
    expect(report.rows[1].outcome).toBe("conflict");
    expect(port.calls.planPublish).toHaveLength(1);
  });

  it("distinguishes an empty selection from an empty overwrite request", async () => {
    const port = createFakePublishContentPort({ report });
    const empty = await port.planPublish({ peerId: "live", selectedEntityKeys: [], overwriteEntityKeys: [] });
    expect(empty.details.rows).toEqual([]);
    expect(empty.bundleId).toBe("fake-bundle-narrowed");
    expect(empty.overwriteEntityKeys).toEqual([]);
    const forced = await port.planPublish({ peerId: "live", overwriteEntityKeys: ["page:b"] });
    expect(forced.details.rows).toEqual([
      report.rows[0],
      { ...report.rows[1], outcome: "forced", writes: true },
      report.rows[2],
    ]);
  });

  it("records a failed planning request before rejecting with the configured error", async () => {
    const error = new Error("planning failed");
    const port = createFakePublishContentPort({ planError: error });
    await expect(port.planPublish({ peerId: "live" })).rejects.toBe(error);
    expect(port.calls.planPublish).toEqual([{ peerId: "live" }]);
  });
});

it("an empty scope entityKeys list keeps every fake row (reported, not fixed)", async () => {
  // The server's applyPublishScope treats an explicitly empty key set as matching nothing.
  // Preserve the fake's existing mismatch for this behavior-only refactor.
  const port = createFakePublishContentPort({ report });
  const plan = await port.planPublish({ peerId: "live", scope: { entityKeys: [] } });
  expect(plan.details.rows).toEqual(report.rows);
  expect(plan.planId).toBe("fake-plan-scoped");
});
