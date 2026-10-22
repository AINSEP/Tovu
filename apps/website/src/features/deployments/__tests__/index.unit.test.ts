import assert from "node:assert/strict";
import test from "node:test";
import * as deployments from "../index.js";

test("the core deployment barrel exposes generic publishing and no dormant provider implementation", () => {
  assert.deepEqual(Object.keys(deployments).filter(name => /DeploymentProvider/.test(name)), []);
  assert.equal(typeof deployments.loadDeployConfigGeneratorsFromSource, "function");
});
