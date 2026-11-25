import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { bindDeployOpsRuntime, type DeployOpsToolDeps } from "../../../../features/deployments/deploy-ops/run-ops.js";

/**
 * @file P10 O1.T pin (Codex FIX 17): Jini's deploy observation hook (`observeDeploy`, O1.J) stays
 * UNBOUND in Tovu until P4's composed host ErrorReporter exists at the publish/deploy/import
 * boundaries (open-bugs `g5a-o1t-blocked`). Binding it early would report through no composed
 * reporter. Enabling it is a deliberate change that must delete this pin in the same diff.
 */

const SRC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function productionSources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" || entry.name === "node_modules" ? [] : productionSources(full);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

test("the deploy-ops runtime Tovu binds carries no observeDeploy hook", () => {
  const runtime = bindDeployOpsRuntime({ workspaceId: "w" } as unknown as DeployOpsToolDeps);
  assert.equal("observeDeploy" in runtime, false, "O1.T is blocked on P4: no observation hook at the deploy boundary");
});

test("no production source under apps/website/src binds observeDeploy", () => {
  const binders = productionSources(SRC_ROOT).filter((file) => fs.readFileSync(file, "utf8").includes("observeDeploy"));
  assert.deepEqual(binders.map((file) => path.relative(SRC_ROOT, file)), []);
});
