import "../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";

import { createRouteDeps } from "#src/server/runtime/composition/app";
import { toPublishContentDeps } from "../deps.js";

/**
 * @file The route deps builder is one of the two producers of the plugin before-save hook on a
 * publish bag. The hook travels in the host's own port bag (`ports.hooks.beforeSave`), not on the
 * engine's deps. This pins that the producer still hands on the composition root's hook after the
 * field moved there: a builder that dropped it would compile, because the field is optional.
 */

test("T-HOOK: the route publish bag carries the root's before-save hook as ports.hooks.beforeSave", () => {
  const routeDeps = createRouteDeps();

  const bag = toPublishContentDeps(routeDeps);

  assert.equal(typeof routeDeps.pluginBeforeSaveHook, "function");
  assert.equal(bag.ports.hooks?.beforeSave, routeDeps.pluginBeforeSaveHook);
});

test("T-HOOK: the hook is not an engine dependency: the bag has no top-level beforeSaveHook", () => {
  const bag = toPublishContentDeps(createRouteDeps());

  assert.equal("beforeSaveHook" in bag, false);
});
