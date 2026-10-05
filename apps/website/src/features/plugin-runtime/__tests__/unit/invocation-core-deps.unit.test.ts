import assert from "node:assert/strict";
import test from "node:test";

import { HOOK_CONTENT_ENTRY_BEFORE_SAVE, type ContentEntryDraft, type HookContext } from "@tovu/sdk";

import { createPluginInvocationCoreDeps } from "../../invocation-core-deps.js";

/**
 * @file `createPluginInvocationCoreDeps()` — the per-load `content.read`/`content.extend`/`addFilter`
 * backing shared by the in-process (Tier 3) composition path and the Tier-2 worker.
 *
 * Requirement-to-test map:
 * - content.read/extend only work while a captured filter is running -> the "outside" tests.
 * - extend() writes merge under the filter's own returned keys -> the merge tests.
 * - only a declared beforeSave hook may attach, and only once -> the attach-guard tests.
 */

const entry: ContentEntryDraft = {
  id: "e1",
  workspaceId: "ws",
  title: "T",
  slug: "t",
  status: "draft",
  bodyJson: {},
  ext: {},
};
const ctx: HookContext = { pluginId: "p", workspaceId: "ws" };

function depsFor(declaredHooks: readonly string[] = [HOOK_CONTENT_ENTRY_BEFORE_SAVE]) {
  return createPluginInvocationCoreDeps({ pluginId: "p", declaredHooks });
}

test("no filter is captured until setup attaches one", () => {
  assert.equal(depsFor().capturedFilter(), null);
});

test("content.read and content.extend outside a running filter throw a named error", () => {
  const { coreDeps } = depsFor();
  assert.throws(() => coreDeps.getCurrentEntry(), { message: "plugin 'p' called content.read outside a beforeSave hook" });
  assert.throws(() => coreDeps.writeExtField("a", 1), { message: "plugin 'p' called content.extend outside a beforeSave hook" });
});

test("the captured filter sees the entry through content.read and returns its own patch when nothing was extended", async () => {
  const { coreDeps, capturedFilter } = depsFor();
  let seen: unknown;
  coreDeps.attachFilter(HOOK_CONTENT_ENTRY_BEFORE_SAVE, () => {
    seen = coreDeps.getCurrentEntry();
    return { a: 1 };
  });
  assert.deepEqual(await capturedFilter()!(entry, ctx), { a: 1 });
  assert.equal(seen, entry);
});

test("content.extend writes merge under the filter's returned keys (returned keys win)", async () => {
  const { coreDeps, capturedFilter } = depsFor();
  coreDeps.attachFilter(HOOK_CONTENT_ENTRY_BEFORE_SAVE, async () => {
    coreDeps.writeExtField("a", 1);
    coreDeps.writeExtField("b", "x");
    return { b: "returned" };
  });
  assert.deepEqual(await capturedFilter()!(entry, ctx), { a: 1, b: "returned" });
});

for (const returned of [null, [1], "str"] as const) {
  test(`a non-object return (${JSON.stringify(returned)}) passes through untouched even after extend()`, async () => {
    const { coreDeps, capturedFilter } = depsFor();
    coreDeps.attachFilter(HOOK_CONTENT_ENTRY_BEFORE_SAVE, (() => {
      coreDeps.writeExtField("a", 1);
      return returned;
    }) as never);
    assert.deepEqual(await capturedFilter()!(entry, ctx), returned);
  });
}

test("attaching an undeclared hook, or a hook the manifest did not declare, throws", () => {
  assert.throws(
    () => depsFor().coreDeps.attachFilter("other.hook" as never, () => ({})),
    { message: "plugin 'p' attempted to attach undeclared hook 'other.hook'" },
  );
  assert.throws(
    () => depsFor([]).coreDeps.attachFilter(HOOK_CONTENT_ENTRY_BEFORE_SAVE, () => ({})),
    { message: "plugin 'p' attempted to attach undeclared hook 'content.entry.beforeSave'" },
  );
});

test("a second beforeSave filter is refused", () => {
  const { coreDeps } = depsFor();
  coreDeps.attachFilter(HOOK_CONTENT_ENTRY_BEFORE_SAVE, () => ({}));
  assert.throws(() => coreDeps.attachFilter(HOOK_CONTENT_ENTRY_BEFORE_SAVE, () => ({})), {
    message: "plugin 'p' attempted to attach more than one beforeSave filter",
  });
});
