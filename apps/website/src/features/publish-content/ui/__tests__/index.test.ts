/**
 * @file The `@tovu/publish-content-ui` barrel (`../index.ts`) — admin imports the publish dialog's
 * semantics only through it, so every runtime export must be present and be the very same binding its
 * owner defines: the neutral Jini subpath for what is policy-free, this folder's host binding for what
 * takes Tovu policy (a stale or duplicated copy here would let admin drift from the server's rules).
 */
import assert from "node:assert/strict";
import test from "node:test";

import * as neutral from "@jini-ai/cms/publish/content/ui";
import * as barrel from "../index.js";
import * as binding from "../host-binding.js";
import * as policy from "../policy.js";
import * as sections from "../sections.js";

const OWNERS: ReadonlyArray<readonly [Record<string, unknown>, readonly string[]]> = [
  [neutral, ["canConfirmPlan", "canRequestPlan", "confirmationTokenFor", "countSelectedPublishing", "encodePublishCriteriaToQuery", "overwriteReplanIsConsistent", "planOnScreen", "publishOrderComparator", "PublishPlanDriftError", "publishRowDisposition", "reportOnScreen", "rowPublishesWithSelection", "selectableRowKeys", "sortPublishReportRows", "summarizePublishReport"]],
  [binding, ["applyPublishCriteria", "decodePublishCriteriaFromQuery", "parsePublishContentToolInput", "preparePublishConfirmation", "toPublishReportRows"]],
  [policy, ["PUBLISH_CONTENT_CAPABILITY", "PUBLISH_CRITERIA_QUERY_PARAM"]],
  [sections, ["PUBLISH_SECTIONS", "publishEntityTypeLabel", "publishEntityTypePluralLabel", "publishSectionById", "publishSectionForEntityTypes"]],
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

test("the host binding injects Tovu's policy: drift wording, type aliases, query cap and capability id", async () => {
  const plan = (rows: object[]) => ({ details: { refused: false, rows } }) as never;
  const shown = plan([{ entityType: "page", entityId: "a", outcome: "created", writes: true, entityLabel: "A", reason: null }, { entityType: "page", entityId: "b", outcome: "created", writes: true, entityLabel: "B", reason: null }]);
  const drifted = plan([{ entityType: "page", entityId: "z", outcome: "created", writes: true, entityLabel: "Z", reason: null }]);
  await assert.rejects(
    () => barrel.preparePublishConfirmation({ plan: shown, deselectedKeys: new Set(["page:a"]), planPublish: async () => drifted }),
    (error: unknown) => error instanceof barrel.PublishPlanDriftError && error.message === "The live site changed while publishing was being planned. Check the list again.",
  );
  assert.equal(barrel.decodePublishCriteriaFromQuery({ raw: "x".repeat(4001) }), null);
  assert.throws(() => barrel.parsePublishContentToolInput({ types: "page" }), /^Error: admin\.publish_content: 'types' must be an array of strings$/);
  const rows = barrel.toPublishReportRows({ refused: false, rows: [{ entityType: "menu", entityId: "m", outcome: "created", writes: true, entityLabel: "M", reason: null }] } as never);
  assert.deepEqual([...barrel.applyPublishCriteria({ rows, criteria: { types: ["nav"] } }).deselectedKeys], []);
  assert.equal(rows[0]?.entityTypeLabel, "Menu");
});
