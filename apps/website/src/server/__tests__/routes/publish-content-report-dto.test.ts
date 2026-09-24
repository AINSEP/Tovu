import assert from "node:assert/strict";
import test from "node:test";

import type { PublishContentReport } from "#src/features/publish-content/planner";
import { toPublishContentReportDto } from "#src/server/inbound/admin-http/routes/publish-content/report-dto";

test("the HTTP report mapper preserves every client-visible field and creates a wire DTO", () => {
  const domain: PublishContentReport = {
    refused: false,
    refusalReason: null,
    applyOrder: ["media", "post"],
    rows: [
      {
        entityType: "post",
        entityId: "post-1",
        entityLabel: "a-post-slug",
        outcome: "forced",
        writes: true,
        reason: "operator accepted the destination conflict",
        canOverwrite: false,
        retires: { entityType: "post", entityId: "post-0", entityLabel: "an-old-post-slug", hash: "sha256:old" },
      },
      {
        entityType: "media",
        entityId: "media-1",
        entityLabel: null,
        outcome: "blocked",
        writes: false,
        reason: "required blob is absent",
        canOverwrite: false,
        retires: null,
      },
    ],
  };

  const dto = toPublishContentReportDto(domain);
  assert.deepEqual(dto, domain);
  assert.notEqual(dto, domain, "the HTTP boundary must explicitly map, not expose the domain object by identity");
  assert.notEqual(dto.rows, domain.rows);
  assert.notEqual(dto.rows[0], domain.rows[0]);
  assert.notEqual(dto.applyOrder, domain.applyOrder);
});

// R6 (`plan-publish-repoint-menus-2026-09-24.md` §2.2/R6) — `referencedBy` is the last planner row
// field the HTTP boundary did not yet whitelist onto the wire; the operator dialog needs it to name
// the menus a retired page still feeds.
test("the HTTP report mapper carries a row's referencedBy holders onto the wire, and omits the key entirely when the planner didn't set it", () => {
  const domain: PublishContentReport = {
    refused: false,
    refusalReason: null,
    applyOrder: ["menu", "post"],
    rows: [
      {
        entityType: "post",
        entityId: "post-about",
        entityLabel: "about",
        outcome: "blocked",
        writes: false,
        reason: "slug taken by a different id",
        canOverwrite: true,
        retires: { entityType: "post", entityId: "post-about-old", entityLabel: "About (old)", hash: "sha256:old" },
        referencedBy: [
          { entityType: "menu", entityId: "menu-header", entityLabel: "Header", referencedId: "post-about-old" },
        ],
      },
      {
        entityType: "media",
        entityId: "media-1",
        entityLabel: null,
        outcome: "unchanged",
        writes: false,
        reason: null,
        canOverwrite: false,
        retires: null,
      },
    ],
  };

  const dto = toPublishContentReportDto(domain);

  assert.deepEqual(dto.rows[0].referencedBy, [
    { entityType: "menu", entityId: "menu-header", entityLabel: "Header", referencedId: "post-about-old" },
  ]);
  assert.ok(
    !("referencedBy" in dto.rows[1]),
    "a row whose planner row carries no referencedBy at all must not gain an explicit `referencedBy: undefined` key on the wire"
  );
});
