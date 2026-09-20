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
      },
      {
        entityType: "media",
        entityId: "media-1",
        entityLabel: null,
        outcome: "blocked",
        writes: false,
        reason: "required blob is absent",
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
