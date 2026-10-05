/**
 * @file Unit tests for `contracts/core/plugin-hook-failed-error.ts`: the moved class keeps its
 * shape and identity (so `hook-registry.ts`'s throws are what `features/post` recognizes), and the
 * handler-map wrap is transparent except for a plugin refusal.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { ToolInputError, type ToolHandler } from "@jini-ai/core";

import { PluginHookFailedError as RegistryPluginHookFailedError } from "#src/features/plugin-runtime/hook-registry";
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
