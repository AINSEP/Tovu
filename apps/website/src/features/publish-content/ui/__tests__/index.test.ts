/**
 * @file The `@tovu/publish-content-ui` barrel (`../index.ts`) — admin imports the publish dialog's
 * semantics only through it, so every runtime export must be present and be the very same binding its
 * owning module defines (a stale or duplicated copy here would let admin drift from the server's rules).
 */
import assert from "node:assert/strict";
import test from "node:test";

import * as barrel from "../index.js";
import * as criteria from "../criteria.js";
import * as phase from "../phase.js";
import * as publishOrder from "../publish-order.js";
import * as replan from "../replan.js";
import * as reportRows from "../report-rows.js";
import * as sections from "../sections.js";

const OWNERS: ReadonlyArray<readonly [Record<string, unknown>, readonly string[]]> = [
  [reportRows, ["countSelectedPublishing", "publishRowDisposition", "rowPublishesWithSelection", "selectableRowKeys", "summarizePublishReport", "toPublishReportRows"]],
  [publishOrder, ["publishOrderComparator", "sortPublishReportRows"]],
  [criteria, ["applyPublishCriteria", "decodePublishCriteriaFromQuery", "encodePublishCriteriaToQuery", "parsePublishContentToolInput", "PUBLISH_CONTENT_CAPABILITY", "PUBLISH_CRITERIA_QUERY_PARAM"]],
  [sections, ["PUBLISH_SECTIONS", "publishEntityTypeLabel", "publishEntityTypePluralLabel", "publishSectionById", "publishSectionForEntityTypes"]],
  [phase, ["canConfirmPlan", "canRequestPlan", "confirmationTokenFor", "planOnScreen"]],
  [replan, ["overwriteReplanIsConsistent", "preparePublishConfirmation", "PublishPlanDriftError"]],
];

test("the ui barrel re-exports exactly its owning modules' runtime bindings", () => {
  const expected = OWNERS.flatMap(([, names]) => names).sort();
  assert.deepEqual(Object.keys(barrel).sort(), expected);
  for (const [owner, names] of OWNERS) {
    for (const name of names) {
      assert.ok(owner[name] !== undefined, `${name} exists in its owning module`);
      assert.equal((barrel as Record<string, unknown>)[name], owner[name], `${name} is the owner's own binding`);
    }
  }
});

test("a barrel binding behaves as the dialog relies on: criteria round-trip through the query param", () => {
  const raw = barrel.encodePublishCriteriaToQuery({ types: ["page"], overwrite: true });
  assert.deepEqual(barrel.decodePublishCriteriaFromQuery(raw), { types: ["page"], overwrite: true });
  assert.equal(barrel.PUBLISH_CRITERIA_QUERY_PARAM, "publish");
});
