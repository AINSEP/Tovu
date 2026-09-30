import assert from "node:assert/strict";
import test from "node:test";

import { deployConfigTargetOptionHelp, formatTargetOptionHelp } from "../../commands/deploy-config.js";
import { createProgram } from "../../program.js";

/**
 * @file `tovu deploy config --target` help text is built from the ids the bundled `deploy` plugin
 * declares; with exactly fly, render, railway it must read as it always has.
 */

test("with the bundled plugin, --target help is unchanged", () => {
  assert.equal(deployConfigTargetOptionHelp(), "deploy platform: fly, render, or railway");
  const config = createProgram().commands.find((c) => c.name() === "deploy")?.commands.find((c) => c.name() === "config");
  assert.equal(config?.options.find((o) => o.long === "--target")?.description, "deploy platform: fly, render, or railway");
});

test("formatTargetOptionHelp: joins one, two, and many ids", () => {
  assert.equal(formatTargetOptionHelp([]), "deploy platform id declared by the deploy plugin");
  assert.equal(formatTargetOptionHelp(["fly"]), "deploy platform: fly");
  assert.equal(formatTargetOptionHelp(["fly", "render"]), "deploy platform: fly or render");
  assert.equal(formatTargetOptionHelp(["a", "b", "c", "d"]), "deploy platform: a, b, c, or d");
});
