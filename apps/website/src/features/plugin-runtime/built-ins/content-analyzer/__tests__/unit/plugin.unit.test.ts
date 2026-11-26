import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import type { ContentEntryDraft } from "@tovu/sdk";
import { analyzeContentWithSiteSlug as analyzeContent, summarizeReport, tiptapToBlocks } from "@jini-ai/cms/seo/content-analysis";

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


const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", `
  const { registerPluginSdkResolver } = await import(${JSON.stringify(new URL("../../../../sdk-resolver.ts", import.meta.url).href)});
  registerPluginSdkResolver();
  // The worker entry is Tovu's own file: Jini's subpath is a factory with no default export.
  const { default: plugin } = await import(${JSON.stringify(new URL("../../plugin.ts", import.meta.url).href)});
  const { buildContentAnalyzerPatch, readMetaDescription } = await import("@jini-ai/cms/seo/content-analyzer-plugin/plugin");
  const analysis = await import("@jini-ai/cms/seo/content-analysis");
  const base = ${JSON.stringify(entry())};
  const hooks = [];
  plugin.definition.setup({ addFilter: (hookName, filter) => hooks.push({ hookName, filter }) });
  const patch = await hooks[0].filter(base, { pluginId: "content-analyzer", workspaceId: "ws-1" });
  const accented = { ...base, bodyJson: { type: "doc", content: [{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Café Münster" }] }] } };
  console.log(JSON.stringify({ hooks: hooks.map(h => h.hookName), patch,
    meta: [base, { ...base, metaDescription: 12 }, { ...base, metaDescription: "A description" }].map(entry => readMetaDescription({ entry })),
    withMeta: buildContentAnalyzerPatch({ entry: { ...base, metaDescription: "m".repeat(100) }, analysis }),
    without: buildContentAnalyzerPatch({ entry: base, analysis }),
    accented: buildContentAnalyzerPatch({ entry: accented, analysis }),
    filterMeta: await hooks[0].filter({ ...base, metaDescription: "m".repeat(100) }, { pluginId: "content-analyzer", workspaceId: "ws-1" }) }));
`], { encoding: "utf8" });
assert.equal(result.status, 0, result.stderr);
const output = JSON.parse(result.stdout);


test("setup attaches exactly one content.entry.beforeSave filter and nothing else", async () => {
  assert.deepEqual(
    output.hooks,
    ["content.entry.beforeSave"],
  );
});

test("the filter returns the 6-field patch (un-prefixed keys) computed from title + bodyJson", async () => {
  const patch = output.patch;

  const expected = analyzeContent({ title: entry().title, blocks: tiptapToBlocks({ bodyJson: BODY }) });
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
  assert.equal(output.meta[0] ?? undefined, undefined);
  assert.equal(output.meta[1] ?? undefined, undefined);
  assert.equal(output.meta[2], "A description");

  const withMeta = output.withMeta;
  const report = JSON.parse(String(withMeta.report)) as { checks: Array<{ id: string; status: string }> };
  assert.equal(report.checks.find((c) => c.id === "meta-description-length")?.status, "pass");

  const without = JSON.parse(String(output.without.report)) as typeof report;
  assert.equal(without.checks.find((c) => c.id === "meta-description-length")?.status, "skip");
});

test("an accented heading's TOC anchor is the renderer's transliterated fragment id", () => {
  // TOC links must match the fragment ids the site renderer emits (AW-7 Tier 2), so the worker's
  // projection has to anchor through the renderer's `toSlug`, not an ASCII-only rule.
  const report = JSON.parse(String(output.accented.report)) as { toc: Array<{ anchor: string }> };
  assert.deepEqual(report.toc.map((row) => row.anchor), ["cafe-muenster"]);
});

test("the SDK-typed preview description reaches the installed beforeSave filter", async () => {
  const patch = output.filterMeta;
  const report = JSON.parse(String(patch.report)) as { checks: Array<{ id: string; status: string }> };
  assert.equal(report.checks.find(check => check.id === "meta-description-length")?.status, "pass");
});
