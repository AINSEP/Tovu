/**
 * @file The `@jini-ai/cms/publish/content/dialog` barrel — admin imports the publish dialog's
 * semantics only through it, so every runtime export must be present and be the very same binding its
 * owning module defines (a stale or duplicated copy here would let admin drift from the server's rules).
 */
import assert from "node:assert/strict";
import test from "node:test";

import * as barrel from "@jini-ai/cms/publish/content/dialog";
import * as criteria from "@jini-ai/cms/publish/content/dialog/criteria";
import * as phase from "@jini-ai/cms/publish/content/dialog/phase";
import * as publishOrder from "@jini-ai/cms/publish/content/dialog/publish-order";
import * as replan from "@jini-ai/cms/publish/content/dialog/replan";
import * as reportRows from "@jini-ai/cms/publish/content/dialog/report-rows";

const OWNERS: ReadonlyArray<readonly [Record<string, unknown>, readonly string[]]> = [
  [reportRows, ["countSelectedPublishing", "publishRowDisposition", "rowPublishesWithSelection", "selectableRowKeys", "summarizePublishReport", "toPublishReportRows"]],
  [publishOrder, ["publishOrderComparator", "sortPublishReportRows"]],
  [criteria, ["applyPublishCriteria", "decodePublishCriteriaFromQuery", "encodePublishCriteriaToQuery", "parsePublishContentToolInput", "PUBLISH_CONTENT_CAPABILITY", "PUBLISH_CRITERIA_QUERY_PARAM"]],
  [phase, ["canConfirmPlan", "canRequestPlan", "confirmationTokenFor", "planOnScreen", "reportOnScreen"]],
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
  assert.deepEqual(barrel.decodePublishCriteriaFromQuery({ raw }), { types: ["page"], overwrite: true });
  assert.equal(barrel.PUBLISH_CRITERIA_QUERY_PARAM, "publish");
});
