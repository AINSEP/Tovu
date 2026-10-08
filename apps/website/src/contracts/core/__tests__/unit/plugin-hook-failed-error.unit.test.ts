/**
 * @file Unit tests for `contracts/core/plugin-hook-failed-error.ts`: the class must preserve its
 * shape and identity (so `hook-registry.ts`'s throws are what `features/post` recognizes), and the
 * handler-map wrap is transparent except for a plugin refusal.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { ToolInputError, type ToolHandler } from "@jini-ai/core";

import { PluginHookFailedError as RegistryPluginHookFailedError } from "@jini-ai/plugins/host";
import {
  PluginHookFailedError,
  toModelFacingPluginHookError,
  withPluginHookRefusals,
} from "../../plugin-hook-failed-error.js";

test("hook-registry re-exports the SAME class, so its throws match instanceof here", () => {
  assert.equal(RegistryPluginHookFailedError, PluginHookFailedError);
});

test("PluginHookFailedError carries name, pluginId, message and cause", () => {
  const cause = new Error("inner");
  const err = new PluginHookFailedError("seo", "plugin 'seo' failed", { cause });
  assert.equal(err.name, "PluginHookFailedError");
  assert.equal(err.pluginId, "seo");
  assert.equal(err.message, "plugin 'seo' failed");
  assert.equal(err.cause, cause);
});

test("toModelFacingPluginHookError publishes only the fixed refusal and the plugin id", () => {
  const out = toModelFacingPluginHookError(new PluginHookFailedError("seo", "raw /secret/path"));
  assert.ok(out instanceof ToolInputError);
  assert.equal(out.message, "PLUGIN_HOOK_FAILED: a site plugin (seo) refused this save; the content was not saved");
});

test("PluginHookFailedError has no refused item unless a multi-item apply names one", () => {
  assert.equal(new PluginHookFailedError("seo", "raw").refusedItemRef, null);
  const cause = new PluginHookFailedError("seo", "raw");
  const atItem = new PluginHookFailedError("seo", "raw", { cause, refusedItemRef: "post:p-2" });
  assert.equal(atItem.refusedItemRef, "post:p-2");
  assert.equal(atItem.cause, cause);
});

test("toModelFacingPluginHookError names the refused item and that earlier items stay saved", () => {
  const out = toModelFacingPluginHookError(
    new PluginHookFailedError("seo", "raw /secret/path", { refusedItemRef: "post:p-2" })
  );
  assert.ok(out instanceof ToolInputError);
  assert.equal(
    out.message,
    "PLUGIN_HOOK_FAILED: a site plugin (seo) refused item post:p-2; items applied before it stay saved, so check the import history before retrying"
  );
});

test("toModelFacingPluginHookError returns any other rejection unchanged", () => {
  const other = new Error("boom");
  assert.equal(toModelFacingPluginHookError(other), other);
});

test("withPluginHookRefusals passes success and arguments through and reclassifies a refusal", async () => {
  const seen: unknown[] = [];
  const handlers: Record<string, ToolHandler> = {
    ok: (async (...args: Parameters<ToolHandler>) => {
      seen.push(args);
      return { done: true };
    }) as ToolHandler,
    refuse: (async () => {
      throw new PluginHookFailedError("seo", "raw");
    }) as ToolHandler,
  };
  const wrapped = withPluginHookRefusals(handlers);
  const ctx = { input: { a: 1 } } as unknown as Parameters<ToolHandler>[0];
  const optional = { signal: undefined } as unknown as Parameters<ToolHandler>[1];

  assert.deepEqual(Object.keys(wrapped), ["ok", "refuse"]);
  assert.deepEqual(await wrapped.ok!(ctx, optional), { done: true });
  assert.deepEqual(seen, [[ctx, optional]]);
  await assert.rejects(wrapped.refuse!(ctx, optional), (err: unknown) =>
    err instanceof ToolInputError && err.message.startsWith("PLUGIN_HOOK_FAILED: a site plugin (seo)"));
});
