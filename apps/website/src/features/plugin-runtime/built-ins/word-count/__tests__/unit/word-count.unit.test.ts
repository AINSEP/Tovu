import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";

import { WORD_COUNT_MANIFEST } from "../../index.js";

/**
 * @file `word-count` built-in — SPEC-005 REQ-09, AC-01, RT-005's pinned tokenization algorithm.
 *
 * The RT-005 tokenizer cases moved with `countWords` to `@jini-ai/plugins` (`count-words.test.ts`);
 * this suite keeps the manifest contract and the hook binding that calls it.
 */

test("REQ-09: WORD_COUNT_MANIFEST declares exactly the three v1 capabilities, one hook attachment, one integer field, and tier-3 (1.1.1)", () => {
  assert.deepEqual([...WORD_COUNT_MANIFEST.capabilities].sort(), ["content.extend", "content.read", "hooks.attach"]);
  assert.deepEqual([...WORD_COUNT_MANIFEST.hooks], ["content.entry.beforeSave"]);
  assert.equal(WORD_COUNT_MANIFEST.fields.length, 1);
  assert.equal(WORD_COUNT_MANIFEST.fields[0].path, "ext.word-count.count");
  assert.equal(WORD_COUNT_MANIFEST.fields[0].type, "integer");
  assert.equal(WORD_COUNT_MANIFEST.fields[0].queryable, false);
  assert.equal(WORD_COUNT_MANIFEST.tier, "tier-3");
});

test("the runtime source imports the plugin whose beforeSave filter stores the entry's word count", async () => {
  const { HOOK_CONTENT_ENTRY_BEFORE_SAVE } = await import("@tovu/sdk");
  const { WORD_COUNT_RUNTIME_SOURCE } = await import("../../index.js");
  assert.equal(WORD_COUNT_RUNTIME_SOURCE.entryPath, "built-in:word-count");
  assert.equal(WORD_COUNT_RUNTIME_SOURCE.source, "built-in");
  assert.equal(WORD_COUNT_RUNTIME_SOURCE.manifest, WORD_COUNT_MANIFEST);
  assert.equal(WORD_COUNT_RUNTIME_SOURCE.sourceDir, path.resolve(import.meta.dirname, "../.."));
  const imported = await WORD_COUNT_RUNTIME_SOURCE.importModule();
  assert.equal(imported.default, (await WORD_COUNT_RUNTIME_SOURCE.importModule()).default);

  const filters: { hook: string; filter: (entry: { bodyJson: unknown }) => Promise<unknown> }[] = [];
  const sdk = { addFilter: (hook: string, filter: (entry: { bodyJson: unknown }) => Promise<unknown>) => { filters.push({ hook, filter }); } };
  await imported.default.definition.setup(sdk as unknown as Parameters<typeof imported.default.definition.setup>[0]);
  assert.deepEqual(filters.map((f) => f.hook), [HOOK_CONTENT_ENTRY_BEFORE_SAVE]);
  const body = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "three small words" }] }] };
  assert.deepEqual(await filters[0]!.filter({ bodyJson: body }), { count: 3 });
  // RT-005 (tokenizer in `@jini-ai/plugins`): adjacent text nodes are joined with a single space, so
  // "two" + "words" with no trailing space still counts 2 through the hook, not 1.
  const adjacent = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "two" }, { type: "text", text: "words" }] }] };
  assert.deepEqual(await filters[0]!.filter({ bodyJson: adjacent }), { count: 2 });
});


test("registered source imports one stable plugin and exposes the same manifest to package inspection", async () => {
  const { WORD_COUNT_RUNTIME_SOURCE } = await import("../../index.js");
  const first = await WORD_COUNT_RUNTIME_SOURCE.importModule();
  assert.equal((await WORD_COUNT_RUNTIME_SOURCE.importModule()).default, first.default);
  assert.equal(WORD_COUNT_RUNTIME_SOURCE.manifest, WORD_COUNT_MANIFEST);
  assert.equal(typeof first.default.definition.setup, "function");
});
