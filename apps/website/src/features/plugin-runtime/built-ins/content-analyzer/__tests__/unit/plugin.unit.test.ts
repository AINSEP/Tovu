import assert from "node:assert/strict";
import test from "node:test";

import type { ContentEntryDraft, ExtPatch, HookContext, PluginSdk } from "@tovu/sdk";

import { analyzeContent } from "../../analyze-content.js";
import contentAnalyzerPlugin, { buildContentAnalyzerPatch, readMetaDescription } from "../../plugin.js";
import { summarizeReport } from "../../summary.js";
import { tiptapToBlocks } from "../../tiptap-blocks.js";

/**
 * @file `content-analyzer`'s worker-side entry module (`plugin.ts`) end to end through a tiny fake
 * `PluginSdk` that only captures `addFilter` — the same surface a Tier-2 worker hands the module.
 */

type Captured = { hookName: string; filter: (entry: Readonly<ContentEntryDraft>, ctx: HookContext) => ExtPatch | Promise<ExtPatch> };

function fakeSdk(): { sdk: PluginSdk; captured: Captured[] } {
  const captured: Captured[] = [];
  const unused = () => {
    throw new Error("content-analyzer must only call addFilter");
  };
  const sdk = {
    content: { read: unused, extend: unused },
    addFilter: (hookName: string, filter: Captured["filter"]) => {
      captured.push({ hookName, filter });
    },
    addAction: unused,
    addContribution: unused,
  } as unknown as PluginSdk;
  return { sdk, captured };
}

const BODY = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Why it matters" }] },
    { type: "paragraph", content: [{ type: "text", text: "Short posts are fine. This one is short." }] },
    { type: "image", attrs: { alt: null } },
  ],
};

function entry(extra: Record<string, unknown> = {}): Readonly<ContentEntryDraft> {
  return {
    id: "post-1",
    workspaceId: "ws-1",
    title: "Analyzing a short post for search engines",
    slug: "short-post",
    status: "draft",
    bodyJson: BODY,
    ext: {},
    ...extra,
  } as Readonly<ContentEntryDraft>;
}

test("setup attaches exactly one content.entry.beforeSave filter and nothing else", async () => {
  const { sdk, captured } = fakeSdk();
  await contentAnalyzerPlugin.definition.setup(sdk);
  assert.deepEqual(
    captured.map((c) => c.hookName),
    ["content.entry.beforeSave"],
  );
});

test("the filter returns the 6-field patch (un-prefixed keys) computed from title + bodyJson", async () => {
  const { sdk, captured } = fakeSdk();
  await contentAnalyzerPlugin.definition.setup(sdk);
  const patch = await captured[0]!.filter(entry(), { pluginId: "content-analyzer", workspaceId: "ws-1" });

  const expected = analyzeContent({ title: entry().title, blocks: tiptapToBlocks(BODY) });
  assert.deepEqual(Object.keys(patch).sort(), ["readability", "readingTimeMinutes", "report", "score", "summary", "wordCount"]);
  assert.equal(patch.score, expected.score);
  assert.equal(patch.wordCount, 8);
  assert.equal(patch.readingTimeMinutes, 1);
  assert.equal(patch.readability, expected.readability.fleschReadingEase);
  assert.equal(patch.summary, summarizeReport(expected));
  assert.deepEqual(JSON.parse(String(patch.report)), expected);
  for (const value of Object.values(patch)) assert.ok(["string", "number"].includes(typeof value));
});

test("metaDescription hook point: read from the entry only when it is a string, forwarded into the analysis", () => {
  assert.equal(readMetaDescription(entry()), undefined);
  assert.equal(readMetaDescription(entry({ metaDescription: 12 })), undefined);
  assert.equal(readMetaDescription(entry({ metaDescription: "A description" })), "A description");

  const withMeta = buildContentAnalyzerPatch(entry({ metaDescription: "m".repeat(100) }));
  const report = JSON.parse(String(withMeta.report)) as { checks: Array<{ id: string; status: string }> };
  assert.equal(report.checks.find((c) => c.id === "meta-description-length")?.status, "pass");

  const without = JSON.parse(String(buildContentAnalyzerPatch(entry()).report)) as typeof report;
  assert.equal(without.checks.find((c) => c.id === "meta-description-length")?.status, "skip");
});
