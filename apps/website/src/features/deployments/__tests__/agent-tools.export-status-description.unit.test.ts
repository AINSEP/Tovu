import assert from "node:assert/strict";
import test from "node:test";

import { firstExportFailure } from "@jini-ai/devops/static-export/failure-summary";
import { deploymentsAgentToolCatalog } from "../agent-tools.js";

// B163: the status tool's description told the model that asset failures "do not flip ok", but
// export-run.ts derives `ok` from firstExportFailure, which counts BOTH routes and assets. A model
// believing the description would call an export with a missing stylesheet "ok". Pin the true rule.
const statusDescription = deploymentsAgentToolCatalog.find((tool) => tool.name === "deployment_get_export_status")!.description;

test("B163 the premise holds: an asset-only failure is a failure for the ok flag", () => {
  const report = {
    routes: { succeeded: ["/"], failed: [] },
    assets: { succeeded: [], failed: [{ url: "/theme.css", reason: "404" }] },
  };
  assert.notEqual(firstExportFailure({ report: report as never }), undefined);
});

test("B163 deployment_get_export_status says a failed asset flips ok exactly like a failed route", () => {
  assert.match(statusDescription, /ok is true only when every ROUTE and every ASSET exported successfully/);
  assert.doesNotMatch(statusDescription, /do not flip ok/);
});
